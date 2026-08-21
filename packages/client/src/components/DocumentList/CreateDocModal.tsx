import React, { useState } from 'react';
import { Plus, X, FileText, Cpu, CheckSquare, Sparkles } from 'lucide-react';

interface CreateDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, templateType?: string) => void;
}

const TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Document',
    description: 'Start fresh with an empty collaborative canvas',
    icon: FileText,
    color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950 border-sky-200 dark:border-sky-800',
    defaultTitle: 'Untitled Document',
  },
  {
    id: 'architecture_rfc',
    title: 'System Architecture RFC',
    description: 'Design doc template with context, trade-offs & milestones',
    icon: Cpu,
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800',
    defaultTitle: 'RFC: Real-Time Distributed Architecture',
  },
  {
    id: 'meeting_notes',
    title: 'Engineering Sprint Notes',
    description: 'Agendas, active attendees, action items & decisions',
    icon: CheckSquare,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800',
    defaultTitle: 'Engineering Sprint Sync',
  },
  {
    id: 'crdt_spec',
    title: 'CRDT Technical Spec',
    description: 'Mathematical invariants, state vectors & Lamport clocks',
    icon: Sparkles,
    color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800',
    defaultTitle: 'Technical Spec: CRDT State Replication',
  },
];

export const CreateDocModal: React.FC<CreateDocModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [title, setTitle] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentTpl = TEMPLATES.find((t) => t.id === selectedTemplate);
    const finalTitle = title.trim() || currentTpl?.defaultTitle || 'Untitled Document';
    onCreate(finalTitle, selectedTemplate);
    setTitle('');
    setSelectedTemplate('blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-lg border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Create New Document
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose a template or start with a blank document.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template Selection Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Select Template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplate(tpl.id);
                      if (!title) setTitle(tpl.defaultTitle);
                    }}
                    className={`p-3 rounded-2xl border transition cursor-pointer text-left flex flex-col justify-between ${
                      isSelected
                        ? 'border-sky-600 dark:border-sky-400 bg-sky-50/60 dark:bg-sky-950/40 ring-2 ring-sky-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start space-x-2.5 mb-1.5">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${tpl.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {tpl.title}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {tpl.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Distributed Consensus Design Proposal"
              autoFocus
              className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-950 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white rounded-xl shadow-md shadow-sky-500/20 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Create Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
