import React, { useState } from 'react';
import { UserProfile } from '@syncforge/shared';
import {
  Share2,
  Copy,
  Check,
  Users,
  ShieldCheck,
  Globe,
  Radio,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  docTitle: string;
  peers?: Map<number, any>;
  currentProfile: UserProfile;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  docId,
  docTitle,
  peers,
  currentProfile,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/document/${docId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    showToast('Share Link Copied', {
      message: 'Share URL copied to clipboard.',
      type: 'success',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const peerList = peers
    ? Array.from(peers.entries()).map(([clientId, state]) => ({
        clientId,
        user: state?.user || { name: `Peer-${clientId}`, color: '#0ea5e9' },
      }))
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Share Document</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
                {docTitle || 'Untitled Document'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Share Link Copy Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Collaborative Document Link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                <Globe className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
                <span className="truncate">{shareUrl}</span>
              </div>
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-emerald-500/25'
                    : 'bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white shadow-sky-500/25'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              Anyone with this link can edit concurrently with live cursors.
            </p>
          </div>

          {/* Active Collaborators Roster */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                Active Collaborators ({peerList.length + 1})
              </label>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Room Live
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {/* Current User */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-sky-50/50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900">
                <div className="flex items-center space-x-2.5">
                  <div
                    className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-sm"
                    style={{ backgroundColor: currentProfile.color }}
                  >
                    {currentProfile.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {currentProfile.name}{' '}
                      <span className="text-xs font-normal text-sky-600 dark:text-sky-400 font-sans">(You)</span>
                    </span>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 font-semibold">
                  Local
                </span>
              </div>

              {/* Remote Peers */}
              {peerList.map(({ clientId, user }) => (
                <div
                  key={clientId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-sm"
                      style={{ backgroundColor: user.color || '#64748b' }}
                    >
                      {(user.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {user.name || `Collaborator #${clientId}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">ID: {clientId}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CRDT Security & Privacy Assurance */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-start space-x-2.5 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">
              Changes are synchronized via binary CRDT state vectors and stored with debounced WAL snapshot compaction.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
