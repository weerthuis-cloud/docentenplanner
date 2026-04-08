'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Editor } from '@tiptap/react';

const InlineEditor = dynamic(() => import('@/components/InlineEditor'), { ssr: false });

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface RoosterSlot { id?: number; klas_id: number; dag: number; uur: number; vak: string; lokaal: string; is_blokuur: boolean; }
interface Les { id?: number; klas_id: number; datum: string; uur: number | null; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; notities: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; kleur: string; les_id: number | null; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; }
interface Jaarplanner { id: number; vak: string; jaarlaag: string; schooljaar: string; naam: string; data: Array<{ week: number; les: number; planning: string; toetsen: string }>; created_at: string; }

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

const dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const klasKleuren = ['#1a7a2e', '#2563EB', '#9333EA', '#DC2626', '#D97706', '#0891B2', '#BE185D', '#4338CA'];
const toetsKleuren: Record<string, string> = { PW: '#DC2626', SO: '#D97706', PO: '#7C3AED', MO: '#059669', SE: '#2563EB', overig: '#6B7280' };
const toetsLabels: Record<string, string> = { PW: 'Proefwerk', SO: 'Schriftelijke overhoring', PO: 'Praktische opdracht', MO: 'Mondeling', SE: 'Schoolexamen', overig: 'Overig' };

const FONTS = ['14px', '16px', '18px', '20px', '24px'];
const COLORS = ['#000000', '#1a7a2e', '#2563EB', '#DC2626', '#D97706', '#7C3AED', '#6B7280'];
const HIGHLIGHTS = ['transparent', '#FEF08A', '#BBF7D0', '#BFDBFE', '#FECACA', '#FDE68A'];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d); m.setDate(d.getDate() + diff); return m;
}
function formatDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }
function getWeekNumber(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}
function getDaysOfWeek(ws: string): string[] {
  const days: string[] = []; const s = new Date(ws + 'T12:00:00');
  for (let i = 0; i < 5; i++) { const d = new Date(s); d.setDate(s.getDate() + i); days.push(d.toISOString().split('T')[0]); }
  return days;
}
function isInVakantie(datum: string, vakanties: Vakantie[]): Vakantie | null {
  for (const v of vakanties) { if (datum >= v.start_datum && datum <= v.eind_datum) return v; } return null;
}
const emptyLes = (klas_id: number, datum: string, uur: number | null): Les => ({
  klas_id, datum, uur, startopdracht: '', terugkijken: '', programma: '', leerdoelen: '', huiswerk: '', niet_vergeten: '', notities: '',
});

/* ───── Component ───── */
export default function PlannerPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [allRooster, setAllRooster] = useState<RoosterSlot[]>([]);
  const [lessen, setLessen] = useState<Les[]>([]);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [vakanties, setVakanties] = useState<Vakantie[]>([]);
  const [jaarplanners, setJaarplanners] = useState<Jaarplanner[]>([]);

  const [view, setView] = useState<'rooster' | 'planner'>('planner');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO', klas_id: 0, datum: '' });
  const [showToetsForm, setShowToetsForm] = useState(false);

  // Local edit state for all cells: key = "klas_id-datum-uur"
  const [editState, setEditState] = useState<Record<string, Les>>({});
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const days = getDaysOfWeek(weekStart);
  const weekEnd = days[4];
  const today = new Date().toISOString().split('T')[0];

  const klasKleurMap: Record<number, string> = {};
  klassen.forEach((k, i) => { klasKleurMap[k.id] = klasKleuren[i % klasKleuren.length]; });

  /* ───── Fetching ───── */
  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen);
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
    fetch('/api/jaarplanners').then(r => r.json()).then(setJaarplanners);
  }, []);

  const fetchAllRooster = useCallback(() => {
    fetch('/api/roosters').then(r => r.json()).then(setAllRooster);
  }, []);

  const fetchLessen = useCallback(() => {
    if (klassen.length === 0) return;
    Promise.all(klassen.map(k =>
      fetch(`/api/lessen?klas_id=${k.id}&week_start=${weekStart}&week_end=${weekEnd}`)
        .then(r => r.json()).then((d: Les[] | Les | null) => Array.isArray(d) ? d : d ? [d] : [])
    )).then(r => { setLessen(r.flat()); setEditState({}); });
  }, [klassen, weekStart, weekEnd]);

  const fetchToetsen = useCallback(() => {
    if (klassen.length === 0) return;
    Promise.all(klassen.map(k => fetch(`/api/toetsen?klas_id=${k.id}`).then(r => r.json())))
      .then(r => setToetsen(r.flat()));
  }, [klassen]);

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { if (view === 'planner') fetchLessen(); }, [fetchLessen, view]);
  useEffect(() => { if (view === 'planner') fetchToetsen(); }, [fetchToetsen, view]);

  /* ───── Helpers ───── */
  const getSlot = (dag: number, uur: number): RoosterSlot | undefined =>
    allRooster.find(r => r.dag === dag && r.uur === uur);

  const getLes = (klas_id: number, datum: string, uur: number): Les | undefined =>
    lessen.find(l => l.klas_id === klas_id && l.datum === datum && l.uur === uur);

  const getToetsenForDateKlas = (datum: string, klas_id: number): Toets[] =>
    toetsen.filter(t => t.datum === datum && t.klas_id === klas_id);

  const isBlokuurStart = (dag: number, uur: number): boolean => {
    const slot = getSlot(dag, uur);
    const next = getSlot(dag, uur + 1);
    return !!(slot && next && slot.klas_id === next.klas_id && slot.is_blokuur);
  };

  const isBlokuurSecond = (dag: number, uur: number): boolean => {
    const slot = getSlot(dag, uur);
    const prev = getSlot(dag, uur - 1);
    return !!(slot && prev && slot.klas_id === prev.klas_id && prev.is_blokuur);
  };

  const canBeBlokuur = (dag: number, uur: number): boolean => {
    const slot = getSlot(dag, uur);
    const next = getSlot(dag, uur + 1);
    return !!(slot && next && slot.klas_id === next.klas_id);
  };

  /* ───── Rooster actions ───── */
  async function setRoosterKlas(dag: number, uur: number, klasId: number | null) {
    const existing = getSlot(dag, uur);
    if (existing?.id) await fetch(`/api/roosters?id=${existing.id}`, { method: 'DELETE' });
    if (klasId) {
      const klas = klassen.find(k => k.id === klasId);
      await fetch('/api/roosters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klas_id: klasId, dag, uur, vak: klas?.vak || '', lokaal: klas?.lokaal || '', is_blokuur: false }),
      });
    }
    fetchAllRooster();
  }

  async function toggleBlokuur(dag: number, uur: number) {
    const slot = getSlot(dag, uur);
    const next = getSlot(dag, uur + 1);
    if (!slot || !next || slot.klas_id !== next.klas_id) return;
    const newVal = !slot.is_blokuur;
    await fetch('/api/roosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...slot, is_blokuur: newVal }) });
    await fetch('/api/roosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...next, is_blokuur: newVal }) });
    fetchAllRooster();
  }

  /* ───── Auto-save on change (debounced) ───── */
  function updateCell(key: string, les: Les, field: string, value: string) {
    const updated = { ...les, [field]: value };
    setEditState(prev => ({ ...prev, [key]: updated }));

    // Debounced auto-save
    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
    saveTimerRef.current[key] = setTimeout(() => {
      saveLes(updated);
    }, 1500);
  }

  async function saveLes(les: Les) {
    setSaving(true);
    await fetch('/api/lessen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(les) });
    setSaving(false);
  }

  async function deleteToets(id: number) {
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' }); fetchToetsen();
  }

  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  /* ───── Get cell data ───── */
  function getCellLes(klas_id: number, datum: string, uur: number): Les {
    const key = `${klas_id}-${datum}-${uur}`;
    if (editState[key]) return editState[key];
    const existing = getLes(klas_id, datum, uur);
    if (existing) return existing;
    return emptyLes(klas_id, datum, uur);
  }

  /* ───── Jaarplanner suggestion for a cell ───── */
  function getJpSuggestion(klas_id: number, datum: string): string | null {
    const klas = klassen.find(k => k.id === klas_id);
    if (!klas) return null;
    const jp = jaarplanners.find(j => j.vak === klas.vak && j.jaarlaag === klas.jaarlaag);
    if (!jp || !jp.data) return null;
    const week = getWeekNumber(datum);
    const rows = jp.data.filter(r => r.week === week);
    if (rows.length === 0) return null;
    const parts = rows.map(r => {
      let t = '';
      if (r.planning) t += stripHtml(r.planning);
      if (r.toetsen) t += (t ? ' · ' : '') + '📝 ' + stripHtml(r.toetsen);
      return t;
    }).filter(Boolean);
    return parts.length > 0 ? parts.join(' | ') : null;
  }

  /* ───── Determine which uren actually have rooster entries ───── */
  const activeUren = Array.from(new Set(allRooster.map(r => r.uur))).sort((a, b) => a - b);
  // Filter out blokuur seconds
  const visibleUren = activeUren.filter(uur => {
    // Check if this uur is a blokuur-second for ANY day
    for (let dag = 1; dag <= 5; dag++) {
      if (isBlokuurStart(dag, uur)) return true; // it's a start, keep it
    }
    for (let dag = 1; dag <= 5; dag++) {
      if (isBlokuurSecond(dag, uur)) return false; // it's a second on some day, we handle via rowspan
    }
    return true;
  });
  // Actually, for the document view, let's just show all uren but handle blokuur per cell
  const allUren = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(uur =>
    allRooster.some(r => r.uur === uur)
  );

  /* ───── Styles ───── */
  const th: React.CSSProperties = { padding: '0.4rem 0.3rem', fontWeight: 700, fontSize: '0.85rem', borderBottom: '2px solid #d1d5db', textAlign: 'center', background: '#f9fafb' };
  const td: React.CSSProperties = { padding: 0, borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', verticalAlign: 'top' };
  const navBtn: React.CSSProperties = { padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer', background: 'white', fontWeight: 600, fontSize: '0.82rem' };

  /* ═══════════════════════════════════════════════════════ */
  /* ───── RENDER ───── */
  /* ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f5f5f5' }}>

      {/* ═══ TOP BAR: View toggle + week navigation ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0.4rem 1rem', background: 'white',
        borderBottom: '1px solid #e0e0e0', gap: '0.6rem', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* View toggle */}
        <div style={{ display: 'flex', background: '#e8f5e9', borderRadius: 6, overflow: 'hidden' }}>
          {(['planner', 'rooster'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.35rem 0.8rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
              background: view === v ? '#1a7a2e' : 'transparent', color: view === v ? 'white' : '#1a7a2e',
            }}>{{ planner: 'Planner', rooster: 'Rooster' }[v]}</button>
          ))}
        </div>

        {/* Klassen legenda */}
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          {klassen.map((k, i) => (
            <span key={k.id} style={{
              padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
              background: klasKleuren[i % klasKleuren.length] + '15', color: klasKleuren[i % klasKleuren.length],
              border: `1px solid ${klasKleuren[i % klasKleuren.length]}25`,
            }}>{k.naam}</span>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Week navigation */}
        {view === 'planner' && (
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            {saving && <span style={{ fontSize: '0.7rem', color: '#1a7a2e', fontWeight: 600 }}>💾 Opslaan...</span>}
            <button onClick={() => changeWeek(-1)} style={navBtn}>◀</button>
            <span style={{ fontWeight: 700, color: '#1a7a2e', minWidth: 65, textAlign: 'center', fontSize: '0.9rem' }}>
              Wk {getWeekNumber(weekStart)}
            </span>
            <button onClick={() => changeWeek(1)} style={navBtn}>▶</button>
            <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])}
              style={{ ...navBtn, background: '#1a7a2e', color: 'white', border: 'none' }}>Vandaag</button>

            <div style={{ width: 1, height: 20, background: '#e0e0e0', margin: '0 0.3rem' }} />

            <button onClick={() => setShowToetsForm(!showToetsForm)}
              style={{ ...navBtn, background: showToetsForm ? '#D97706' : 'white', color: showToetsForm ? 'white' : '#D97706', borderColor: '#D97706' }}>
              📝 Toets
            </button>
          </div>
        )}

        {view === 'rooster' && (
          <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
            Stel je weekrooster in. Schakel daarna naar <strong>Planner</strong>.
          </span>
        )}
      </div>

      {/* ═══ SHARED FORMATTING TOOLBAR (only in planner view) ═══ */}
      {view === 'planner' && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.3rem 0.8rem',
          background: '#fafafa', borderBottom: '1px solid #e0e0e0', alignItems: 'center', flexShrink: 0,
        }}>
          {/* Bold / Italic / Underline / Strike */}
          <TBtn active={activeEditor?.isActive('bold') || false} onClick={() => activeEditor?.chain().focus().toggleBold().run()} title="Dikgedrukt"><strong>B</strong></TBtn>
          <TBtn active={activeEditor?.isActive('italic') || false} onClick={() => activeEditor?.chain().focus().toggleItalic().run()} title="Schuin"><em>I</em></TBtn>
          <TBtn active={activeEditor?.isActive('underline') || false} onClick={() => activeEditor?.chain().focus().toggleUnderline().run()} title="Onderstreept"><span style={{ textDecoration: 'underline' }}>U</span></TBtn>
          <TBtn active={activeEditor?.isActive('strike') || false} onClick={() => activeEditor?.chain().focus().toggleStrike().run()} title="Doorgestreept"><span style={{ textDecoration: 'line-through' }}>S</span></TBtn>

          <Sep />

          {/* Lists */}
          <TBtn active={activeEditor?.isActive('bulletList') || false} onClick={() => activeEditor?.chain().focus().toggleBulletList().run()} title="Opsomming">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="2" cy="4" r="1.5"/><rect x="5" y="3" width="10" height="2" rx="0.5"/><circle cx="2" cy="8" r="1.5"/><rect x="5" y="7" width="10" height="2" rx="0.5"/><circle cx="2" cy="12" r="1.5"/><rect x="5" y="11" width="10" height="2" rx="0.5"/></svg>
          </TBtn>
          <TBtn active={activeEditor?.isActive('orderedList') || false} onClick={() => activeEditor?.chain().focus().toggleOrderedList().run()} title="Genummerd">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><text x="0" y="5.5" fontSize="5" fontWeight="700">1.</text><rect x="5" y="3" width="10" height="2" rx="0.5"/><text x="0" y="9.5" fontSize="5" fontWeight="700">2.</text><rect x="5" y="7" width="10" height="2" rx="0.5"/><text x="0" y="13.5" fontSize="5" fontWeight="700">3.</text><rect x="5" y="11" width="10" height="2" rx="0.5"/></svg>
          </TBtn>

          <Sep />

          {/* Text align */}
          <TBtn active={activeEditor?.isActive({ textAlign: 'left' }) || false} onClick={() => activeEditor?.chain().focus().setTextAlign('left').run()} title="Links">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5"/><rect x="1" y="6" width="9" height="2" rx="0.5"/><rect x="1" y="10" width="14" height="2" rx="0.5"/></svg>
          </TBtn>
          <TBtn active={activeEditor?.isActive({ textAlign: 'center' }) || false} onClick={() => activeEditor?.chain().focus().setTextAlign('center').run()} title="Centreren">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5"/><rect x="3.5" y="6" width="9" height="2" rx="0.5"/><rect x="1" y="10" width="14" height="2" rx="0.5"/></svg>
          </TBtn>

          <Sep />

          {/* Font size */}
          <select
            onChange={e => {
              const size = e.target.value;
              if (size && activeEditor) activeEditor.chain().focus().setMark('textStyle', { fontSize: size }).run();
            }}
            defaultValue=""
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 4px', fontSize: '0.72rem', background: 'white', cursor: 'pointer' }}
          >
            <option value="" disabled>Grootte</option>
            {FONTS.map(s => <option key={s} value={s}>{parseInt(s)}pt</option>)}
          </select>

          <Sep />

          {/* Colors */}
          <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginRight: 2 }}>A</span>
            {COLORS.map(c => (
              <button key={c} onClick={() => activeEditor?.chain().focus().setColor(c).run()} title={`Kleur`}
                style={{ width: 16, height: 16, borderRadius: 3, border: '1px solid #d1d5db', background: c, cursor: 'pointer', padding: 0 }} />
            ))}
          </div>

          <Sep />

          {/* Highlight */}
          <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginRight: 2 }}>🖍</span>
            {HIGHLIGHTS.map(c => (
              <button key={c} onClick={() => { if (c === 'transparent') activeEditor?.chain().focus().unsetHighlight().run(); else activeEditor?.chain().focus().setHighlight({ color: c }).run(); }}
                style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${c === 'transparent' ? '#d1d5db' : c}`, background: c === 'transparent' ? 'white' : c, cursor: 'pointer', padding: 0, position: 'relative' }}>
                {c === 'transparent' && <span style={{ position: 'absolute', top: -1, left: 3, fontSize: '0.6rem', color: '#DC2626' }}>✕</span>}
              </button>
            ))}
          </div>

          {!activeEditor && (
            <span style={{ fontSize: '0.7rem', color: '#b0b0b0', marginLeft: '0.5rem' }}>Klik in een cel om te bewerken</span>
          )}
        </div>
      )}

      {/* ═══ TOETS FORM (inline bar) ═══ */}
      {view === 'planner' && showToetsForm && (
        <div style={{
          display: 'flex', gap: '0.4rem', padding: '0.4rem 0.8rem', background: '#FEF3C7',
          borderBottom: '1px solid #F59E0B', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#92400E' }}>📝 Toets toevoegen:</span>
          <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.2rem 0.3rem', fontSize: '0.78rem', fontWeight: 600, color: toetsKleuren[newToets.type] }}>
            {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}
          </select>
          <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })}
            placeholder="Naam toets..." style={{ flex: '1 1 120px', minWidth: 100, border: '1px solid #d1d5db', borderRadius: 4, padding: '0.2rem 0.4rem', fontSize: '0.78rem' }} />
          <select value={newToets.klas_id || ''} onChange={e => setNewToets({ ...newToets, klas_id: Number(e.target.value) })}
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.2rem 0.3rem', fontSize: '0.78rem' }}>
            <option value="">Klas...</option>
            {klassen.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          <input type="date" value={newToets.datum} onChange={e => setNewToets({ ...newToets, datum: e.target.value })}
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.2rem 0.3rem', fontSize: '0.78rem' }} />
          <button onClick={async () => {
            if (!newToets.naam.trim() || !newToets.klas_id || !newToets.datum) return;
            await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ klas_id: newToets.klas_id, naam: newToets.naam, type: newToets.type, datum: newToets.datum, kleur: toetsKleuren[newToets.type] || '#6B7280' }) });
            setNewToets({ naam: '', type: 'SO', klas_id: 0, datum: '' }); fetchToetsen();
          }} style={{ background: '#D97706', color: 'white', border: 'none', borderRadius: 4, padding: '0.25rem 0.6rem', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            Toevoegen
          </button>
          <button onClick={() => setShowToetsForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#92400E' }}>✕</button>
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      <div style={{ flex: 1, overflow: 'auto', padding: view === 'rooster' ? '1rem' : 0 }}>

        {/* ═══ ROOSTER VIEW ═══ */}
        {view === 'rooster' && (
          <div style={{ maxWidth: 1200, margin: '0 auto', borderRadius: 12, border: '1px solid #d4d4d4', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 42 }}>Uur</th>
                  {dagNamen.map(n => <th key={n} style={th}>{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(uur => (
                  <tr key={uur}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.85rem', padding: '0.3rem' }}>{uur}</td>
                    {[1, 2, 3, 4, 5].map(dag => {
                      const slot = getSlot(dag, uur);
                      const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                      const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                      const isSecond = isBlokuurSecond(dag, uur);
                      const canBlok = canBeBlokuur(dag, uur);
                      const isBlok = isBlokuurStart(dag, uur);
                      if (isSecond) return null;
                      return (
                        <td key={`${dag}-${uur}`} rowSpan={isBlok ? 2 : 1}
                          style={{ ...td, borderLeft: slot ? `3px solid ${kleur}` : undefined, background: slot ? kleur + '06' : '#fcfcfc', padding: '0.3rem 0.4rem' }}>
                          <select value={slot?.klas_id || ''} onChange={e => setRoosterKlas(dag, uur, e.target.value ? Number(e.target.value) : null)}
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', color: kleur || '#c4c4c4', outline: 'none' }}>
                            <option value="" style={{ color: '#c4c4c4' }}>— kies klas —</option>
                            {klassen.map((k, i) => <option key={k.id} value={k.id} style={{ color: klasKleuren[i % klasKleuren.length] }}>{k.naam} ({k.lokaal})</option>)}
                          </select>
                          {slot && klas && <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: 2 }}>{klas.vak} - {klas.lokaal}</div>}
                          {canBlok && (
                            <button onClick={() => toggleBlokuur(dag, uur)} style={{
                              marginTop: 3, fontSize: '0.62rem', padding: '1px 5px', borderRadius: 3,
                              border: `1px solid ${isBlok ? kleur : '#d1d5db'}`, background: isBlok ? kleur + '20' : '#f9fafb',
                              color: isBlok ? kleur : '#9CA3AF', cursor: 'pointer', fontWeight: 600,
                            }}>{isBlok ? '✓ Blokuur' : 'Maak blokuur'}</button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══ PLANNER VIEW (document-style) ═══ */}
        {view === 'planner' && (
          <div style={{ minHeight: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: 'white' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36, position: 'sticky', top: 0, zIndex: 2, borderRight: '1px solid #d1d5db' }}></th>
                  {days.map((d, idx) => {
                    const vak = isInVakantie(d, vakanties);
                    return (
                      <th key={d} style={{
                        ...th, position: 'sticky', top: 0, zIndex: 2,
                        background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f9fafb',
                        color: d === today ? '#1a7a2e' : vak ? '#b91c1c' : '#374151',
                        borderRight: idx < 4 ? '1px solid #d1d5db' : 'none',
                      }}>
                        <div style={{ fontSize: '0.85rem' }}>{dagNamen[idx]}</div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(d)}</div>
                        {vak && <div style={{ fontSize: '0.6rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {allUren.map(uur => {
                  // Check if this uur is only a blokuur-second everywhere
                  const isOnlySecond = [1,2,3,4,5].every(dag => {
                    const slot = getSlot(dag, uur);
                    if (!slot) return true;
                    return isBlokuurSecond(dag, uur);
                  });
                  if (isOnlySecond) return null;

                  return (
                    <tr key={uur}>
                      <td style={{
                        ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF',
                        background: '#fafafa', fontSize: '0.82rem', padding: '0.3rem',
                        borderRight: '1px solid #d1d5db',
                      }}>{uur}</td>
                      {days.map((d, idx) => {
                        const dag = idx + 1;
                        const slot = getSlot(dag, uur);
                        const vakantie = isInVakantie(d, vakanties);
                        const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                        const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                        const isSecond = isBlokuurSecond(dag, uur);
                        const isBlok = isBlokuurStart(dag, uur);
                        const cellToetsen = slot ? getToetsenForDateKlas(d, slot.klas_id) : [];

                        if (isSecond) return null;

                        if (vakantie) {
                          return (
                            <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{
                              ...td, background: '#fef2f2', textAlign: 'center',
                              borderRight: idx < 4 ? '1px solid #d1d5db' : 'none',
                              padding: '0.3rem',
                            }}>
                              {uur === allUren[0] && <span style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 600 }}>{vakantie.naam}</span>}
                            </td>
                          );
                        }

                        if (!slot) {
                          return <td key={`${d}-${uur}`} style={{
                            ...td, background: '#fafafa',
                            borderRight: idx < 4 ? '1px solid #d1d5db' : 'none',
                          }}></td>;
                        }

                        const cellKey = `${slot.klas_id}-${d}-${uur}`;
                        const les = getCellLes(slot.klas_id, d, uur);
                        const jpSuggestion = getJpSuggestion(slot.klas_id, d);

                        return (
                          <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{
                            ...td, borderLeft: `3px solid ${kleur}`,
                            background: d === today ? '#f7fdf9' : 'white',
                            borderRight: idx < 4 ? '1px solid #d1d5db' : 'none',
                            padding: 0,
                          }}>
                            {/* Cell header: klas naam + toetsen */}
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: '0.3rem',
                              padding: '3px 6px', background: kleur + '08', borderBottom: `1px solid ${kleur}15`,
                              flexWrap: 'wrap',
                            }}>
                              <span style={{
                                fontWeight: 700, fontSize: '0.68rem', color: 'white',
                                background: kleur, padding: '0 0.35rem', borderRadius: 3,
                              }}>{klas?.naam}</span>
                              <span style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>{klas?.lokaal}</span>
                              {isBlok && <span style={{ fontSize: '0.58rem', color: kleur, fontWeight: 600 }}>blok</span>}
                              {cellToetsen.map(t => (
                                <span key={t.id} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 2,
                                  background: (toetsKleuren[t.type] || '#6B7280') + '15',
                                  color: toetsKleuren[t.type] || '#6B7280',
                                  padding: '0 3px', borderRadius: 3, fontSize: '0.58rem', fontWeight: 700,
                                }}>
                                  {t.type}: {t.naam.length > 10 ? t.naam.slice(0, 10) + '..' : t.naam}
                                  <button onClick={() => deleteToets(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.5rem', padding: 0 }}>✕</button>
                                </span>
                              ))}
                            </div>

                            {/* Jaarplanner suggestie */}
                            {jpSuggestion && !les.programma && (
                              <div
                                onClick={() => {
                                  updateCell(cellKey, les, 'programma', `<p>${jpSuggestion}</p>`);
                                }}
                                style={{
                                  padding: '2px 6px', fontSize: '0.62rem', color: '#1a7a2e', background: '#f0fdf4',
                                  borderBottom: '1px dashed #bbf7d0', cursor: 'pointer',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}
                                title="Klik om jaarplanner suggestie over te nemen"
                              >
                                📅 {jpSuggestion.slice(0, 50)}{jpSuggestion.length > 50 ? '...' : ''}
                              </div>
                            )}

                            {/* Inline editor */}
                            <InlineEditor
                              content={les.programma || ''}
                              onChange={(val) => updateCell(cellKey, les, 'programma', val)}
                              onFocus={(editor) => setActiveEditor(editor)}
                              placeholder="Plan les..."
                              borderColor={kleur}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Toolbar button ───── */
function TBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
      background: active ? '#1a7a2e20' : 'transparent',
      color: active ? '#1a7a2e' : '#374151',
      fontWeight: active ? 700 : 400,
    }}>{children}</button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />;
}
