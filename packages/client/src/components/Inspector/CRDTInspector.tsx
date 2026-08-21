import React, { useState } from 'react';
import * as Y from 'yjs';
import {
  SyncTelemetry,
  UserProfile,
  CRDTOperationLog,
  DecodedStateVectorEntry,
  ConnectionState,
} from '@syncforge/shared';
import {
  X,
  Layers,
  Cpu,
  Radio,
  Database,
  Download,
  Activity,
  History,
  Network,
  Maximize2,
  Minimize2,
  Trash2,
  Pause,
  Play,
  ArrowUpRight,
  ArrowDownLeft,
  Server,
  User,
  ShieldAlert,
} from 'lucide-react';
import { exportDocument } from '../../lib/api';

interface CRDTInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  ydoc: Y.Doc | null;
  status: ConnectionState;
  telemetry: SyncTelemetry;
  timeline: CRDTOperationLog[];
  decodedStateVector: DecodedStateVectorEntry[];
  peers: Map<number, any>;
  currentProfile: UserProfile;
  onClearTimeline: () => void;
}

export const CRDTInspector: React.FC<CRDTInspectorProps> = ({
  isOpen,
  onClose,
  docId,
  ydoc,
  status,
  telemetry,
  timeline,
  decodedStateVector,
  peers,
  currentProfile,
  onClearTimeline,
}) => {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'timeline' | 'replicas' | 'statevector'>('telemetry');
  const [isExpanded, setIsExpanded] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'local' | 'remote' | 'system'>('all');
  const [isTimelinePaused, setIsTimelinePaused] = useState(false);
  const [frozenTimeline, setFrozenTimeline] = useState<CRDTOperationLog[]>([]);

  if (!isOpen) return null;

  const rawXml = ydoc ? JSON.stringify(ydoc.getXmlFragment('default').toJSON()) : '';
  const rawText = ydoc ? ydoc.getText('default').toString() : '';
  const stateVectorHex = ydoc
    ? Array.from(Y.encodeStateVector(ydoc))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
    : '';

  const activeTimeline = isTimelinePaused ? frozenTimeline : timeline;
  const filteredTimeline = activeTimeline.filter((log) => {
    if (timelineFilter === 'all') return true;
    return log.origin === timelineFilter;
  });

  const togglePauseTimeline = () => {
    if (!isTimelinePaused) {
      setFrozenTimeline([...timeline]);
      setIsTimelinePaused(true);
    } else {
      setIsTimelinePaused(false);
    }
  };

  const handleExport = async (format: 'text' | 'json') => {
    try {
      const data = await exportDocument(docId, format);
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
        type: format === 'json' ? 'application/json' : 'text/plain',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `syncforge_${docId}.${format === 'json' ? 'json' : 'txt'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const syncStatus =
    status === 'offline'
      ? 'PARTITIONED_OFFLINE'
      : (telemetry.pendingUpdates || 0) > 0
      ? 'PENDING_LOCAL_EDITS'
      : status === 'syncing'
      ? 'RECEIVING_REMOTE_EDITS'
      : 'IN_SYNC';

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 bg-slate-950 text-slate-100 shadow-2xl border-l border-slate-800 flex flex-col transition-all duration-300 ${
        isExpanded ? 'w-full max-w-4xl' : 'w-full max-w-xl'
      }`}
    >
      {/* Developer Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/20 via-sky-500/20 to-purple-500/20 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-[11px] font-mono font-bold tracking-widest text-amber-300 uppercase">
            Developer / Debugging Interface — Distributed CRDT Telemetry
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Top Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-400" />
            <h2 className="font-bold text-base text-white font-mono">CRDT Inspector</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-sky-950 text-sky-400 border border-sky-800">
              Live State
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Doc ID: <span className="text-slate-200">{docId}</span>
          </p>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 border ${
              syncStatus === 'IN_SYNC'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                : syncStatus === 'PARTITIONED_OFFLINE'
                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                : 'bg-sky-950/80 text-sky-300 border-sky-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                syncStatus === 'IN_SYNC'
                  ? 'bg-emerald-400 animate-pulse'
                  : syncStatus === 'PARTITIONED_OFFLINE'
                  ? 'bg-amber-400'
                  : 'bg-sky-400 animate-spin'
              }`}
            />
            {syncStatus}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 px-4 pt-2 gap-2 text-xs font-medium">
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'telemetry'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Telemetry & Metrics
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'timeline'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Update Timeline ({timeline.length})
        </button>

        <button
          onClick={() => setActiveTab('replicas')}
          className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'replicas'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          Replica Topology
        </button>

        <button
          onClick={() => setActiveTab('statevector')}
          className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'statevector'
              ? 'border-sky-500 text-sky-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          State Vector & Structs
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 text-sm">
        {/* ================= TAB 1: TELEMETRY & METRICS ================= */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Core Metrics Grid */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5 font-mono">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                CRDT Node Telemetry
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">Client ID</span>
                  <span className="font-mono font-bold text-base text-sky-400">{telemetry.clientId}</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Local Replica</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">Connection</span>
                  <span className="font-mono font-bold text-base text-emerald-400 uppercase">{status}</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">WebSocket State</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">Sent Updates</span>
                  <span className="font-mono font-bold text-base text-emerald-400 flex items-center gap-1">
                    <ArrowUpRight className="w-4 h-4" /> {telemetry.sentUpdates}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Local Edits Generated</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">Received Updates</span>
                  <span className="font-mono font-bold text-base text-sky-400 flex items-center gap-1">
                    <ArrowDownLeft className="w-4 h-4" /> {telemetry.receivedUpdates}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Remote Edits Applied</span>
                </div>
              </div>
            </div>

            {/* Storage & Buffer Metrics */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5 font-mono">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                Storage & Queue Buffers
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">Document Binary Size</span>
                  <span className="font-mono font-bold text-base text-slate-100">{telemetry.documentBytes} B</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Compressed CRDT update payload</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">Unsent / Pending Buffer</span>
                  <span className="font-mono font-bold text-base text-amber-400">
                    {telemetry.pendingUpdates || 0} updates
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Queued during offline/reconnect</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-mono">IndexedDB Persistence</span>
                  <span className="font-mono font-bold text-base text-emerald-400">Active (Journaled)</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Store: syncforge_doc_{docId}</span>
                </div>
              </div>
            </div>

            {/* Connected Peers Presence Summary */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5 font-mono">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                Active Awareness Peers ({peers.size})
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-sky-950/30 rounded-xl border border-sky-800/60">
                  <div className="flex items-center space-x-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full ring-2 ring-sky-500/50"
                      style={{ backgroundColor: currentProfile.color }}
                    />
                    <div>
                      <span className="font-medium text-slate-100">{currentProfile.name}</span>
                      <span className="text-xs text-sky-400 ml-2 font-mono font-semibold">(Local Replica)</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">ClientID: {telemetry.clientId}</span>
                </div>

                {Array.from(peers.entries()).map(([cid, state]) => {
                  if (!state || !state.user || state.user.name === currentProfile.name) return null;
                  return (
                    <div
                      key={cid}
                      className="flex items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-800"
                    >
                      <div className="flex items-center space-x-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full ring-2 ring-slate-700"
                          style={{ backgroundColor: state.user.color || '#3B82F6' }}
                        />
                        <div>
                          <span className="font-medium text-slate-200">{state.user.name}</span>
                          <span className="text-xs text-emerald-400 ml-2 font-mono">Online</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-400">Peer ID: {cid}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: OPERATION TIMELINE ================= */}
        {activeTab === 'timeline' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Timeline Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-mono px-2">Filter:</span>
                {(['all', 'local', 'remote', 'system'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTimelineFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono uppercase transition ${
                      timelineFilter === filter
                        ? 'bg-sky-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={togglePauseTimeline}
                  className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition ${
                    isTimelinePaused
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isTimelinePaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {isTimelinePaused ? 'Resume Stream' : 'Pause Stream'}
                </button>
                <button
                  onClick={onClearTimeline}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Clear timeline"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Timeline Stream */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredTimeline.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  No operations recorded yet for current filter. Type in the editor to stream CRDT events.
                </div>
              ) : (
                filteredTimeline.map((log) => {
                  const date = new Date(log.timestamp);
                  const timeString = `${date.toTimeString().split(' ')[0]}.${date
                    .getMilliseconds()
                    .toString()
                    .padStart(3, '0')}`;

                  return (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border text-xs font-mono transition ${
                        log.origin === 'local'
                          ? 'bg-emerald-950/20 border-emerald-900/50 text-slate-200'
                          : log.origin === 'remote'
                          ? 'bg-sky-950/20 border-sky-900/50 text-slate-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              log.origin === 'local'
                                ? 'bg-emerald-900 text-emerald-300'
                                : log.origin === 'remote'
                                ? 'bg-sky-900 text-sky-300'
                                : 'bg-purple-900 text-purple-300'
                            }`}
                          >
                            {log.origin}
                          </span>
                          <span className="text-slate-400 font-semibold">{log.type.toUpperCase()}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">{timeString}</span>
                      </div>

                      <div className="text-slate-200 font-sans mb-1">{log.summary}</div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>
                          Author ID: <span className="text-slate-300">{log.clientId}</span>
                        </span>
                        <span className="font-semibold text-slate-300">+{log.byteSize} bytes</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            log.status === 'synced'
                              ? 'text-emerald-400'
                              : log.status === 'applied'
                              ? 'text-sky-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: REPLICA TOPOLOGY ================= */}
        {activeTab === 'replicas' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 font-mono">
                Distributed Multi-Replica Topology Map
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Visualizing active CRDT replicas and bidirectional WebSocket synchronization channels.
              </p>

              {/* Topology Diagram Container */}
              <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 relative flex flex-col items-center justify-center gap-8">
                {/* Central Server Node */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-sky-950 border-2 border-sky-500 flex flex-col items-center justify-center text-sky-400 shadow-lg shadow-sky-950">
                    <Server className="w-7 h-7" />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-200 mt-2">SyncForge Server</span>
                  <span className="text-[11px] font-mono text-slate-500">Room: {docId.substring(0, 12)}...</span>
                </div>

                {/* Animated Connecting Lines */}
                <div className="w-full flex items-center justify-around relative">
                  {/* Local Client Node */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center text-white shadow-lg relative"
                      style={{
                        borderColor: currentProfile.color,
                        backgroundColor: `${currentProfile.color}22`,
                      }}
                    >
                      <User className="w-6 h-6" style={{ color: currentProfile.color }} />
                      <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-emerald-500 text-slate-950 font-bold text-[9px] rounded-full uppercase">
                        You
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-200 mt-2">{currentProfile.name}</span>
                    <span className="text-[11px] font-mono text-sky-400">ID: {telemetry.clientId}</span>
                    <span className="text-[10px] font-mono text-emerald-400 uppercase mt-0.5">
                      ↑ {telemetry.sentUpdates} / ↓ {telemetry.receivedUpdates}
                    </span>
                  </div>

                  {/* Remote Peer Nodes */}
                  {Array.from(peers.entries())
                    .filter(([cid, state]) => state && state.user && state.user.name !== currentProfile.name)
                    .map(([cid, state]) => (
                      <div key={cid} className="flex flex-col items-center">
                        <div
                          className="w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center text-white shadow-lg relative"
                          style={{
                            borderColor: state.user.color || '#3B82F6',
                            backgroundColor: `${state.user.color || '#3B82F6'}22`,
                          }}
                        >
                          <User className="w-6 h-6" style={{ color: state.user.color || '#3B82F6' }} />
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-200 mt-2">{state.user.name}</span>
                        <span className="text-[11px] font-mono text-purple-400">Peer: {cid}</span>
                        <span className="text-[10px] font-mono text-emerald-400 uppercase mt-0.5">Online</span>
                      </div>
                    ))}

                  {peers.size <= 1 && (
                    <div className="flex flex-col items-center opacity-40 border-2 border-dashed border-slate-700 rounded-2xl p-4">
                      <User className="w-6 h-6 text-slate-500 mb-1" />
                      <span className="text-[11px] font-mono text-slate-400">Waiting for peers...</span>
                      <span className="text-[10px] text-slate-500">Open link in another tab</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: STATE VECTOR & STRUCTS ================= */}
        {activeTab === 'statevector' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Decoded State Vector Table */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5 font-mono">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                Decoded State Vector (Lamport Clocks)
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                The State Vector maps each active replica client ID to the highest sequential Lamport clock received.
              </p>

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2">Replica Client ID</th>
                      <th className="px-3 py-2">Latest Clock</th>
                      <th className="px-3 py-2">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {decodedStateVector.map((entry) => (
                      <tr key={entry.clientId} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-bold text-sky-400">{entry.clientId}</td>
                        <td className="px-3 py-2 text-emerald-400">{entry.clock}</td>
                        <td className="px-3 py-2 text-slate-400">
                          {entry.clientId === telemetry.clientId ? (
                            <span className="text-emerald-400 font-semibold">Local Replica</span>
                          ) : (
                            <span>Remote Peer</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Binary Hex State Vector */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 font-mono">
                Binary Encoded State Vector Dump (Hex)
              </h3>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto break-all">
                {stateVectorHex || '00'}
              </div>
            </div>

            {/* CRDT Xml / Text Inspection */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 font-mono">
                CRDT Fragment ProseMirror Node Tree
              </h3>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-slate-300 font-mono text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">
                {rawXml || rawText || '(Empty document fragment)'}
              </div>
            </div>

            {/* Export Actions */}
            <div className="pt-2 border-t border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5 font-mono">
                <Download className="w-3.5 h-3.5 text-slate-400" />
                Diagnostic State Export
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExport('text')}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-medium text-xs transition"
                >
                  Export Plain Text
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl font-medium text-xs transition"
                >
                  Export CRDT JSON
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
