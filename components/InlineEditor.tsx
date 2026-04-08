'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Extension } from '@tiptap/core';
import { useEffect, useRef } from 'react';

/* Custom FontSize extension — voegt fontSize attribuut toe aan textStyle */
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
});

interface InlineEditorProps {
  content: string;
  onChange: (html: string) => void;
  onFocus?: (editor: Editor) => void;
  onBlur?: () => void;
  placeholder?: string;
  borderColor?: string;
  grow?: boolean;
}

export default function InlineEditor({ content, onChange, onFocus, onBlur, placeholder, borderColor, grow }: InlineEditorProps) {
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
    },
  });

  // Sync external content changes (only on mount or real external changes)
  useEffect(() => {
    if (!editor) return;
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  return (
    <div
      className={grow ? 'editor-grow' : undefined}
      style={{
        background: 'white',
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
