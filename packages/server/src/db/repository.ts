import { getDb } from './database';
import { DocumentMetadata } from '@syncforge/shared';
import * as Y from 'yjs';

export class DocumentRepository {
  static async createDocument(id: string, title: string, creator: string = 'Anonymous Engineer'): Promise<DocumentMetadata> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO documents (id, title, creator, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [id, title, creator, now, now]
    );

    return {
      id,
      title,
      creator,
      created_at: now,
      updated_at: now,
      update_count: 0,
      size_bytes: 0,
    };
  }

  static async getDocument(id: string): Promise<DocumentMetadata | null> {
    const db = await getDb();
    const rows = await db.query<any>(
      `SELECT d.id, d.title, d.creator, d.created_at, d.updated_at,
              COUNT(u.id) as update_count,
              COALESCE(SUM(LENGTH(u.update_blob)), 0) as size_bytes
       FROM documents d
       LEFT JOIN document_updates u ON d.id = u.document_id
       WHERE d.id = ?
       GROUP BY d.id, d.title, d.creator, d.created_at, d.updated_at`,
      [id]
    );

    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      title: row.title,
      creator: row.creator || 'Anonymous Engineer',
      created_at: row.created_at,
      updated_at: row.updated_at,
      update_count: Number(row.update_count || 0),
      size_bytes: Number(row.size_bytes || 0),
    };
  }

  static async listDocuments(): Promise<DocumentMetadata[]> {
    const db = await getDb();
    const rows = await db.query<any>(
      `SELECT d.id, d.title, d.creator, d.created_at, d.updated_at,
              COUNT(u.id) as update_count,
              COALESCE(SUM(LENGTH(u.update_blob)), 0) as size_bytes
       FROM documents d
       LEFT JOIN document_updates u ON d.id = u.document_id
       GROUP BY d.id, d.title, d.creator, d.created_at, d.updated_at
       ORDER BY d.updated_at DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      creator: row.creator || 'Anonymous Engineer',
      created_at: row.created_at,
      updated_at: row.updated_at,
      update_count: Number(row.update_count || 0),
      size_bytes: Number(row.size_bytes || 0),
    }));
  }

  static async updateDocumentTitle(id: string, title: string): Promise<boolean> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE documents SET title = ?, updated_at = ? WHERE id = ?`,
      [title, now, id]
    );
    return true;
  }

  static async touchDocument(id: string): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE documents SET updated_at = ? WHERE id = ?`,
      [now, id]
    );
  }

  static async deleteDocument(id: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(`DELETE FROM document_updates WHERE document_id = ?`, [id]);
    await db.execute(`DELETE FROM documents WHERE id = ?`, [id]);
    return true;
  }

  static async duplicateDocument(sourceId: string, newId: string, customTitle?: string): Promise<DocumentMetadata> {
    const source = await this.getDocument(sourceId);
    if (!source) {
      throw new Error(`Source document ${sourceId} not found`);
    }

    const title = customTitle || `Copy of ${source.title}`;
    const newDoc = await this.createDocument(newId, title, source.creator);

    const updates = await this.getUpdates(sourceId);
    for (const update of updates) {
      await this.saveUpdate(newId, update);
    }

    return (await this.getDocument(newId)) || newDoc;
  }

  static async saveUpdate(documentId: string, updateBlob: Uint8Array): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    const buffer = Buffer.from(updateBlob);
    await db.execute(
      `INSERT INTO document_updates (document_id, update_blob, created_at) VALUES (?, ?, ?)`,
      [documentId, buffer, now]
    );
    await this.touchDocument(documentId);
  }

  static async getUpdates(documentId: string): Promise<Uint8Array[]> {
    const db = await getDb();
    const rows = await db.query<{ update_blob: Buffer | Uint8Array }>(
      `SELECT update_blob FROM document_updates WHERE document_id = ? ORDER BY id ASC`,
      [documentId]
    );

    return rows.map((r) => new Uint8Array(r.update_blob));
  }

  static async compactDocumentUpdates(documentId: string, mergedSnapshot: Uint8Array): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    const buffer = Buffer.from(mergedSnapshot);

    await db.execute(`DELETE FROM document_updates WHERE document_id = ?`, [documentId]);
    await db.execute(
      `INSERT INTO document_updates (document_id, update_blob, created_at) VALUES (?, ?, ?)`,
      [documentId, buffer, now]
    );
    await this.touchDocument(documentId);
    console.log(`[Repository] Compacted snapshot saved for document ${documentId}, size: ${buffer.length} bytes`);
  }
}
