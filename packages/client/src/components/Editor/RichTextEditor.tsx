import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { SyncForgeProvider } from '../../lib/sync/SyncForgeProvider';
import { UserProfile } from '@syncforge/shared';
import { EditorToolbar } from './EditorToolbar';
import { FileText, Users, CheckCircle2 } from 'lucide-react';

interface RichTextEditorProps {
  provider: SyncForgeProvider;
  userProfile: UserProfile;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  provider,
  userProfile,
}) => {
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // Disable built-in history because Yjs handles collaborative undo/redo
          history: false,
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-sky-600 dark:text-sky-400 underline cursor-pointer hover:text-sky-800 dark:hover:text-sky-300',
          },
        }),
        Collaboration.configure({
          document: provider.doc,
        }),
        CollaborationCursor.configure({
          provider: provider as any,
          user: {
            name: userProfile.name,
            color: userProfile.color,
          },
        }),
      ],
      editorProps: {
        attributes: {
          class:
            'tiptap-content max-w-4xl mx-auto focus:outline-none min-h-[600px] px-6 sm:px-10 py-8 text-slate-800 dark:text-slate-200 leading-relaxed text-base',
        },
      },
      onUpdate: ({ editor }) => {
        const text = editor.getText();
        setCharCount(text.length);
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      },
    },
    [provider.docId]
  );

  // Update cursor user profile whenever it changes
  useEffect(() => {
    if (editor && userProfile) {
      editor.commands.updateUser({
        name: userProfile.name,
        color: userProfile.color,
      });
    }
  }, [editor, userProfile]);

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-2 sm:px-4 flex flex-col">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
        {/* Top Rich Text Toolbar */}
        <EditorToolbar editor={editor} />

        {/* Paper Canvas */}
        <div className="bg-white dark:bg-slate-900 min-h-[650px] relative transition-colors">
          <EditorContent editor={editor} />
        </div>

        {/* Document Stats Footer */}
        <div className="px-6 py-2.5 bg-slate-50/80 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1.5 font-medium">
              <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              {wordCount} words
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="font-medium">{charCount} characters</span>
          </div>

          <div className="flex items-center space-x-3 text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 shadow-2xs">
                Ctrl+B
              </kbd>{' '}
              Bold
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 shadow-2xs">
                Ctrl+Z
              </kbd>{' '}
              Undo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
