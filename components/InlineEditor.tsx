'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { useEffect, useRef } from 'react';

interface InlineEditorProps {
  content: string;
  onChange: (html: string) => void;
  onFocus?: (editor: Editor) => void;
  onBlur?: () => void;
  placeholder?: string;
  borderColor?: string;
}

export default function InlineEditor({ content, onChange, onFocus, onBlur, placeholder, borderColor }: InlineEditorProps) {
  const hasInitialized = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onFocus: ({ editor }) => {
      onFocus?.(editor);
    },
    onBlur: () => {
      onBlur?.();
    },
    editorProps: {
      attributes: {
        style: 'outline: none; padding: 8px 10px; font-size: 0.85rem; line-height: 1.6; min-height: 80px;',
      },
    },
  });

  // Sync external content changes (only on mount or real external changes)
  useEffect(() => {
    if (!editor) return;
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }
    // Only update if content actually differs (prevent cursor jump)
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  return (
    <div
      style={{
        background: 'white',
        cursor: 'text',
        position: 'relative',
      }}
      onClick={() => editor.commands.focus()}
    >
      <EditorContent editor={editor} />
      {editor.isEmpty && placeholder && (
        <div style={{
          position: 'absolute', top: '6px', left: '8px',
          color: '#c4c4c4', fontSize: '0.82rem', pointerEvents: 'none',
        }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}
