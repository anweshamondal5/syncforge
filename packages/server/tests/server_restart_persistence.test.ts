import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from '../src/db/database';
import { DocumentRepository } from '../src/db/repository';
import { DocManager } from '../src/sync/DocManager';
import { WsSyncServer } from '../src/sync/WsSyncServer';
import { docsRouter } from '../src/routes/docs';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { MESSAGE_SYNC } from '@syncforge/shared';

describe('SyncForge Robust Database Persistence & Server Restart Verification', () => {
  let server1: http.Server;
  let wss1: WebSocketServer;
  let wsSyncServer1: WsSyncServer;
  let wsUrl1: string;
  let port1: number;

  before(async () => {
    await getDb();
  });

  test('Create document, edit via CRDT, shut down server, restart fresh server, and verify 100% content restoration', async () => {
    const docId = `restart_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docTitle = 'Mission Critical Distributed Architecture Paper';
    const docCreator = 'Anwesha (Staff Engineer)';

    // Phase 1: Start Initial Server Instance
    const app1 = express();
    app1.use(cors());
    app1.use(express.json());
    app1.use('/api/docs', docsRouter);

    server1 = http.createServer(app1);
    wss1 = new WebSocketServer({ server: server1 });
    wsSyncServer1 = new WsSyncServer(wss1);

    await new Promise<void>((resolve) => {
      server1.listen(0, '127.0.0.1', () => {
        const address = server1.address() as any;
        port1 = address.port;
        wsUrl1 = `ws://127.0.0.1:${port1}/ws/${docId}`;
        resolve();
      });
    });

    // Step 1: Create Document via Repository with Metadata
    const createdDoc = await DocumentRepository.createDocument(docId, docTitle, docCreator);
    assert.strictEqual(createdDoc.id, docId);
    assert.strictEqual(createdDoc.title, docTitle);
    assert.strictEqual(createdDoc.creator, docCreator);

    // Step 2: Client 1 Connects and Edits Rich-Text Content
    const docClient1 = new Y.Doc();
    const wsClient1 = new WebSocket(wsUrl1);

    await new Promise<void>((resolve) => {
      const sendStep1 = () => {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(enc, docClient1);
        wsClient1.send(encoding.toUint8Array(enc));
      };

      if (wsClient1.readyState === WebSocket.OPEN) {
        sendStep1();
      } else {
        wsClient1.on('open', sendStep1);
      }

      wsClient1.on('message', (data: Buffer) => {
        const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const decoder = decoding.createDecoder(uint8);
        const msgType = decoding.readVarUint(decoder);
        if (msgType === MESSAGE_SYNC) {
          const enc = encoding.createEncoder();
          encoding.writeVarUint(enc, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, enc, docClient1, wsClient1);
          if (encoding.length(enc) > 1) {
            wsClient1.send(encoding.toUint8Array(enc));
          }
          resolve();
        }
      });
    });

    // Perform Rich-Text insertions on Client 1
    const frag1 = docClient1.getXmlFragment('default');
    const h1 = new Y.XmlElement('heading');
    h1.setAttribute('level', '1');
    h1.insert(0, [new Y.XmlText('Chapter 1: Fault-Tolerant State Replication')]);

    const ul = new Y.XmlElement('bulletList');
    const li1 = new Y.XmlElement('listItem');
    li1.insert(0, [new Y.XmlText('PostgreSQL / SQLite Dual-Tier Persistence')]);
    const li2 = new Y.XmlElement('listItem');
    li2.insert(0, [new Y.XmlText('Snapshot Compaction & Zero-Data-Loss Guarantees')]);
    ul.insert(0, [li1, li2]);

    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('CRDT replicas guarantee strong eventual consistency across crashes.')]);

    frag1.insert(0, [h1, ul, p]);

    // Send edits to Server 1
    const updateClient1 = Y.encodeStateAsUpdate(docClient1);
    const updateEncoder = encoding.createEncoder();
    encoding.writeVarUint(updateEncoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(updateEncoder, updateClient1);
    wsClient1.send(encoding.toUint8Array(updateEncoder));

    // Wait for server to process update
    await new Promise((r) => setTimeout(r, 400));

    // Force persistence flush to database
    await DocManager.persistDocNow(docId);

    const preShutdownContent = docClient1.getXmlFragment('default').toString();

    // Step 3: FULL SERVER SHUTDOWN (Simulate crash / planned restart)
    wsSyncServer1.close();
    wsClient1.removeAllListeners();
    wsClient1.terminate();
    for (const client of wss1.clients) {
      client.removeAllListeners();
      client.terminate();
    }
    wss1.close();
    (server1 as any).closeAllConnections?.();
    await new Promise<void>((resolve) => server1.close(() => resolve()));
    console.log('[Test] Server 1 shut down successfully');

    // Evict all in-memory state
    DocManager.clearAll();
    assert.strictEqual(DocManager.getActiveRoomCount(), 0);

    // Step 4: RESTART BRAND NEW SERVER INSTANCE
    const app2 = express();
    app2.use(cors());
    app2.use(express.json());
    app2.use('/api/docs', docsRouter);

    const server2 = http.createServer(app2);
    const wss2 = new WebSocketServer({ server: server2 });
    const wsSyncServer2 = new WsSyncServer(wss2);

    let wsUrl2 = '';
    await new Promise<void>((resolve) => {
      server2.listen(0, '127.0.0.1', () => {
        const address = server2.address() as any;
        wsUrl2 = `ws://127.0.0.1:${address.port}/ws/${docId}`;
        resolve();
      });
    });
    console.log('[Test] Server 2 started successfully');

    // Step 5: Verify Metadata Restored from Database via REST API
    const restoredDocMeta = await DocumentRepository.getDocument(docId);
    assert.ok(restoredDocMeta !== null);
    assert.strictEqual(restoredDocMeta?.id, docId);
    assert.strictEqual(restoredDocMeta?.title, docTitle);
    assert.strictEqual(restoredDocMeta?.creator, docCreator);
    assert.ok(restoredDocMeta?.size_bytes! > 0);
    assert.ok(restoredDocMeta?.update_count! >= 1);
    console.log('[Test] Document metadata restored and verified');

    // Step 6: Connect a Fresh Client to the Restarted Server
    const docClient2 = new Y.Doc();
    const wsClient2 = new WebSocket(wsUrl2);

    await new Promise<void>((resolve) => {
      const finishIfLoaded = () => {
        if (docClient2.getXmlFragment('default').toString().length > 0) {
          resolve();
        }
      };

      docClient2.on('update', finishIfLoaded);

      const sendStep1 = () => {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(enc, docClient2);
        wsClient2.send(encoding.toUint8Array(enc));
      };

      if (wsClient2.readyState === WebSocket.OPEN) {
        sendStep1();
      } else {
        wsClient2.on('open', sendStep1);
      }

      wsClient2.on('message', (data: Buffer) => {
        const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const decoder = decoding.createDecoder(uint8);
        const msgType = decoding.readVarUint(decoder);
        if (msgType === MESSAGE_SYNC) {
          const enc = encoding.createEncoder();
          encoding.writeVarUint(enc, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, enc, docClient2, wsClient2);
          if (encoding.length(enc) > 1) {
            wsClient2.send(encoding.toUint8Array(enc));
          }
          finishIfLoaded();
        }
      });
    });
    console.log('[Test] Client 2 connected and received sync step 2');

    // Step 7: Assert 100% Content Restoration Equality
    const postRestartContent = docClient2.getXmlFragment('default').toString();

    assert.strictEqual(postRestartContent, preShutdownContent);
    assert.ok(postRestartContent.includes('Chapter 1: Fault-Tolerant State Replication'));
    assert.ok(postRestartContent.includes('PostgreSQL / SQLite Dual-Tier Persistence'));
    assert.ok(postRestartContent.includes('Snapshot Compaction & Zero-Data-Loss Guarantees'));
    assert.ok(postRestartContent.includes('CRDT replicas guarantee strong eventual consistency across crashes.'));
    console.log('[Test] Content equality verified 100%');

    // Cleanup Server 2
    wsSyncServer2.close();
    wsClient2.removeAllListeners();
    wsClient2.terminate();
    docClient1.destroy();
    docClient2.destroy();
    for (const client of wss2.clients) {
      client.removeAllListeners();
      client.terminate();
    }
    wss2.close();
    DocManager.clearAll();
    (server2 as any).closeAllConnections?.();
    await new Promise<void>((resolve) => server2.close(() => resolve()));
    console.log('[Test] Server 2 cleaned up successfully');
  });
});
