import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || path.resolve(process.cwd(), 'syncforge.db'),
  docSaveDebounceMs: parseInt(process.env.DOC_SAVE_DEBOUNCE_MS || '1000', 10),
  docSnapshotThreshold: parseInt(process.env.DOC_SNAPSHOT_THRESHOLD || '50', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
