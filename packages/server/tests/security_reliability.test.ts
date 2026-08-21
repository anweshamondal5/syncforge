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
import { isValidDocId, sanitizeString, createRateLimiter } from '../src/middleware/security';
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
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/docs', docsRouter);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, maxPayload: 5 * 1024 * 1024 });
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

describe('SyncForge Security & Reliability Pass', () => {
  // 1. Document ID Validation
  test('1. isValidDocId rejects malicious, path-traversal, and oversized IDs', () => {
    assert.strictEqual(isValidDocId('valid-doc_123'), true);
    assert.strictEqual(isValidDocId('doc_abc_XYZ_456'), true);

    // Path traversal attacks
    assert.strictEqual(isValidDocId('../../../etc/passwd'), false);
    assert.strictEqual(isValidDocId('..\\..\\windows\\system32'), false);
    assert.strictEqual(isValidDocId('/root/doc'), false);

    // SQL Injection patterns
    assert.strictEqual(isValidDocId("' OR '1'='1"), false);
    assert.strictEqual(isValidDocId('doc; DROP TABLE documents;--'), false);

    // Invalid characters and boundary lengths
    assert.strictEqual(isValidDocId(''), false);
    assert.strictEqual(isValidDocId('doc with spaces'), false);
    assert.strictEqual(isValidDocId('doc\0nullbyte'), false);
    assert.strictEqual(isValidDocId('a'.repeat(129)), false);
    assert.strictEqual(isValidDocId('a'.repeat(128)), true);
  });

  // 2. HTML and XSS string sanitization
  test('2. sanitizeString strips HTML tags, control characters, and truncates', () => {
    assert.strictEqual(
      sanitizeString('<script>alert("xss")</script>My Title'),
      'alert("xss")My Title'
    );
    assert.strictEqual(
      sanitizeString('<img src=x onerror=alert(1)>Important Doc'),
      'Important Doc'
    );
    assert.strictEqual(
      sanitizeString('Normal Title\x00\x08With Control Chars'),
      'Normal TitleWith Control Chars'
    );
    assert.strictEqual(sanitizeString('a'.repeat(300), 50).length, 50);
  });

  // 3. WebSocket rejects invalid Document IDs with close code 1008
  test('3. WebSocket rejects invalid document IDs with Policy Violation (1008)', async () => {
    const s = await createTestServer();
    const maliciousDocId = '..%2F..%2Fetc%2Fpasswd';

    const ws = new WebSocket(`${s.wsUrl}/ws/${maliciousDocId}`);
    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    const result = await closePromise;
    assert.strictEqual(result.code, 1008);
    assert.ok(result.reason.includes('Invalid document ID'));

    await s.close();
  });

  // 4. REST API rejects invalid Document IDs with 400 Bad Request
  test('4. REST API rejects invalid document IDs with 400 status', async () => {
    const s = await createTestServer();

    const res = await fetch(`http://127.0.0.1:${s.port}/api/docs/..%2F..%2Fmalicious`);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes('Invalid document ID'));

    await s.close();
  });

  // 5. Malformed binary WebSocket message does not crash server
  test('5. Malformed binary WebSocket messages are safely caught without crashing the server', async () => {
    const s = await createTestServer();
    const docId = `safe_doc_${Date.now()}`;
    const ws = new WebSocket(`${s.wsUrl}/ws/${docId}`);

    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    // Send corrupted / random garbage binary buffer
    const garbageBuffer = Buffer.from([0xff, 0xfe, 0x00, 0x12, 0x99, 0xbb]);
    ws.send(garbageBuffer);

    await new Promise((r) => setTimeout(r, 200));

    // Send a valid Yjs message right after garbage to verify server is still responsive and uncorrupted
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, new Y.Doc());
    ws.send(encoding.toUint8Array(enc));

    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(ws.readyState, WebSocket.OPEN);

    ws.terminate();
    await s.close();
  });

  // 6. Oversized WebSocket message rejection (>5MB)
  test('6. Oversized WebSocket messages are rejected with close code 1009 or socket termination', async () => {
    const s = await createTestServer();
    const docId = `oversize_doc_${Date.now()}`;
    const ws = new WebSocket(`${s.wsUrl}/ws/${docId}`, { maxPayload: 10 * 1024 * 1024 });
    ws.on('error', () => {}); // Catch expected client connection drop

    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    await new Promise((r) => setTimeout(r, 200));

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Send 5.5 MB payload
    const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0x41);
    ws.send(oversizedBuffer);

    const result = await closePromise;
    assert.ok(result.code === 1009 || result.code === 1006);

    await s.close();
  });

  // 7. Message flood rate limiter triggers socket closure (1008)
  test('7. WebSocket message flood terminates abusive connection with 1008', async () => {
    const s = await createTestServer();
    const docId = `flood_doc_${Date.now()}`;
    const ws = new WebSocket(`${s.wsUrl}/ws/${docId}`);
    ws.on('error', () => {}); // Catch expected client connection drop

    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    await new Promise((r) => setTimeout(r, 200));

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Flood 350 messages rapidly within a few milliseconds
    for (let i = 0; i < 350; i++) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(enc, new Y.Doc());
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoding.toUint8Array(enc));
      }
    }

    const result = await closePromise;
    assert.ok(result.code === 1008 || result.code === 1006);

    await s.close();
  });

  // 8. Stale room teardown removes update handlers to prevent listener leaks
  test('8. Stale room teardown removes event listeners and evicts awareness map', async () => {
    const s = await createTestServer();
    const docId = `leak_check_${Date.now()}`;

    const ws = new WebSocket(`${s.wsUrl}/ws/${docId}`);
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(s.wsSyncServer.getActivePeersForDoc(docId), 1);
    assert.strictEqual(s.wsSyncServer.getActiveConnectionsCount(), 1);

    // Disconnect
    ws.terminate();
    await new Promise((r) => setTimeout(r, 200));

    // Room must be cleared from WsSyncServer
    assert.strictEqual(s.wsSyncServer.getActivePeersForDoc(docId), 0);
    assert.strictEqual(s.wsSyncServer.getActiveConnectionsCount(), 0);

    await s.close();
  });

  // 9. SQL injection attempt in document title safely parameterized
  test('9. SQL injection strings in document title are safely parameterized without executing', async () => {
    const docId = `sqli_test_${Date.now()}`;
    const maliciousTitle = "Robert'); DROP TABLE documents;--";

    // Create document with SQL injection string
    const doc = await DocumentRepository.createDocument(docId, maliciousTitle, "Hacker'; DROP TABLE documents;--");
    assert.strictEqual(doc.title, maliciousTitle);

    // Verify documents table was not dropped and data exists
    const fetched = await DocumentRepository.getDocument(docId);
    assert.ok(fetched !== null);
    assert.strictEqual(fetched.title, maliciousTitle);

    await DocumentRepository.deleteDocument(docId);
  });

  // 10. Sliding window REST Rate Limiter blocks excessive calls
  test('10. Express Rate Limiter blocks excessive requests with 429 status', async () => {
    const app = express();
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 5 });
    app.use('/test', limiter, (req, res) => res.json({ ok: true }));

    const server = http.createServer(app);
    let port = 0;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });

    for (let i = 0; i < 5; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res.status, 200);
    }

    // 6th request must be rejected with 429
    const blockedRes = await fetch(`http://127.0.0.1:${port}/test`);
    assert.strictEqual(blockedRes.status, 429);
    const json = await blockedRes.json();
    assert.strictEqual(json.success, false);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
