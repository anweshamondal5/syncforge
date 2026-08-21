export interface DocumentMetadata {
  id: string;
  title: string;
  creator?: string;
  created_at: string;
  updated_at: string;
  update_count?: number;
  size_bytes?: number;
  active_users?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

export interface CursorPosition {
  anchor: number;
  head: number;
}

export interface AwarenessState {
  user: UserProfile;
  cursor: CursorPosition | null;
  lastActive: number;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'saved'
  | 'offline'
  | 'error';

export interface SyncTelemetry {
  clientId: number;
  clock: number;
  stateVectorEntries: number;
  receivedUpdates: number;
  sentUpdates: number;
  documentBytes: number;
  activePeers: number;
  pendingUpdates?: number;
}

export type CRDTSyncStatus =
  | 'in-sync'
  | 'pending-local-edits'
  | 'receiving-remote-edits'
  | 'partitioned-offline'
  | 'connecting';

export interface DecodedStateVectorEntry {
  clientId: number;
  clock: number;
}

export interface CRDTOperationLog {
  id: string;
  timestamp: number;
  origin: 'local' | 'remote' | 'initial-load' | 'system';
  clientId: number;
  byteSize: number;
  type: 'insert' | 'delete' | 'sync-step-1' | 'sync-step-2' | 'awareness' | 'format';
  summary: string;
  clockRange?: { start: number; end: number };
  status: 'applied' | 'synced' | 'pending';
}

export interface CreateDocumentDto {
  title: string;
  creator?: string;
}

export interface UpdateDocumentDto {
  title?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
