'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Editor } from '@tiptap/react';

const InlineEditor = dynamic(() => import('@/components/InlineEditor'), { ssr: false });

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface RoosterSlot { id?: number; klas_id: number; dag: number; uur: number; vak: string; lokaal: string; is_blokuur: boolean; periode_id?: number; }
interface Les { id?: number; klas_id: number; datum: string; uur: number | null; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; notities: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; kleur: string; les_id: number | null; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; }
interface Jaarplanner { id: number; vak: string; jaarlaag: string; schooljaar: string; naam: string; data: Array<{ week: number; les: number; planning: string; toetsen: string }>; created_at: string; }
interface RoosterPeriode { id: number; naam: string; start_datum: string; eind_datum: string; bron: string; created_at: string; }

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

const dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const dagNamenKort = ['Ma', 'Di', 'Wo', 'Do', 'Vr'];
const klasKleuren = ['#2d8a4e', '#4a80d4', '#8b5ec0', '#c95555', '#c4892e', '#2ba0b0', '#b04e7a', '#6060c0'];
const uurTijden: Record<number, string> = { 1: '09:00', 2: '09:40', 3: '10:20', 4: '11:00', 5: '12:20', 6: '13:00', 7: '13:40', 8: '14:40', 9: '15:20', 10: '16:00' };
const toetsKleuren: Record<string, string> = { PW: '#c95555', SO: '#c4892e', PO: '#8b5ec0', MO: '#2d8a4e', SE: '#4a80d4', overig: '#8b95a5' };
const toetsLabels: Record<string, string> = { PW: 'Proefwerk', SO: 'Schriftelijke overhoring', PO: 'Praktische opdracht', MO: 'Mondeling', SE: 'Schoolexamen', overig: 'Overig' };

const FONTS = ['14px', '16px', '18px', '20px', '24px'];
const COLORS = ['#000000', '#2d8a4e', '#2563EB', '#DC2626', '#D97706', '#7C3AED', '#6B7280'];
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

  const [view, setView] = useState<'overzicht' | 'week' | 'dag' | 'klas' | 'jaarlaag' | 'rooster'>('overzicht');
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
  const [selectedLesPanel, setSelectedLesPanel] = useState<{ klas_id: number; datum: string; uur: number | null } | null>(null);
  const [panelTab, setPanelTab] = useState<string>('programma');

  const [editState, setEditState] = useState<Record<string, Les>>({});
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Rooster periodes
  const [periodes, setPeriodes] = useState<RoosterPeriode[]>([]);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<number | null>(null);
  const [showPeriodeForm, setShowPeriodeForm] = useState(false);
  const [showZermeloForm, setShowZermeloForm] = useState(false);
  const [zermeloSchool, setZermeloSchool] = useState('');
  const [zermeloCode, setZermeloCode] = useState('');
  const [zermeloToken, setZermeloToken] = useState('');
  const [zermeloStatus, setZermeloStatus] = useState('');
  const [zermeloPreview, setZermeloPreview] = useState<Array<{ dag: number; uur: number; vak: string; lokaal: string; groep: string; groepen?: string[]; start_time: string; end_time: string }> | null>(null);
  const [zermeloStep, setZermeloStep] = useState<'auth' | 'fetch' | 'preview'>('auth');
  const [zermeloMapping, setZermeloMapping] = useState<Record<string, number | 'new'>>({});
  const [zermeloImportPeriodeId, setZermeloImportPeriodeId] = useState<number | 'new'>('new');
  const [zermeloWeekStart, setZermeloWeekStart] = useState('');
  const [showNewKlasForm, setShowNewKlasForm] = useState(false);

  const days = getDaysOfWeek(weekStart);
  const weekEnd = days[4];
  const today = new Date().toISOString().split('T')[0];

  const klasKleurMap: Record<number, string> = {};
  klassen.forEach((k, i) => { klasKleurMap[k.id] = klasKleuren[i % klasKleuren.length]; });

  /* ───── Fetching ───── */
  const fetchPeriodes = useCallback((forceSelectId?: number) => {
    fetch('/api/rooster-periodes').then(r => r.json()).then((data: RoosterPeriode[]) => {
      setPeriodes(data);
      if (forceSelectId) {
        setSelectedPeriodeId(forceSelectId);
      } else if (data.length > 0 && !selectedPeriodeId) {
        const today = new Date().toISOString().split('T')[0];
        // Zoek actieve periode, of de meest recente
        const actief = data.find(p => p.start_datum <= today && p.eind_datum >= today);
        if (actief) { setSelectedPeriodeId(actief.id); }
        else {
          // Neem de periode die het dichtst bij vandaag ligt
          const sorted = [...data].sort((a, b) => Math.abs(new Date(a.start_datum).getTime() - Date.now()) - Math.abs(new Date(b.start_datum).getTime() - Date.now()));
          setSelectedPeriodeId(sorted[0].id);
        }
      }
    });
  }, [selectedPeriodeId]);

  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen);
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
    fetch('/api/jaarplanners').then(r => r.json()).then(setJaarplanners);
    fetchPeriodes();
  }, []);

  const fetchAllRooster = useCallback(() => {
    const url = selectedPeriodeId ? `/api/roosters?periode_id=${selectedPeriodeId}` : '/api/roosters';
    fetch(url).then(r => r.json()).then(setAllRooster);
  }, [selectedPeriodeId]);

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
        body: JSON.stringify({ klas_id: klasId, dag, uur, vak: klas?.vak || '', lokaal: klas?.lokaal || '', is_blokuur: false, periode_id: selectedPeriodeId }) });
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

    /* Content indicators: welke extra velden zijn ingevuld? */
    const extraFields: Array<{ key: keyof Les; icon: string; label: string }> = [
      { key: 'startopdracht', icon: '🚀', label: 'Start' },
      { key: 'terugkijken', icon: '🔄', label: 'Terugkijken' },
      { key: 'leerdoelen', icon: '🎯', label: 'Doelen' },
      { key: 'huiswerk', icon: '📝', label: 'Huiswerk' },
      { key: 'niet_vergeten', icon: '⚡', label: 'Onthoud' },
      { key: 'notities', icon: '💬', label: 'Notities' },
    ];
    const filledExtras = extraFields.filter(f => { const v = les[f.key]; return typeof v === 'string' && stripHtml(v).length > 0; });

    return (
      <div key={cellKey} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: isBlok ? 160 : 80, borderLeft: `3px solid ${kleur}`, background: 'white', cursor: 'pointer', position: 'relative' }}
        onClick={(e) => { if ((e.target as HTMLElement).closest('button') === null && (e.target as HTMLElement).closest('[contenteditable]') === null) setSelectedLesPanel({ klas_id: slot.klas_id, datum, uur: slot.uur }); }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '3px 6px', background: kleur + '08', borderBottom: `1px solid ${kleur}15`, flexWrap: 'wrap', flexShrink: 0 }}>
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
          <div onClick={(e) => { e.stopPropagation(); updateCell(cellKey, les, 'programma', `<p>${jpSuggestion}</p>`); }}
            style={{ padding: '2px 6px', fontSize: '0.62rem', color: '#2d8a4e', background: '#f0fdf4', borderBottom: '1px dashed #bbf7d0', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}
            title="Klik om jaarplanner suggestie over te nemen">
            📅 {jpSuggestion.slice(0, 60)}{jpSuggestion.length > 60 ? '...' : ''}
          </div>
        )}
        {/* Editor - flex:1 vult rest van cel */}
        <InlineEditor content={les.programma || ''} onChange={(val) => updateCell(cellKey, les, 'programma', val)}
          onFocus={(editor) => setActiveEditor(editor)} placeholder="Plan les..." borderColor={kleur} grow />
        {/* Content indicators voor extra velden */}
        {filledExtras.length > 0 && (
          <div style={{ display: 'flex', gap: 2, padding: '2px 6px 3px', flexShrink: 0, flexWrap: 'wrap' }}>
            {filledExtras.map(f => (
              <span key={f.key} title={f.label} style={{ fontSize: '0.52rem', lineHeight: 1, opacity: 0.7 }}>{f.icon}</span>
            ))}
          </div>
        )}
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f7f8fa' }}>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.8rem', background: 'white', borderBottom: '1px solid #e0e0e0', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#eef4f0', borderRadius: 8, overflow: 'hidden' }}>
          {(['overzicht', 'week', 'dag', 'klas', 'jaarlaag', 'rooster'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.35rem 0.7rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
              background: view === v ? '#2d8a4e' : 'transparent', color: view === v ? 'white' : '#2d8a4e',
            }}>{{ overzicht: 'Overzicht', week: 'Week', dag: 'Dag', klas: 'Klas', jaarlaag: 'Jaarlaag', rooster: 'Rooster' }[v]}</button>
          ))}
        </div>

        {klassen.map((k, i) => (
          <span key={k.id} style={{ padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700,
            background: klasKleuren[i % klasKleuren.length] + '15', color: klasKleuren[i % klasKleuren.length] }}>{k.naam}</span>
        ))}

        <div style={{ flex: 1 }} />

        {saving && <span style={{ fontSize: '0.7rem', color: '#2d8a4e', fontWeight: 600 }}>💾 Opslaan...</span>}

        {/* Overzicht nav */}
        {view === 'overzicht' && (
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        )}

        {/* Week nav */}
        {view === 'week' && (<>
          <button onClick={() => changeWeek(-1)} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', minWidth: 55, textAlign: 'center', fontSize: '0.88rem' }}>Wk {getWeekNumber(weekStart)}</span>
          <button onClick={() => changeWeek(1)} style={navBtn}>▶</button>
          <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Dag nav */}
        {view === 'dag' && (<>
          <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', fontSize: '0.88rem' }}>
            {dagNamen[new Date(selectedDate + 'T12:00:00').getDay() - 1] || 'Weekend'} {formatDate(selectedDate)}
          </span>
          <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Klas nav */}
        {view === 'klas' && (<>
          <select value={selectedKlasId || ''} onChange={e => setSelectedKlasId(Number(e.target.value))}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
            {klassen.map((k, i) => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', fontSize: '0.85rem' }}>Wk {getWeekNumber(klasWeekStart)}–{getWeekNumber(klasWeekStart) + 1}</span>
          <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setKlasWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Jaarlaag nav */}
        {view === 'jaarlaag' && (<>
          <select value={selectedJaarlaag} onChange={e => setSelectedJaarlaag(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
            {[...new Set(klassen.map(k => k.jaarlaag))].map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', fontSize: '0.85rem' }}>Wk {getWeekNumber(jaarlaagWeekStart)}–{getWeekNumber(jaarlaagWeekStart) + 1}</span>
          <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setJaarlaagWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {view !== 'rooster' && (
          <button onClick={() => setShowToetsForm(!showToetsForm)}
            style={{ ...navBtn, background: showToetsForm ? '#D97706' : 'white', color: showToetsForm ? 'white' : '#D97706', borderColor: '#D97706' }}>📝 Toets</button>
        )}
      </div>

      {/* ═══ SHARED TOOLBAR ═══ */}
      {view !== 'rooster' && view !== 'overzicht' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.25rem 0.8rem', background: '#fafafa', borderBottom: '1px solid #e0e0e0', alignItems: 'center', flexShrink: 0 }}>
          <TBtn active={activeEditor?.isActive('bold') || false} onClick={() => activeEditor?.chain().focus().toggleBold().run()} title="Dikgedrukt"><strong>B</strong></TBtn>
          <TBtn active={activeEditor?.isActive('italic') || false} onClick={() => activeEditor?.chain().focus().toggleItalic().run()} title="Schuin"><em>I</em></TBtn>
          <TBtn active={activeEditor?.isActive('underline') || false} onClick={() => activeEditor?.chain().focus().toggleUnderline().run()} title="Onderstreept"><span style={{ textDecoration: 'underline' }}>U</span></TBtn>
          <TBtn active={activeEditor?.isActive('strike') || false} onClick={() => activeEditor?.chain().focus().toggleStrike().run()} title="Doorgestreept"><span style={{ textDecoration: 'line-through' }}>S</span></TBtn>
          <Sep />
          <TBtn active={activeEditor?.isActive('bulletList') || false} onClick={() => activeEditor?.chain().focus().toggleBulletList().run()} title="Opsomming met bolletjes">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="6" x2="21" y2="6"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="12" x2="21" y2="12"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="18" x2="21" y2="18"/></svg>
          </TBtn>
          <TBtn active={activeEditor?.isActive('orderedList') || false} onClick={() => activeEditor?.chain().focus().toggleOrderedList().run()} title="Genummerde lijst">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><line x1="9" y1="6" x2="21" y2="6"/><text x="2" y="15" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><line x1="9" y1="12" x2="21" y2="12"/><text x="2" y="21" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text><line x1="9" y1="18" x2="21" y2="18"/></svg>
          </TBtn>
          <Sep />
          <select onChange={e => { if (e.target.value && activeEditor) activeEditor.chain().focus().setFontSize(e.target.value).run(); }} defaultValue=""
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
      <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ═══ DASHBOARD ═══ */}
        {view === 'overzicht' && (() => {
          const today = new Date().toISOString().split('T')[0];
          const todayDag = new Date(today + 'T12:00:00').getDay();
          const todayDagNum = todayDag >= 1 && todayDag <= 5 ? todayDag : 0;
          const todayVakantie = isInVakantie(today, vakanties);

          // Vandaag section: lessenvan vandaag
          const todaySlots = todayDagNum > 0 && !todayVakantie ?
            allRooster.filter(r => r.dag === todayDagNum).sort((a, b) => a.uur - b.uur).filter(s => !isBlokuurSecond(todayDagNum, s.uur)) : [];

          // Lege lessen: deze week, geen programma
          const weekStart2 = getMonday(new Date()).toISOString().split('T')[0];
          const weekDays = getDaysOfWeek(weekStart2);
          const emptyLessons: Array<{ slot: RoosterSlot; datum: string; klas: Klas }> = [];
          weekDays.forEach(d => {
            const dag = new Date(d + 'T12:00:00').getDay();
            const dagNum = dag >= 1 && dag <= 5 ? dag : 0;
            if (dagNum > 0 && !isInVakantie(d, vakanties)) {
              allRooster.filter(r => r.dag === dagNum).forEach(slot => {
                const les = getLes(slot.klas_id, d, slot.uur);
                const klas = klassen.find(k => k.id === slot.klas_id);
                if (!les?.programma && klas && !isBlokuurSecond(dagNum, slot.uur)) {
                  emptyLessons.push({ slot, datum: d, klas });
                }
              });
            }
          });

          // Komende toetsen: volgende 14 dagen
          const upcomingToetsen = toetsen.filter(t => {
            const tDate = new Date(t.datum + 'T12:00:00');
            const todayDate = new Date(today + 'T12:00:00');
            const diffDays = Math.floor((tDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 14;
          }).sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime());

          return (
            <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Vandaag */}
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#2d8a4e', marginBottom: '0.75rem' }}>Vandaag ({dagNamen[todayDagNum - 1] || 'Weekend'})</h2>
                {todayVakantie ? (
                  <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '0.9rem', fontWeight: 600 }}>{todayVakantie.naam}</div>
                ) : todaySlots.length === 0 ? (
                  <div style={{ padding: '1rem', background: '#f3f4f6', borderRadius: 8, color: '#9CA3AF', fontSize: '0.9rem' }}>Geen lessen vandaag</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {todaySlots.map(slot => {
                      const les = getLes(slot.klas_id, today, slot.uur);
                      const klas = klassen.find(k => k.id === slot.klas_id);
                      const kleur = klasKleurMap[slot.klas_id] || '#6B7280';
                      const overzichtFields: Array<{ key: keyof Les; icon: string; label: string }> = [
                        { key: 'startopdracht', icon: '🚀', label: 'Start' },
                        { key: 'terugkijken', icon: '🔄', label: 'Terugkijken' },
                        { key: 'leerdoelen', icon: '🎯', label: 'Doelen' },
                        { key: 'huiswerk', icon: '📝', label: 'Huiswerk' },
                        { key: 'niet_vergeten', icon: '⚡', label: 'Onthoud' },
                        { key: 'notities', icon: '💬', label: 'Notities' },
                      ];
                      const filledFields = les ? overzichtFields.filter(f => { const v = les[f.key]; return typeof v === 'string' && stripHtml(v).length > 0; }) : [];
                      return (
                        <div key={slot.uur} onClick={() => setSelectedLesPanel({ klas_id: slot.klas_id, datum: today, uur: slot.uur })}
                          style={{ padding: '0.75rem 1rem', background: 'white', border: `1px solid ${kleur}30`, borderLeft: `3px solid ${kleur}`, borderRadius: 6, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.3rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: kleur, minWidth: 30 }}>Uur {slot.uur}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>{klas?.naam}</span>
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>({klas?.lokaal})</span>
                            {filledFields.length > 0 && (
                              <span style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                                {filledFields.map(f => <span key={f.key} title={f.label} style={{ fontSize: '0.6rem', opacity: 0.7 }}>{f.icon}</span>)}
                              </span>
                            )}
                          </div>
                          {les?.programma && <div style={{ fontSize: '0.82rem', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(les.programma).slice(0, 80)}</div>}
                          {!les?.programma && <div style={{ fontSize: '0.82rem', color: '#d1d5db', fontStyle: 'italic' }}>Niet gepland...</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lege lessen */}
              {emptyLessons.length > 0 && (
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#d97706', marginBottom: '0.75rem' }}>Lege lessen deze week</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {emptyLessons.slice(0, 10).map((item, idx) => {
                      const kleur = klasKleurMap[item.klas.id] || '#6B7280';
                      return (
                        <div key={idx} onClick={() => setSelectedLesPanel({ klas_id: item.slot.klas_id, datum: item.datum, uur: item.slot.uur })}
                          style={{ padding: '0.75rem 1rem', background: 'white', border: `1px solid ${kleur}30`, borderLeft: `3px solid ${kleur}`, borderRadius: 6, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.3rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', minWidth: 60 }}>{dagNamenKort[new Date(item.datum + 'T12:00:00').getDay() - 1]} {formatDate(item.datum)}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Uur {item.slot.uur}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: kleur }}>{item.klas.naam}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Komende toetsen */}
              {upcomingToetsen.length > 0 && (
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#c95555', marginBottom: '0.75rem' }}>Komende toetsen</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {upcomingToetsen.map(t => {
                      const klas = klassen.find(k => k.id === t.klas_id);
                      const kleur = klasKleurMap[t.klas_id] || '#6B7280';
                      const tKleur = toetsKleuren[t.type] || '#6B7280';
                      return (
                        <div key={t.id} style={{ padding: '0.75rem 1rem', background: 'white', border: `1px solid ${tKleur}30`, borderLeft: `3px solid ${tKleur}`, borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.3rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF', minWidth: 60 }}>{formatDate(t.datum)}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, background: tKleur + '20', color: tKleur, padding: '0 0.35rem', borderRadius: 3 }}>{t.type}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>{t.naam}</span>
                            <span style={{ fontSize: '0.8rem', color: kleur, marginLeft: 'auto' }}>{klas?.naam}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ ROOSTER ═══ */}
        {view === 'rooster' && (
          <div style={{ padding: '1rem', maxWidth: 1200, margin: '0 auto' }}>

            {/* Periode bar */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#374151' }}>Periode:</span>
              <select value={selectedPeriodeId || ''} onChange={e => setSelectedPeriodeId(Number(e.target.value))}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}>
                {periodes.map(p => (
                  <option key={p.id} value={p.id}>{p.naam} ({p.start_datum} t/m {p.eind_datum})</option>
                ))}
              </select>

              {/* Verplaats naar andere periode */}
              {selectedPeriodeId && periodes.length > 1 && (
                <select
                  value=""
                  onChange={async (e) => {
                    const naarId = Number(e.target.value);
                    if (!naarId) return;
                    const naarPeriode = periodes.find(p => p.id === naarId);
                    if (!confirm(`Rooster verplaatsen naar "${naarPeriode?.naam}"? Bestaande slots in die periode worden overschreven.`)) return;
                    await fetch('/api/rooster-periodes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'verplaatsen', van_periode_id: selectedPeriodeId, naar_periode_id: naarId }) });
                    setSelectedPeriodeId(naarId);
                    fetchPeriodes();
                    fetch(`/api/roosters?periode_id=${naarId}`).then(r => r.json()).then(setAllRooster);
                  }}
                  style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.78rem', color: '#6B7280' }}
                >
                  <option value="">Verplaats naar...</option>
                  {periodes.filter(p => p.id !== selectedPeriodeId).map(p => (
                    <option key={p.id} value={p.id}>{p.naam}</option>
                  ))}
                </select>
              )}

              {/* Verlengen */}
              {selectedPeriodeId && (
                <button onClick={async () => {
                  await fetch('/api/rooster-periodes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'verlengen', id: selectedPeriodeId, weken: 1 }) });
                  fetchPeriodes();
                }} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid #2d8a4e', background: '#f0fdf4', color: '#2d8a4e', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                  +1 week
                </button>
              )}

              {/* Dupliceren als nieuw */}
              {selectedPeriodeId && (
                <button onClick={async () => {
                  const naam = prompt('Naam voor nieuw rooster:', 'Nieuw rooster');
                  if (!naam) return;
                  const start = prompt('Startdatum (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                  if (!start) return;
                  const eind = prompt('Einddatum (YYYY-MM-DD):');
                  if (!eind) return;
                  const res = await fetch('/api/rooster-periodes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'dupliceren', id: selectedPeriodeId, naam, start_datum: start, eind_datum: eind }) });
                  const data = await res.json();
                  if (data.periode) { setSelectedPeriodeId(data.periode.id); }
                  fetchPeriodes();
                }} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid #4a80d4', background: '#eff6ff', color: '#4a80d4', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                  Dupliceer als nieuw
                </button>
              )}

              {/* Nieuw leeg rooster */}
              <button onClick={() => setShowPeriodeForm(!showPeriodeForm)}
                style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid #8b5ec0', background: showPeriodeForm ? '#8b5ec0' : '#faf5ff', color: showPeriodeForm ? 'white' : '#8b5ec0', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                + Nieuw rooster
              </button>

              {/* Zermelo import */}
              <button onClick={() => setShowZermeloForm(!showZermeloForm)}
                style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid #c4892e', background: showZermeloForm ? '#c4892e' : '#fef3c7', color: showZermeloForm ? 'white' : '#c4892e', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                Zermelo import
              </button>

              {/* Verwijderen */}
              {selectedPeriodeId && periodes.length > 1 && (
                <button onClick={async () => {
                  if (!confirm('Weet je zeker dat je deze periode en alle bijbehorende roosterslots wilt verwijderen?')) return;
                  await fetch(`/api/rooster-periodes?id=${selectedPeriodeId}`, { method: 'DELETE' });
                  setSelectedPeriodeId(null);
                  fetchPeriodes(); fetchAllRooster();
                }} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid #c95555', background: 'white', color: '#c95555', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', marginLeft: 'auto' }}>
                  Verwijder
                </button>
              )}
            </div>

            {/* Nieuwe periode form */}
            {showPeriodeForm && (
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', padding: '0.75rem', background: '#faf5ff', borderRadius: 8, border: '1px solid #d8b4fe', alignItems: 'center', flexWrap: 'wrap' }}>
                <input id="np-naam" placeholder="Naam..." style={{ flex: '1 1 120px', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                <input id="np-start" type="date" style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem', fontSize: '0.8rem' }} />
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>t/m</span>
                <input id="np-eind" type="date" style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem', fontSize: '0.8rem' }} />
                <button onClick={async () => {
                  const naam = (document.getElementById('np-naam') as HTMLInputElement).value;
                  const start = (document.getElementById('np-start') as HTMLInputElement).value;
                  const eind = (document.getElementById('np-eind') as HTMLInputElement).value;
                  if (!start || !eind) return;
                  const res = await fetch('/api/rooster-periodes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ naam: naam || 'Nieuw rooster', start_datum: start, eind_datum: eind }) });
                  const data = await res.json();
                  if (data.id) setSelectedPeriodeId(data.id);
                  fetchPeriodes(); setShowPeriodeForm(false);
                }} style={{ background: '#8b5ec0', color: 'white', border: 'none', borderRadius: 6, padding: '0.3rem 0.7rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                  Aanmaken
                </button>
              </div>
            )}

            {/* Zermelo import form */}
            {showZermeloForm && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e' }}>Rooster importeren vanuit Zermelo</span>
                  {zermeloToken && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['auth', 'fetch', 'preview'].map((s, i) => (
                        <div key={s} style={{ width: 8, height: 8, borderRadius: '50%',
                          background: (['auth', 'fetch', 'preview'].indexOf(zermeloStep) >= i) ? '#c4892e' : '#e5e7eb' }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Stap 1: Authenticatie */}
                {!zermeloToken && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={zermeloSchool} onChange={e => setZermeloSchool(e.target.value)} placeholder="Schoolnaam (bijv. mijnschool)"
                      style={{ flex: '1 1 140px', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>.zportal.nl</span>
                    <input value={zermeloCode} onChange={e => setZermeloCode(e.target.value)} placeholder="Koppelcode" type="password"
                      style={{ flex: '1 1 100px', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                    <button onClick={async () => {
                      setZermeloStatus('Verbinden...');
                      const res = await fetch('/api/zermelo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'auth', school: zermeloSchool, code: zermeloCode }) });
                      const data = await res.json();
                      if (data.token) { setZermeloToken(data.token); setZermeloStep('fetch'); setZermeloStatus('Verbonden! Kies een week.'); }
                      else { setZermeloStatus(data.error || 'Authenticatie mislukt'); }
                    }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 6, padding: '0.3rem 0.7rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                      Verbinden
                    </button>
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: 4, width: '100%' }}>
                      Maak een koppelcode aan in Zermelo: Instellingen → Koppel apps → Nieuwe koppeling
                    </div>
                  </div>
                )}

                {/* Stap 2: Week kiezen en rooster ophalen */}
                {zermeloToken && zermeloStep === 'fetch' && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: '#2d8a4e', fontWeight: 600 }}>✓ Verbonden</span>
                    <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>Kies een lesweek:</span>
                    <input id="z-week" type="date" defaultValue={getMonday(new Date()).toISOString().split('T')[0]}
                      style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem', fontSize: '0.8rem' }} />
                    <button onClick={async () => {
                      const ws = (document.getElementById('z-week') as HTMLInputElement).value;
                      setZermeloStatus('Rooster ophalen...');
                      const res = await fetch('/api/zermelo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'fetch', school: zermeloSchool, token: zermeloToken, week_start: ws }) });
                      const data = await res.json();
                      if (data.slots) {
                        setZermeloPreview(data.slots);
                        setZermeloWeekStart(ws);
                        const uniqueGroepen = [...new Set(data.slots.map((s: { groep?: string }) => s.groep?.trim()).filter(Boolean))] as string[];
                        const autoMap: Record<string, number | 'new'> = {};
                        for (const g of uniqueGroepen) {
                          const gClean = g.trim().toLowerCase();
                          const match = klassen.find(k => k.naam.trim().toLowerCase() === gClean)
                            || klassen.find(k => k.naam.trim().toLowerCase().replace(/[._-]/g, '') === gClean.replace(/[._-]/g, ''));
                          autoMap[g] = match ? match.id : 'new';
                        }
                        setZermeloMapping(autoMap);
                        // Selecteer huidige periode als default, anders 'new'
                        setZermeloImportPeriodeId(selectedPeriodeId || 'new');
                        setZermeloStep('preview');
                        const matched = Object.values(autoMap).filter(v => v !== 'new').length;
                        setZermeloStatus(`${data.slots.length} lessen gevonden, ${matched}/${uniqueGroepen.length} groepen herkend`);
                      } else { setZermeloStatus(data.error || 'Ophalen mislukt'); }
                    }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 6, padding: '0.3rem 0.7rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                      Ophalen
                    </button>
                  </div>
                )}

                {/* Stap 3: Preview + koppelen + direct importeren */}
                {zermeloToken && zermeloStep === 'preview' && zermeloPreview && (
                  <div>
                    {/* Compact rooster preview */}
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                      {zermeloPreview.length} lessen gevonden
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      {[1,2,3,4,5].map(dag => {
                        const dagSlots = zermeloPreview.filter(s => s.dag === dag);
                        if (dagSlots.length === 0) return null;
                        return (
                          <div key={dag} style={{ flex: '1 1 100px', background: '#fefce8', borderRadius: 6, padding: '0.3rem 0.4rem', border: '1px solid #fde68a', minWidth: 90 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#92400e', marginBottom: 2 }}>{dagNamenKort[dag - 1]}</div>
                            {dagSlots.map((s, i) => (
                              <div key={i} style={{ fontSize: '0.68rem', color: '#374151', lineHeight: 1.4 }}>
                                <span style={{ fontWeight: 700, color: '#92400e' }}>u{s.uur}</span> {s.vak} <span style={{ color: '#94a3b8' }}>({s.groep})</span>
                                <div style={{ fontSize: '0.62rem', color: '#b08040', marginLeft: 16 }}>
                                  {s.start_time}-{s.end_time} ({String((s as Record<string, unknown>).duur ?? '?')}min)
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>

                    {/* Groepen koppelen */}
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Koppel Zermelo-groepen aan je klassen:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.6rem' }}>
                      {Object.entries(zermeloMapping).map(([groep, value]) => {
                        const slotInfo = zermeloPreview.find(s => s.groep === groep);
                        const isMatched = value !== 'new' && value !== 0;
                        const isSkipped = value === 0;
                        return (
                          <div key={groep} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0.5rem', background: isSkipped ? '#f9fafb' : isMatched ? '#f0fdf4' : '#fffbeb', borderRadius: 6, border: `1px solid ${isSkipped ? '#e5e7eb' : isMatched ? '#bbf7d0' : '#fde68a'}` }}>
                            <div style={{ minWidth: 90, fontSize: '0.78rem' }}>
                              <span style={{ fontWeight: 700, color: '#374151' }}>{groep}</span>
                              {slotInfo && <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: '0.68rem' }}>({slotInfo.vak})</span>}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>→</span>
                            <select
                              value={value === 'new' ? 'new' : (value === 0 ? 'skip' : String(value))}
                              onChange={e => {
                                const v = e.target.value;
                                setZermeloMapping(prev => ({
                                  ...prev,
                                  [groep]: v === 'new' ? 'new' : (v === 'skip' ? 0 as unknown as number : Number(v))
                                }));
                              }}
                              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '0.2rem 0.4rem', fontSize: '0.78rem', background: 'white' }}
                            >
                              <option value="new">+ Nieuwe klas aanmaken</option>
                              <option value="skip">Overslaan</option>
                              <optgroup label="Bestaande klassen">
                                {klassen.map(k => (
                                  <option key={k.id} value={String(k.id)}>{k.naam} ({k.vak})</option>
                                ))}
                              </optgroup>
                            </select>
                            {isMatched && <span style={{ color: '#2d8a4e', fontSize: '0.8rem' }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Periode keuze + Importeer knop */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.5rem 0', borderTop: '1px solid #f59e0b40' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Periode:</label>
                      <select
                        value={zermeloImportPeriodeId === 'new' ? 'new' : String(zermeloImportPeriodeId)}
                        onChange={e => setZermeloImportPeriodeId(e.target.value === 'new' ? 'new' : Number(e.target.value))}
                        style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.78rem', background: 'white', minWidth: 200 }}
                      >
                        {periodes.map(p => (
                          <option key={p.id} value={String(p.id)}>{p.naam} ({p.start_datum} t/m {p.eind_datum})</option>
                        ))}
                        <option value="new">+ Nieuwe periode aanmaken</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.3rem 0' }}>
                      <button onClick={async () => {
                        const activeCount = Object.values(zermeloMapping).filter(v => v !== 0).length;
                        if (activeCount === 0) { setZermeloStatus('Koppel minstens 1 groep aan een klas'); return; }
                        setZermeloStatus('Importeren...');
                        const importBody: Record<string, unknown> = {
                          action: 'import_full',
                          slots: zermeloPreview,
                          students: {},
                          mapping: zermeloMapping,
                        };
                        if (zermeloImportPeriodeId !== 'new') {
                          importBody.periode_id = zermeloImportPeriodeId;
                        } else {
                          importBody.periode_naam = `Zermelo ${new Date().toLocaleDateString('nl-NL')}`;
                          importBody.start_datum = zermeloWeekStart || getMonday(new Date()).toISOString().split('T')[0];
                          const yr = new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear();
                          importBody.eind_datum = `${yr}-07-17`;
                        }
                        const res = await fetch('/api/zermelo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(importBody) });
                        const data = await res.json();
                        if (data.success) {
                          const parts = [];
                          if (data.klassen_aangemaakt > 0) parts.push(`${data.klassen_aangemaakt} klassen aangemaakt`);
                          parts.push(`${data.rooster_imported} lessen geïmporteerd`);
                          setZermeloStatus(`✓ ${parts.join(', ')}`);
                          // Reset wizard en sluit Zermelo-formulier
                          setZermeloPreview(null); setZermeloStep('auth'); setZermeloToken('');
                          setZermeloMapping({}); setZermeloImportPeriodeId('new');
                          setShowZermeloForm(false);
                          // Refresh alles met de juiste periode geselecteerd
                          fetch('/api/klassen').then(r => r.json()).then(setKlassen);
                          fetchPeriodes(data.periode.id);
                        } else { setZermeloStatus(data.error || 'Import mislukt'); }
                      }} style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 1rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                        Importeer rooster
                      </button>
                      <button onClick={() => { setZermeloPreview(null); setZermeloStep('fetch'); setZermeloStatus(''); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', marginLeft: 'auto' }}>
                        ← Terug
                      </button>
                    </div>
                  </div>
                )}

                {zermeloStatus && <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#92400e', fontWeight: 500 }}>{zermeloStatus}</div>}
              </div>
            )}

            {/* Periodes overzicht */}
            {periodes.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {periodes.map(p => {
                  const isActive = p.id === selectedPeriodeId;
                  const today = new Date().toISOString().split('T')[0];
                  const isCurrent = p.start_datum <= today && p.eind_datum >= today;
                  return (
                    <button key={p.id} onClick={() => setSelectedPeriodeId(p.id)}
                      style={{ padding: '0.3rem 0.6rem', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.72rem',
                        border: isActive ? '2px solid #2d8a4e' : '1px solid #d1d5db',
                        background: isActive ? '#f0fdf4' : 'white',
                        color: isActive ? '#2d8a4e' : '#6B7280' }}>
                      {p.naam}
                      {isCurrent && <span style={{ marginLeft: 4, color: '#2d8a4e' }}>●</span>}
                      <div style={{ fontSize: '0.6rem', fontWeight: 400, color: '#94a3b8' }}>
                        {p.start_datum.slice(5)} → {p.eind_datum.slice(5)}
                        {p.bron !== 'handmatig' && ` · ${p.bron}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Klassen info */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                {klassen.length} klassen: {klassen.map(k => k.naam).join(', ')}
              </span>
            </div>

            {/* Rooster grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderRadius: 12, overflow: 'hidden', border: '1px solid #d4d4d4' }}>
              <thead><tr>
                <th style={{ ...th, width: 42 }}>Uur</th>
                {dagNamen.map(n => <th key={n} style={th}>{n}</th>)}
              </tr></thead>
              <tbody>
                {[1,2,3,4,5,6,7,8,9,10].map(uur => (
                  <tr key={uur}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.85rem', padding: '0.2rem 0.15rem' }}>
                      {uur}
                      <div style={{ fontSize: '0.55rem', fontWeight: 400, color: '#b0b8c4', lineHeight: 1 }}>{uurTijden[uur]}</div>
                    </td>
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
              <th style={{ ...th, width: 42 }}>Uur</th>
              {days.map((d, idx) => {
                const vak = isInVakantie(d, vakanties);
                return (
                  <th key={d} style={{ ...th, background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f9fafb', color: d === today ? '#2d8a4e' : vak ? '#b91c1c' : '#374151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <div style={{ fontSize: '0.82rem' }}>{dagNamen[idx]}</div>
                    <div style={{ fontSize: '0.66rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(d)}</div>
                    {vak && <div style={{ fontSize: '0.58rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
                  </th>
                );
              })}
            </tr></thead>
            <tbody>
              {[1,2,3,4,5,6,7,8,9,10].map(uur => (
                <tr key={uur}>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.82rem', padding: '0.2rem 0.15rem' }}>
                    {uur}
                    <div style={{ fontSize: '0.55rem', fontWeight: 400, color: '#b0b8c4', lineHeight: 1 }}>{uurTijden[uur]}</div>
                  </td>
                  {days.map((d, idx) => {
                    const dag = idx + 1; const slot = getSlot(dag, uur); const vakantie = isInVakantie(d, vakanties);
                    /* Exact zelfde patroon als rooster: blokuur-second → null */
                    if (isBlokuurSecond(dag, uur)) return null;
                    const isBlok = isBlokuurStart(dag, uur);
                    const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                    /* Vakantie */
                    if (vakantie) return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, background: '#fef2f2', padding: '0.3rem', verticalAlign: 'middle', textAlign: 'center' }}>{uur === 1 && <span style={{ fontSize: '0.65rem', color: '#f87171', fontWeight: 600 }}>{vakantie.naam}</span>}</td>;
                    /* Leeg uur */
                    if (!slot) return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, background: '#ececec', verticalAlign: 'top' }}><div style={{ minHeight: isBlok ? 160 : 80 }} /></td>;
                    /* Les cel — height:1px trick zodat height:100% in kinderen werkt */
                    return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, padding: 0, height: '1px' }}>{renderCell(slot, d, isBlok)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ═══ DAGPLANNER (alle lesvelden direct zichtbaar per les) ═══ */}
        {view === 'dag' && (() => {
          const dagIdx = new Date(selectedDate + 'T12:00:00').getDay();
          const dagNr = dagIdx >= 1 && dagIdx <= 5 ? dagIdx : 0;
          const vakantie = isInVakantie(selectedDate, vakanties);
          if (dagNr === 0) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', padding: '3rem' }}>Geen lesdag (weekend).</div>;
          if (vakantie) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c95555', fontWeight: 600, padding: '3rem' }}>{vakantie.naam}</div>;
          const dagSlots = allRooster.filter(r => r.dag === dagNr).sort((a, b) => a.uur - b.uur).filter(s => !isBlokuurSecond(dagNr, s.uur));
          if (dagSlots.length === 0) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', padding: '3rem' }}>Geen lessen op deze dag.</div>;

          const dagFields: Array<{ key: keyof Les; label: string; placeholder: string }> = [
            { key: 'startopdracht', label: '🚀 Start', placeholder: 'Startopdracht...' },
            { key: 'terugkijken', label: '🔄 Terugkijken', placeholder: 'Wat bespreken we?' },
            { key: 'programma', label: '📋 Programma', placeholder: 'Plan les...' },
            { key: 'leerdoelen', label: '🎯 Leerdoelen', placeholder: 'Wat moeten ze leren?' },
            { key: 'huiswerk', label: '📝 Huiswerk', placeholder: 'Huiswerk opgave...' },
            { key: 'niet_vergeten', label: '⚡ Onthoud', placeholder: 'Niet vergeten...' },
            { key: 'notities', label: '💬 Notities', placeholder: 'Notities...' },
          ];

          return (
            <div style={{ maxWidth: 700, margin: '0 auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {dagSlots.map(slot => {
                const isBlok = isBlokuurStart(dagNr, slot.uur);
                const kleur = klasKleurMap[slot.klas_id] || '#6B7280';
                const klas = klassen.find(k => k.id === slot.klas_id);
                const cellKey = `${slot.klas_id}-${selectedDate}-${slot.uur}`;
                const les = getCellLes(slot.klas_id, selectedDate, slot.uur);
                const cellToetsen = getToetsenForDateKlas(selectedDate, slot.klas_id);

                return (
                  <div key={slot.uur} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', borderLeft: `4px solid ${kleur}` }}>
                    {/* Header - klik opent zijpaneel voor snelle tab-navigatie */}
                    <div onClick={() => setSelectedLesPanel({ klas_id: slot.klas_id, datum: selectedDate, uur: slot.uur })}
                      style={{ padding: '0.5rem 0.75rem', background: kleur + '08', borderBottom: `1px solid ${kleur}15`, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', cursor: 'pointer' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: kleur }}>Uur {slot.uur}{isBlok ? `–${slot.uur + 1}` : ''}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'white', background: kleur, padding: '1px 8px', borderRadius: 4 }}>{klas?.naam}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{klas?.vak} · {klas?.lokaal}</span>
                      {isBlok && <span style={{ fontSize: '0.62rem', color: kleur, fontWeight: 600, background: kleur + '15', padding: '1px 6px', borderRadius: 3 }}>blokuur</span>}
                      {cellToetsen.map(t => (
                        <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280', padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700 }}>
                          {t.type}: {t.naam}
                        </span>
                      ))}
                      <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#b0b8c4' }}>&#9654;</span>
                    </div>
                    {/* Velden grid: 2 kolommen, 7 velden (laatste rij krijgt colspan via gridColumn) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                      {dagFields.map((field, fi) => {
                        const isLast = fi === dagFields.length - 1;
                        const isInLastRow = fi >= dagFields.length - 2;
                        return (
                          <div key={field.key} style={{
                            borderBottom: isInLastRow ? 'none' : '1px solid #f1f5f9',
                            borderRight: fi % 2 === 0 && !isLast ? '1px solid #f1f5f9' : 'none',
                            padding: '0.25rem 0.5rem', minHeight: 60,
                            ...(isLast ? { gridColumn: '1 / -1' } : {}),
                          }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{field.label}</div>
                            <InlineEditor
                              content={(les[field.key] as string) || ''}
                              onChange={(val) => updateCell(cellKey, les, field.key, val)}
                              onFocus={(editor) => setActiveEditor(editor)}
                              placeholder={field.placeholder}
                              borderColor={kleur}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ═══ KLASPLANNER (2 weken als kolommen, zelfde tabel-stijl als weekplanner) ═══ */}
        {view === 'klas' && selectedKlasId && (() => {
          const klas = klassen.find(k => k.id === selectedKlasId);
          if (!klas) return null;
          const kleur = klasKleurMap[selectedKlasId] || '#6B7280';
          const weeks = getTwoWeeks(klasWeekStart);
          const klasSlots = allRooster.filter(r => r.klas_id === selectedKlasId);
          const slotsByDay: Record<number, number[]> = {};
          klasSlots.forEach(s => { if (!slotsByDay[s.dag]) slotsByDay[s.dag] = []; slotsByDay[s.dag].push(s.uur); });

          /* Verzamel alle lesdagen per week */
          const weekColumns = weeks.map(week => {
            const lesDagen: Array<{ datum: string; di: number; dag: number; vakantie: Vakantie | null; slots: RoosterSlot[] }> = [];
            week.days.forEach((datum, di) => {
              const dag = di + 1;
              const uren = slotsByDay[dag];
              if (!uren || uren.length === 0) return;
              const vakantie = isInVakantie(datum, vakanties);
              const slots = klasSlots.filter(s => s.dag === dag).sort((a,b) => a.uur - b.uur).filter(s => !isBlokuurSecond(dag, s.uur));
              lesDagen.push({ datum, di, dag, vakantie, slots });
            });
            return { ...week, lesDagen };
          });

          return (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: 'white' }}>
              <thead><tr>
                <th style={{ ...th, width: 42 }} />
                {weekColumns.map((week, wi) => {
                  const isCurrentWeek = week.startDate <= today && today <= week.days[4];
                  return (
                    <th key={wi} colSpan={1} style={{ ...th, background: isCurrentWeek ? '#f0fdf4' : '#f9fafb', color: isCurrentWeek ? kleur : '#374151' }}>
                      <div style={{ fontSize: '0.85rem' }}>Week {week.weekNum}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(week.days[0])} – {formatDate(week.days[4])}</div>
                    </th>
                  );
                })}
              </tr></thead>
              <tbody>
                {/* Match lesdagen per rij: week1.dag[i] naast week2.dag[i] */}
                {Array.from({ length: Math.max(weekColumns[0].lesDagen.length, weekColumns[1].lesDagen.length) }).map((_, rowIdx) => {
                  return (
                    <tr key={rowIdx}>
                      {/* Dag label van week 1 als rij-identifier */}
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.72rem', padding: '0.2rem', verticalAlign: 'top' }}>
                        {weekColumns[0].lesDagen[rowIdx] ? (
                          <>{dagNamenKort[weekColumns[0].lesDagen[rowIdx].di]}<br/><span style={{ fontSize: '0.6rem', fontWeight: 400 }}>{formatDate(weekColumns[0].lesDagen[rowIdx].datum)}</span></>
                        ) : ''}
                      </td>
                      {weekColumns.map((week, wi) => {
                        const lesdag = week.lesDagen[rowIdx];
                        if (!lesdag) return <td key={wi} style={{ ...td, background: '#fafafa' }}><div style={{ minHeight: 80 }} /></td>;
                        const { datum, dag, vakantie, slots } = lesdag;
                        const isToday = datum === today;
                        if (vakantie) return <td key={wi} style={{ ...td, background: '#fefce8', verticalAlign: 'middle', textAlign: 'center', padding: '0.5rem' }}><span style={{ fontSize: '0.68rem', color: '#ca8a04', fontWeight: 600 }}>{vakantie.naam}</span></td>;
                        return (
                          <td key={wi} style={{ ...td, padding: 0, height: '1px', background: isToday ? '#f0fdf408' : undefined }}>
                            {slots.map(slot => renderCell(slot, datum, isBlokuurStart(dag, slot.uur)))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}

        {/* ═══ JAARLAAGPLANNER (klassen als kolommen, 2 weken als rijen) ═══ */}
        {view === 'jaarlaag' && (() => {
          const jlKlassen = klassen.filter(k => k.jaarlaag === selectedJaarlaag);
          if (jlKlassen.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Geen klassen in deze jaarlaag.</div>;
          const weeks = getTwoWeeks(jaarlaagWeekStart);

          /* Bouw rijen: weekheader + lesdagen per week */
          type JaarlaagRow = { type: 'weekheader'; week: typeof weeks[0]; isCurrentWeek: boolean } | { type: 'dag'; datum: string; dag: number; di: number; vakantie: Vakantie | null };
          const rows: JaarlaagRow[] = [];
          weeks.forEach(week => {
            const isCurrentWeek = week.startDate <= today && today <= week.days[4];
            rows.push({ type: 'weekheader', week, isCurrentWeek });
            week.days.forEach((datum, di) => {
              const dag = di + 1;
              const vakantie = isInVakantie(datum, vakanties);
              const anyLes = jlKlassen.some(k => allRooster.some(r => r.dag === dag && r.klas_id === k.id));
              if (anyLes) rows.push({ type: 'dag', datum, dag, di, vakantie });
            });
          });

          return (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: 'white' }}>
              <thead><tr>
                <th style={{ ...th, width: 72 }}>Dag</th>
                {jlKlassen.map(klas => {
                  const kleur = klasKleurMap[klas.id] || '#6B7280';
                  return (
                    <th key={klas.id} style={{ ...th, color: kleur }}>
                      <div style={{ fontSize: '0.85rem' }}>{klas.naam}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: 400, opacity: 0.6 }}>{klas.vak}</div>
                    </th>
                  );
                })}
              </tr></thead>
              <tbody>
                {rows.map((row, ri) => {
                  if (row.type === 'weekheader') {
                    return (
                      <tr key={`wh-${ri}`}>
                        <td colSpan={1 + jlKlassen.length} style={{ padding: '0.4rem 0.6rem', background: row.isCurrentWeek ? '#f0fdf4' : '#f9fafb', fontWeight: 700, fontSize: '0.82rem', color: row.isCurrentWeek ? '#2d8a4e' : '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'center' }}>
                          Week {row.week.weekNum} <span style={{ fontWeight: 400, fontSize: '0.72rem', color: '#94a3b8', marginLeft: 6 }}>{formatDate(row.week.days[0])} – {formatDate(row.week.days[4])}</span>
                        </td>
                      </tr>
                    );
                  }
                  const { datum, dag, di, vakantie } = row;
                  const isToday = datum === today;
                  return (
                    <tr key={`d-${datum}`}>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem', background: isToday ? '#f0fdf4' : vakantie ? '#fefce8' : '#fafafa', color: isToday ? '#2d8a4e' : '#475569', verticalAlign: 'top' }}>
                        {dagNamenKort[di]}<br/><span style={{ fontSize: '0.6rem', fontWeight: 400, color: '#94a3b8' }}>{formatDate(datum)}</span>
                        {vakantie && <div style={{ fontSize: '0.56rem', color: '#ca8a04', fontWeight: 600, marginTop: 2 }}>{vakantie.naam}</div>}
                      </td>
                      {jlKlassen.map(klas => {
                        if (vakantie) return <td key={klas.id} style={{ ...td, background: '#fefce8', verticalAlign: 'middle', textAlign: 'center' }}><span style={{ fontSize: '0.62rem', color: '#ca8a04' }}>{vakantie.naam}</span></td>;
                        const slots = allRooster.filter(r => r.dag === dag && r.klas_id === klas.id).sort((a, b) => a.uur - b.uur).filter(s => !isBlokuurSecond(dag, s.uur));
                        if (slots.length === 0) return <td key={klas.id} style={{ ...td, background: '#fafafa' }}><div style={{ minHeight: 60 }} /></td>;
                        return (
                          <td key={klas.id} style={{ ...td, padding: 0, height: '1px' }}>
                            {slots.map(slot => renderCell(slot, datum, isBlokuurStart(dag, slot.uur)))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
        {/* jaarlaag view ends above */}
        </div>

        {/* ═══ LESSON DETAIL PANEL (tabbed) ═══ */}
        {selectedLesPanel && (() => {
          const panelLes = getCellLes(selectedLesPanel.klas_id, selectedLesPanel.datum, selectedLesPanel.uur || 0);
          const panelKlas = klassen.find(k => k.id === selectedLesPanel.klas_id);
          const panelKleur = klasKleurMap[selectedLesPanel.klas_id] || '#6B7280';
          const panelKey = `${selectedLesPanel.klas_id}-${selectedLesPanel.datum}-${selectedLesPanel.uur}`;
          const tabs: Array<{ key: keyof Les; label: string; placeholder: string; icon: string }> = [
            { key: 'programma', label: 'Programma', placeholder: 'Plan les...', icon: '📋' },
            { key: 'startopdracht', label: 'Start', placeholder: 'Startopdracht...', icon: '🚀' },
            { key: 'terugkijken', label: 'Terugkijken', placeholder: 'Wat bespreken we?', icon: '🔄' },
            { key: 'leerdoelen', label: 'Doelen', placeholder: 'Wat moeten ze leren?', icon: '🎯' },
            { key: 'huiswerk', label: 'Huiswerk', placeholder: 'Huiswerk opgave...', icon: '📝' },
            { key: 'niet_vergeten', label: 'Onthoud', placeholder: 'Niet vergeten...', icon: '⚡' },
            { key: 'notities', label: 'Notities', placeholder: 'Notities...', icon: '💬' },
          ];
          const activeTab = tabs.find(t => t.key === panelTab) || tabs[0];
          const hasContent = (key: keyof Les) => { const v = panelLes[key]; return typeof v === 'string' && stripHtml(v).length > 0; };

          return (
            <div style={{ width: 380, background: 'white', borderLeft: `1px solid #e5e7eb`, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 12px rgba(0,0,0,0.06)' }}>
              {/* Panel header */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: `3px solid ${panelKleur}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: panelKleur + '08' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: panelKleur }}>{panelKlas?.naam}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 8 }}>Uur {selectedLesPanel.uur || '—'} · {formatDate(selectedLesPanel.datum)}</span>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>{panelKlas?.vak} · {panelKlas?.lokaal}</div>
                </div>
                <button onClick={() => setSelectedLesPanel(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px', borderRadius: 4 }}>✕</button>
              </div>

              {/* Tab bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '0.4rem 0.5rem', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setPanelTab(tab.key)}
                    style={{ padding: '0.25rem 0.5rem', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600,
                      background: panelTab === tab.key ? panelKleur : 'transparent',
                      color: panelTab === tab.key ? 'white' : hasContent(tab.key) ? '#334155' : '#b0b8c4',
                      position: 'relative'
                    }}>
                    {tab.icon} {tab.label}
                    {hasContent(tab.key) && panelTab !== tab.key && <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: panelKleur, marginLeft: 3, verticalAlign: 'middle' }} />}
                  </button>
                ))}
              </div>

              {/* Active tab content - full height editor */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <InlineEditor
                  key={`${panelKey}-${activeTab.key}`}
                  content={(panelLes[activeTab.key] as string) || ''}
                  onChange={(val) => updateCell(panelKey, panelLes, activeTab.key, val)}
                  onFocus={(editor) => setActiveEditor(editor)}
                  placeholder={activeTab.placeholder}
                  borderColor={panelKleur}
                  grow
                />
              </div>
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
      background: active ? '#2d8a4e20' : 'transparent', color: active ? '#2d8a4e' : '#374151', fontWeight: active ? 700 : 400,
    }}>{children}</button>
  );
}
function Sep() { return <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />; }
