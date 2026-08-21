import { DocumentMetadata, ApiResponse } from '@syncforge/shared';

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '/api';

export async function fetchDocuments(): Promise<DocumentMetadata[]> {
  const res = await fetch(`${API_BASE}/docs`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.statusText}`);
  const json: ApiResponse<DocumentMetadata[]> = await res.json();
  return json.data || [];
}

export async function createDocument(title?: string): Promise<DocumentMetadata> {
  const res = await fetch(`${API_BASE}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create document: ${res.statusText}`);
  const json: ApiResponse<DocumentMetadata> = await res.json();
  return json.data!;
}

export async function duplicateDocument(id: string, title?: string): Promise<DocumentMetadata> {
  const res = await fetch(`${API_BASE}/docs/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to duplicate document: ${res.statusText}`);
  const json: ApiResponse<DocumentMetadata> = await res.json();
  return json.data!;
}

export async function fetchDocument(id: string): Promise<DocumentMetadata> {
  const res = await fetch(`${API_BASE}/docs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.statusText}`);
  const json: ApiResponse<DocumentMetadata> = await res.json();
  return json.data!;
}

export async function updateDocumentTitle(id: string, title: string): Promise<DocumentMetadata> {
  const res = await fetch(`${API_BASE}/docs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to update document: ${res.statusText}`);
  const json: ApiResponse<DocumentMetadata> = await res.json();
  return json.data!;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/docs/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete document: ${res.statusText}`);
}

export async function exportDocument(id: string, format: 'text' | 'json' = 'text'): Promise<any> {
  const res = await fetch(`${API_BASE}/docs/${id}/export?format=${format}`);
  if (!res.ok) throw new Error(`Failed to export document: ${res.statusText}`);
  if (format === 'json') return res.json();
  return res.text();
}

export async function fetchHealth(): Promise<any> {
  const healthEndpoint = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/health`
    : `/health`;
  const res = await fetch(healthEndpoint);
  if (!res.ok) {
    const fallbackRes = await fetch(`${API_BASE}/health`);
    if (!fallbackRes.ok) throw new Error(`Health check failed`);
    return fallbackRes.json();
  }
  return res.json();
}
