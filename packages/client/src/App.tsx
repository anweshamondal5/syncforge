import React, { useState, useEffect } from 'react';
import { useDocuments } from './hooks/useDocuments';
import { useSyncForge } from './hooks/useSyncForge';
import { Navbar } from './components/Layout/Navbar';
import { LandingPage } from './components/Landing/LandingPage';
import { DocumentList } from './components/DocumentList/DocumentList';
import { CreateDocModal } from './components/DocumentList/CreateDocModal';
import { RichTextEditor } from './components/Editor/RichTextEditor';
import { CRDTInspector } from './components/Inspector/CRDTInspector';
import { ToastContainer } from './components/Common/ToastContainer';
import { WifiOff } from 'lucide-react';
import { useToast } from './context/ToastContext';

export const App: React.FC = () => {
  const { showToast } = useToast();

  // Routing State
  const [currentDocId, setCurrentDocId] = useState<string | null>(() => {
    // Check path /document/:id or ?docId=:id
    const path = window.location.pathname;
    if (path.startsWith('/document/')) {
      return path.replace('/document/', '').trim();
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('docId');
  });

  const [view, setView] = useState<'landing' | 'dashboard' | 'editor'>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/document/')) return 'editor';
    if (path === '/dashboard') return 'dashboard';
    return 'landing';
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const {
    documents,
    loading: docsLoading,
    error: docsError,
    refresh: refreshDocs,
    createDocument: apiCreateDocument,
    duplicateDocument: apiDuplicateDocument,
    deleteDocument: apiDeleteDocument,
    renameDocument: apiRenameDocument,
  } = useDocuments();

  // Document metadata for current doc
  const currentDocMeta = documents.find((d) => d.id === currentDocId);

  // SyncForge CRDT Hook for current doc
  const {
    provider,
    ydoc,
    status,
    userProfile,
    updateProfile,
    peers,
    telemetry,
    timeline,
    decodedStateVector,
    clearTimeline,
    toggleOffline,
  } = useSyncForge(currentDocId || '');

  // Handle URL change popstate
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith('/document/')) {
        const id = path.replace('/document/', '').trim();
        setCurrentDocId(id);
        setView('editor');
      } else if (path === '/dashboard') {
        setCurrentDocId(null);
        setView('dashboard');
      } else {
        setCurrentDocId(null);
        setView('landing');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToDoc = (docId: string) => {
    setCurrentDocId(docId);
    setView('editor');
    window.history.pushState({}, '', `/document/${docId}`);
  };

  const navigateToDashboard = () => {
    setCurrentDocId(null);
    setView('dashboard');
    window.history.pushState({}, '', '/dashboard');
  };

  const navigateToLanding = () => {
    setCurrentDocId(null);
    setView('landing');
    window.history.pushState({}, '', '/');
  };

  const handleCreateDocument = async (title: string) => {
    setIsCreateModalOpen(false);
    try {
      const newDoc = await apiCreateDocument(title);
      showToast('Document Created', {
        message: `Created "${newDoc.title}". Opening editor...`,
        type: 'success',
      });
      navigateToDoc(newDoc.id);
    } catch (err: any) {
      showToast('Creation Failed', {
        message: err.message || 'Could not create document.',
        type: 'error',
      });
    }
  };

  const handleRenameDocument = async (newTitle: string) => {
    if (!currentDocId) return;
    try {
      await apiRenameDocument(currentDocId, newTitle);
    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Top Navbar */}
      <Navbar
        docId={view === 'editor' && currentDocId ? currentDocId : undefined}
        docTitle={currentDocMeta ? currentDocMeta.title : 'Untitled Document'}
        onRenameTitle={handleRenameDocument}
        onNavigateHome={navigateToDashboard}
        status={view === 'editor' ? status : undefined}
        onToggleOffline={view === 'editor' ? toggleOffline : undefined}
        onOpenInspector={() => setIsInspectorOpen(true)}
        peers={view === 'editor' ? peers : undefined}
        currentProfile={userProfile}
        onUpdateProfile={updateProfile}
      />

      {/* Main Views */}
      <main className="flex-1">
        {view === 'landing' && (
          <LandingPage
            onCreateNew={() => setIsCreateModalOpen(true)}
            onGoToDashboard={navigateToDashboard}
          />
        )}

        {view === 'dashboard' && (
          <DocumentList
            documents={documents}
            loading={docsLoading}
            error={docsError}
            onRefresh={refreshDocs}
            onOpenDocument={navigateToDoc}
            onCreateNew={() => setIsCreateModalOpen(true)}
            onDuplicateDocument={apiDuplicateDocument}
            onRenameDocument={apiRenameDocument}
            onDeleteDocument={apiDeleteDocument}
          />
        )}

        {view === 'editor' && currentDocId && provider && (
          <div className="px-2 sm:px-4 py-4 max-w-7xl mx-auto">
            {status === 'offline' && (
              <div className="mb-4 max-w-4xl mx-auto bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900 flex items-center justify-center text-amber-700 dark:text-amber-300 flex-shrink-0 shadow-inner">
                    <WifiOff className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                      Offline-First Mode Active
                    </h4>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      You are editing offline. Changes are saved locally in browser IndexedDB and will automatically synchronize upon reconnection.
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleOffline}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex-shrink-0 self-start sm:self-auto"
                >
                  Reconnect Sync
                </button>
              </div>
            )}
            <RichTextEditor provider={provider} userProfile={userProfile} />
          </div>
        )}
      </main>

      {/* Create Document Modal */}
      <CreateDocModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateDocument}
      />

      {/* CRDT Live Inspector Drawer */}
      {view === 'editor' && currentDocId && (
        <CRDTInspector
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          docId={currentDocId}
          ydoc={ydoc}
          status={status}
          telemetry={telemetry}
          timeline={timeline}
          decodedStateVector={decodedStateVector}
          peers={peers}
          currentProfile={userProfile}
          onClearTimeline={clearTimeline}
        />
      )}

      {/* Toast Notifications Container */}
      <ToastContainer />
    </div>
  );
};
