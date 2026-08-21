import React, { useState, useEffect } from 'react';
import { UserProfile, ConnectionState } from '@syncforge/shared';
import { USER_COLORS } from '@syncforge/shared';
import { CollaboratorAvatars } from '../Editor/CollaboratorAvatars';
import { ConnectionIndicator } from '../Editor/ConnectionIndicator';
import { ShareModal } from '../Editor/ShareModal';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  FileText,
  Share2,
  ChevronLeft,
  Check,
  Edit2,
  User,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface NavbarProps {
  docId?: string;
  docTitle?: string;
  onRenameTitle?: (newTitle: string) => void;
  onNavigateHome: () => void;
  status?: ConnectionState;
  onToggleOffline?: () => void;
  onOpenInspector?: () => void;
  peers?: Map<number, any>;
  currentProfile: UserProfile;
  onUpdateProfile: (name: string, color: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  docId,
  docTitle = 'Untitled Document',
  onRenameTitle,
  onNavigateHome,
  status,
  onToggleOffline,
  onOpenInspector,
  peers,
  currentProfile,
  onUpdateProfile,
}) => {
  const { showToast } = useToast();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(docTitle);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState(currentProfile.name);
  const [tempColor, setTempColor] = useState(currentProfile.color);

  useEffect(() => {
    setTitleInput(docTitle);
  }, [docTitle]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleInput.trim() && titleInput !== docTitle && onRenameTitle) {
      onRenameTitle(titleInput.trim());
      showToast('Title Updated', {
        message: `Document renamed to "${titleInput.trim()}".`,
        type: 'success',
      });
    }
  };

  const handleSaveProfile = () => {
    if (tempName.trim()) {
      onUpdateProfile(tempName.trim(), tempColor);
      setShowProfileModal(false);
      showToast('Profile Updated', {
        message: `Identity updated to "${tempName.trim()}".`,
        type: 'info',
      });
    }
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-4 py-2.5 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Left Section: Logo & Document Title */}
        <div className="flex items-center space-x-3 min-w-0">
          {docId && (
            <button
              onClick={onNavigateHome}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Back to Documents"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div
            onClick={onNavigateHome}
            className="flex items-center space-x-2 cursor-pointer group flex-shrink-0"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-600 dark:bg-sky-500 flex items-center justify-center text-white font-bold shadow-md shadow-sky-500/20 group-hover:bg-sky-700 transition">
              <FileText className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-base text-slate-900 dark:text-white hidden sm:inline tracking-tight">
              Sync<span className="text-sky-600 dark:text-sky-400">Forge</span>
            </span>
          </div>

          {docId && (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-800 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                    autoFocus
                    className="px-2.5 py-1 text-xs font-semibold border border-sky-400 dark:border-sky-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-white bg-white dark:bg-slate-950"
                  />
                  <button
                    onClick={handleTitleSubmit}
                    className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingTitle(true)}
                  className="flex items-center space-x-1.5 group cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition truncate max-w-[180px] md:max-w-xs"
                  title="Click to rename document"
                >
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {docTitle}
                  </span>
                  <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center/Right Section: Collaborators, Connection, Theme, Profile */}
        <div className="flex items-center space-x-2.5">
          {docId && peers && (
            <CollaboratorAvatars peers={peers} currentProfile={currentProfile} />
          )}

          {docId && status && onToggleOffline && onOpenInspector && (
            <ConnectionIndicator
              status={status}
              onToggleOffline={onToggleOffline}
              onOpenInspector={onOpenInspector}
            />
          )}

          {docId && (
            <button
              onClick={() => setShowShareModal(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white shadow-sm shadow-sky-500/25 transition flex items-center gap-1.5"
              title="Open Share & Collaborators Modal"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Share</span>
            </button>
          )}

          {/* Theme Mode Switcher */}
          <ThemeSwitcher />

          {/* User Profile Avatar Button */}
          <button
            onClick={() => {
              setTempName(currentProfile.name);
              setTempColor(currentProfile.color);
              setShowProfileModal(true);
            }}
            style={{ backgroundColor: currentProfile.color }}
            className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-slate-800 hover:ring-sky-400 transition flex-shrink-0"
            title={`Logged in as ${currentProfile.name} (Click to customize profile)`}
          >
            {currentProfile.name.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </div>

      {/* Share Modal */}
      {docId && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          docId={docId}
          docTitle={docTitle}
          peers={peers}
          currentProfile={currentProfile}
        />
      )}

      {/* User Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              Collaborator Profile
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Your name and cursor color are visible to other editors in real time.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-white"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Cursor Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {USER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setTempColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-7 h-7 rounded-full transition transform hover:scale-110 flex items-center justify-center ${
                        tempColor === color ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white' : ''
                      }`}
                    >
                      {tempColor === color && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                className="px-4 py-2 text-xs bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white font-semibold rounded-xl shadow-sm transition"
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
