import { Router, Request, Response } from 'express';
import { DocumentRepository } from '../db/repository.js';
import { DocManager } from '../sync/DocManager.js';
import { ApiResponse, DocumentMetadata } from '@syncforge/shared';
import { isValidDocId, sanitizeString, createRateLimiter } from '../middleware/security.js';
import * as Y from 'yjs';

export const docsRouter = Router();

// Rate limiter for write operations: max 60 writes per minute per IP
const writeRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 60,
  message: 'Too many document operations. Please slow down.',
});

// List all documents
docsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const docs = await DocumentRepository.listDocuments();
    const response: ApiResponse<DocumentMetadata[]> = {
      success: true,
      data: docs,
    };
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to retrieve document catalog' });
  }
});

// Create a new document
docsRouter.post('/', writeRateLimiter, async (req: Request, res: Response) => {
  try {
    const { title, creator, id: customId } = req.body || {};

    if (customId && !isValidDocId(customId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid custom document ID format. Must be 1-128 alphanumeric characters, hyphens, or underscores.',
      });
    }

    const id = customId ? customId.trim() : `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sanitizedTitle = sanitizeString(title, 255) || 'Untitled Document';
    const sanitizedCreator = sanitizeString(creator, 100) || 'Anonymous Engineer';

    const newDoc = await DocumentRepository.createDocument(id, sanitizedTitle, sanitizedCreator);
    res.status(201).json({ success: true, data: newDoc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to create document' });
  }
});

// Get document metadata
docsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isValidDocId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format. Must be 1-128 alphanumeric characters, hyphens, or underscores.',
      });
    }

    let doc = await DocumentRepository.getDocument(id);

    // Auto-create document metadata if accessing a new valid docId directly
    if (!doc) {
      doc = await DocumentRepository.createDocument(id, `Document ${id.slice(-6)}`);
    }

    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to retrieve document metadata' });
  }
});

// Duplicate document
docsRouter.post('/:id/duplicate', writeRateLimiter, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body || {};

    if (!isValidDocId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid source document ID format',
      });
    }

    // Flush any pending in-memory updates from active room
    await DocManager.flushDoc(id);

    const newId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sanitizedTitle = sanitizeString(title, 255);
    const duplicated = await DocumentRepository.duplicateDocument(id, newId, sanitizedTitle);

    res.status(201).json({ success: true, data: duplicated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Failed to duplicate document: ${err.message}` });
  }
});

// Update document title
docsRouter.put('/:id', writeRateLimiter, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body || {};

    if (!isValidDocId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format',
      });
    }

    const sanitizedTitle = sanitizeString(title, 255);
    if (!sanitizedTitle) {
      return res.status(400).json({ success: false, error: 'Title is required (1-255 characters)' });
    }

    await DocumentRepository.updateDocumentTitle(id, sanitizedTitle);
    const updated = await DocumentRepository.getDocument(id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update document title' });
  }
});

// Delete document
docsRouter.delete('/:id', writeRateLimiter, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isValidDocId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format',
      });
    }

    await DocumentRepository.deleteDocument(id);
    DocManager.evictDoc(id);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

// Export document content (Text / Markdown / Raw CRDT XML)
docsRouter.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isValidDocId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format',
      });
    }

    const format = (req.query.format as string) || 'text';
    const ydoc = await DocManager.getOrCreateDoc(id);
    const xmlFragment = ydoc.getXmlFragment('default');
    const rawText = ydoc.getText('default').toString() || xmlFragment.toString();

    if (format === 'json') {
      return res.json({
        success: true,
        documentId: id,
        xmlString: xmlFragment.toString(),
        rawText,
        stateVectorBase64: Buffer.from(Y.encodeStateVector(ydoc)).toString('base64'),
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.txt"`);
    res.send(rawText);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to export document' });
  }
});
