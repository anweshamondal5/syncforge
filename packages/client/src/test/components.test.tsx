import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LandingPage } from '../components/Landing/LandingPage';
import { DocumentList } from '../components/DocumentList/DocumentList';
import { ConnectionIndicator } from '../components/Editor/ConnectionIndicator';
import { ShareModal } from '../components/Editor/ShareModal';
import { DocumentMetadata } from '@syncforge/shared';

describe('SyncForge Frontend Component & Behavior Tests', () => {
  // Test 1: LandingPage Component
  test('LandingPage renders hero section, badges, and triggers CTAs', () => {
    const handleCreateNew = vi.fn();
    const handleGoToDashboard = vi.fn();

    render(
      <LandingPage
        onCreateNew={handleCreateNew}
        onGoToDashboard={handleGoToDashboard}
      />
    );

    // Verify main headline and badges
    expect(screen.getByText(/Real-Time Collaborative Editing with/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflict-Free Replicated Data Types/i)).toBeInTheDocument();

    // Verify CTAs
    const createBtn = screen.getByRole('button', { name: /Create New Document/i });
    fireEvent.click(createBtn);
    expect(handleCreateNew).toHaveBeenCalledTimes(1);

    const dashboardBtn = screen.getByRole('button', { name: /View All Documents/i });
    fireEvent.click(dashboardBtn);
    expect(handleGoToDashboard).toHaveBeenCalledTimes(1);
  });

  // Test 2: DocumentList Component
  test('DocumentList renders documents, filters by search, and prompts delete confirmation', () => {
    const docs: DocumentMetadata[] = [
      {
        id: 'doc_1',
        title: 'Distributed Consensus RFC',
        creator: 'Leslie Lamport',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        update_count: 42,
        size_bytes: 1024,
      },
      {
        id: 'doc_2',
        title: 'Weekly Sprint Notes',
        creator: 'Ada Lovelace',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        update_count: 5,
        size_bytes: 256,
      },
    ];

    const handleOpen = vi.fn();
    const handleCreate = vi.fn();
    const handleDelete = vi.fn();

    render(
      <DocumentList
        documents={docs}
        loading={false}
        onOpenDocument={handleOpen}
        onCreateNew={handleCreate}
        onDeleteDocument={handleDelete}
      />
    );

    expect(screen.getByText('Distributed Consensus RFC')).toBeInTheDocument();
    expect(screen.getByText('Weekly Sprint Notes')).toBeInTheDocument();

    // Test Search Filter
    const searchInput = screen.getByPlaceholderText(/Search documents by title/i);
    fireEvent.change(searchInput, { target: { value: 'Consensus' } });

    expect(screen.getByText('Distributed Consensus RFC')).toBeInTheDocument();
    expect(screen.queryByText('Weekly Sprint Notes')).not.toBeInTheDocument();

    // Clear search and test delete modal
    fireEvent.change(searchInput, { target: { value: '' } });
    const deleteButtons = screen.getAllByTitle(/Delete document/i);
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText(/Delete Document\?/i)).toBeInTheDocument();
    const confirmDeleteBtn = screen.getByRole('button', { name: /Yes, Delete Document/i });
    fireEvent.click(confirmDeleteBtn);

    expect(handleDelete).toHaveBeenCalledWith('doc_1');
  });

  // Test 3: ConnectionIndicator Component
  test('ConnectionIndicator renders appropriate states and handles offline toggle', () => {
    const handleToggleOffline = vi.fn();
    const handleOpenInspector = vi.fn();

    // 1. Connected State
    const { rerender } = render(
      <ConnectionIndicator
        status="connected"
        onToggleOffline={handleToggleOffline}
        onOpenInspector={handleOpenInspector}
      />
    );
    expect(screen.getByText(/Saved & Connected/i)).toBeInTheDocument();

    const offlineToggleBtn = screen.getByTitle(/Disconnect WebSocket to test offline editing/i);
    fireEvent.click(offlineToggleBtn);
    expect(handleToggleOffline).toHaveBeenCalledTimes(1);

    // 2. Offline State
    rerender(
      <ConnectionIndicator
        status="offline"
        onToggleOffline={handleToggleOffline}
        onOpenInspector={handleOpenInspector}
      />
    );
    expect(screen.getByText(/Offline Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Reconnect Sync/i)).toBeInTheDocument();

    // 3. Syncing State
    rerender(
      <ConnectionIndicator
        status="syncing"
        onToggleOffline={handleToggleOffline}
        onOpenInspector={handleOpenInspector}
      />
    );
    expect(screen.getByText(/Syncing Changes/i)).toBeInTheDocument();

    // 4. CRDT Inspector Trigger
    const inspectorBtn = screen.getByTitle(/Open Developer CRDT State Inspector/i);
    fireEvent.click(inspectorBtn);
    expect(handleOpenInspector).toHaveBeenCalledTimes(1);
  });

  // Test 4: ShareModal Component
  test('ShareModal displays shareable link and live collaborator list', () => {
    const handleClose = vi.fn();
    const peers = new Map<number, any>([
      [
        12345,
        {
          user: { name: 'Barbara Liskov', color: '#10b981' },
        },
      ],
    ]);

    render(
      <ShareModal
        isOpen={true}
        onClose={handleClose}
        docId="test-doc-xyz"
        docTitle="High Throughput CRDTs"
        peers={peers}
        currentProfile={{ id: 'user-1', name: 'Grace Hopper', color: '#0ea5e9' }}
      />
    );

    expect(screen.getByText('Share Document')).toBeInTheDocument();
    expect(screen.getByText('High Throughput CRDTs')).toBeInTheDocument();
    expect(screen.getByText(/Grace Hopper/i)).toBeInTheDocument();
    expect(screen.getByText('Barbara Liskov')).toBeInTheDocument();
    expect(screen.getByText(/ID: 12345/i)).toBeInTheDocument();

    // Close button
    const doneBtn = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
