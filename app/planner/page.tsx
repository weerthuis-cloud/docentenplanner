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
const dagNamenKort = ['Ma', 'Di', 'Wo', 'Do', 'Vr'];
const klasKleuren = ['#1a7a2e', '#2563EB', '#9333EA', '#DC2626', '#D97706', '#0891B2', '#BE185D', '#4338CA'];
const toetsKleuren: Record<string, string> = { PW: '#DC2626', SO: '#D97706', PO: '#7C3AED', MO: '#059669', SE: '#2563EB', overig: '#6B7280' };
const toetsLabels: Record<string, string> = { PW: 'Proefwerk', SO: 'Schriftelijke overhoring', PO: 'Praktische opdracht', MO: 'Mondeling', SE: 'Schoolexamen', overig: 'Overig' };

const FONTS = ['14px', '16px', '18px', '20px', '24px'];
const COLORS = ['#000000', '#1a7a2e', '#2563EB', '#DC2626', '#D97706', '#7C3AED', '#6B7280'];
const HIGHLIGHTS = ['transparent', '#FEF08A', '#BBF7D0', '#BFDBFE', '#FECACA', '#FDE68A'];

function getMonday(d: Date): Date {
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
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

  const [view, setView] = useState<'rooster' | 'week' | 'dag' | 'klas' | 'jaarlaag'>('week');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedKlasId, setSelectedKlasId] = useState<number | null>(null);
  const [selectedJaarlaag, setSelectedJaarlaag] = useState('');
  const [klasWeekStart, setKlasWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [jaarlaagWeekStart, setJaarlaagWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO', klas_id: 0, datum: '' });
  const [showToetsForm, setShowToetsForm] = useState(false);

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

  const fetchAllRooster = useCallback(() => { fetch('/api/roosters').then(r => r.json()).then(setAllRooster); }, []);

  // Compute the widest date range we need for any view
  const fetchStart = (() => {
    if (view === 'klas') return klasWeekStart;
    if (view === 'jaarlaag') return jaarlaagWeekStart;
    if (view === 'dag') { const m = getMonday(new Date(selectedDate + 'T12:00:00')); return m.toISOString().split('T')[0]; }
    return weekStart;
  })();
  const fetchEnd = (() => {
    if (view === 'klas' || view === 'jaarlaag') {
      const d = new Date(fetchStart + 'T12:00:00'); d.setDate(d.getDate() + 13); return d.toISOString().split('T')[0];
    }
    return days[4];
  })();

  const fetchLessen = useCallback(() => {
    if (klassen.length === 0) return;
    Promise.all(klassen.map(k =>
      fetch(`/api/lessen?klas_id=${k.id}&week_start=${fetchStart}&week_end=${fetchEnd}`)
        .then(r => r.json()).then((d: Les[] | Les | null) => Array.isArray(d) ? d : d ? [d] : [])
    )).then(r => { setLessen(r.flat()); setEditState({}); });
  }, [klassen, fetchStart, fetchEnd]);

  const fetchToetsen = useCallback(() => {
    if (klassen.length === 0) return;
    Promise.all(klassen.map(k => fetch(`/api/toetsen?klas_id=${k.id}`).then(r => r.json()))).then(r => setToetsen(r.flat()));
  }, [klassen]);

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { fetchLessen(); }, [fetchLessen]);
  useEffect(() => { fetchToetsen(); }, [fetchToetsen]);
  useEffect(() => { if (klassen.length > 0 && !selectedKlasId) setSelectedKlasId(klassen[0].id); }, [klassen, selectedKlasId]);
  useEffect(() => { if (klassen.length > 0 && !selectedJaarlaag) setSelectedJaarlaag([...new Set(klassen.map(k => k.jaarlaag))][0] || ''); }, [klassen, selectedJaarlaag]);

  /* ───── Helpers ───── */
  const getSlot = (dag: number, uur: number): RoosterSlot | undefined => allRooster.find(r => r.dag === dag && r.uur === uur);
  const getLes = (klas_id: number, datum: string, uur: number): Les | undefined => lessen.find(l => l.klas_id === klas_id && l.datum === datum && l.uur === uur);
  const getToetsenForDateKlas = (datum: string, klas_id: number): Toets[] => toetsen.filter(t => t.datum === datum && t.klas_id === klas_id);
  const isBlokuurStart = (dag: number, uur: number): boolean => { const s = getSlot(dag, uur); const n = getSlot(dag, uur + 1); return !!(s && n && s.klas_id === n.klas_id && s.is_blokuur); };
  const isBlokuurSecond = (dag: number, uur: number): boolean => { const s = getSlot(dag, uur); const p = getSlot(dag, uur - 1); return !!(s && p && s.klas_id === p.klas_id && p.is_blokuur); };
  const canBeBlokuur = (dag: number, uur: number): boolean => { const s = getSlot(dag, uur); const n = getSlot(dag, uur + 1); return !!(s && n && s.klas_id === n.klas_id); };

  /* ───── Rooster actions ───── */
  async function setRoosterKlas(dag: number, uur: number, klasId: number | null) {
    const existing = getSlot(dag, uur);
    if (existing?.id) await fetch(`/api/roosters?id=${existing.id}`, { method: 'DELETE' });
    if (klasId) {
      const klas = klassen.find(k => k.id === klasId);
      await fetch('/api/roosters', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klas_id: klasId, dag, uur, vak: klas?.vak || '', lokaal: klas?.lokaal || '', is_blokuur: false }) });
    }
    fetchAllRooster();
  }
  async function toggleBlokuur(dag: number, uur: number) {
    const slot = getSlot(dag, uur); const next = getSlot(dag, uur + 1);
    if (!slot || !next || slot.klas_id !== next.klas_id) return;
    const v = !slot.is_blokuur;
    await fetch('/api/roosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...slot, is_blokuur: v }) });
    await fetch('/api/roosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...next, is_blokuur: v }) });
    fetchAllRooster();
  }

  /* ───── Cell helpers ───── */
  function getCellLes(klas_id: number, datum: string, uur: number): Les {
    const key = `${klas_id}-${datum}-${uur}`;
    return editState[key] || getLes(klas_id, datum, uur) || emptyLes(klas_id, datum, uur);
  }

  function updateCell(key: string, les: Les, field: string, value: string) {
    const updated = { ...les, [field]: value };
    setEditState(prev => ({ ...prev, [key]: updated }));
    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
    saveTimerRef.current[key] = setTimeout(() => { saveLes(updated); }, 1500);
  }

  async function saveLes(les: Les) {
    setSaving(true);
    await fetch('/api/lessen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(les) });
    setSaving(false);
  }

  async function deleteToets(id: number) { await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' }); fetchToetsen(); }

  function changeWeek(delta: number) { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + delta * 7); setWeekStart(d.toISOString().split('T')[0]); }

  function getJpSuggestion(klas_id: number, datum: string): string | null {
    const klas = klassen.find(k => k.id === klas_id); if (!klas) return null;
    const jp = jaarplanners.find(j => j.vak === klas.vak && j.jaarlaag === klas.jaarlaag);
    if (!jp?.data) return null;
    const week = getWeekNumber(datum);
    const rows = jp.data.filter(r => r.week === week);
    if (rows.length === 0) return null;
    const parts = rows.map(r => { let t = ''; if (r.planning) t += stripHtml(r.planning); if (r.toetsen) t += (t ? ' · ' : '') + '📝 ' + stripHtml(r.toetsen); return t; }).filter(Boolean);
    return parts.length > 0 ? parts.join(' | ') : null;
  }

  /* ───── Reusable cell renderer ───── */
  function renderCell(slot: RoosterSlot, datum: string, isBlok: boolean) {
    const klas = klassen.find(k => k.id === slot.klas_id);
    const kleur = klasKleurMap[slot.klas_id] || '#6B7280';
    const cellKey = `${slot.klas_id}-${datum}-${slot.uur}`;
    const les = getCellLes(slot.klas_id, datum, slot.uur);
    const cellToetsen = getToetsenForDateKlas(datum, slot.klas_id);
    const jpSuggestion = getJpSuggestion(slot.klas_id, datum);

    return (
      <div key={cellKey} style={{ borderLeft: `3px solid ${kleur}`, background: datum === today ? '#f7fdf9' : 'white', borderBottom: '1px solid #e5e7eb' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '3px 6px', background: kleur + '08', borderBottom: `1px solid ${kleur}15`, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.68rem', color: 'white', background: kleur, padding: '0 0.35rem', borderRadius: 3 }}>{klas?.naam}</span>
          <span style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>{klas?.lokaal}</span>
          {isBlok && <span style={{ fontSize: '0.58rem', color: kleur, fontWeight: 600 }}>blok</span>}
          {cellToetsen.map(t => (
            <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280', padding: '0 3px', borderRadius: 3, fontSize: '0.58rem', fontWeight: 700 }}>
              {t.type}: {t.naam.length > 10 ? t.naam.slice(0, 10) + '..' : t.naam}
              <button onClick={() => deleteToets(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.5rem', padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
        {/* JP suggestie */}
        {jpSuggestion && !les.programma && (
          <div onClick={() => updateCell(cellKey, les, 'programma', `<p>${jpSuggestion}</p>`)}
            style={{ padding: '2px 6px', fontSize: '0.62rem', color: '#1a7a2e', background: '#f0fdf4', borderBottom: '1px dashed #bbf7d0', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title="Klik om jaarplanner suggestie over te nemen">
            📅 {jpSuggestion.slice(0, 60)}{jpSuggestion.length > 60 ? '...' : ''}
          </div>
        )}
        {/* Editor */}
        <InlineEditor content={les.programma || ''} onChange={(val) => updateCell(cellKey, les, 'programma', val)}
          onFocus={(editor) => setActiveEditor(editor)} placeholder="Plan les..." borderColor={kleur} />
      </div>
    );
  }

  /* ───── Styles ───── */
  const th: React.CSSProperties = { padding: '0.4rem 0.3rem', fontWeight: 700, fontSize: '0.85rem', borderBottom: '2px solid #d1d5db', textAlign: 'center', background: '#f9fafb' };
  const td: React.CSSProperties = { padding: 0, borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', verticalAlign: 'top' };
  const navBtn: React.CSSProperties = { padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer', background: 'white', fontWeight: 600, fontSize: '0.82rem' };

  /* ═══ Two-week data for klas/jaarlaag views ═══ */
  function getTwoWeeks(ws: string) {
    const w1Days = getDaysOfWeek(ws);
    const w2Start = new Date(ws + 'T12:00:00'); w2Start.setDate(w2Start.getDate() + 7);
    const w2Days = getDaysOfWeek(w2Start.toISOString().split('T')[0]);
    return [
      { weekNum: getWeekNumber(ws), days: w1Days, startDate: ws },
      { weekNum: getWeekNumber(w2Days[0]), days: w2Days, startDate: w2Start.toISOString().split('T')[0] },
    ];
  }

  /* ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f5f5f5' }}>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.8rem', background: 'white', borderBottom: '1px solid #e0e0e0', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#e8f5e9', borderRadius: 6, overflow: 'hidden' }}>
          {(['week', 'dag', 'klas', 'jaarlaag', 'rooster'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.35rem 0.7rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
              background: view === v ? '#1a7a2e' : 'transparent', color: view === v ? 'white' : '#1a7a2e',
            }}>{{ week: 'Week', dag: 'Dag', klas: 'Klas', jaarlaag: 'Jaarlaag', rooster: 'Rooster' }[v]}</button>
          ))}
        </div>

        {klassen.map((k, i) => (
          <span key={k.id} style={{ padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700,
            background: klasKleuren[i % klasKleuren.length] + '15', color: klasKleuren[i % klasKleuren.length] }}>{k.naam}</span>
        ))}

        <div style={{ flex: 1 }} />

        {saving && <span style={{ fontSize: '0.7rem', color: '#1a7a2e', fontWeight: 600 }}>💾 Opslaan...</span>}

        {/* Week nav */}
        {view === 'week' && (<>
          <button onClick={() => changeWeek(-1)} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#1a7a2e', minWidth: 55, textAlign: 'center', fontSize: '0.88rem' }}>Wk {getWeekNumber(weekStart)}</span>
          <button onClick={() => changeWeek(1)} style={navBtn}>▶</button>
          <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#1a7a2e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Dag nav */}
        {view === 'dag' && (<>
          <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '0.88rem' }}>
            {dagNamen[new Date(selectedDate + 'T12:00:00').getDay() - 1] || 'Weekend'} {formatDate(selectedDate)}
          </span>
          <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{ ...navBtn, background: '#1a7a2e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Klas nav */}
        {view === 'klas' && (<>
          <select value={selectedKlasId || ''} onChange={e => setSelectedKlasId(Number(e.target.value))}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
            {klassen.map((k, i) => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '0.85rem' }}>Wk {getWeekNumber(klasWeekStart)}–{getWeekNumber(klasWeekStart) + 1}</span>
          <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setKlasWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#1a7a2e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Jaarlaag nav */}
        {view === 'jaarlaag' && (<>
          <select value={selectedJaarlaag} onChange={e => setSelectedJaarlaag(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
            {[...new Set(klassen.map(k => k.jaarlaag))].map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '0.85rem' }}>Wk {getWeekNumber(jaarlaagWeekStart)}–{getWeekNumber(jaarlaagWeekStart) + 1}</span>
          <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setJaarlaagWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#1a7a2e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {view !== 'rooster' && (
          <button onClick={() => setShowToetsForm(!showToetsForm)}
            style={{ ...navBtn, background: showToetsForm ? '#D97706' : 'white', color: showToetsForm ? 'white' : '#D97706', borderColor: '#D97706' }}>📝 Toets</button>
        )}
      </div>

      {/* ═══ SHARED TOOLBAR ═══ */}
      {view !== 'rooster' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.25rem 0.8rem', background: '#fafafa', borderBottom: '1px solid #e0e0e0', alignItems: 'center', flexShrink: 0 }}>
          <TBtn active={activeEditor?.isActive('bold') || false} onClick={() => activeEditor?.chain().focus().toggleBold().run()} title="Dikgedrukt"><strong>B</strong></TBtn>
          <TBtn active={activeEditor?.isActive('italic') || false} onClick={() => activeEditor?.chain().focus().toggleItalic().run()} title="Schuin"><em>I</em></TBtn>
          <TBtn active={activeEditor?.isActive('underline') || false} onClick={() => activeEditor?.chain().focus().toggleUnderline().run()} title="Onderstreept"><span style={{ textDecoration: 'underline' }}>U</span></TBtn>
          <TBtn active={activeEditor?.isActive('strike') || false} onClick={() => activeEditor?.chain().focus().toggleStrike().run()} title="Doorgestreept"><span style={{ textDecoration: 'line-through' }}>S</span></TBtn>
          <Sep />
          <TBtn active={activeEditor?.isActive('bulletList') || false} onClick={() => activeEditor?.chain().focus().toggleBulletList().run()} title="Opsomming">•≡</TBtn>
          <TBtn active={activeEditor?.isActive('orderedList') || false} onClick={() => activeEditor?.chain().focus().toggleOrderedList().run()} title="Genummerd">1.</TBtn>
          <Sep />
          <select onChange={e => { if (e.target.value && activeEditor) activeEditor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run(); }} defaultValue=""
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 4px', fontSize: '0.72rem', background: 'white', cursor: 'pointer' }}>
            <option value="" disabled>Grootte</option>
            {FONTS.map(s => <option key={s} value={s}>{parseInt(s)}pt</option>)}
          </select>
          <Sep />
          <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginRight: 2 }}>A</span>
            {COLORS.map(c => (
              <button key={c} onClick={() => activeEditor?.chain().focus().setColor(c).run()} style={{ width: 16, height: 16, borderRadius: 3, border: '1px solid #d1d5db', background: c, cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <Sep />
          <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginRight: 2 }}>🖍</span>
            {HIGHLIGHTS.map(c => (
              <button key={c} onClick={() => { if (c === 'transparent') activeEditor?.chain().focus().unsetHighlight().run(); else activeEditor?.chain().focus().setHighlight({ color: c }).run(); }}
                style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${c === 'transparent' ? '#d1d5db' : c}`, background: c === 'transparent' ? 'white' : c, cursor: 'pointer', padding: 0, position: 'relative' }}>
                {c === 'transparent' && <span style={{ position: 'absolute', top: -1, left: 3, fontSize: '0.6rem', color: '#DC2626' }}>✕</span>}
              </button>
            ))}
          </div>
          {!activeEditor && <span style={{ fontSize: '0.7rem', color: '#b0b0b0', marginLeft: '0.5rem' }}>Klik in een cel om te bewerken</span>}
        </div>
      )}

      {/* ═══ TOETS FORM ═══ */}
      {view !== 'rooster' && showToetsForm && (
        <div style={{ display: 'flex', gap: '0.4rem', padding: '0.35rem 0.8rem', background: '#FEF3C7', borderBottom: '1px solid #F59E0B', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#92400E' }}>📝</span>
          <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem', fontSize: '0.75rem', fontWeight: 600, color: toetsKleuren[newToets.type] }}>
            {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })} placeholder="Naam..."
            style={{ flex: '1 1 100px', minWidth: 80, border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem 0.3rem', fontSize: '0.75rem' }} />
          <select value={newToets.klas_id || ''} onChange={e => setNewToets({ ...newToets, klas_id: Number(e.target.value) })}
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem', fontSize: '0.75rem' }}>
            <option value="">Klas</option>
            {klassen.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          <input type="date" value={newToets.datum} onChange={e => setNewToets({ ...newToets, datum: e.target.value })}
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem', fontSize: '0.75rem' }} />
          <button onClick={async () => {
            if (!newToets.naam.trim() || !newToets.klas_id || !newToets.datum) return;
            await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ klas_id: newToets.klas_id, naam: newToets.naam, type: newToets.type, datum: newToets.datum, kleur: toetsKleuren[newToets.type] || '#6B7280' }) });
            setNewToets({ naam: '', type: 'SO', klas_id: 0, datum: '' }); fetchToetsen();
          }} style={{ background: '#D97706', color: 'white', border: 'none', borderRadius: 4, padding: '0.2rem 0.5rem', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>+</button>
          <button onClick={() => setShowToetsForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E' }}>✕</button>
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ═══ ROOSTER ═══ */}
        {view === 'rooster' && (
          <div style={{ padding: '1rem', maxWidth: 1200, margin: '0 auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderRadius: 12, overflow: 'hidden', border: '1px solid #d4d4d4' }}>
              <thead><tr>
                <th style={{ ...th, width: 42 }}>Uur</th>
                {dagNamen.map(n => <th key={n} style={th}>{n}</th>)}
              </tr></thead>
              <tbody>
                {[1,2,3,4,5,6,7,8,9].map(uur => (
                  <tr key={uur}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.85rem', padding: '0.3rem' }}>{uur}</td>
                    {[1,2,3,4,5].map(dag => {
                      const slot = getSlot(dag, uur); const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                      const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                      if (isBlokuurSecond(dag, uur)) return null;
                      const isBlok = isBlokuurStart(dag, uur);
                      return (
                        <td key={`${dag}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, borderLeft: slot ? `3px solid ${kleur}` : undefined, background: slot ? kleur + '06' : '#fcfcfc', padding: '0.3rem' }}>
                          <select value={slot?.klas_id || ''} onChange={e => setRoosterKlas(dag, uur, e.target.value ? Number(e.target.value) : null)}
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', color: kleur || '#c4c4c4' }}>
                            <option value="">—</option>
                            {klassen.map((k, i) => <option key={k.id} value={k.id} style={{ color: klasKleuren[i % klasKleuren.length] }}>{k.naam} ({k.lokaal})</option>)}
                          </select>
                          {slot && klas && <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: 2 }}>{klas.vak} - {klas.lokaal}</div>}
                          {canBeBlokuur(dag, uur) && (
                            <button onClick={() => toggleBlokuur(dag, uur)} style={{ marginTop: 3, fontSize: '0.62rem', padding: '1px 5px', borderRadius: 3,
                              border: `1px solid ${isBlok ? kleur : '#d1d5db'}`, background: isBlok ? kleur + '20' : '#f9fafb', color: isBlok ? kleur : '#9CA3AF', cursor: 'pointer', fontWeight: 600 }}>
                              {isBlok ? '✓ Blokuur' : 'Maak blokuur'}
                            </button>
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

        {/* ═══ WEEKPLANNER ═══ */}
        {view === 'week' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: 'white' }}>
            <thead><tr>
              <th style={{ ...th, width: 36, borderRight: '1px solid #d1d5db' }}></th>
              {days.map((d, idx) => {
                const vak = isInVakantie(d, vakanties);
                return (
                  <th key={d} style={{ ...th, background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f9fafb', color: d === today ? '#1a7a2e' : vak ? '#b91c1c' : '#374151', borderRight: idx < 4 ? '1px solid #d1d5db' : 'none', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <div style={{ fontSize: '0.82rem' }}>{dagNamen[idx]}</div>
                    <div style={{ fontSize: '0.66rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(d)}</div>
                    {vak && <div style={{ fontSize: '0.58rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
                  </th>
                );
              })}
            </tr></thead>
            <tbody>
              {[1,2,3,4,5,6,7,8,9].map(uur => {
                const anyBlokSecond = [1,2,3,4,5].some(dag => isBlokuurSecond(dag, uur));
                const allBlokSecond = [1,2,3,4,5].every(dag => isBlokuurSecond(dag, uur));
                return (
                  <tr key={uur}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.82rem', padding: '0.3rem', borderRight: '1px solid #d1d5db', verticalAlign: 'top', paddingTop: '0.5rem' }}>{allBlokSecond ? '' : uur}</td>
                    {days.map((d, idx) => {
                      const dag = idx + 1; const vakantie = isInVakantie(d, vakanties);
                      if (isBlokuurSecond(dag, uur)) return null;
                      const slot = getSlot(dag, uur);
                      const isBlok = isBlokuurStart(dag, uur);
                      const cellBorder = idx < 4 ? '1px solid #d1d5db' : 'none';
                      if (vakantie) return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, background: '#fef2f2', borderRight: cellBorder, padding: '0.3rem', verticalAlign: 'middle', textAlign: 'center' }}>{uur === 1 && <span style={{ fontSize: '0.65rem', color: '#f87171', fontWeight: 600 }}>{vakantie.naam}</span>}</td>;
                      if (!slot) return <td key={`${d}-${uur}`} style={{ ...td, background: '#e8e8e8', borderRight: cellBorder, verticalAlign: 'top' }}><div style={{ minHeight: 70 }} /></td>;
                      return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, padding: 0, borderRight: cellBorder, verticalAlign: 'top' }}>{renderCell(slot, d, isBlok)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ═══ DAGPLANNER ═══ */}
        {view === 'dag' && (() => {
          const dagIdx = new Date(selectedDate + 'T12:00:00').getDay();
          const dagNr = dagIdx >= 1 && dagIdx <= 5 ? dagIdx : 0;
          const vakantie = isInVakantie(selectedDate, vakanties);
          if (dagNr === 0) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', padding: '3rem' }}>Geen lesdag (weekend).</div>;
          if (vakantie) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', fontWeight: 600, padding: '3rem' }}>{vakantie.naam}</div>;
          const dagSlots = allRooster.filter(r => r.dag === dagNr).sort((a, b) => a.uur - b.uur).filter(s => !isBlokuurSecond(dagNr, s.uur));
          return (
            <div style={{ maxWidth: 700, margin: '0 auto', padding: '0.5rem 0.5rem' }}>
              {dagSlots.length === 0 && <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '2rem' }}>Geen lessen op deze dag.</div>}
              {dagSlots.map(slot => {
                const isBlok = isBlokuurStart(dagNr, slot.uur);
                return (
                  <div key={slot.uur} style={{ marginBottom: '0.5rem', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.5rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#9CA3AF', width: 28, textAlign: 'center' }}>{slot.uur}</span>
                      <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>uur {slot.uur}{isBlok ? '–' + (slot.uur + 1) : ''}</span>
                    </div>
                    {renderCell(slot, selectedDate, isBlok)}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ═══ KLASPLANNER (2 weken naast elkaar) ═══ */}
        {view === 'klas' && selectedKlasId && (() => {
          const klas = klassen.find(k => k.id === selectedKlasId);
          if (!klas) return null;
          const kleur = klasKleurMap[selectedKlasId] || '#6B7280';
          const weeks = getTwoWeeks(klasWeekStart);
          const klasSlots = allRooster.filter(r => r.klas_id === selectedKlasId);
          const slotsByDay: Record<number, number[]> = {};
          klasSlots.forEach(s => { if (!slotsByDay[s.dag]) slotsByDay[s.dag] = []; slotsByDay[s.dag].push(s.uur); });

          return (
            <div style={{ display: 'flex', gap: 0 }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ flex: 1, borderRight: wi === 0 ? '2px solid #d1d5db' : 'none' }}>
                  {/* Week header */}
                  <div style={{ padding: '0.4rem 0.6rem', background: week.startDate <= today && today <= week.days[4] ? '#1a7a2e' : '#374151', color: 'white', fontWeight: 700, fontSize: '0.9rem', textAlign: 'center' }}>
                    Week {week.weekNum} — {formatDate(week.days[0])} t/m {formatDate(week.days[4])}
                  </div>
                  {/* Days */}
                  {week.days.map((datum, di) => {
                    const dag = di + 1;
                    const uren = slotsByDay[dag];
                    if (!uren || uren.length === 0) return null;
                    const vakantie = isInVakantie(datum, vakanties);
                    return (
                      <div key={datum}>
                        <div style={{ padding: '0.25rem 0.6rem', background: datum === today ? '#dcfce7' : vakantie ? '#fef2f2' : '#f0f0f0', borderBottom: '1px solid #d1d5db', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.82rem', background: kleur, padding: '0 0.35rem', borderRadius: 3, color: 'white', width: 28, textAlign: 'center' }}>{dagNamenKort[di]}</span>
                          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{formatDate(datum)}</span>
                          {vakantie && <span style={{ fontSize: '0.65rem', color: '#DC2626', fontWeight: 600 }}>{vakantie.naam}</span>}
                        </div>
                        {!vakantie && uren.sort((a,b) => a - b).filter(u => !isBlokuurSecond(dag, u)).map(uur => {
                          const slot = getSlot(dag, uur);
                          if (!slot || slot.klas_id !== selectedKlasId) return null;
                          return <div key={uur}>{renderCell(slot, datum, isBlokuurStart(dag, uur))}</div>;
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}

        {/* ═══ JAARLAAGPLANNER (klassen als kolommen, 2 weken als rijen) ═══ */}
        {view === 'jaarlaag' && (() => {
          const jlKlassen = klassen.filter(k => k.jaarlaag === selectedJaarlaag);
          if (jlKlassen.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Geen klassen in deze jaarlaag.</div>;
          const weeks = getTwoWeeks(jaarlaagWeekStart);
          const colCount = jlKlassen.length;

          return (
            <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${colCount}, 1fr)`, border: '1px solid #d1d5db' }}>
              {/* ── Header row: empty corner + klas names ── */}
              <div style={{ background: '#1a7a2e', padding: '0.5rem', borderRight: '1px solid #15803d', borderBottom: '2px solid #15803d' }} />
              {jlKlassen.map((klas, ki) => {
                const kleur = klasKleurMap[klas.id] || '#6B7280';
                return (
                  <div key={klas.id} style={{ background: kleur, color: 'white', padding: '0.5rem 0.3rem', fontWeight: 700, fontSize: '0.9rem', textAlign: 'center', borderRight: ki < colCount - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none', borderBottom: '2px solid #15803d' }}>
                    {klas.naam}
                  </div>
                );
              })}

              {/* ── Week rows ── */}
              {weeks.map((week, wi) => {
                // Collect all lesson rows for this week: [{datum, dag, slots_per_klas}]
                const lesRows: Array<{ datum: string; dag: number; di: number; vakantie: Vakantie | null }> = [];
                week.days.forEach((datum, di) => {
                  const dag = di + 1;
                  const vakantie = isInVakantie(datum, vakanties);
                  const anyLes = jlKlassen.some(k => allRooster.some(r => r.dag === dag && r.klas_id === k.id));
                  if (anyLes) lesRows.push({ datum, dag, di, vakantie });
                });

                return [
                  /* Week header spanning full width */
                  <div key={`wh-${wi}`} style={{ gridColumn: `1 / -1`, padding: '0.35rem 0.6rem', background: week.startDate <= today && today <= week.days[4] ? '#1a7a2e' : '#374151', color: 'white', fontWeight: 700, fontSize: '0.82rem', textAlign: 'center' }}>
                    Week {week.weekNum} — {formatDate(week.days[0])} t/m {formatDate(week.days[4])}
                  </div>,
                  /* Lesson rows */
                  ...lesRows.map(({ datum, dag, di, vakantie }) => [
                    /* Day label cell */
                    <div key={`dl-${datum}`} style={{ padding: '0.3rem 0.4rem', background: datum === today ? '#dcfce7' : vakantie ? '#fef2f2' : '#f9fafb', borderRight: '1px solid #d1d5db', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: '0.72rem', color: datum === today ? '#1a7a2e' : '#374151' }}>
                      {dagNamenKort[di]}<br /><span style={{ fontWeight: 400, fontSize: '0.65rem', color: '#6B7280' }}>{formatDate(datum)}</span>
                      {vakantie && <div style={{ fontSize: '0.6rem', color: '#DC2626', marginTop: 2 }}>{vakantie.naam}</div>}
                    </div>,
                    /* One cell per klas */
                    ...jlKlassen.map((klas, ki) => {
                      if (vakantie) return <div key={`v-${datum}-${klas.id}`} style={{ background: '#fef2f2', borderRight: ki < colCount - 1 ? '1px solid #e5e7eb' : 'none', borderBottom: '1px solid #e5e7eb', padding: '0.3rem', fontSize: '0.65rem', color: '#DC2626' }}>{vakantie.naam}</div>;
                      const slots = allRooster.filter(r => r.dag === dag && r.klas_id === klas.id).sort((a, b) => a.uur - b.uur).filter(s => !isBlokuurSecond(dag, s.uur));
                      if (slots.length === 0) return <div key={`e-${datum}-${klas.id}`} style={{ background: '#f9fafb', borderRight: ki < colCount - 1 ? '1px solid #e5e7eb' : 'none', borderBottom: '1px solid #e5e7eb' }} />;
                      return (
                        <div key={`c-${datum}-${klas.id}`} style={{ borderRight: ki < colCount - 1 ? '1px solid #e5e7eb' : 'none', borderBottom: '1px solid #e5e7eb' }}>
                          {slots.map(slot => renderCell(slot, datum, isBlokuurStart(dag, slot.uur)))}
                        </div>
                      );
                    }),
                  ]).flat(),
                ].flat();
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
      background: active ? '#1a7a2e20' : 'transparent', color: active ? '#1a7a2e' : '#374151', fontWeight: active ? 700 : 400,
    }}>{children}</button>
  );
}
function Sep() { return <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />; }
