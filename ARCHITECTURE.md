# SyncForge — Real-Time CRDT Collaborative Document Editor
## System Architecture & Engineering Design Document

SyncForge is a distributed, real-time, conflict-free collaborative rich-text document editing platform built with **Conflict-free Replicated Data Types (CRDTs)**, WebSockets, Tiptap/ProseMirror, and dual-layer persistence (PostgreSQL/SQLite + browser IndexedDB).

---

## 1. High-Level Architecture Diagram

```
 ┌──────────────────────────────────────────────────┐          ┌──────────────────────────────────────────────────┐
 │               Client A (Browser)                 │          │               Client B (Browser)                 │
 │ ┌──────────────────────────────────────────────┐ │          │ ┌──────────────────────────────────────────────┐ │
 │ │  Tiptap / ProseMirror Rich Text Editor Layer │ │          │ │  Tiptap / ProseMirror Rich Text Editor Layer │ │
 │ └──────────────────────┬───────────────────────┘ │          │ └──────────────────────┬───────────────────────┘ │
 │                        │ y-prosemirror binding   │          │                        │ y-prosemirror binding   │
 │ ┌──────────────────────▼───────────────────────┐ │          │ ┌──────────────────────▼───────────────────────┐ │
 │ │       Y.Doc (CRDT In-Memory Document)        │ │          │ │       Y.Doc (CRDT In-Memory Document)        │ │
 │ └──────────┬───────────────────────┬───────────┘ │          │ └──────────┬───────────────────────┬───────────┘ │
 │            │                       │             │          │            │                       │             │
 │ ┌──────────▼──────────┐ ┌──────────▼───────────┐ │          │ ┌──────────▼──────────┐ ┌──────────▼───────────┐ │
 │ │ IndexedDB Provider  │ │   SyncForge Provider │ │          │ │ IndexedDB Provider  │ │   SyncForge Provider │ │
 │ │ (Local Offline Log) │ │  (WebSocket Client)  │ │          │ │ (Local Offline Log) │ │  (WebSocket Client)  │ │
 │ └─────────────────────┘ └──────────┬───────────┘ │          │ └─────────────────────┘ └──────────┬───────────┘ │
 └────────────────────────────────────┼─────────────┘          └────────────────────────────────────┼─────────────┘
                                      │                                                             │
                                      │ WebSocket Protocol (Binary Yjs Sync + Awareness)            │
                                      ▼                                                             ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                              SyncForge Backend Server                                          │
 │ ┌───────────────────────────────────────────────────┐    ┌───────────────────────────────────────────────────┐ │
 │ │ Express REST API Layer                            │    │ WebSocket Gateway (WsSyncServer)                  │ │
 │ │  - GET  /api/docs (List documents with stats)     │    │  - Step 1: Exchange State Vectors                 │ │
 │ │  - POST /api/docs (Create document metadata)      │    │  - Step 2: Compute & Stream Missing Update Diffs  │ │
 │ │  - GET  /api/docs/:id (Fetch document metadata)   │    │  - Step 3: Broadcast Incremental Deltas           │ │
 │ │  - GET  /api/health (Room telemetry & stats)      │    │  - Awareness: Ephemeral Cursor & Presence Gossip  │ │
 │ └─────────────────────────┬─────────────────────────┘    └─────────────────────────┬─────────────────────────┘ │
 │                           │                                                        │                           │
 │ ┌─────────────────────────▼────────────────────────────────────────────────────────▼─────────────────────────┐ │
 │ │ DocManager (In-Memory Room Orchestrator)                                                                   │ │
 │ │  - Maintains active Y.Doc replicas per room                                                                │ │
 │ │  - Applies incoming client binary updates atomically                                                       │ │
 │ │  - Debounced snapshot compaction & persistence queue                                                       │ │
 │ └──────────────────────────────────────────────────┬─────────────────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                              Persistence Layer                                                 │
 │ PostgreSQL (Production) / SQLite (Zero-Config Development Engine)                                              │
 │                                                                                                                │
 │  TABLE: documents                                 TABLE: document_updates                                      │
 │  ┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────────────────┐ │
 │  │ id           VARCHAR(64) PRIMARY KEY         │ │ id            SERIAL PRIMARY KEY                         │ │
 │  │ title        VARCHAR(255)                    │ │ document_id   VARCHAR(64) REFERENCES documents(id)       │ │
 │  │ created_at   TIMESTAMP                       │ │ update_blob   BYTEA / BLOB (Encoded Y.Doc Update)        │ │
 │  │ updated_at   TIMESTAMP                       │ │ created_at    TIMESTAMP DEFAULT NOW()                    │ │
 │  └──────────────────────────────────────────────┘ └──────────────────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Components

### 2.1 Frontend Client (`@syncforge/client`)
- **Rich Text Editor**: Powered by **Tiptap** and **ProseMirror**, bound directly to the Yjs `XmlFragment` via `y-prosemirror`. Keystrokes generate immutable CRDT items with relative origin pointers.
- **`SyncForgeProvider`**: High-performance WebSocket client managing binary frames, State Vector handshakes, awareness throttling ($25\text{ fps}$), and reconnection backoff.
- **Offline Cache**: Integrates `y-indexeddb` to store local CRDT updates across browser restarts.
- **CRDT Inspector**: Real-time developer dashboard exposing live Lamport clocks, update timelines, replica topology, and state vector metrics.

### 2.2 Backend Synchronization Server (`@syncforge/server`)
- **`WsSyncServer`**: Binary WebSocket gateway parsing `MESSAGE_SYNC` and `MESSAGE_AWARENESS` opcodes with payload limits ($5\text{ MB}$) and sliding-window rate limiters ($300\text{ msgs/sec}$).
- **`DocManager`**: Room orchestrator maintaining in-memory `Y.Doc` instances. Flushes debounced updates to the database every $2,000\text{ ms}$ and triggers snapshot compaction every $50$ updates.
- **Dual-Tier Storage Abstraction**: `DatabaseEngine` interface supporting PostgreSQL for scalable container deployments and SQLite for fast development and testing.

---

## 3. Distributed Invariants & Guarantees

1. **Strong Eventual Consistency**: Replicas receiving the same set of binary updates reach the exact same text document state.
2. **Deterministic Concurrency**: Conflicting insertions at the same position resolve using immutable origin references and unique 53-bit client IDs.
3. **Partition Tolerance**: Clients partitioned from the network continue editing locally in IndexedDB and reconcile upon reconnection without data loss.
4. **Decoupled Ephemeral State**: Cursor positions and selection highlights are broadcast through awareness channels and never pollute persistent storage.
