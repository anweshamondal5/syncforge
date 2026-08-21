import { useState, useEffect, useCallback } from 'react';
import { DocumentMetadata } from '@syncforge/shared';
import {
  fetchDocuments,
  createDocument,
  deleteDocument,
  updateDocumentTitle,
  duplicateDocument as apiDuplicateDocument,
} from '../lib/api';

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchDocuments();
      setDocuments(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (title?: string) => {
    try {
      const newDoc = await createDocument(title);
      setDocuments((prev) => [newDoc, ...prev]);
      return newDoc;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const handleDuplicate = async (id: string, title?: string) => {
    try {
      const dup = await apiDuplicateDocument(id, title);
      setDocuments((prev) => [dup, ...prev]);
      return dup;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updated = await updateDocumentTitle(id, newTitle);
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      return updated;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return {
    documents,
    loading,
    error,
    refresh,
    createDocument: handleCreate,
    duplicateDocument: handleDuplicate,
    deleteDocument: handleDelete,
    renameDocument: handleRename,
  };
}
