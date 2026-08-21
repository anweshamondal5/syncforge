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

// Helper to spawn a test HTTP + WebSocket server instance
async function createTestServer() {
  await getDb();
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/docs', docsRouter);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const wsSyncServer = new WsSyncServer(wss);

  let port = 0;
  let wsUrl = '';
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      port = addr.port;
      wsUrl = `ws://127.0.0.1:${port}`;
      resolve();
    });
  });

  const close = async () => {
    wsSyncServer.close();
    for (const client of wss.clients) {
      client.removeAllListeners();
      client.terminate();
    }
    wss.close();
    DocManager.clearAll();
    (server as any).closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { server, wss, wsSyncServer, port, wsUrl, close };
}

// Helper to bind a test Y.Doc client to a WebSocket
function connectTestClient(wsUrl: string, docId: string, doc: Y.Doc = new Y.Doc()) {
  const ws = new WebSocket(`${wsUrl}/ws/${docId}`);

  const sendStep1 = () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    ws.send(encoding.toUint8Array(enc));
  };

  if (ws.readyState === WebSocket.OPEN) {
    sendStep1();
  } else {
    ws.on('open', sendStep1);
  }

  ws.on('message', (data: Buffer) => {
    const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const decoder = decoding.createDecoder(uint8);
    const msgType = decoding.readVarUint(decoder);
    if (msgType === MESSAGE_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, enc, doc, ws);
      if (encoding.length(enc) > 1) {
        ws.send(encoding.toUint8Array(enc));
      }
    }
  });

  const updateHandler = (update: Uint8Array, origin: any) => {
    if (origin === ws) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeUpdate(enc, update);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(enc));
    }
  };
  doc.on('update', updateHandler);

  const cleanup = () => {
    doc.off('update', updateHandler);
    ws.removeAllListeners();
    ws.terminate();
    doc.destroy();
  };

  return { ws, doc, cleanup };
}

describe('SyncForge Distributed Systems Chaos & Concurrency Suite', () => {
  // Test 1: Two users editing simultaneously
  test('1. Two users editing simultaneously', async () => {
    const s = await createTestServer();
    const docId = `chaos_2users_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);
    const c2 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));

    c1.doc.getXmlFragment('default').insert(0, [new Y.XmlText('Alpha User Content')]);
    c2.doc.getXmlFragment('default').insert(0, [new Y.XmlText('Beta User Content')]);

    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(
      c1.doc.getXmlFragment('default').toString(),
      c2.doc.getXmlFragment('default').toString()
    );
    assert.ok(c1.doc.getXmlFragment('default').toString().includes('Alpha User Content'));
    assert.ok(c1.doc.getXmlFragment('default').toString().includes('Beta User Content'));

    c1.cleanup();
    c2.cleanup();
    await s.close();
  });

  // Test 2: Three users editing simultaneously
  test('2. Three users editing simultaneously', async () => {
    const s = await createTestServer();
    const docId = `chaos_3users_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);
    const c2 = connectTestClient(s.wsUrl, docId);
    const c3 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));

    c1.doc.getXmlFragment('default').insert(0, [new Y.XmlText('Node-1;')]);
    c2.doc.getXmlFragment('default').insert(0, [new Y.XmlText('Node-2;')]);
    c3.doc.getXmlFragment('default').insert(0, [new Y.XmlText('Node-3;')]);

    await new Promise((r) => setTimeout(r, 400));

    const s1 = c1.doc.getXmlFragment('default').toString();
    const s2 = c2.doc.getXmlFragment('default').toString();
    const s3 = c3.doc.getXmlFragment('default').toString();

    assert.strictEqual(s1, s2);
    assert.strictEqual(s2, s3);
    assert.ok(s1.includes('Node-1;') && s1.includes('Node-2;') && s1.includes('Node-3;'));

    c1.cleanup();
    c2.cleanup();
    c3.cleanup();
    await s.close();
  });

  // Test 3: Rapid concurrent typing (burst of 30 sequential insertions)
  test('3. Rapid concurrent typing bursts', async () => {
    const s = await createTestServer();
    const docId = `chaos_rapid_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);
    const c2 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));

    const ytext1 = c1.doc.getText('stream');
    const ytext2 = c2.doc.getText('stream');

    for (let i = 0; i < 25; i++) {
      ytext1.insert(ytext1.length, `A${i}`);
      ytext2.insert(ytext2.length, `B${i}`);
    }

    await new Promise((r) => setTimeout(r, 500));

    assert.strictEqual(c1.doc.getText('stream').toString(), c2.doc.getText('stream').toString());
    assert.strictEqual(c1.doc.getText('stream').length, c2.doc.getText('stream').length);

    c1.cleanup();
    c2.cleanup();
    await s.close();
  });

  // Test 4: Concurrent insertion at same position 0
  test('4. Concurrent insertion at identical index 0', async () => {
    const s = await createTestServer();
    const docId = `chaos_pos0_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);
    const c2 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));

    // Both insert at position 0 simultaneously
    c1.doc.getText('pos0').insert(0, '[First]');
    c2.doc.getText('pos0').insert(0, '[Second]');

    await new Promise((r) => setTimeout(r, 400));

    const res1 = c1.doc.getText('pos0').toString();
    const res2 = c2.doc.getText('pos0').toString();

    assert.strictEqual(res1, res2);
    assert.ok(res1 === '[First][Second]' || res1 === '[Second][First]');

    c1.cleanup();
    c2.cleanup();
    await s.close();
  });

  // Test 5: Concurrent deletion of overlapping ranges
  test('5. Concurrent deletion of overlapping ranges', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.getText('text').insert(0, 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG');

    // Sync baseline state to Doc B
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    assert.strictEqual(docA.getText('text').toString(), docB.getText('text').toString());

    // Doc A deletes "QUICK BROWN " (indices 4..16)
    docA.getText('text').delete(4, 12);

    // Doc B concurrently deletes "BROWN FOX " (indices 10..10)
    docB.getText('text').delete(10, 10);

    // Reconcile
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docA, updateB);
    Y.applyUpdate(docB, updateA);

    assert.strictEqual(docA.getText('text').toString(), docB.getText('text').toString());
    assert.ok(!docA.getText('text').toString().includes('BROWN'));

    docA.destroy();
    docB.destroy();
  });

  // Test 6: User disconnecting abruptly during editing
  test('6. User disconnecting abruptly during editing', async () => {
    const s = await createTestServer();
    const docId = `chaos_discon_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);
    const c2 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));

    c1.doc.getText('stream').insert(0, 'Pre-disconnect message.');
    await new Promise((r) => setTimeout(r, 200));

    // Abruptly terminate client 1
    c1.ws.terminate();

    // Client 2 continues editing
    c2.doc.getText('stream').insert(c2.doc.getText('stream').length, ' Post-disconnect addition.');
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(
      c2.doc.getText('stream').toString(),
      'Pre-disconnect message. Post-disconnect addition.'
    );

    c1.cleanup();
    c2.cleanup();
    await s.close();
  });

  // Test 7: User reconnecting and catching up on missed state
  test('7. User reconnecting and syncing missed edits', async () => {
    const s = await createTestServer();
    const docId = `chaos_reconnect_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));
    c1.doc.getText('doc').insert(0, 'Initial base text. ');
    await new Promise((r) => setTimeout(r, 200));

    // Disconnect client 1
    c1.ws.terminate();

    // Client 2 connects while client 1 is offline and makes edits
    const c2 = connectTestClient(s.wsUrl, docId);
    await new Promise((r) => setTimeout(r, 200));
    c2.doc.getText('doc').insert(c2.doc.getText('doc').length, 'Edits made while C1 was offline.');
    await new Promise((r) => setTimeout(r, 300));

    // Client 1 reconnects with its existing Y.Doc
    const c1Reconnected = connectTestClient(s.wsUrl, docId, c1.doc);
    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(
      c1.doc.getText('doc').toString(),
      'Initial base text. Edits made while C1 was offline.'
    );
    assert.strictEqual(
      c1.doc.getText('doc').toString(),
      c2.doc.getText('doc').toString()
    );

    c1.cleanup();
    c2.cleanup();
    c1Reconnected.cleanup();
    await s.close();
  });

  // Test 8: Offline partitioned edits reconciling on reconnection
  test('8. Offline partitioned replicas merge deterministically', async () => {
    const replicaA = new Y.Doc();
    const replicaB = new Y.Doc();

    replicaA.getText('content').insert(0, 'Base Header\n');
    Y.applyUpdate(replicaB, Y.encodeStateAsUpdate(replicaA));

    // Partition: Replica A makes offline changes
    replicaA.getText('content').insert(replicaA.getText('content').length, 'Section A (Offline)\n');

    // Partition: Replica B makes different offline changes
    replicaB.getText('content').insert(replicaB.getText('content').length, 'Section B (Offline)\n');

    // Reconnect & exchange updates
    const deltaA = Y.encodeStateAsUpdate(replicaA, Y.encodeStateVector(replicaB));
    const deltaB = Y.encodeStateAsUpdate(replicaB, Y.encodeStateVector(replicaA));

    Y.applyUpdate(replicaB, deltaA);
    Y.applyUpdate(replicaA, deltaB);

    assert.strictEqual(replicaA.getText('content').toString(), replicaB.getText('content').toString());
    assert.ok(replicaA.getText('content').toString().includes('Section A (Offline)'));
    assert.ok(replicaA.getText('content').toString().includes('Section B (Offline)'));

    replicaA.destroy();
    replicaB.destroy();
  });

  // Test 9: Multiple updates arriving in rapid micro-burst
  test('9. Micro-burst updates processed without loss', async () => {
    const s = await createTestServer();
    const docId = `chaos_burst_${Date.now()}`;
    const c1 = connectTestClient(s.wsUrl, docId);
    const c2 = connectTestClient(s.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));

    // Client 1 sends 50 sequential updates rapidly
    for (let i = 0; i < 50; i++) {
      c1.doc.getText('burst').insert(c1.doc.getText('burst').length, `[#${i}]`);
    }

    await new Promise((r) => setTimeout(r, 500));

    assert.strictEqual(c1.doc.getText('burst').toString(), c2.doc.getText('burst').toString());
    assert.ok(c2.doc.getText('burst').toString().includes('[#49]'));

    c1.cleanup();
    c2.cleanup();
    await s.close();
  });

  // Test 10: Duplicate update delivery idempotency
  test('10. Duplicate update delivery idempotency', async () => {
    const docOrigin = new Y.Doc();
    const docReplica = new Y.Doc();

    docOrigin.getText('idempotent').insert(0, 'Unique Message Content 12345');
    const update = Y.encodeStateAsUpdate(docOrigin);

    // Apply the exact same binary update 5 times
    Y.applyUpdate(docReplica, update);
    Y.applyUpdate(docReplica, update);
    Y.applyUpdate(docReplica, update);
    Y.applyUpdate(docReplica, update);
    Y.applyUpdate(docReplica, update);

    assert.strictEqual(docReplica.getText('idempotent').toString(), 'Unique Message Content 12345');
    assert.strictEqual(
      docReplica.getText('idempotent').toString(),
      docOrigin.getText('idempotent').toString()
    );

    docOrigin.destroy();
    docReplica.destroy();
  });

  // Test 11: Out-of-order network delivery permutation
  test('11. Out-of-order update chunks converge identically to in-order', async () => {
    const docSource = new Y.Doc();
    const updates: Uint8Array[] = [];

    // Record separate incremental updates
    docSource.on('update', (u) => updates.push(u));

    docSource.getText('text').insert(0, 'Step 1; ');
    docSource.getText('text').insert(docSource.getText('text').length, 'Step 2; ');
    docSource.getText('text').insert(docSource.getText('text').length, 'Step 3; ');
    docSource.getText('text').insert(docSource.getText('text').length, 'Step 4; ');

    const docInOrder = new Y.Doc();
    for (const u of updates) {
      Y.applyUpdate(docInOrder, u);
    }

    // Apply in reverse / permuted order on docReverse
    const docReverse = new Y.Doc();
    for (const u of [...updates].reverse()) {
      Y.applyUpdate(docReverse, u);
    }

    assert.strictEqual(docInOrder.getText('text').toString(), docReverse.getText('text').toString());
    assert.strictEqual(docReverse.getText('text').toString(), 'Step 1; Step 2; Step 3; Step 4; ');

    docSource.destroy();
    docInOrder.destroy();
    docReverse.destroy();
  });

  // Test 12: Server restart and cold recovery
  test('12. Server restart cold recovery restores state', async () => {
    const s1 = await createTestServer();
    const docId = `chaos_cold_restart_${Date.now()}`;
    const c1 = connectTestClient(s1.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 200));
    c1.doc.getXmlFragment('default').insert(0, [new Y.XmlText('Persistent Cold State Data')]);
    await new Promise((r) => setTimeout(r, 300));
    await DocManager.persistDocNow(docId);

    c1.cleanup();
    await s1.close();

    // Start brand new server 2
    const s2 = await createTestServer();
    const c2 = connectTestClient(s2.wsUrl, docId);

    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(
      c2.doc.getXmlFragment('default').toString(),
      'Persistent Cold State Data'
    );

    c2.cleanup();
    await s2.close();
  });

  // Test 13: Large document stress test (1,000 nodes)
  test('13. Large document stress test with 500+ nodes', async () => {
    const docLarge = new Y.Doc();
    const frag = docLarge.getXmlFragment('default');

    for (let i = 0; i < 500; i++) {
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText(`Paragraph entry #${i} with distributed payload details.`)]);
      frag.insert(frag.length, [p]);
    }

    const encodedSize = Y.encodeStateAsUpdate(docLarge).byteLength;
    assert.ok(encodedSize > 10000);

    const docTarget = new Y.Doc();
    Y.applyUpdate(docTarget, Y.encodeStateAsUpdate(docLarge));

    assert.strictEqual(
      docLarge.getXmlFragment('default').length,
      docTarget.getXmlFragment('default').length
    );
    assert.strictEqual(
      docLarge.getXmlFragment('default').toString(),
      docTarget.getXmlFragment('default').toString()
    );

    docLarge.destroy();
    docTarget.destroy();
  });

  // Test 14: Rapid connect and disconnect churn
  test('14. Rapid connect and disconnect churn does not leak rooms', async () => {
    const s = await createTestServer();
    const docId = `chaos_churn_${Date.now()}`;

    for (let i = 0; i < 15; i++) {
      const ws = new WebSocket(`${s.wsUrl}/ws/${docId}`);
      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          ws.terminate();
          resolve();
        });
      });
    }

    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(s.wsSyncServer.getActivePeersForDoc(docId), 0);
    assert.strictEqual(s.wsSyncServer.getActiveConnectionsCount(), 0);

    await s.close();
  });

  // Test 15: Multiple documents edited simultaneously in isolation
  test('15. Multiple documents edited simultaneously with strict room isolation', async () => {
    const s = await createTestServer();
    const docIdA = `chaos_docA_${Date.now()}`;
    const docIdB = `chaos_docB_${Date.now()}`;

    const clientA1 = connectTestClient(s.wsUrl, docIdA);
    const clientA2 = connectTestClient(s.wsUrl, docIdA);
    const clientB1 = connectTestClient(s.wsUrl, docIdB);
    const clientB2 = connectTestClient(s.wsUrl, docIdB);

    await new Promise((r) => setTimeout(r, 200));

    clientA1.doc.getText('text').insert(0, 'ROOM_A_EXCLUSIVE');
    clientB1.doc.getText('text').insert(0, 'ROOM_B_EXCLUSIVE');

    await new Promise((r) => setTimeout(r, 400));

    assert.strictEqual(clientA1.doc.getText('text').toString(), 'ROOM_A_EXCLUSIVE');
    assert.strictEqual(clientA2.doc.getText('text').toString(), 'ROOM_A_EXCLUSIVE');
    assert.strictEqual(clientB1.doc.getText('text').toString(), 'ROOM_B_EXCLUSIVE');
    assert.strictEqual(clientB2.doc.getText('text').toString(), 'ROOM_B_EXCLUSIVE');

    // Assert zero cross-talk
    assert.ok(!clientA1.doc.getText('text').toString().includes('ROOM_B'));
    assert.ok(!clientB1.doc.getText('text').toString().includes('ROOM_A'));

    clientA1.cleanup();
    clientA2.cleanup();
    clientB1.cleanup();
    clientB2.cleanup();
    await s.close();
  });

  // Test 16: Chaotic 5-Replica Out-of-Order Convergence Test
  test('16. Chaotic 5-Replica Out-of-Order Convergence Test', async () => {
    const replicas = [
      new Y.Doc(),
      new Y.Doc(),
      new Y.Doc(),
      new Y.Doc(),
      new Y.Doc(),
    ];

    // Seed baseline document
    replicas[0].getText('main').insert(0, 'ROOT_SEED\n');
    const rootUpdate = Y.encodeStateAsUpdate(replicas[0]);
    for (let i = 1; i < replicas.length; i++) {
      Y.applyUpdate(replicas[i], rootUpdate);
    }

    // Collect all independent operation updates
    const allUpdates: Uint8Array[] = [];

    // Replica 0 writes
    replicas[0].getText('main').insert(replicas[0].getText('main').length, '[R0-Insert-1]');
    allUpdates.push(Y.encodeStateAsUpdate(replicas[0]));

    // Replica 1 writes
    replicas[1].getText('main').insert(0, '[R1-Header]');
    allUpdates.push(Y.encodeStateAsUpdate(replicas[1]));

    // Replica 2 writes
    replicas[2].getText('main').insert(replicas[2].getText('main').length, '[R2-Footer]');
    allUpdates.push(Y.encodeStateAsUpdate(replicas[2]));

    // Replica 3 writes
    replicas[3].getText('main').insert(5, '[R3-Mid]');
    allUpdates.push(Y.encodeStateAsUpdate(replicas[3]));

    // Replica 4 writes
    replicas[4].getText('main').insert(replicas[4].getText('main').length, '[R4-End]');
    allUpdates.push(Y.encodeStateAsUpdate(replicas[4]));

    // Deliver all updates to each replica in randomized shuffled permutations
    function shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    for (let r = 0; r < replicas.length; r++) {
      const randomizedOrder = shuffle(allUpdates);
      for (const update of randomizedOrder) {
        Y.applyUpdate(replicas[r], update);
      }
    }

    // Assert 100% mathematical convergence across all 5 replicas
    const canonicalState = replicas[0].getText('main').toString();
    for (let r = 1; r < replicas.length; r++) {
      assert.strictEqual(
        replicas[r].getText('main').toString(),
        canonicalState,
        `Replica #${r} diverged from Canonical Replica #0`
      );
    }

    assert.ok(canonicalState.includes('[R0-Insert-1]'));
    assert.ok(canonicalState.includes('[R1-Header]'));
    assert.ok(canonicalState.includes('[R2-Footer]'));
    assert.ok(canonicalState.includes('[R3-Mid]'));
    assert.ok(canonicalState.includes('[R4-End]'));

    for (const r of replicas) {
      r.destroy();
    }
  });
});
