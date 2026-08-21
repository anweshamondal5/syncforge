import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { DocManager } from './DocManager.js';
import { isValidDocId } from '../middleware/security.js';
import {
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  DEFAULT_ROOM_NAME,
} from '@syncforge/shared';

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB max payload
const FLOOD_MESSAGE_THRESHOLD = 300; // max messages/sec per socket before termination

interface RoomClient {
  ws: WebSocket;
  docId: string;
  controlledUserIds: Set<number>;
  lastSeen: number;
  messageCountWindow: number;
  windowStart: number;
}

export class WsSyncServer {
  private wss: WebSocketServer;
  private rooms: Map<string, Set<RoomClient>> = new Map();
  private awarenessMap: Map<string, awarenessProtocol.Awareness> = new Map();
  private roomUpdateHandlers: Map<string, (update: Uint8Array, origin: any) => void> = new Map();

  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.init();
  }

  private init() {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      await this.handleConnection(ws, req);
    });

    // Heartbeat ping interval to detect dead sockets
    this.heartbeatInterval = setInterval(() => {
      for (const [, clients] of this.rooms) {
        for (const client of clients) {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.ping();
          }
        }
      }
    }, 30000);
    this.heartbeatInterval.unref();
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const allRooms = Array.from(this.rooms.values());
    this.rooms.clear();
    this.awarenessMap.clear();
    this.roomUpdateHandlers.clear();

    for (const clients of allRooms) {
      for (const client of clients) {
        try {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close();
          }
        } catch {
          // ignore
        }
      }
    }
  }

  private parseDocId(req: IncomingMessage): string {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    
    // Support paths like /ws/:docId or /sync/:docId or query ?room=docId / ?docId=docId
    const queryDocId = url.searchParams.get('docId') || url.searchParams.get('room');
    if (queryDocId) return queryDocId;

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'ws' || parts[0] === 'sync' || parts[0] === 'syncforge')) {
      return parts[1];
    }
    if (parts.length === 1 && parts[0] !== 'ws') {
      return parts[0];
    }
    return DEFAULT_ROOM_NAME;
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    const docId = this.parseDocId(req);

    // Security: Validate document ID format
    if (!isValidDocId(docId)) {
      console.warn(`[WebSocket] Rejecting connection with invalid docId format: "${docId}"`);
      try {
        ws.close(1008, 'Invalid document ID format');
      } catch {}
      return;
    }

    console.log(`[WebSocket] Client connected for docId: ${docId}`);

    // Buffer any early messages arriving while doc loads from DB
    const earlyMessageQueue: Buffer[] = [];
    let isReady = false;
    const earlyHandler = (data: Buffer) => {
      if (!isReady) {
        earlyMessageQueue.push(data);
      }
    };
    ws.on('message', earlyHandler);

    let doc: Y.Doc;
    try {
      doc = await DocManager.getOrCreateDoc(docId);
    } catch (err) {
      console.error(`[WebSocket] Failed to load doc ${docId}:`, err);
      ws.off('message', earlyHandler);
      try {
        ws.close(1011, 'Internal server error loading document');
      } catch {}
      return;
    }

    // If socket closed before database returned, clean up immediately and abort setup
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      ws.off('message', earlyHandler);
      return;
    }

    if (!this.awarenessMap.has(docId)) {
      const awareness = new awarenessProtocol.Awareness(doc);
      awareness.setLocalState(null);

      // Listen to awareness changes and broadcast to all room clients
      awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
        const changedClients = added.concat(updated, removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const buff = encoding.toUint8Array(encoder);

        const roomClients = this.rooms.get(docId);
        if (roomClients) {
          for (const client of roomClients) {
            if (client.ws !== origin && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(buff);
            }
          }
        }
      });

      this.awarenessMap.set(docId, awareness);
    }

    const awareness = this.awarenessMap.get(docId)!;

    if (!this.rooms.has(docId)) {
      this.rooms.set(docId, new Set());

      // Broadcast doc updates to room clients once per room
      const roomUpdateHandler = (update: Uint8Array, origin: any) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        const buff = encoding.toUint8Array(encoder);

        const roomClients = this.rooms.get(docId);
        if (roomClients) {
          for (const c of roomClients) {
            if (c.ws !== origin && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(buff);
            }
          }
        }
      };

      doc.on('update', roomUpdateHandler);
      this.roomUpdateHandlers.set(docId, roomUpdateHandler);
    }

    const client: RoomClient = {
      ws,
      docId,
      controlledUserIds: new Set(),
      lastSeen: Date.now(),
      messageCountWindow: 0,
      windowStart: Date.now(),
    };

    this.rooms.get(docId)!.add(client);

    // Sync Step 1: Send server Sync Step 1 to client so client replies with Sync Step 2
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, doc);
      ws.send(encoding.toUint8Array(encoder));
    }

    // Send existing awareness states to the newly joined client
    {
      const awarenessStates = awareness.getStates();
      if (awarenessStates.size > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            awareness,
            Array.from(awarenessStates.keys())
          )
        );
        ws.send(encoding.toUint8Array(encoder));
      }
    }

    const awarenessUpdateListener = ({ added, updated, removed }: any, origin: any) => {
      if (origin === ws) {
        for (const id of added) client.controlledUserIds.add(id);
        for (const id of updated) client.controlledUserIds.add(id);
        for (const id of removed) client.controlledUserIds.delete(id);
      }
    };
    awareness.on('update', awarenessUpdateListener);

    // Stop early buffering and attach main message handler
    ws.off('message', earlyHandler);
    isReady = true;

    const handleMessage = (data: Buffer) => {
      // 1. Oversized message protection
      if (data.byteLength > MAX_PAYLOAD_BYTES) {
        console.warn(`[WebSocket] Client sent oversized message (${data.byteLength} bytes). Closing socket.`);
        try {
          ws.close(1009, 'Message exceeds max allowed payload size');
          ws.terminate();
        } catch {}
        return;
      }

      // 2. Sliding window message flood rate limiting
      const now = Date.now();
      if (now - client.windowStart > 1000) {
        client.messageCountWindow = 1;
        client.windowStart = now;
      } else {
        client.messageCountWindow++;
        if (client.messageCountWindow > FLOOD_MESSAGE_THRESHOLD) {
          console.warn(`[WebSocket] Client rate limit exceeded (${client.messageCountWindow} msgs/sec). Terminating socket.`);
          try {
            ws.close(1008, 'Message rate limit exceeded');
            ws.terminate();
          } catch {}
          return;
        }
      }

      client.lastSeen = now;

      // 3. Resilient binary message decoding
      try {
        const uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const decoder = decoding.createDecoder(uint8Array);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case MESSAGE_SYNC: {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);

            // Read the sync message and write back any necessary responses
            syncProtocol.readSyncMessage(decoder, encoder, doc, ws, (err: Error) => {
              console.error(`[WsSyncServer] readSyncMessage error on doc ${docId}:`, err);
            });

            // If an answer is required (e.g. Server Step 1 -> Client Step 2 diff)
            if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
              ws.send(encoding.toUint8Array(encoder));
            }
            break;
          }

          case MESSAGE_AWARENESS: {
            const update = decoding.readVarUint8Array(decoder);
            awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
            break;
          }

          case MESSAGE_QUERY_AWARENESS: {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
              encoder,
              awarenessProtocol.encodeAwarenessUpdate(
                awareness,
                Array.from(awareness.getStates().keys())
              )
            );
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(encoding.toUint8Array(encoder));
            }
            break;
          }

          default:
            console.warn(`[WebSocket] Unknown message opcode ${messageType} for doc ${docId}`);
        }
      } catch (err) {
        console.warn(`[WebSocket] Malformed message decode error on doc ${docId}:`, err);
      }
    };

    ws.on('message', handleMessage);

    // Drain any early buffered messages received while awaiting the DB
    for (const earlyData of earlyMessageQueue) {
      handleMessage(earlyData);
    }

    // Handle client disconnect
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected from docId: ${docId}`);
      awareness.off('update', awarenessUpdateListener);

      const roomClients = this.rooms.get(docId);
      if (roomClients) {
        roomClients.delete(client);
        if (roomClients.size === 0) {
          this.rooms.delete(docId);
          this.awarenessMap.delete(docId);

          // Detach room update handler from doc to eliminate listener leak
          const handler = this.roomUpdateHandlers.get(docId);
          if (handler) {
            doc.off('update', handler);
            this.roomUpdateHandlers.delete(docId);
          }

          DocManager.persistDocNow(docId).catch(console.error);
        }
      }

      // Remove awareness state for this client and broadcast removal to peers
      if (client.controlledUserIds.size > 0) {
        try {
          awarenessProtocol.removeAwarenessStates(
            awareness,
            Array.from(client.controlledUserIds),
            null
          );
        } catch {
          // ignore
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Socket error for doc ${docId}:`, err);
    });
  }

  public getActiveConnectionsCount(): number {
    let total = 0;
    for (const [, clients] of this.rooms) {
      total += clients.size;
    }
    return total;
  }

  public getActivePeersForDoc(docId: string): number {
    return this.rooms.get(docId)?.size || 0;
  }
}
