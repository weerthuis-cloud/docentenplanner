'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { useEffect, useCallback } from 'react';

const FONTS = ['14px', '16px', '18px', '20px', '24px'];
const COLORS = ['#000000', '#1a7a2e', '#2563EB', '#DC2626', '#D97706', '#7C3AED', '#6B7280'];
const HIGHLIGHTS = ['transparent', '#FEF08A', '#BBF7D0', '#BFDBFE', '#FECACA', '#FDE68A'];

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  labelColor?: string;
  minHeight?: number;
}

export default function RichTextEditor({ content, onChange, placeholder, label, labelColor, minHeight = 120 }: RichTextEditorProps) {
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
    editorProps: {
      attributes: {
        style: `min-height: ${minHeight}px; outline: none; padding: 0.5rem 0.7rem; font-size: 0.9rem; line-height: 1.6;`,
      },
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  const setColor = useCallback((color: string) => {
    editor?.chain().focus().setColor(color).run();
  }, [editor]);

  const setHighlight = useCallback((color: string) => {
    if (color === 'transparent') {
      editor?.chain().focus().unsetHighlight().run();
    } else {
      editor?.chain().focus().setHighlight({ color }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div style={{ border: '1.5px solid #d1d5db', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
      {/* Label */}
      {label && (
        <div style={{
          padding: '0.35rem 0.7rem', background: labelColor ? labelColor + '10' : '#f9fafb',
          borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: '0.82rem',
          color: labelColor || '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          {label}
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.3rem 0.5rem',
        borderBottom: '1px solid #e5e7eb', background: '#fafafa', alignItems: 'center',
      }}>
        {/* Bold / Italic / Underline / Strike */}
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Dikgedrukt">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Schuin">
          <em>I</em>
        </ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Onderstreept">
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolBtn>
        <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Doorgestreept">
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolBtn>

        <Divider />

        {/* Lists */}
        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Opsomming">
          ☰
        </ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Genummerd">
          1.
        </ToolBtn>

        <Divider />

        {/* Text align */}
        <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Links">
          ≡
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Midden">
          ≡
        </ToolBtn>

        <Divider />

        {/* Font size */}
        <select
          onChange={e => {
            const size = e.target.value;
            if (size) {
              editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
            }
          }}
          defaultValue=""
          style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 4px', fontSize: '0.72rem', background: 'white', cursor: 'pointer' }}
        >
          <option value="" disabled>Grootte</option>
          {FONTS.map(s => <option key={s} value={s}>{parseInt(s)}pt</option>)}
        </select>

        <Divider />

        {/* Colors */}
        <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginRight: 2 }}>A</span>
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} title={`Kleur: ${c}`}
              style={{
                width: 16, height: 16, borderRadius: 3, border: '1px solid #d1d5db',
                background: c, cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>

        <Divider />

        {/* Highlight */}
        <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginRight: 2 }}>🖍</span>
          {HIGHLIGHTS.map(c => (
            <button key={c} onClick={() => setHighlight(c)} title={c === 'transparent' ? 'Geen markering' : `Markeer: ${c}`}
              style={{
                width: 16, height: 16, borderRadius: 3,
                border: `1px solid ${c === 'transparent' ? '#d1d5db' : c}`,
                background: c === 'transparent' ? 'white' : c,
                cursor: 'pointer', padding: 0,
                position: 'relative',
              }}
            >
              {c === 'transparent' && <span style={{ position: 'absolute', top: -1, left: 3, fontSize: '0.6rem', color: '#DC2626' }}>✕</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Editor content */}
      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
        {!content && placeholder && (
          <div style={{
            position: 'absolute', top: '0.5rem', left: '0.7rem',
            color: '#c4c4c4', fontSize: '0.9rem', pointerEvents: 'none',
            display: editor.isEmpty ? 'block' : 'none',
          }}>
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
      background: active ? '#1a7a2e20' : 'transparent',
      color: active ? '#1a7a2e' : '#374151',
      fontWeight: active ? 700 : 400,
    }}>
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />;
}
