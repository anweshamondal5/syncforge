import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  ConnectionState,
  SyncTelemetry,
  UserProfile,
  CRDTOperationLog,
  DecodedStateVectorEntry,
} from '@syncforge/shared';

export type StatusListener = (status: ConnectionState) => void;
export type TelemetryListener = (telemetry: SyncTelemetry) => void;
export type PeersListener = (peers: Map<number, any>) => void;
export type TimelineListener = (timeline: CRDTOperationLog[]) => void;

export class SyncForgeProvider {
  public doc: Y.Doc;
  public awareness: awarenessProtocol.Awareness;
  public docId: string;
  public wsUrl: string;

  private ws: WebSocket | null = null;
  private indexeddbPersistence: IndexeddbPersistence | null = null;
  private status: ConnectionState = 'disconnected';
  private shouldConnect: boolean = true;
  private reconnectTimeout: number | null = null;

  private receivedUpdatesCount: number = 0;
  private sentUpdatesCount: number = 0;
  private pendingUpdatesQueue: Uint8Array[] = [];

  private timeline: CRDTOperationLog[] = [];
  private statusListeners: Set<StatusListener> = new Set();
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private peersListeners: Set<PeersListener> = new Set();
  private timelineListeners: Set<TimelineListener> = new Set();

  constructor(docId: string, doc?: Y.Doc, userProfile?: UserProfile) {
    this.docId = docId;
    this.doc = doc || new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    if (userProfile) {
      this.awareness.setLocalStateField('user', userProfile);
    }

    // Determine WebSocket endpoint URL
    if (import.meta.env.VITE_WS_URL) {
      let baseWs = import.meta.env.VITE_WS_URL.replace(/\/$/, '');
      if (baseWs.startsWith('http://')) baseWs = baseWs.replace('http://', 'ws://');
      if (baseWs.startsWith('https://')) baseWs = baseWs.replace('https://', 'wss://');
      this.wsUrl = `${baseWs}/ws/${docId}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.port === '5173' ? `${window.location.hostname}:3001` : window.location.host;
      this.wsUrl = `${protocol}//${host}/ws/${docId}`;
    }

    // Initialize Offline IndexedDB persistence
    try {
      this.indexeddbPersistence = new IndexeddbPersistence(`syncforge_doc_${docId}`, this.doc);
      this.indexeddbPersistence.on('synced', () => {
        console.log(`[IndexedDB] Loaded offline state for doc ${docId}`);
        this.logOperation(
          'initial-load',
          'sync-step-2',
          `Hydrated offline state from IndexedDB cache (${this.doc.store.clients.size} client stores)`,
          Y.encodeStateAsUpdate(this.doc).byteLength,
          this.doc.clientID
        );
        this.emitTelemetry();
      });
    } catch (err) {
      console.warn('[IndexedDB] IndexedDB initialization failed:', err);
    }

    // Bind local doc update listener to dispatch changes to WebSocket
    this.doc.on('update', this.handleDocUpdate);

    // Bind awareness update listener to dispatch presence over WebSocket
    this.awareness.on('update', this.handleAwarenessUpdate);
    this.awareness.on('change', () => {
      this.emitPeers();
    });

    // Bind browser online/offline listeners for native network disconnection detection
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Start WebSocket connection
    this.connect();
  }

  public logOperation(
    origin: 'local' | 'remote' | 'initial-load' | 'system',
    type: 'insert' | 'delete' | 'sync-step-1' | 'sync-step-2' | 'awareness' | 'format',
    summary: string,
    byteSize: number,
    clientId: number = this.doc.clientID,
    clockRange?: { start: number; end: number },
    status: 'applied' | 'synced' | 'pending' = 'applied'
  ) {
    const log: CRDTOperationLog = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      origin,
      clientId,
      byteSize,
      type,
      summary,
      clockRange,
      status,
    };
    this.timeline.unshift(log);
    if (this.timeline.length > 100) {
      this.timeline.pop();
    }
    this.emitTimeline();
  }

  public getDecodedStateVector(): DecodedStateVectorEntry[] {
    try {
      const svMap = Y.decodeStateVector(Y.encodeStateVector(this.doc));
      const entries: DecodedStateVectorEntry[] = [];
      for (const [clientId, clock] of svMap.entries()) {
        entries.push({ clientId, clock });
      }
      return entries.sort((a, b) => b.clock - a.clock);
    } catch {
      return [{ clientId: this.doc.clientID, clock: 0 }];
    }
  }

  public getTimeline(): CRDTOperationLog[] {
    return [...this.timeline];
  }

  public clearTimeline() {
    this.timeline = [];
    this.emitTimeline();
  }

  public onTimeline(listener: TimelineListener) {
    this.timelineListeners.add(listener);
    listener(this.timeline);
    return () => this.timelineListeners.delete(listener);
  }

  private emitTimeline() {
    const timelineCopy = [...this.timeline];
    for (const listener of this.timelineListeners) {
      listener(timelineCopy);
    }
  }

  private handleOnline = () => {
    console.log('[SyncForgeProvider] Network online detected. Attempting reconnect...');
    this.logOperation('system', 'sync-step-1', 'Network online detected. Initiating WebSocket reconnection...', 0);
    if (this.shouldConnect) {
      this.reconnectAttempts = 0;
      this.connect();
    }
  };

  private handleOffline = () => {
    console.log('[SyncForgeProvider] Network offline detected.');
    this.logOperation('system', 'sync-step-1', 'Network offline detected. Switching to IndexedDB journaling.', 0);
    this.setStatus('offline');
  };

  private reconnectAttempts = 0;

  private handleDocUpdate = (update: Uint8Array, origin: any) => {
    // If update originated from our server connection, don't echo back
    if (origin === this) {
      let authorId = this.doc.clientID;
      let clockRange: { start: number; end: number } | undefined;
      let summary = `Remote CRDT update applied (+${update.byteLength} B)`;
      try {
        const decoded = Y.decodeUpdate(update);
        if (decoded.structs.length > 0) {
          const first = decoded.structs[0];
          authorId = first.id.client;
          clockRange = { start: first.id.clock, end: first.id.clock + first.length };
          const totalLength = decoded.structs.reduce((sum, s) => sum + s.length, 0);
          summary = `Peer #${authorId} inserted ${totalLength} item(s) (clock ${first.id.clock}..${first.id.clock + first.length})`;
        } else if (decoded.ds && decoded.ds.clients.size > 0) {
          summary = `Peer deletion set applied across ${decoded.ds.clients.size} client delete ranges`;
        }
      } catch {
        // Struct parsing fallback
      }
      this.logOperation('remote', 'insert', summary, update.byteLength, authorId, clockRange, 'applied');
      return;
    }

    if (origin === 'initial-load') {
      return;
    }

    // Local edit
    this.sentUpdatesCount++;
    let clockRange: { start: number; end: number } | undefined;
    let summary = `Local edit applied (+${update.byteLength} B)`;
    try {
      const decoded = Y.decodeUpdate(update);
      if (decoded.structs.length > 0) {
        const first = decoded.structs[0];
        clockRange = { start: first.id.clock, end: first.id.clock + first.length };
        const totalLength = decoded.structs.reduce((sum, s) => sum + s.length, 0);
        summary = `Local insertion of ${totalLength} item(s) (clock ${first.id.clock}..${first.id.clock + first.length})`;
      } else if (decoded.ds && decoded.ds.clients.size > 0) {
        summary = `Local deletion applied (${decoded.ds.clients.size} delete ranges)`;
      }
    } catch {
      // Struct parsing fallback
    }

    const isConnected = this.ws && this.ws.readyState === WebSocket.OPEN;
    if (!isConnected) {
      this.pendingUpdatesQueue.push(update);
    }

    this.logOperation(
      'local',
      'insert',
      summary,
      update.byteLength,
      this.doc.clientID,
      clockRange,
      isConnected ? 'synced' : 'pending'
    );

    this.emitTelemetry();

    if (isConnected) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.ws!.send(encoding.toUint8Array(encoder));
    }
  };

  private awarenessThrottleTimer: number | null = null;
  private pendingAwarenessClients: Set<number> = new Set();

  private handleAwarenessUpdate = ({ added, updated, removed }: any, origin: any) => {
    if (origin === this) return;

    for (const c of added.concat(updated, removed)) {
      this.pendingAwarenessClients.add(c);
    }

    if (removed.length > 0) {
      // Dispatch immediately if client was removed (disconnect)
      this.flushAwareness();
      return;
    }

    if (!this.awarenessThrottleTimer) {
      this.awarenessThrottleTimer = window.setTimeout(() => {
        this.flushAwareness();
      }, 40); // 25fps throttling for smooth cursor broadcasting without network flood
    }
  };

  private flushAwareness() {
    if (this.awarenessThrottleTimer) {
      clearTimeout(this.awarenessThrottleTimer);
      this.awarenessThrottleTimer = null;
    }

    if (this.pendingAwarenessClients.size === 0) return;
    const clientsToSync = Array.from(this.pendingAwarenessClients);
    this.pendingAwarenessClients.clear();

    if (this.ws && this.ws.readyState === WebSocket.OPEN && clientsToSync.length > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientsToSync)
      );
      this.ws.send(encoding.toUint8Array(encoder));
    }
  }

  public connect() {
    this.shouldConnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.setStatus('syncing');
        console.log(`[SyncForgeProvider] WebSocket connected to ${this.wsUrl}`);

        // Sync Step 1: Send client's State Vector to server
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, this.doc);
        const step1Bytes = encoding.toUint8Array(encoder);
        this.ws!.send(step1Bytes);

        this.logOperation(
          'system',
          'sync-step-1',
          `Transmitted SyncStep1 State Vector (${step1Bytes.byteLength} B)`,
          step1Bytes.byteLength
        );

        // Send local awareness to server
        if (this.awareness.getLocalState() !== null) {
          const awarenessEncoder = encoding.createEncoder();
          encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
          );
          this.ws!.send(encoding.toUint8Array(awarenessEncoder));
        }

        // Query awareness of all other peers
        const queryEncoder = encoding.createEncoder();
        encoding.writeVarUint(queryEncoder, MESSAGE_QUERY_AWARENESS);
        this.ws!.send(encoding.toUint8Array(queryEncoder));

        // Flush any offline pending updates
        if (this.pendingUpdatesQueue.length > 0) {
          console.log(`[SyncForgeProvider] Flushing ${this.pendingUpdatesQueue.length} offline updates...`);
          for (const pendingUp of this.pendingUpdatesQueue) {
            const upEnc = encoding.createEncoder();
            encoding.writeVarUint(upEnc, MESSAGE_SYNC);
            syncProtocol.writeUpdate(upEnc, pendingUp);
            this.ws!.send(encoding.toUint8Array(upEnc));
          }
          this.pendingUpdatesQueue = [];
        }

        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.emitTelemetry();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const uint8Array = new Uint8Array(event.data);
          const decoder = decoding.createDecoder(uint8Array);
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case MESSAGE_SYNC: {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, MESSAGE_SYNC);

              // Apply sync message to local doc
              syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
              this.receivedUpdatesCount++;

              // If an answer is required (e.g. Server Step 1 -> Client Step 2 diff)
              if (encoding.length(encoder) > 1 && this.ws?.readyState === WebSocket.OPEN) {
                const replyBytes = encoding.toUint8Array(encoder);
                this.ws.send(replyBytes);
                this.logOperation(
                  'system',
                  'sync-step-2',
                  `Transmitted SyncStep2 delta payload (${replyBytes.byteLength} B) to server`,
                  replyBytes.byteLength
                );
              }

              this.emitTelemetry();
              break;
            }

            case MESSAGE_AWARENESS: {
              const update = decoding.readVarUint8Array(decoder);
              awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
              this.emitPeers();
              break;
            }

            default:
              console.warn(`[SyncForgeProvider] Unhandled message opcode: ${messageType}`);
          }
        } catch (err) {
          console.error('[SyncForgeProvider] Message decode error:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[SyncForgeProvider] WebSocket disconnected.');
        this.ws = null;
        this.setStatus('offline');
        this.logOperation('system', 'sync-step-1', 'WebSocket disconnected. Switching to local offline journaling.', 0);

        if (this.shouldConnect) {
          this.reconnectAttempts++;
          // Exponential backoff with jitter: min(1000 * 1.5^n + rand(400), 10000)
          const delay = Math.min(
            1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 400,
            10000
          );
          console.log(`[SyncForgeProvider] Scheduling reconnect attempt #${this.reconnectAttempts} in ${Math.round(delay)}ms`);
          this.reconnectTimeout = window.setTimeout(() => {
            this.connect();
          }, delay);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[SyncForgeProvider] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[SyncForgeProvider] Connection failed:', err);
      this.setStatus('error');
    }
  }

  public disconnect() {
    this.shouldConnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.awarenessThrottleTimer) {
      clearTimeout(this.awarenessThrottleTimer);
      this.awarenessThrottleTimer = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID], new Map())
        );
        this.ws.send(encoding.toUint8Array(encoder));
      } catch (err) {
        // Ignore closing socket write error
      }
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('offline');
    this.logOperation('system', 'sync-step-1', 'User manually disconnected sync (Simulated Offline Mode).', 0);
  }

  public setStatus(newStatus: ConnectionState) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      listener(newStatus);
    }
  }

  public getStatus(): ConnectionState {
    return this.status;
  }

  public setUserProfile(profile: UserProfile) {
    this.awareness.setLocalStateField('user', profile);
    this.emitPeers();
  }

  public getTelemetry(): SyncTelemetry {
    const sv = Y.encodeStateVector(this.doc);
    const docBytes = Y.encodeStateAsUpdate(this.doc).byteLength;
    return {
      clientId: this.doc.clientID,
      clock: 0,
      stateVectorEntries: sv.byteLength,
      receivedUpdates: this.receivedUpdatesCount,
      sentUpdates: this.sentUpdatesCount,
      documentBytes: docBytes,
      activePeers: this.awareness.getStates().size,
      pendingUpdates: this.pendingUpdatesQueue.length,
    };
  }

  public onStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onTelemetry(listener: TelemetryListener) {
    this.telemetryListeners.add(listener);
    listener(this.getTelemetry());
    return () => this.telemetryListeners.delete(listener);
  }

  public onPeers(listener: PeersListener) {
    this.peersListeners.add(listener);
    listener(this.awareness.getStates());
    return () => this.peersListeners.delete(listener);
  }

  private emitTelemetry() {
    const telemetry = this.getTelemetry();
    for (const listener of this.telemetryListeners) {
      listener(telemetry);
    }
  }

  private emitPeers() {
    const states = this.awareness.getStates();
    for (const listener of this.peersListeners) {
      listener(states);
    }
    this.emitTelemetry();
  }

  public destroy() {
    this.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.destroy();
    if (this.indexeddbPersistence) {
      this.indexeddbPersistence.destroy();
    }
    this.statusListeners.clear();
    this.telemetryListeners.clear();
    this.peersListeners.clear();
    this.timelineListeners.clear();
  }
}
