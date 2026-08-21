import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

export interface DatabaseEngine {
  init(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  close(): Promise<void>;
  isPostgres(): boolean;
}

class PostgresEngine implements DatabaseEngine {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  isPostgres() {
    return true;
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id VARCHAR(64) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          creator VARCHAR(128) DEFAULT 'Anonymous Engineer',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='creator') THEN
            ALTER TABLE documents ADD COLUMN creator VARCHAR(128) DEFAULT 'Anonymous Engineer';
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS document_updates (
          id SERIAL PRIMARY KEY,
          document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          update_blob BYTEA NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_doc_updates_doc_id ON document_updates(document_id);
      `);
    } finally {
      client.release();
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // Convert ? to $1, $2 for Postgres
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await this.pool.query(pgSql, params);
    return res.rows as T[];
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    await this.pool.query(pgSql, params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class SqliteEngine implements DatabaseEngine {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  isPostgres() {
    return false;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        this.db!.serialize(() => {
          this.db!.run(
            `CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              creator TEXT DEFAULT 'Anonymous Engineer',
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
            )`,
            (err2) => {
              if (err2) return reject(err2);
              // Migrate creator column if table already existed without it
              this.db!.run(
                `ALTER TABLE documents ADD COLUMN creator TEXT DEFAULT 'Anonymous Engineer'`,
                () => {
                  // Ignore error if column already exists
                }
              );
            }
          );

          this.db!.run(
            `CREATE TABLE IF NOT EXISTS document_updates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              document_id TEXT NOT NULL,
              update_blob BLOB NOT NULL,
              created_at TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            )`,
            (err3) => {
              if (err3) return reject(err3);
              this.db!.run(
                `CREATE INDEX IF NOT EXISTS idx_doc_updates_doc_id ON document_updates(document_id)`,
                (err4) => {
                  if (err4) return reject(err4);
                  resolve();
                }
              );
            }
          );
        });
      });
    });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('SQLite database not initialized'));
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows as T[]);
      });
    });
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('SQLite database not initialized'));
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const dbRef = this.db;
      this.db = null;
      try {
        dbRef.close(() => resolve());
        setTimeout(resolve, 50).unref();
      } catch {
        resolve();
      }
    });
  }
}

let dbInstance: DatabaseEngine | null = null;

export async function getDb(): Promise<DatabaseEngine> {
  if (dbInstance) return dbInstance;

  if (config.databaseUrl) {
    try {
      console.log(`[Database] Connecting to PostgreSQL at ${config.databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
      const pg = new PostgresEngine(config.databaseUrl);
      await pg.init();
      console.log('[Database] PostgreSQL initialized successfully.');
      dbInstance = pg;
      return dbInstance;
    } catch (err) {
      console.warn('[Database] PostgreSQL connection failed, falling back to SQLite:', err);
    }
  }

  console.log(`[Database] Initializing embedded SQLite database at: ${config.sqlitePath}`);
  const sqlite = new SqliteEngine(config.sqlitePath);
  await sqlite.init();
  console.log('[Database] SQLite initialized successfully.');
  dbInstance = sqlite;
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
