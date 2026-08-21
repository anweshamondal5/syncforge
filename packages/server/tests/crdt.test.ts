import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

describe('SyncForge CRDT Engine Tests', () => {
  test('1. Two replicas converge on sequential insertions', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    docA.on('update', (update) => {
      Y.applyUpdate(docB, update);
    });

    const textA = docA.getText('content');
    textA.insert(0, 'Hello World from SyncForge!');

    const textB = docB.getText('content');
    assert.strictEqual(textB.toString(), 'Hello World from SyncForge!');
  });

  test('2. Concurrent conflicting insertions at position 0 deterministically converge', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Initial sync
    const textA = docA.getText('content');
    const textB = docB.getText('content');
    textA.insert(0, 'Base Text. ');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    assert.strictEqual(textA.toString(), 'Base Text. ');
    assert.strictEqual(textB.toString(), 'Base Text. ');

    // Concurrent independent edits while partitioned
    textA.insert(0, '[User A Edit] ');
    textB.insert(0, '[User B Edit] ');

    // Capture state vectors before sync
    const svA = Y.encodeStateVector(docA);
    const svB = Y.encodeStateVector(docB);

    // Compute diffs
    const diffForB = Y.encodeStateAsUpdate(docA, svB);
    const diffForA = Y.encodeStateAsUpdate(docB, svA);

    // Apply diffs
    Y.applyUpdate(docA, diffForA);
    Y.applyUpdate(docB, diffForB);

    // Verify mathematical convergence
    assert.strictEqual(textA.toString(), textB.toString());
    assert.ok(textA.toString().includes('[User A Edit]'));
    assert.ok(textA.toString().includes('[User B Edit]'));
    assert.ok(textA.toString().includes('Base Text. '));
  });

  test('3. Two-step State Vector handshake reaches total consistency', () => {
    const serverDoc = new Y.Doc();
    const clientDoc = new Y.Doc();

    // Populate server history
    serverDoc.getText('content').insert(0, 'Server initial content. ');

    // Populate client offline history
    clientDoc.getText('content').insert(0, 'Client offline draft. ');

    // Step 1: Client sends State Vector to Server
    const clientSV = Y.encodeStateVector(clientDoc);

    // Server calculates missing diff for client
    const serverDiff = Y.encodeStateAsUpdate(serverDoc, clientSV);

    // Step 2: Server sends State Vector to Client
    const serverSV = Y.encodeStateVector(serverDoc);
    const clientDiff = Y.encodeStateAsUpdate(clientDoc, serverSV);

    // Both apply each other's diff
    Y.applyUpdate(clientDoc, serverDiff);
    Y.applyUpdate(serverDoc, clientDiff);

    // Check complete convergence
    const finalTextServer = serverDoc.getText('content').toString();
    const finalTextClient = clientDoc.getText('content').toString();

    assert.strictEqual(finalTextServer, finalTextClient);
    assert.deepStrictEqual(Y.encodeStateVector(serverDoc), Y.encodeStateVector(clientDoc));
  });

  test('4. Rich Text XML Fragments converge across multiple concurrent collaborators', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const doc3 = new Y.Doc();

    const frag1 = doc1.getXmlFragment('default');
    const frag2 = doc2.getXmlFragment('default');
    const frag3 = doc3.getXmlFragment('default');

    const p1 = new Y.XmlElement('paragraph');
    p1.insert(0, [new Y.XmlText('Section 1 Title')]);
    frag1.insert(0, [p1]);

    // Replicate to doc2 and doc3
    const update1 = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update1);
    Y.applyUpdate(doc3, update1);

    // Concurrent formatting and node insertions
    const p2 = new Y.XmlElement('paragraph');
    p2.insert(0, [new Y.XmlText('Added by User 2')]);
    frag2.insert(1, [p2]);

    const p3 = new Y.XmlElement('paragraph');
    p3.insert(0, [new Y.XmlText('Added by User 3')]);
    frag3.insert(1, [p3]);

    // 3-way sync
    const u2 = Y.encodeStateAsUpdate(doc2);
    const u3 = Y.encodeStateAsUpdate(doc3);

    Y.applyUpdate(doc1, u2);
    Y.applyUpdate(doc1, u3);
    Y.applyUpdate(doc2, u3);
    Y.applyUpdate(doc3, u2);
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
    Y.applyUpdate(doc3, Y.encodeStateAsUpdate(doc1));

    assert.strictEqual(frag1.toString(), frag2.toString());
    assert.strictEqual(frag2.toString(), frag3.toString());
  });
});
