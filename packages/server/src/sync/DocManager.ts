import * as Y from 'yjs';
import { DocumentRepository } from '../db/repository.js';
import { config } from '../config.js';

interface ManagedDoc {
  doc: Y.Doc;
  unpersistedUpdates: Uint8Array[];
  saveTimer: NodeJS.Timeout | null;
  totalUpdatesCount: number;
  lastActive: number;
}

export class DocManager {
  private static docs: Map<string, ManagedDoc> = new Map();
  private static pendingDocs: Map<string, Promise<Y.Doc>> = new Map();

  static async getOrCreateDoc(docId: string): Promise<Y.Doc> {
    const existing = this.docs.get(docId);
    if (existing) {
      existing.lastActive = Date.now();
      return existing.doc;
    }

    const pending = this.pendingDocs.get(docId);
    if (pending) {
      return pending;
    }

    const loadPromise = (async () => {
      const doc = new Y.Doc();
      const managed: ManagedDoc = {
        doc,
        unpersistedUpdates: [],
        saveTimer: null,
        totalUpdatesCount: 0,
        lastActive: Date.now(),
      };
      this.docs.set(docId, managed);

      // Load persisted history from repository
      try {
        const updates = await DocumentRepository.getUpdates(docId);
        if (updates.length > 0) {
          console.log(`[DocManager] Loaded ${updates.length} updates for doc ${docId}`);
          for (const u of updates) {
            Y.applyUpdate(doc, u, 'initial-load');
          }
          managed.totalUpdatesCount = updates.length;
        }
      } catch (err) {
        console.error(`[DocManager] Error loading updates for doc ${docId}:`, err);
      }

      // Bind update listener to capture real-time changes for persistence
      doc.on('update', (update: Uint8Array, origin: any) => {
        if (origin === 'initial-load') return;

        managed.unpersistedUpdates.push(update);
        managed.totalUpdatesCount++;
        managed.lastActive = Date.now();

        // Debounce saving updates to DB
        if (managed.saveTimer) {
          clearTimeout(managed.saveTimer);
        }

        managed.saveTimer = setTimeout(async () => {
          await this.flushUpdates(docId);
        }, config.docSaveDebounceMs);
        managed.saveTimer.unref();

        // Trigger snapshot compaction if threshold reached
        if (managed.totalUpdatesCount >= config.docSnapshotThreshold) {
          this.compactDoc(docId).catch((err) =>
            console.error(`[DocManager] Snapshot compaction error for ${docId}:`, err)
          );
        }
      });

      this.pendingDocs.delete(docId);
      return doc;
    })();

    this.pendingDocs.set(docId, loadPromise);
    return loadPromise;
  }

  static async flushUpdates(docId: string): Promise<void> {
    const managed = this.docs.get(docId);
    if (!managed || managed.unpersistedUpdates.length === 0) return;

    const updatesToSave = [...managed.unpersistedUpdates];
    managed.unpersistedUpdates = [];
    if (managed.saveTimer) {
      clearTimeout(managed.saveTimer);
      managed.saveTimer = null;
    }

    try {
      for (const u of updatesToSave) {
        await DocumentRepository.saveUpdate(docId, u);
      }
      console.log(`[DocManager] Flushed ${updatesToSave.length} updates for doc ${docId}`);
    } catch (err) {
      console.error(`[DocManager] Failed to flush updates for ${docId}:`, err);
      // Re-queue updates if failed
      managed.unpersistedUpdates.unshift(...updatesToSave);
    }
  }

  static async compactDoc(docId: string): Promise<void> {
    const managed = this.docs.get(docId);
    if (!managed) return;

    // Flush any pending updates first
    await this.flushUpdates(docId);

    // Encode full current state as a single merged update
    const mergedSnapshot = Y.encodeStateAsUpdate(managed.doc);
    await DocumentRepository.compactDocumentUpdates(docId, mergedSnapshot);
    managed.totalUpdatesCount = 1;
  }

  static async persistDocNow(docId: string): Promise<void> {
    await this.flushUpdates(docId);
  }

  static async flushDoc(docId: string): Promise<void> {
    await this.flushUpdates(docId);
  }

  static getActiveRoomCount(): number {
    return this.docs.size;
  }

  static evictDoc(docId: string): void {
    const managed = this.docs.get(docId);
    if (managed?.saveTimer) {
      clearTimeout(managed.saveTimer);
    }
    this.docs.delete(docId);
    this.pendingDocs.delete(docId);
  }

  static clearAll(): void {
    for (const [, managed] of this.docs) {
      if (managed.saveTimer) {
        clearTimeout(managed.saveTimer);
        managed.saveTimer = null;
      }
      managed.unpersistedUpdates = [];
    }
    this.docs.clear();
    this.pendingDocs.clear();
  }

  static getActiveRoomIds(): string[] {
    return Array.from(this.docs.keys());
  }

  static getDocStateVector(docId: string): Uint8Array | null {
    const managed = this.docs.get(docId);
    if (!managed) return null;
    return Y.encodeStateVector(managed.doc);
  }
}
