# SyncForge Binary Wire Protocol Specification

## 1. Overview & Transport Layer

SyncForge uses a high-performance **binary WebSocket wire protocol** for real-time document synchronization and ephemeral collaborator presence.

- **Transport**: Standard WebSocket (`ws://` / `wss://`)
- **Encoding**: Binary `ArrayBuffer` encoded using `lib0/encoding` and `lib0/decoding` (Variable-Length Unsigned Integers / VLQ).
- **Endpoint Pattern**: `/ws/:docId`

---

## 2. Message Opcodes & Framing

Every WebSocket message is framed with a 1-byte variable-length integer (`VarUint`) opcode indicating the message category:

| Opcode | Identifier | Direction | Purpose |
| :--- | :--- | :--- | :--- |
| `0` | `MESSAGE_SYNC` | Bi-directional | Document CRDT state vector handshakes, diffs, and incremental updates. |
| `1` | `MESSAGE_AWARENESS` | Bi-directional | Ephemeral collaborator presence, cursor positions, selections, and user profile data. |
| `2` | `MESSAGE_QUERY_AWARENESS` | Client $\to$ Server | Request current awareness state of all connected peers in the room. |

```
Binary Message Structure:
┌────────────────────┬────────────────────────────────────────────────────────┐
│ Opcode (VarUint)   │ Payload (VarUint8Array / Protocol-Specific Encoding)   │
│ 1 byte             │ Variable Length (Up to 5 MB hard limit)                │
└────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Sub-Protocol 1: Sync Protocol (`MESSAGE_SYNC = 0`)

The Sync message encapsulates three sub-types:

### A. SyncStep 1 (`Sub-Opcode = 0`)
Transmits the client's current **State Vector** to request missing updates.
```
┌────────────────────┬────────────────────┬───────────────────────────────────┐
│ Opcode: 0 (SYNC)   │ Sub-Opcode: 0      │ Encoded StateVector (VarUint8Arr) │
└────────────────────┴────────────────────┴───────────────────────────────────┘
```

### B. SyncStep 2 (`Sub-Opcode = 1`)
Transmits the missing binary **CRDT Update Chunk** computed from the received State Vector.
```
┌────────────────────┬────────────────────┬───────────────────────────────────┐
│ Opcode: 0 (SYNC)   │ Sub-Opcode: 1      │ Encoded Update Diff (VarUint8Arr) │
└────────────────────┴────────────────────┴───────────────────────────────────┘
```

### C. Update (`Sub-Opcode = 2`)
Broadcasts an incremental local edit made during active collaboration.
```
┌────────────────────┬────────────────────┬───────────────────────────────────┐
│ Opcode: 0 (SYNC)   │ Sub-Opcode: 2      │ Incremental Update (VarUint8Arr)  │
└────────────────────┴────────────────────┴───────────────────────────────────┘
```

---

## 4. Sub-Protocol 2: Ephemeral Awareness Protocol (`MESSAGE_AWARENESS = 1`)

Presence information (cursors, selections, user profiles) is kept **completely decoupled** from persistent document content to prevent unbounded history growth.

### Awareness Message Payload
```typescript
interface AwarenessState {
  user: {
    name: string;      // Collaborator display name (e.g. "Ada Lovelace")
    color: string;     // Hex color code (e.g. "#0ea5e9")
  };
  cursor?: {
    anchor: number;    // Absolute ProseMirror document position
    head: number;      // Selection range head position
  };
}
```

### Awareness Update Structure
```
┌─────────────────────────┬──────────────────────────────────────────────────────────┐
│ Opcode: 1 (AWARENESS)   │ Awareness Update Stream                                  │
│                         │   - Client Count (VarUint)                               │
│                         │   - For each client:                                     │
│                         │       - ClientID (VarUint)                               │
│                         │       - Lamport Clock (VarUint)                          │
│                         │       - JSON Encoded State String (VarString)            │
└─────────────────────────┴──────────────────────────────────────────────────────────┘
```

### Disconnect & Eviction
- When a client disconnects cleanly, an awareness update with an empty state `null` is gossiped to all peers.
- If a client disconnects ungracefully (network timeout), the server's awareness timeout ($30,000\text{ ms}$) automatically purges the client and broadcasts the removal.

---

## 5. Security & Rate Limiting Guardrails

1. **Max Payload Size**: Capped at $5\text{ MB}$ (`5,242,880 bytes`). Sockets attempting to transmit larger frames are terminated with close code `1009` (`Message Too Big`).
2. **Message Rate Limit**: Sliding window threshold of $300\text{ messages/second}$ per socket. Sockets breaching this threshold are closed with `1008` (`Policy Violation`).
3. **Invalid Room Rejection**: Invalid `docId` strings violating `/^[a-zA-Z0-9_-]{1,128}$/` are rejected during connection with code `1008`.
