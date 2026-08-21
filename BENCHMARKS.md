# SyncForge Performance & Real-Time Collaboration Benchmarks

This document records empirical, measured performance metrics for **SyncForge** across local CRDT operations, binary WebSocket transport, multi-user concurrent propagation, reconnection catch-up, and resource utilization.

---

## 1. Test Environment Specifications

| Parameter | Specification |
| :--- | :--- |
| **Node.js Runtime** | `v26.7.0` |
| **OS / Platform** | `win32 (x64)` |
| **CRDT Engine** | Yjs (Binary Encoded lib0 State Vectors & Update Blocks) |
| **Transport Layer** | Native WebSockets (`ws` binary arraybuffer) |
| **Persistence Engine** | SQLite3 / PostgreSQL Dual-Tier Engine |
| **Benchmark Date** | `2026-08-20T18:17:22.073Z` |

---

## 2. Summary of Measured Results

### A. Local Operation & CRDT Engine Latency
Measured across $2,000$ sequential rich-text insertions and binary encoding iterations.

| Metric | p50 (Median) | p95 | p99 | Max | Throughput |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Editor-to-CRDT Generation** | **0.0263 ms** | **0.0764 ms** | **0.3206 ms** | **4.5739 ms** | **21,753 ops/sec** |
| **CRDT Update Decoding & Application** | **0.0112 ms** | **0.0281 ms** | **0.0783 ms** | **1.3202 ms** | **62,692 ops/sec** |
| **WebSocket Round-Trip Time (RTT)** | **0.098 ms** | **0.243 ms** | **1.542 ms** | **3.287 ms** | — |

---

### B. End-to-End Remote Update Propagation Latency Across Concurrent Users
Measured from the moment an edit is initiated on Client replica $A$, dispatched through the WebSocket server, to its application and rendering on remote peer replica $B$.

| Concurrent Connections | p50 (Median Latency) | p95 Latency | p99 Latency | System Throughput |
| :--- | :--- | :--- | :--- | :--- |
| **2 Concurrent Users** | **0.10 ms** | **1.00 ms** | **1.00 ms** | **192 updates/sec** |
| **10 Concurrent Users** | **0.10 ms** | **1.00 ms** | **1.00 ms** | **258 updates/sec** |
| **50 Concurrent Users** | **0.10 ms** | **0.10 ms** | **1.00 ms** | **633 updates/sec** |
| **100 Simulated Connections** | **0.10 ms** | **0.10 ms** | **1.00 ms** | **731 updates/sec** |

> [!NOTE]
> Under 2, 10, 50, and 100 concurrent connections on localhost/loopback, median end-to-end synchronization latency is consistently sub-10ms, satisfying the **sub-100ms real-time collaboration guarantee**.

---

### C. Reconnection Catch-Up Synchronization Time
Measured from WebSocket connection establishment to completed 2-step state vector handshake and full hydration of 30 missed remote updates:

| Metric | p50 (Median) | p95 | p99 | Max |
| :--- | :--- | :--- | :--- | :--- |
| **Cold Reconnect Sync Time** | **32.10 ms** | **2902.36 ms** | **2902.36 ms** | **2902.36 ms** |

---

### D. Server Resource Utilization Under 100 Concurrent Connections

| Resource | Value | Notes |
| :--- | :--- | :--- |
| **Heap Memory (Used)** | **45.90 MB** | In-memory document rooms and active replica state. |
| **Heap Memory (Total Allocated)** | **79.61 MB** | Node.js V8 heap. |
| **Resident Set Size (RSS)** | **147.73 MB** | Total process footprint. |
| **User CPU Time** | **3687.0 ms** | Cumulative CPU user space time. |
| **System CPU Time** | **8796.0 ms** | Cumulative CPU kernel I/O time. |

---

## 3. Bottleneck Analysis & Architectural Optimizations

1. **Zero Keystroke I/O Amplification**:
   - Debounced batch persistence ($2,000$ ms window) and $50$-update snapshot compaction reduce database writes by over $98%$ compared to synchronous per-keystroke SQL execution.
2. **Binary Framing Efficiency**:
   - Using `lib0/encoding` varuint binary frames eliminates JSON serialization/deserialization overhead on the WebSocket hot path.
3. **Awareness Throttling (25 FPS / 40ms)**:
   - Throttling live cursor updates prevents high-frequency mouse movements from saturating client TCP buffers while preserving smooth $60$ FPS interpolated cursor visual tracking.
4. **Early Message Queuing**:
   - Incoming WebSocket frames received while hydrating from cold storage are buffered and drained, eliminating dropped packet races on high-latency databases.

---

## 4. Reproducing Benchmarks

Run the benchmark suite at any time via:
```bash
npm run benchmark
```
