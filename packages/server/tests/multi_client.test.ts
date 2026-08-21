import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from '../src/db/database';
import { DocManager } from '../src/sync/DocManager';
import { WsSyncServer } from '../src/sync/WsSyncServer';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { MESSAGE_SYNC } from '@syncforge/shared';

describe('SyncForge Multi-Client Real-Time WebSocket Synchronization', () => {
  test('Two concurrent WebSocket clients edit simultaneously and reach mathematical convergence', async () => {
    await getDb();
    const app = express();
    app.use(cors());
    app.use(express.json());

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });
    const wsSyncServer = new WsSyncServer(wss);

    let wsUrl = '';
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        wsUrl = `ws://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const docId = `e2e_sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fullWsUrl = `${wsUrl}/ws/${docId}`;

    const docA = new Y.Doc();
    const wsA = new WebSocket(fullWsUrl);
    const awarenessA = new awarenessProtocol.Awareness(docA);

    const docB = new Y.Doc();
    const wsB = new WebSocket(fullWsUrl);
    const awarenessB = new awarenessProtocol.Awareness(docB);

    function bindClient(ws: WebSocket, doc: Y.Doc, awareness: awarenessProtocol.Awareness) {
      ws.on('open', () => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, doc);
        ws.send(encoding.toUint8Array(encoder));
      });

      ws.on('message', (data: Buffer) => {
        const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const decoder = decoding.createDecoder(uint8);
        const msgType = decoding.readVarUint(decoder);

        if (msgType === MESSAGE_SYNC) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        }
      });

      doc.on('update', (update: Uint8Array, origin: any) => {
        if (origin === ws) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encoding.toUint8Array(encoder));
        }
      });
    }

    bindClient(wsA, docA, awarenessA);
    bindClient(wsB, docB, awarenessB);

    // Wait for connection handshake
    await new Promise((r) => setTimeout(r, 200));

    // Client A inserts Heading
    const fragA = docA.getXmlFragment('default');
    const h1 = new Y.XmlElement('heading');
    h1.setAttribute('level', '1');
    h1.insert(0, [new Y.XmlText('CRDT Convergence Verified')]);
    fragA.insert(0, [h1]);

    // Client B inserts Paragraph concurrently
    const fragB = docB.getXmlFragment('default');
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('Real-time conflict-free collaboration engine.')]);
    fragB.insert(fragB.length, [p]);

    // Wait for propagation
    await new Promise((r) => setTimeout(r, 400));

    const contentA = docA.getXmlFragment('default').toString();
    const contentB = docB.getXmlFragment('default').toString();

    try {
      assert.strictEqual(contentA, contentB);
      assert.ok(contentA.includes('CRDT Convergence Verified'));
      assert.ok(contentA.includes('Real-time conflict-free collaboration engine.'));
    } catch (err) {
      console.error('[multi_client.test.ts ERROR]:', err);
      throw err;
    } finally {
      wsSyncServer.close();
      wsA.removeAllListeners();
      wsB.removeAllListeners();
      wsA.terminate();
      wsB.terminate();
      docA.destroy();
      docB.destroy();
      awarenessA.destroy();
      awarenessB.destroy();
      for (const client of wss.clients) {
        client.removeAllListeners();
        client.terminate();
      }
      wss.close();
      DocManager.clearAll();
      (server as any).closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
