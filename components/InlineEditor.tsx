'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
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
  grow?: boolean;
  autoFocus?: boolean;
  onTabOut?: () => void;
}

export default function InlineEditor({ content, onChange, onFocus, onBlur, placeholder, borderColor, grow, autoFocus, onTabOut }: InlineEditorProps) {
  const hasInitialized = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
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
        class: 'tiptap',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          // If Shift+Tab, try to go back; otherwise go to next tab
          if (event.shiftKey) {
            onTabOut?.();
          } else {
            // For forward Tab in last field, call onTabOut (which cycles to first)
            onTabOut?.();
          }
          return true;
        }
        return false;
      },
    },
  });

  // Sync external content changes (only on mount or real external changes)
  useEffect(() => {
    if (!editor) return;
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      if (autoFocus) {
        editor.commands.focus();
      }
      return;
    }
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && editor && hasInitialized.current) {
      editor.commands.focus('end');
    }
  }, [autoFocus, editor]);

  if (!editor) return null;

  return (
    <div
      className={grow ? 'editor-grow' : undefined}
      style={{
        background: 'transparent',
        cursor: 'text',
        position: 'relative',
        ...(grow ? { flex: 1, display: 'flex', flexDirection: 'column' as const } : {}),
      }}
      onClick={() => editor.commands.focus()}
    >
      <EditorContent
        editor={editor}
        className={grow ? 'editor-grow' : undefined}
        style={grow ? { flex: 1, display: 'flex', flexDirection: 'column' as const } : undefined}
      />
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
