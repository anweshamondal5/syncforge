# SyncForge Distributed Systems Architecture & Correctness Boundaries

This document provides a technical specification of the distributed system model underlying **SyncForge**, detailing the operational responsibilities, concurrency model, and architectural correctness boundaries.

---

## 1. System Overview & Distributed Model

SyncForge is a real-time collaborative document platform built on Conflict-Free Replicated Data Types (CRDTs), state machine synchronization, and an append-only persistence layer.

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                           │
│  [ProseMirror Editor] ──► [Y.Doc CRDT] ──► [SyncForgeProvider]
└──────────────────────────────┬──────────────────────────────┘
                               │ Binary WebSocket (varuint)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     SyncForge Server                        │
│  [WsSyncServer (Relay)] ──► [DocManager (In-Memory WAL)]    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Debounced Batch / Compaction
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Persistence Tier                         │
│  [PostgreSQL / SQLite] ── (documents + document_updates)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Explicit Correctness & Architectural Boundaries

To ensure engineering transparency, the responsibilities of each layer are delineated below:

### A. Correctness Guaranteed by Yjs (CRDT Mathematical Engine)

Yjs is a mature operation-based CRDT implementation providing state convergence without a central coordinating master:

1. **Deterministic Conflict Resolution (Strong Eventual Consistency)**:
   - Concurrent insertions at identical logical positions are deterministically ordered using Lamport timestamps and unique replica `clientID` tie-breakers.
   - Insertions and deletions are commutative and associative: regardless of network delivery permutations or out-of-order packet arrivals, all replicas compute identical document trees.
2. **Deletion Set Commutativity**:
   - Deletions are recorded in Delete Sets (`ds`) referencing unique struct item IDs rather than mutable array indices. Deleting an already-deleted range is strictly idempotent and cannot corrupt neighbouring nodes.
3. **State Vector Differential Handshake**:
   - The two-step State Vector sync protocol calculates the exact minimal differential delta $\Delta = \text{doc} \setminus \text{StateVector}_{\text{peer}}$, guaranteeing that missing updates are computed with zero redundant bytes.

---

### B. Synchronization Logic Implemented by SyncForge

The SyncForge synchronization engine (`SyncForgeProvider` on the frontend and `WsSyncServer` on the backend) manages the network lifecycle, transport framing, and presence propagation:

1. **Binary Transport Framing & Protocol Opcodes**:
   - Implements compact `lib0/encoding` varuint framing distinguishing CRDT synchronization messages (`MESSAGE_SYNC`), ephemeral presence broadcasts (`MESSAGE_AWARENESS`), and awareness queries (`MESSAGE_QUERY_AWARENESS`).
2. **Early Message Queuing & Race Condition Elimination**:
   - Sockets connecting while the backend hydrates document state from disk or PostgreSQL buffer incoming `SyncStep1` messages in an early queue. The queue drains immediately upon room readiness, preventing dropped initial sync messages.
3. **Awareness & Cursor Throttling (25 FPS / 40ms)**:
   - Decouples high-frequency mouse movements from CRDT document history. Cursor positions are broadcast via a 40ms trailing-edge throttle buffer to prevent network congestion while rendering smooth peer cursors.
4. **Resilient Exponential Backoff with Jitter**:
   - Automatic reconnect loop using $T = \min(1000 \times 1.5^n + \text{rand}(400), 10000)\text{ ms}$ to protect the cluster from thundering-herd reconnect storms upon network recovery.

---

### C. Application & Persistence Guarantees Implemented by SyncForge

The application layer (`DocManager`, `DatabaseEngine`, `IndexeddbPersistence`) provides data durability, isolation, and system stability:

1. **Zero-Keystroke I/O Amplification (Debounced Write-Ahead Buffer)**:
   - Incoming CRDT updates are appended to an in-memory buffer and flushed to PostgreSQL/SQLite via a configurable 2,000ms debounce timer (`DOC_SAVE_DEBOUNCE_MS`), protecting the storage engine from write saturation.
2. **Constant-Time Snapshot Compaction ($O(1)$ Cold Load)**:
   - When cumulative delta updates exceed $N \ge 50$ (`DOC_SNAPSHOT_THRESHOLD`), SyncForge merges all updates into a single root state vector snapshot `Y.encodeStateAsUpdate(doc)`. This bounds storage growth and eliminates long startup replay times.
3. **Offline-First Local Journaling**:
   - Browser edits executed while disconnected are cached in browser `IndexedDB` (`syncforge_doc_<id>`). Upon reconnection, pending updates are dispatched and reconciled automatically.
4. **Relational Metadata & Multi-Tenant Room Isolation**:
   - Strict document room isolation ensuring concurrent edits to Document A and Document B never cross-pollinate, while tracking document ownership, created timestamps, byte sizes, and update counts.

---

## 3. Distributed Chaos Verification Summary

SyncForge is validated against 16 automated distributed failure modes in [`distributed_chaos.test.ts`](file:///packages/server/tests/distributed_chaos.test.ts):

| Test Scenario | Validation Strategy | Outcome |
| :--- | :--- | :--- |
| **Two Users Editing Simultaneously** | Concurrent paragraph and heading insertions | **Passed (Converged)** |
| **Three Users Editing Simultaneously** | 3 simultaneous list insertions | **Passed (Converged)** |
| **Rapid Typing Bursts** | 50 rapid sequential character insertions | **Passed (Converged)** |
| **Concurrent Position 0 Insertions** | Conflicting block insertions at index 0 | **Passed (Deterministic)** |
| **Concurrent Overlapping Deletions** | Overlapping deletions on shared text | **Passed (No Double-Free)** |
| **Disconnection Mid-Edit** | Sudden socket termination during keystrokes | **Passed (Clean Room Teardown)** |
| **Reconnection Catch-up** | State Vector catch-up after 30 missed updates | **Passed (100% Hydrated)** |
| **Offline Partitioning** | Isolated edits on partitioned replicas | **Passed (Deterministic Merge)** |
| **Micro-burst Queue Processing** | 50 rapid updates in single TCP burst | **Passed (0% Dropped)** |
| **Duplicate Delivery Idempotency** | Exact same binary update delivered 5x | **Passed (Zero Duplicate Chars)** |
| **Out-of-Order Delivery Permutations** | Updates applied in reverse order | **Passed (Identical State)** |
| **Server Crash & Cold Restart** | Hard process kill $\to$ Cold reboot $\to$ Restore | **Passed (100% Restored)** |
| **Large Document Stress Test** | 500+ XML paragraph nodes | **Passed ($<50$ ms Serialization)** |
| **Connection Thrashing & Churn** | 15 rapid connect/terminate socket loops | **Passed (0 Leaked Rooms)** |
| **Multi-Room Isolation** | Doc A and Doc B concurrently edited | **Passed (Zero Cross-Talk)** |
| **5-Replica Chaotic Convergence** | 5 replicas, randomized out-of-order streams | **Passed (100% Bit-for-Bit)** |

---

## 4. Empirical Performance Profile

Refer to [`BENCHMARKS.md`](file:///BENCHMARKS.md) for full measured benchmark results:
- **Local CRDT Generation Latency**: $0.027$ ms ($20,868$ ops/sec)
- **CRDT Application Latency**: $0.015$ ms ($34,690$ ops/sec)
- **WebSocket RTT**: $0.131$ ms
- **End-to-End Multi-Client Propagation (100 concurrent connections)**: $0.10$ ms median
- **Cold Reconnect Sync Time**: $37.92$ ms
