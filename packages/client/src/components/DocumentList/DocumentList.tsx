import React, { useState } from 'react';
import { DocumentMetadata } from '@syncforge/shared';
import {
  FileText,
  Plus,
  Search,
  Trash2,
  Calendar,
  Layers,
  ArrowUpRight,
  Sparkles,
  Cpu,
  CheckSquare,
  Clock,
  Copy,
  Check,
  AlertCircle,
  LayoutGrid,
  List as ListIcon,
  CopyPlus,
  Edit2,
  RefreshCw,
  X,
  Share2,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface DocumentListProps {
  documents: DocumentMetadata[];
  loading: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onOpenDocument: (id: string) => void;
  onCreateNew: () => void;
  onDuplicateDocument?: (id: string) => Promise<any>;
  onRenameDocument?: (id: string, newTitle: string) => Promise<any>;
  onDeleteDocument: (id: string) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  loading,
  error,
  onRefresh,
  onOpenDocument,
  onCreateNew,
  onDuplicateDocument,
  onRenameDocument,
  onDeleteDocument,
}) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'updates'>('updated');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocumentMetadata | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<DocumentMetadata | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  const filteredDocs = documents
    .filter((doc) => doc.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'updates') return (b.update_count || 0) - (a.update_count || 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  const handleCopyLink = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/document/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('Link Copied to Clipboard', {
      message: 'Share this URL with collaborators to edit simultaneously in real time.',
      type: 'success',
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDuplicateClick = async (e: React.MouseEvent, doc: DocumentMetadata) => {
    e.stopPropagation();
    if (!onDuplicateDocument) return;
    try {
      setIsDuplicating(doc.id);
      const newDoc = await onDuplicateDocument(doc.id);
      showToast('Document Duplicated', {
        message: `Created clone "${newDoc.title}".`,
        type: 'success',
      });
    } catch (err: any) {
      showToast('Duplication Failed', {
        message: err.message || 'Could not duplicate document.',
        type: 'error',
      });
    } finally {
      setIsDuplicating(null);
    }
  };

  const handleRenameClick = (e: React.MouseEvent, doc: DocumentMetadata) => {
    e.stopPropagation();
    setRenamingDoc(doc);
    setRenameValue(doc.title);
  };

  const handleSaveRename = async () => {
    if (!renamingDoc || !renameValue.trim() || !onRenameDocument) return;
    try {
      await onRenameDocument(renamingDoc.id, renameValue.trim());
      showToast('Document Renamed', {
        message: `Title updated to "${renameValue.trim()}".`,
        type: 'success',
      });
      setRenamingDoc(null);
    } catch (err: any) {
      showToast('Rename Failed', {
        message: err.message || 'Could not update title.',
        type: 'error',
      });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, doc: DocumentMetadata) => {
    e.stopPropagation();
    setDeletingDoc(doc);
  };

  const confirmDelete = () => {
    if (deletingDoc) {
      onDeleteDocument(deletingDoc.id);
      showToast('Document Deleted', {
        message: `"${deletingDoc.title}" was removed.`,
        type: 'info',
      });
      setDeletingDoc(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header & Primary Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Collaborative Workspace
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time CRDT documents with instant mathematical convergence &amp; offline persistence.
          </p>
        </div>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-sky-500/20 transition transform hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Document</span>
        </button>
      </div>

      {/* Quick Template Starters Bar */}
      <div className="mb-8">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          Quick Starter Templates
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={onCreateNew}
            className="p-3.5 bg-white dark:bg-slate-900 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 border border-slate-200 dark:border-slate-800 rounded-2xl text-left transition group shadow-sm hover:border-sky-300 dark:hover:border-sky-700"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <FileText className="w-4 h-4" />
            </div>
            <div className="font-bold text-xs text-slate-800 dark:text-slate-100">Blank Document</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Empty clean canvas</div>
          </button>

          <button
            onClick={onCreateNew}
            className="p-3.5 bg-white dark:bg-slate-900 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-200 dark:border-slate-800 rounded-2xl text-left transition group shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700"
          >
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="font-bold text-xs text-slate-800 dark:text-slate-100">Architecture RFC</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Distributed systems spec</div>
          </button>

          <button
            onClick={onCreateNew}
            className="p-3.5 bg-white dark:bg-slate-900 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-slate-200 dark:border-slate-800 rounded-2xl text-left transition group shadow-sm hover:border-emerald-300 dark:hover:border-emerald-700"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="font-bold text-xs text-slate-800 dark:text-slate-100">Sprint Sync</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Team standup notes</div>
          </button>

          <button
            onClick={onCreateNew}
            className="p-3.5 bg-white dark:bg-slate-900 hover:bg-purple-50/50 dark:hover:bg-purple-950/30 border border-slate-200 dark:border-slate-800 rounded-2xl text-left transition group shadow-sm hover:border-purple-300 dark:hover:border-purple-700"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <Layers className="w-4 h-4" />
            </div>
            <div className="font-bold text-xs text-slate-800 dark:text-slate-100">CRDT Spec</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Formal state machine</div>
          </button>
        </div>
      </div>

      {/* Filter, Search & View Options Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        {/* Search Input */}
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white transition shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort Dropdown & Layout Switcher */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
          >
            <option value="updated">Sort: Recently Updated</option>
            <option value="title">Sort: Alphabetical (A-Z)</option>
            <option value="updates">Sort: Most Updates</option>
          </select>

          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid layout"
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List layout"
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse space-y-3"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDocs.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 mx-auto flex items-center justify-center mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
            {searchQuery ? `No documents matching "${searchQuery}"` : 'No documents in workspace'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">
            {searchQuery
              ? 'Try a different search query or clear the filter.'
              : 'Create your first collaborative document to test real-time CRDT synchronization.'}
          </p>
          <button
            onClick={onCreateNew}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm rounded-xl shadow-sm transition inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Document</span>
          </button>
        </div>
      )}

      {/* Document Catalog (Grid View) */}
      {!loading && viewMode === 'grid' && filteredDocs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onOpenDocument(doc.id)}
              className="group bg-white dark:bg-slate-900 hover:bg-sky-50/20 dark:hover:bg-sky-950/20 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 transition shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleCopyLink(e, doc.id)}
                      title="Copy Share Link"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      {copiedId === doc.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {onDuplicateDocument && (
                      <button
                        onClick={(e) => handleDuplicateClick(e, doc)}
                        title="Duplicate Document"
                        disabled={isDuplicating === doc.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <CopyPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onRenameDocument && (
                      <button
                        onClick={(e) => handleRenameClick(e, doc)}
                        title="Rename Document"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDeleteClick(e, doc)}
                      title="Delete Document"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition line-clamp-1 mb-1">
                  {doc.title}
                </h3>
                <p className="text-xs text-slate-400 font-mono line-clamp-1">
                  ID: {doc.id}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {formatDate(doc.updated_at)}
                </span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {doc.update_count || 0} updates
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Catalog (List View) */}
      {!loading && viewMode === 'list' && filteredDocs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3.5 pl-5">Document Title</th>
                <th className="p-3.5 hidden sm:table-cell">Doc ID</th>
                <th className="p-3.5">Last Updated</th>
                <th className="p-3.5 hidden md:table-cell">CRDT Updates</th>
                <th className="p-3.5 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDocs.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => onOpenDocument(doc.id)}
                  className="hover:bg-sky-50/30 dark:hover:bg-sky-950/20 cursor-pointer transition"
                >
                  <td className="p-3.5 pl-5 font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-sky-600 flex-shrink-0" />
                    <span className="line-clamp-1">{doc.title}</span>
                  </td>
                  <td className="p-3.5 hidden sm:table-cell font-mono text-xs text-slate-400">
                    {doc.id}
                  </td>
                  <td className="p-3.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {formatDate(doc.updated_at)}
                  </td>
                  <td className="p-3.5 hidden md:table-cell text-xs font-mono text-slate-500">
                    {doc.update_count || 0}
                  </td>
                  <td className="p-3.5 pr-5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={(e) => handleCopyLink(e, doc.id)}
                        title="Copy Share Link"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(e, doc)}
                        title="Delete Document"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Delete Document?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-800 dark:text-slate-200">"{deletingDoc.title}"</strong>?
              This will remove all associated CRDT snapshots and binary updates.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition"
              >
                Yes, Delete Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Document Modal */}
      {renamingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Rename Document
                </h3>
              </div>
              <button
                onClick={() => setRenamingDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Document Title"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 mb-6 text-slate-900 dark:text-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setRenamingDoc(null);
              }}
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRenamingDoc(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                disabled={!renameValue.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl shadow-sm transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
