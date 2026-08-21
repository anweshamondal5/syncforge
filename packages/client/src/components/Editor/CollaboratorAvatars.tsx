import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '@syncforge/shared';
import { Users, ChevronDown } from 'lucide-react';

interface CollaboratorAvatarsProps {
  peers: Map<number, any>;
  currentProfile: UserProfile;
}

export const CollaboratorAvatars: React.FC<CollaboratorAvatarsProps> = ({
  peers,
  currentProfile,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const usersList: { id: string | number; name: string; color: string; isSelf: boolean }[] = [];

  if (peers && peers.size > 0) {
    peers.forEach((state, clientID) => {
      if (state && state.user) {
        const isSelf =
          state.user.id === currentProfile.id ||
          state.user.name === currentProfile.name;
        usersList.push({
          id: clientID,
          name: isSelf ? currentProfile.name : state.user.name || `Collaborator #${clientID}`,
          color: isSelf ? currentProfile.color : state.user.color || '#3B82F6',
          isSelf,
        });
      }
    });
  }

  // Ensure self is in list
  if (!usersList.some((u) => u.isSelf)) {
    usersList.unshift({
      id: currentProfile.id || 'self',
      name: currentProfile.name,
      color: currentProfile.color,
      isSelf: true,
    });
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getInitials = (name: string) => {
    return name
      .replace('(You)', '')
      .trim()
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        title="View active collaborators"
      >
        <div className="flex -space-x-1.5 overflow-hidden p-0.5 items-center">
          {usersList.slice(0, 4).map((u) => (
            <div
              key={u.id}
              style={{ backgroundColor: u.color }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold border-2 border-white dark:border-slate-900 shadow-sm ring-1 ring-black/5"
            >
              {getInitials(u.name)}
            </div>
          ))}
        </div>

        {usersList.length > 4 && (
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
            +{usersList.length - 4}
          </span>
        )}

        <div className="flex items-center text-xs text-slate-700 dark:text-slate-300 font-semibold pl-1 gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{usersList.length} online</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Collaborator Details Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              Active Collaborators ({usersList.length})
            </h4>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live Presence
            </span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {usersList.map((u) => (
              <div
                key={u.id}
                className={`flex items-center justify-between p-2 rounded-xl transition ${
                  u.isSelf ? 'bg-sky-50/70 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    style={{ backgroundColor: u.color }}
                    className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-sm flex-shrink-0"
                  >
                    {getInitials(u.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {u.name} {u.isSelf && <span className="text-sky-600 dark:text-sky-400 font-normal">(You)</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active in document
                    </p>
                  </div>
                </div>

                <div
                  className="w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 shadow-sm flex-shrink-0"
                  style={{ backgroundColor: u.color }}
                  title={`Theme Color: ${u.color}`}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Presence via Ephemeral CRDT</span>
            <span className="font-mono">SyncForge 1.0</span>
          </div>
        </div>
      )}
    </div>
  );
};
