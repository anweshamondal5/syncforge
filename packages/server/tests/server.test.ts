import { test, describe } from 'node:test';
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

describe('SyncForge REST API & Persistence Tests', () => {
  test('1. Create, Retrieve, and Rename document via REST API', async () => {
    await getDb();
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/docs', docsRouter);

    const server = http.createServer(app);
    let baseUrl = '';
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const testDocId = `test_doc_${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: testDocId, title: 'Integration Test Document', creator: 'Test Creator' }),
    });

    assert.strictEqual(createRes.status, 201);
    const createJson: any = await createRes.json();
    assert.strictEqual(createJson.data.id, testDocId);
    assert.strictEqual(createJson.data.title, 'Integration Test Document');
    assert.strictEqual(createJson.data.creator, 'Test Creator');

    // Retrieve
    const getRes = await fetch(`${baseUrl}/api/docs/${testDocId}`);
    assert.strictEqual(getRes.status, 200);
    const getJson: any = await getRes.json();
    assert.strictEqual(getJson.data.title, 'Integration Test Document');
    assert.strictEqual(getJson.data.creator, 'Test Creator');

    // Rename
    const renameRes = await fetch(`${baseUrl}/api/docs/${testDocId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed Document Title' }),
    });
    assert.strictEqual(renameRes.status, 200);
    const renameJson: any = await renameRes.json();
    assert.strictEqual(renameJson.data.title, 'Renamed Document Title');

    // List
    const listRes = await fetch(`${baseUrl}/api/docs`);
    const listJson: any = await listRes.json();
    assert.ok(listJson.data.some((d: any) => d.id === testDocId));

    // Delete
    const deleteRes = await fetch(`${baseUrl}/api/docs/${testDocId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(deleteRes.status, 200);

    // Teardown
    (server as any).closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('2. Binary WebSocket CRDT synchronization and persistence reload', async () => {
    await getDb();
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/docs', docsRouter);

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

    const syncDocId = `sync_test_${Date.now()}`;
    await DocumentRepository.createDocument(syncDocId, 'WS Test Document', 'WS Tester');

    const clientDoc = new Y.Doc();
    const ws = new WebSocket(`${wsUrl}/ws/${syncDocId}`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(enc, clientDoc);
        ws.send(encoding.toUint8Array(enc));
        resolve();
      });
      ws.on('error', reject);
    });

    // Listen to messages from server
    ws.on('message', (data: Buffer) => {
      const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const decoder = decoding.createDecoder(uint8);
      const msgType = decoding.readVarUint(decoder);
      if (msgType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, clientDoc, ws);
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
      }
    });

    // Client makes a rich text edit
    const xmlFragment = clientDoc.getXmlFragment('default');
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Live content via WebSocket CRDT')]);
    xmlFragment.insert(0, [paragraph]);

    // Send update to server
    const update = Y.encodeStateAsUpdate(clientDoc);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));

    // Wait for server to receive and process
    await new Promise((r) => setTimeout(r, 300));

    // Flush and check DocManager / Repository state
    await DocManager.flushUpdates(syncDocId);
    const loadedDoc = await DocManager.getOrCreateDoc(syncDocId);

    assert.strictEqual(
      loadedDoc.getXmlFragment('default').toString(),
      clientDoc.getXmlFragment('default').toString()
    );

    // Teardown
    wsSyncServer.close();
    ws.removeAllListeners();
    ws.terminate();
    clientDoc.destroy();
    for (const client of wss.clients) {
      client.removeAllListeners();
      client.terminate();
    }
    wss.close();
    DocManager.clearAll();
    (server as any).closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await DocumentRepository.deleteDocument(syncDocId);
  });
});
