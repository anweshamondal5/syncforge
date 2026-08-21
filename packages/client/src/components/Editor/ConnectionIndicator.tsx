import React from 'react';
import { ConnectionState } from '@syncforge/shared';
import { Wifi, WifiOff, RefreshCw, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ConnectionIndicatorProps {
  status: ConnectionState;
  onToggleOffline: () => void;
  onOpenInspector: () => void;
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  status,
  onToggleOffline,
  onOpenInspector,
}) => {
  const getBadge = () => {
    switch (status) {
      case 'saved':
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Saved & Connected</span>
            <span className="sm:hidden">Live</span>
          </span>
        );
      case 'syncing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-sm">
            <RefreshCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin" />
            Syncing Changes...
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-sm">
            <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
            Connecting...
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            Sync Error
          </span>
        );
      case 'offline':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-sm">
            <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            Offline Mode
          </span>
        );
    }
  };

  return (
    <div className="flex items-center space-x-2">
      {/* Status Badge */}
      {getBadge()}

      {/* Offline / Online Simulation Toggle */}
      <button
        onClick={onToggleOffline}
        className={`px-2.5 py-1 text-xs font-medium rounded-xl border transition flex items-center gap-1.5 shadow-sm ${
          status === 'offline'
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-emerald-500/20'
            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
        }`}
        title={status === 'offline' ? 'Reconnect WebSocket to sync changes' : 'Disconnect WebSocket to test offline editing'}
      >
        {status === 'offline' ? (
          <>
            <Wifi className="w-3.5 h-3.5" />
            <span>Reconnect Sync</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Simulate Offline</span>
            <span className="sm:hidden">Offline</span>
          </>
        )}
      </button>

      {/* CRDT Inspector Button */}
      <button
        onClick={onOpenInspector}
        className="px-2.5 py-1 text-xs font-mono font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/80 hover:bg-sky-100 dark:hover:bg-sky-900/80 border border-sky-300 dark:border-sky-800 rounded-xl transition shadow-sm flex items-center gap-1.5"
        title="Open Developer CRDT State Inspector"
      >
        <Activity className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
        <span className="hidden sm:inline">CRDT Inspector</span>
      </button>
    </div>
  );
};
