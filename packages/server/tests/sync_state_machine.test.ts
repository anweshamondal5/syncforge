import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

describe('SyncForge Offline-First Synchronization & State Machine Engine', () => {
  test('1. Offline replica accumulates updates, persists state vector, and syncs differential updates upon reconnect', () => {
    const serverDoc = new Y.Doc();
    const clientDoc = new Y.Doc();

    // Baseline initial sync
    const step1Enc = encoding.createEncoder();
    syncProtocol.writeSyncStep1(step1Enc, clientDoc);
    const step2Enc = encoding.createEncoder();
    syncProtocol.readSyncMessage(decoding.createDecoder(encoding.toUint8Array(step1Enc)), step2Enc, serverDoc, 'client');
    if (encoding.length(step2Enc) > 0) {
      syncProtocol.readSyncMessage(decoding.createDecoder(encoding.toUint8Array(step2Enc)), encoding.createEncoder(), clientDoc, 'server');
    }

    // Simulate Network Disconnect (Offline Mode)
    // Client accumulates offline edits
    const clientXml = clientDoc.getXmlFragment('default');
    const h1 = new Y.XmlElement('heading');
    h1.setAttribute('level', '1');
    h1.insert(0, [new Y.XmlText('Offline Architectural Document')]);
    clientXml.insert(0, [h1]);

    const p1 = new Y.XmlElement('paragraph');
    p1.insert(0, [new Y.XmlText('Written while offline in airplane mode.')]);
    clientXml.insert(1, [p1]);

    // Meanwhile, Server receives edits from another peer
    const serverXml = serverDoc.getXmlFragment('default');
    const p2 = new Y.XmlElement('paragraph');
    p2.insert(0, [new Y.XmlText('Concurrent remote peer edit made during network partition.')]);
    serverXml.insert(0, [p2]);

    // Reconnection Handshake (2-Step State Vector Sync)
    // Step 1: Client sends State Vector to Server
    const clientSv = Y.encodeStateVector(clientDoc);
    const serverDiffEncoder = encoding.createEncoder();
    syncProtocol.writeSyncStep2(serverDiffEncoder, serverDoc, clientSv);

    // Server sends its State Vector to Client
    const serverSv = Y.encodeStateVector(serverDoc);
    const clientDiffEncoder = encoding.createEncoder();
    syncProtocol.writeSyncStep2(clientDiffEncoder, clientDoc, serverSv);

    // Apply differential updates to both replicas
    syncProtocol.readSyncMessage(decoding.createDecoder(encoding.toUint8Array(serverDiffEncoder)), encoding.createEncoder(), clientDoc, 'server');
    syncProtocol.readSyncMessage(decoding.createDecoder(encoding.toUint8Array(clientDiffEncoder)), encoding.createEncoder(), serverDoc, 'client');

    // Assert total convergence
    const finalClient = clientDoc.getXmlFragment('default').toString();
    const finalServer = serverDoc.getXmlFragment('default').toString();

    assert.strictEqual(finalClient, finalServer);
    assert.ok(finalClient.includes('Offline Architectural Document'));
    assert.ok(finalClient.includes('Written while offline in airplane mode.'));
    assert.ok(finalClient.includes('Concurrent remote peer edit made during network partition.'));
  });

  test('2. Idempotency: Duplicate application of updates does not duplicate content or corrupt state vector', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    let updateCount = 0;
    let capturedUpdate: Uint8Array | null = null;
    docA.on('update', (u) => {
      capturedUpdate = u;
      updateCount++;
    });

    const fragA = docA.getXmlFragment('default');
    const h1 = new Y.XmlElement('heading');
    h1.insert(0, [new Y.XmlText('Strict Idempotency Verification')]);
    fragA.insert(0, [h1]);

    assert.ok(capturedUpdate !== null);

    // Apply update to docB FIRST time
    Y.applyUpdate(docB, capturedUpdate!);
    const firstState = docB.getXmlFragment('default').toString();

    // Apply identical update to docB SECOND time (network duplicate packet)
    Y.applyUpdate(docB, capturedUpdate!);
    const secondState = docB.getXmlFragment('default').toString();

    // Apply identical update to docB THIRD time
    Y.applyUpdate(docB, capturedUpdate!);
    const thirdState = docB.getXmlFragment('default').toString();

    assert.strictEqual(firstState, secondState);
    assert.strictEqual(secondState, thirdState);
    assert.strictEqual(docB.getXmlFragment('default').length, 1);
  });

  test('3. Three-way partitioned network split reconciles deterministically on reconnection', () => {
    const server = new Y.Doc();
    const peer1 = new Y.Doc();
    const peer2 = new Y.Doc();

    // Initial baseline
    const fragServer = server.getXmlFragment('default');
    fragServer.insert(0, [new Y.XmlElement('paragraph')]);
    const initUpdate = Y.encodeStateAsUpdate(server);
    Y.applyUpdate(peer1, initUpdate);
    Y.applyUpdate(peer2, initUpdate);

    // Partition: Peer 1 edits offline
    const p1Frag = peer1.getXmlFragment('default');
    const item1 = new Y.XmlElement('heading');
    item1.setAttribute('level', '2');
    item1.insert(0, [new Y.XmlText('Peer 1 Offline Feature')]);
    p1Frag.insert(p1Frag.length, [item1]);

    // Partition: Peer 2 edits offline concurrently
    const p2Frag = peer2.getXmlFragment('default');
    const item2 = new Y.XmlElement('paragraph');
    item2.insert(0, [new Y.XmlText('Peer 2 Offline Bugfix')]);
    p2Frag.insert(0, [item2]);

    // Reconnection: Sync Peer 1 <-> Server
    {
      const diffToServer = Y.encodeStateAsUpdate(peer1, Y.encodeStateVector(server));
      const diffToPeer1 = Y.encodeStateAsUpdate(server, Y.encodeStateVector(peer1));
      Y.applyUpdate(server, diffToServer);
      Y.applyUpdate(peer1, diffToPeer1);
    }

    // Reconnection: Sync Peer 2 <-> Server
    {
      const diffToServer = Y.encodeStateAsUpdate(peer2, Y.encodeStateVector(server));
      const diffToPeer2 = Y.encodeStateAsUpdate(server, Y.encodeStateVector(peer2));
      Y.applyUpdate(server, diffToServer);
      Y.applyUpdate(peer2, diffToPeer2);
    }

    // Final Sync: Broadcast Server delta to Peer 1
    {
      const diffToPeer1 = Y.encodeStateAsUpdate(server, Y.encodeStateVector(peer1));
      Y.applyUpdate(peer1, diffToPeer1);
    }

    const stateServer = server.getXmlFragment('default').toString();
    const statePeer1 = peer1.getXmlFragment('default').toString();
    const statePeer2 = peer2.getXmlFragment('default').toString();

    assert.strictEqual(stateServer, statePeer1);
    assert.strictEqual(statePeer1, statePeer2);
    assert.ok(stateServer.includes('Peer 1 Offline Feature'));
    assert.ok(stateServer.includes('Peer 2 Offline Bugfix'));
  });
});
