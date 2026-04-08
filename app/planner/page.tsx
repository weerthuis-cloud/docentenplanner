'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false });

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface RoosterSlot { id?: number; klas_id: number; dag: number; uur: number; vak: string; lokaal: string; is_blokuur: boolean; }
interface Les { id?: number; klas_id: number; datum: string; uur: number | null; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; notities: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; kleur: string; les_id: number | null; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; }
interface Jaarplanner { id: number; vak: string; jaarlaag: string; schooljaar: string; naam: string; data: Array<{ week: number; les: number; planning: string; toetsen: string }>; created_at: string; }
interface JaarplannerRow { week: number; les: number; planning: string; toetsen: string; }

/* Strip HTML tags for plain text preview */
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/* Combineer terugkijken + programma + huiswerk in één HTML blok (geen labels) */
function buildCombinedContent(les: Les): string {
  const parts = [les.terugkijken, les.programma, les.huiswerk].filter(Boolean);
  return parts.join('') || '';
}

/* Alles opslaan als programma (één veld) */
function parseCombinedContent(html: string): { terugkijken: string; programma: string; huiswerk: string } {
  return { terugkijken: '', programma: html, huiswerk: '' };
}

const dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const klasKleuren = ['#1a7a2e', '#2563EB', '#9333EA', '#DC2626', '#D97706', '#0891B2', '#BE185D', '#4338CA'];
const toetsKleuren: Record<string, string> = { PW: '#DC2626', SO: '#D97706', PO: '#7C3AED', MO: '#059669', SE: '#2563EB', overig: '#6B7280' };
const toetsLabels: Record<string, string> = { PW: 'Proefwerk', SO: 'Schriftelijke overhoring', PO: 'Praktische opdracht', MO: 'Mondeling', SE: 'Schoolexamen', overig: 'Overig' };

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

  const [view, setView] = useState<'rooster' | 'week' | 'dag' | 'klas' | 'jaarlaag'>('rooster');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [editingLes, setEditingLes] = useState<Les | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO' });
  const [copySource, setCopySource] = useState<Les | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVak, setUploadVak] = useState('');
  const [uploadJaarlaag, setUploadJaarlaag] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copyDropdownOpen, setCopyDropdownOpen] = useState(false);
  const [expandedDagSlots, setExpandedDagSlots] = useState<Set<string>>(new Set()); // multiple "klas_id-uur" keys
  const [dagEditLessen, setDagEditLessen] = useState<Record<string, Les>>({}); // per-slot edit state
  const [dagNewToetsen, setDagNewToetsen] = useState<Record<string, { naam: string; type: string }>>({}); // per-slot toets input
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedKlasId, setSelectedKlasId] = useState<number | null>(null);
  const [selectedJaarlaag, setSelectedJaarlaag] = useState('');
  const [klasWeekStart, setKlasWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [jaarlaagWeekStart, setJaarlaagWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [extraLessen, setExtraLessen] = useState<Les[]>([]);

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
    )).then(r => setLessen(r.flat()));
  }, [klassen, weekStart, weekEnd]);

  const fetchToetsen = useCallback(() => {
    if (klassen.length === 0) return;
    Promise.all(klassen.map(k => fetch(`/api/toetsen?klas_id=${k.id}`).then(r => r.json())))
      .then(r => setToetsen(r.flat()));
  }, [klassen]);

  // Fetch lessons for klas/jaarlaag views (6-week range)
  const fetchExtraLessen = useCallback((ws: string) => {
    if (klassen.length === 0) return;
    const start = ws;
    const end = new Date(new Date(ws + 'T12:00:00').getTime() + 6 * 7 * 86400000).toISOString().split('T')[0];
    Promise.all(klassen.map(k =>
      fetch(`/api/lessen?klas_id=${k.id}&week_start=${start}&week_end=${end}`)
        .then(r => r.json()).then((d: Les[] | Les | null) => Array.isArray(d) ? d : d ? [d] : [])
    )).then(r => setExtraLessen(r.flat()));
  }, [klassen]);

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { if (view === 'week' || view === 'dag') fetchLessen(); }, [fetchLessen, view]);
  useEffect(() => { if (view === 'week' || view === 'dag') fetchToetsen(); }, [fetchToetsen, view]);
  useEffect(() => { if (view === 'klas') fetchExtraLessen(klasWeekStart); }, [view, klasWeekStart, fetchExtraLessen]);
  useEffect(() => { if (view === 'jaarlaag') fetchExtraLessen(jaarlaagWeekStart); }, [view, jaarlaagWeekStart, fetchExtraLessen]);
  useEffect(() => { if ((view === 'klas' || view === 'jaarlaag') && klassen.length > 0) fetchToetsen(); }, [view, klassen, fetchToetsen]);
  // Auto-select first klas/jaarlaag
  useEffect(() => { if (klassen.length > 0 && !selectedKlasId) setSelectedKlasId(klassen[0].id); }, [klassen, selectedKlasId]);
  useEffect(() => { if (klassen.length > 0 && !selectedJaarlaag) setSelectedJaarlaag([...new Set(klassen.map(k => k.jaarlaag))][0] || ''); }, [klassen, selectedJaarlaag]);

  /* ───── Helpers ───── */
  const getSlot = (dag: number, uur: number): RoosterSlot | undefined =>
    allRooster.find(r => r.dag === dag && r.uur === uur);

  const getLes = (klas_id: number, datum: string, uur: number): Les | undefined =>
    lessen.find(l => l.klas_id === klas_id && l.datum === datum && l.uur === uur);

  const getToetsenForDateKlas = (datum: string, klas_id: number): Toets[] =>
    toetsen.filter(t => t.datum === datum && t.klas_id === klas_id);

  // Blokuur: check of dezelfde klas ook het volgende uur heeft
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

  // Kan blokuur worden (zelfde klas twee uur achter elkaar)?
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
    // Update both slots
    await fetch('/api/roosters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...slot, is_blokuur: newVal }),
    });
    await fetch('/api/roosters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...next, is_blokuur: newVal }),
    });
    fetchAllRooster();
  }

  /* ───── Lesson actions ───── */
  async function saveLes(les: Les) {
    setSaving(true);
    await fetch('/api/lessen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(les) });
    setSaving(false);
    fetchLessen();
    if (view === 'klas') fetchExtraLessen(klasWeekStart);
    if (view === 'jaarlaag') fetchExtraLessen(jaarlaagWeekStart);
  }

  async function deleteToets(id: number) {
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' }); fetchToetsen();
  }

  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  /* ───── Jaarplanner helpers ───── */
  function getJaarplannerForLesson(les: Les): Jaarplanner | null {
    const klas = klassen.find(k => k.id === les.klas_id);
    if (!klas) return null;
    return jaarplanners.find(jp => jp.vak === klas.vak && jp.jaarlaag === klas.jaarlaag) || null;
  }

  function getJaarplannerWeeks(jaarplanner: Jaarplanner, centerWeek: number): JaarplannerRow[][] {
    const result: JaarplannerRow[][] = [];
    const weeks = [centerWeek - 1, centerWeek, centerWeek + 1];

    for (const week of weeks) {
      const weekRows = jaarplanner.data.filter(row => row.week === week).sort((a, b) => a.les - b.les);
      result.push(weekRows);
    }

    return result;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Gekopieerd naar klembord!');
    }).catch(() => {
      alert('Kan niet kopiëren naar klembord');
    });
  }

  async function handleJaarplannerUpload() {
    if (!uploadFile || !uploadVak || !uploadJaarlaag) {
      alert('Vul alle velden in');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('vak', uploadVak);
    formData.append('jaarlaag', uploadJaarlaag);

    try {
      const res = await fetch('/api/jaarplanners/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        alert('Upload mislukt: ' + (result.error || 'Onbekende fout'));
      } else {
        alert(`Jaarplanner geupload! ${result.rowsImported} rijen geïmporteerd.`);
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadVak('');
        setUploadJaarlaag('');
        fetch('/api/jaarplanners').then(r => r.json()).then(setJaarplanners);
      }
    } catch (error) {
      alert('Upload fout: ' + (error instanceof Error ? error.message : 'Onbekende fout'));
    } finally {
      setUploading(false);
    }
  }

  /* ═══════════════════════════════════════════════════════ */
  /* ───── RENDER ───── */
  /* ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '1rem 1.5rem', maxWidth: 1600, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Topbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: '#e8f5e9', borderRadius: 8, overflow: 'hidden' }}>
            {(['rooster', 'week', 'dag', 'klas', 'jaarlaag'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '0.4rem 0.7rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                background: view === v ? '#1a7a2e' : 'transparent', color: view === v ? 'white' : '#1a7a2e',
              }}>{{ rooster: 'Rooster', week: 'Week', dag: 'Dag', klas: 'Klas', jaarlaag: 'Jaarlaag' }[v]}</button>
            ))}
          </div>

          {/* Legenda */}
          {klassen.map((k, i) => (
            <span key={k.id} style={{
              padding: '0.15rem 0.45rem', borderRadius: 5, fontSize: '0.72rem', fontWeight: 600,
              background: klasKleuren[i % klasKleuren.length] + '15', color: klasKleuren[i % klasKleuren.length],
              border: `1px solid ${klasKleuren[i % klasKleuren.length]}30`,
            }}>{k.naam}</span>
          ))}
        </div>

        {/* Navigation controls per view */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {copySource && (
            <span style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 600, padding: '0.2rem 0.5rem', background: '#FEF3C7', borderRadius: 6 }}>
              Gekopieerd <button onClick={() => setCopySource(null)} style={{ background: 'none', border: 'none', color: '#D97706', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </span>
          )}

          {view === 'week' && (<>
            <button onClick={() => changeWeek(-1)} style={navBtn}>&#9664;</button>
            <span style={{ fontWeight: 700, color: '#1a7a2e', minWidth: 80, textAlign: 'center', fontSize: '0.9rem' }}>Wk {getWeekNumber(weekStart)}</span>
            <button onClick={() => changeWeek(1)} style={navBtn}>&#9654;</button>
            <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])}
              style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem' }}>Vandaag</button>
          </>)}

          {view === 'dag' && (<>
            <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); setWeekStart(getMonday(d).toISOString().split('T')[0]); }} style={navBtn}>&#9664;</button>
            <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '0.9rem' }}>
              {dagNamen[new Date(selectedDate + 'T12:00:00').getDay() - 1] || 'Weekend'} {formatDate(selectedDate)}
            </span>
            <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); setWeekStart(getMonday(d).toISOString().split('T')[0]); }} style={navBtn}>&#9654;</button>
            <button onClick={() => { const t = new Date(); setSelectedDate(t.toISOString().split('T')[0]); setWeekStart(getMonday(t).toISOString().split('T')[0]); }}
              style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem' }}>Vandaag</button>
          </>)}

          {view === 'klas' && (<>
            <select value={selectedKlasId || ''} onChange={e => setSelectedKlasId(Number(e.target.value))}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}>
              {klassen.map((k, i) => <option key={k.id} value={k.id} style={{ color: klasKleuren[i % klasKleuren.length] }}>{k.naam}</option>)}
            </select>
            <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>&#9664;</button>
            <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '0.85rem' }}>Wk {getWeekNumber(klasWeekStart)} – {getWeekNumber(new Date(new Date(klasWeekStart + 'T12:00:00').getTime() + 7 * 86400000).toISOString().split('T')[0])}</span>
            <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>&#9654;</button>
            <button onClick={() => setKlasWeekStart(getMonday(new Date()).toISOString().split('T')[0])}
              style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem' }}>Vandaag</button>
          </>)}

          {view === 'jaarlaag' && (<>
            <select value={selectedJaarlaag} onChange={e => setSelectedJaarlaag(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}>
              {[...new Set(klassen.map(k => k.jaarlaag))].map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 42); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>&#9664;</button>
            <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '0.85rem' }}>Wk {getWeekNumber(jaarlaagWeekStart)} – {getWeekNumber(new Date(new Date(jaarlaagWeekStart + 'T12:00:00').getTime() + 5 * 7 * 86400000).toISOString().split('T')[0])}</span>
            <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 42); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>&#9654;</button>
            <button onClick={() => setJaarlaagWeekStart(getMonday(new Date()).toISOString().split('T')[0])}
              style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem' }}>Vandaag</button>
          </>)}

          {view === 'rooster' && (
            <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
              Stel je weekrooster in. Koppel het daarna aan weken via <strong>Week</strong>.
            </span>
          )}
        </div>

        {(view === 'week' || view === 'dag') && (
          <button onClick={() => setShowUploadModal(true)} style={{
            ...navBtn, background: '#2563EB', color: 'white', padding: '0.35rem 0.9rem'
          }}>
            ⬆ Jaarplanner uploaden
          </button>
        )}
      </div>

      {/* ── Jaarplanner Upload Modal ── */}
      {showUploadModal && (
        <div style={overlay} onClick={() => setShowUploadModal(false)}>
          <div style={{ ...modal, maxWidth: 450 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1a7a2e' }}>Jaarplanner uploaden</div>
              <button onClick={() => setShowUploadModal(false)} style={closeBtn}>✕</button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#374151', marginBottom: '0.4rem' }}>
                Docx bestand
              </label>
              <input type="file" accept=".docx" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                style={{
                  display: 'block', width: '100%', padding: '0.5rem',
                  border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem',
                }}
              />
              {uploadFile && (
                <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.3rem' }}>
                  ✓ {uploadFile.name}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#374151', marginBottom: '0.4rem' }}>
                  Vak
                </label>
                <select value={uploadVak} onChange={e => setUploadVak(e.target.value)}
                  style={{
                    width: '100%', padding: '0.5rem', border: '1px solid #d1d5db',
                    borderRadius: 8, fontSize: '0.85rem',
                  }}
                >
                  <option value="">— kies vak —</option>
                  {[...new Set(klassen.map(k => k.vak))].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#374151', marginBottom: '0.4rem' }}>
                  Jaarlaag
                </label>
                <select value={uploadJaarlaag} onChange={e => setUploadJaarlaag(e.target.value)}
                  style={{
                    width: '100%', padding: '0.5rem', border: '1px solid #d1d5db',
                    borderRadius: 8, fontSize: '0.85rem',
                  }}
                >
                  <option value="">— kies jaarlaag —</option>
                  {[...new Set(klassen.map(k => k.jaarlaag))].map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#6B7280', background: '#f9fafb', padding: '0.6rem 0.8rem', borderRadius: 8, lineHeight: 1.5 }}>
                <strong>Format:</strong> De docx moet een tabel bevatten met kolommen: Wk, Les 1 (Planning), Les 1 (Toets), Les 2 (Planning), Les 2 (Toets)
              </div>
            </div>

            {jaarplanners.length > 0 && (
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.5rem' }}>Bestaande jaarplanners:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {jaarplanners.map(jp => (
                    <div key={jp.id} style={{ fontSize: '0.78rem', color: '#6B7280', padding: '0.3rem 0.5rem', background: '#f9fafb', borderRadius: 6 }}>
                      {jp.naam}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={() => setShowUploadModal(false)} style={{ ...btn, background: '#e5e7eb', color: '#374151' }}>
                Annuleren
              </button>
              <button onClick={handleJaarplannerUpload} disabled={uploading}
                style={{ ...btn, background: '#2563EB', color: 'white' }}>
                {uploading ? 'Uploaden...' : 'Uploaden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* ROOSTER VIEW */}
      {/* ═══════════════════════════════════════════════════ */}
      {view === 'rooster' && (
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid #d4d4d4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 42 }}>Uur</th>
                {dagNamen.map(n => <th key={n} style={th}>{n}</th>)}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(uur => {
                return (
                  <tr key={uur}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.85rem' }}>{uur}</td>
                    {[1, 2, 3, 4, 5].map(dag => {
                      const slot = getSlot(dag, uur);
                      const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                      const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                      const isSecond = isBlokuurSecond(dag, uur);
                      const canBlok = canBeBlokuur(dag, uur);
                      const isBlok = isBlokuurStart(dag, uur);

                      // Blokuur 2e uur: verborgen (rowSpan op 1e uur)
                      if (isSecond) return null;

                      return (
                        <td key={`${dag}-${uur}`}
                          rowSpan={isBlok ? 2 : 1}
                          style={{
                            ...td,
                            borderLeft: slot ? `3px solid ${kleur}` : undefined,
                            background: slot ? kleur + '06' : '#fcfcfc',
                          }}>
                          <select value={slot?.klas_id || ''}
                            onChange={e => setRoosterKlas(dag, uur, e.target.value ? Number(e.target.value) : null)}
                            style={{
                              width: '100%', border: 'none', background: 'transparent',
                              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                              color: kleur || '#c4c4c4', outline: 'none', padding: '0 0 2px 0',
                            }}
                          >
                            <option value="" style={{ color: '#c4c4c4' }}>— kies klas —</option>
                            {klassen.map((k, i) => (
                              <option key={k.id} value={k.id} style={{ color: klasKleuren[i % klasKleuren.length] }}>
                                {k.naam} ({k.lokaal})
                              </option>
                            ))}
                          </select>

                          {slot && klas && (
                            <div style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: 2 }}>
                              {klas.vak} - {klas.lokaal}
                            </div>
                          )}

                          {/* Blokuur toggle */}
                          {canBlok && (
                            <button onClick={() => toggleBlokuur(dag, uur)} style={{
                              marginTop: 4, fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4,
                              border: `1px solid ${isBlok ? kleur : '#d1d5db'}`,
                              background: isBlok ? kleur + '20' : '#f9fafb',
                              color: isBlok ? kleur : '#9CA3AF',
                              cursor: 'pointer', fontWeight: 600,
                            }}>
                              {isBlok ? '✓ Blokuur' : 'Maak blokuur'}
                            </button>
                          )}
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

      {/* ═══════════════════════════════════════════════════ */}
      {/* WEEKPLANNER VIEW */}
      {/* ═══════════════════════════════════════════════════ */}
      {view === 'week' && (
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid #d4d4d4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 42 }}></th>
                {days.map((d, idx) => {
                  const vak = isInVakantie(d, vakanties);
                  return (
                    <th key={d} style={{
                      ...th, background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f0fdf4',
                      color: d === today ? '#1a7a2e' : vak ? '#b91c1c' : '#374151',
                    }}>
                      <div style={{ fontSize: '0.85rem' }}>{dagNamen[idx]}</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 400, opacity: 0.65 }}>{formatDate(d)}</div>
                      {vak && <div style={{ fontSize: '0.62rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(uur => (
                <tr key={uur}>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.85rem' }}>{uur}</td>
                  {days.map((d, idx) => {
                    const dag = idx + 1;
                    const slot = getSlot(dag, uur);
                    const vakantie = isInVakantie(d, vakanties);
                    const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                    const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                    const les = slot ? getLes(slot.klas_id, d, uur) : undefined;
                    const cellToetsen = slot ? getToetsenForDateKlas(d, slot.klas_id) : [];
                    const isSecond = isBlokuurSecond(dag, uur);
                    const isBlok = isBlokuurStart(dag, uur);

                    if (vakantie) {
                      return (
                        <td key={`${d}-${uur}`} style={{ ...td, background: '#fef2f2', textAlign: 'center' }}>
                          {uur === 1 && <span style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 600 }}>{vakantie.naam}</span>}
                        </td>
                      );
                    }

                    if (!slot) {
                      return <td key={`${d}-${uur}`} style={{ ...td, background: '#fafafa' }}></td>;
                    }

                    // Blokuur 2e uur: verborgen (rowSpan op 1e uur)
                    if (isSecond) return null;

                    return (
                      <td key={`${d}-${uur}`}
                        rowSpan={isBlok ? 2 : 1}
                        onClick={() => {
                          if (copySource && slot) {
                            saveLes({ ...copySource, klas_id: slot.klas_id, datum: d, uur, id: undefined });
                            setCopySource(null); return;
                          }
                          setEditingLes(les || emptyLes(slot.klas_id, d, uur));
                        }}
                        style={{
                          ...td,
                          borderLeft: `3px solid ${kleur}`,
                          background: d === today ? '#f0fdf4' : les?.programma ? 'white' : '#fcfcfc',
                          cursor: 'pointer', position: 'relative',
                          height: isBlok ? 140 : 70,
                        }}
                      >
                        {/* Klas label */}
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: kleur, marginBottom: 2 }}>
                          {klas?.naam}
                          {isBlok && <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 4 }}>blokuur</span>}
                          <span style={{ fontWeight: 400, color: '#b0b0b0', marginLeft: 4 }}>{klas?.lokaal}</span>
                        </div>

                        {/* Toetsen */}
                        {cellToetsen.map(t => (
                          <div key={t.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 2,
                            background: (toetsKleuren[t.type] || '#6B7280') + '15',
                            color: toetsKleuren[t.type] || '#6B7280',
                            padding: '0 4px', borderRadius: 3, fontSize: '0.62rem',
                            fontWeight: 700, marginBottom: 2, marginRight: 2,
                          }}>
                            {t.type}: {t.naam.length > 12 ? t.naam.slice(0, 12) + '..' : t.naam}
                            <button onClick={e => { e.stopPropagation(); deleteToets(t.id); }}
                              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.56rem', padding: 0 }}>✕</button>
                          </div>
                        ))}

                        {/* Les preview */}
                        {les?.programma ? (
                          <div style={{ fontSize: '0.7rem', lineHeight: 1.3, color: '#334155', overflow: 'hidden', maxHeight: isBlok ? 80 : 36 }}>
                            {stripHtml(les.programma).split('\n').slice(0, isBlok ? 4 : 2).map((l, i) => (
                              <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l || '\u00A0'}</div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: '#d4d4d4', fontSize: '0.68rem' }}>+ plan les</div>
                        )}
                        {les?.terugkijken && (
                          <div style={{ color: '#6B7280', fontSize: '0.6rem', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ↩ {stripHtml(les.terugkijken).slice(0, 30)}
                          </div>
                        )}
                        {les?.huiswerk && (
                          <div style={{ color: '#D97706', fontWeight: 600, fontSize: '0.62rem', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            HW: {stripHtml(les.huiswerk).slice(0, 28)}
                          </div>
                        )}

                        {/* Copy btn */}
                        {les && (
                          <div style={{ position: 'absolute', top: 1, right: 1 }}>
                            <button onClick={e => { e.stopPropagation(); setCopySource(les); }}
                              title="Kopieer" style={miniBtn}>⧉</button>
                          </div>
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

      {/* ═══════════════════════════════════════════════════ */}
      {/* DAGPLANNER VIEW */}
      {/* ═══════════════════════════════════════════════════ */}
      {view === 'dag' && (() => {
        const dagIdx = new Date(selectedDate + 'T12:00:00').getDay();
        const dagNr = dagIdx >= 1 && dagIdx <= 5 ? dagIdx : 0;
        const vakantie = isInVakantie(selectedDate, vakanties);

        if (dagNr === 0) return (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '1.1rem' }}>
            Geen lesdag (weekend). Ga naar een werkdag.
          </div>
        );

        if (vakantie) return (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', fontSize: '1.1rem', fontWeight: 600 }}>
            {vakantie.naam}
          </div>
        );

        const dagSlots = allRooster.filter(r => r.dag === dagNr).sort((a, b) => a.uur - b.uur);
        const visibleSlots = dagSlots.filter(s => !isBlokuurSecond(dagNr, s.uur));

        return (
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.25rem', maxWidth: 900 }}>
            {visibleSlots.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '2rem', fontSize: '0.95rem' }}>
                Geen lessen ingepland op deze dag. Stel eerst het rooster in.
              </div>
            )}
            {visibleSlots.map(slot => {
              const klas = klassen.find(k => k.id === slot.klas_id);
              const kleur = klasKleurMap[slot.klas_id] || '#6B7280';
              const les = getLes(slot.klas_id, selectedDate, slot.uur);
              const cellToetsen = getToetsenForDateKlas(selectedDate, slot.klas_id);
              const isBlok = isBlokuurStart(dagNr, slot.uur);
              const slotKey = `${slot.klas_id}-${slot.uur}`;
              const isExpanded = expandedDagSlots.has(slotKey);
              const dagEditLes = dagEditLessen[slotKey] || null;
              const dagNewToets = dagNewToetsen[slotKey] || { naam: '', type: 'SO' };
              const setDagEditLes = (les: Les | null) => setDagEditLessen(prev => les ? { ...prev, [slotKey]: les } : (() => { const n = { ...prev }; delete n[slotKey]; return n; })());
              const setDagNewToets = (v: { naam: string; type: string }) => setDagNewToetsen(prev => ({ ...prev, [slotKey]: v }));

              // Jaarplanner context
              const jpKlas = klas ? jaarplanners.find(jp => jp.vak === klas.vak && jp.jaarlaag === klas.jaarlaag) : null;
              const lesWeek = getWeekNumber(selectedDate);
              const jpWeeks = jpKlas ? getJaarplannerWeeks(jpKlas, lesWeek) : [];

              return (
                <div key={slot.uur} style={{
                  borderRadius: 12, border: `1px solid ${isExpanded ? kleur + '60' : kleur + '30'}`,
                  borderLeft: `4px solid ${kleur}`,
                  background: isExpanded ? 'white' : les?.programma ? 'white' : '#fcfcfc',
                  boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                }}>
                  {/* ── Header (altijd zichtbaar, klikbaar) ── */}
                  <div
                    onClick={() => {
                      if (copySource) { saveLes({ ...copySource, klas_id: slot.klas_id, datum: selectedDate, uur: slot.uur, id: undefined }); setCopySource(null); return; }
                      if (isExpanded) {
                        setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; });
                        setDagEditLes(null);
                      } else {
                        setExpandedDagSlots(prev => new Set(prev).add(slotKey));
                        setDagEditLes(les || emptyLes(slot.klas_id, selectedDate, slot.uur));
                      }
                    }}
                    style={{ display: 'flex', gap: '0.8rem', padding: '0.7rem 0.9rem', cursor: 'pointer',
                      background: isExpanded ? kleur + '10' : 'transparent', borderRadius: '12px 12px 0 0',
                    }}
                  >
                    <div style={{ width: 42, textAlign: 'center', color: '#9CA3AF', fontWeight: 700, fontSize: '1rem', paddingTop: '0.2rem' }}>
                      {slot.uur}{isBlok && <span style={{ display: 'block', fontSize: '0.6rem', color: kleur }}>blok</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontWeight: 700, color: 'white', fontSize: '0.82rem',
                            background: kleur, padding: '0.15rem 0.5rem', borderRadius: 6,
                          }}>{klas?.naam}</span>
                          <span style={{ color: '#6B7280', fontSize: '0.75rem' }}>{klas?.lokaal} &middot; {klas?.vak}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          {les && <button onClick={e => { e.stopPropagation(); setCopySource(les); }} title="Kopieer" style={miniBtn}>⧉</button>}
                          <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {cellToetsen.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                          {cellToetsen.map(t => (
                            <span key={t.id} style={{
                              background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280',
                              padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
                            }}>{t.type}: {t.naam}</span>
                          ))}
                        </div>
                      )}

                      {/* Ingeklapte preview */}
                      {!isExpanded && (
                        <>
                          {les?.programma ? (
                            <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                              {stripHtml(les.programma).split('\n').slice(0, 2).map((l, i) => (
                                <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l || '\u00A0'}</div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: '#d4d4d4', fontSize: '0.8rem' }}>+ plan les</div>
                          )}
                          {les?.leerdoelen && (
                            <div style={{ fontSize: '0.72rem', color: '#2563EB', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Leerdoelen: {stripHtml(les.leerdoelen).slice(0, 60)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Uitgeklapte editor ── */}
                  {isExpanded && dagEditLes && (
                    <div style={{ borderTop: `1px solid ${kleur}20`, padding: '0.75rem 0.9rem', display: 'flex', gap: '1rem' }}>

                      {/* Jaarplanner zijpaneel */}
                      {jpKlas && (
                        <div style={{ width: 220, flex: '0 0 auto', paddingRight: '0.75rem', borderRight: '1px solid #e5e7eb', overflow: 'auto', maxHeight: 500 }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Jaarplanner</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a7a2e', marginBottom: '0.6rem' }}>{jpKlas.naam}</div>
                          {jpWeeks.map((weekData, weekIdx) => {
                            const weekNum = lesWeek - 1 + weekIdx;
                            const isCenter = weekIdx === 1;
                            return (
                              <div key={weekIdx} style={{
                                marginBottom: '0.5rem', padding: '0.4rem 0.5rem',
                                background: isCenter ? '#f0fdf4' : '#fafafa', borderRadius: 6,
                                border: isCenter ? '2px solid #1a7a2e' : '1px solid #e5e7eb',
                              }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isCenter ? '#1a7a2e' : '#6B7280', marginBottom: '0.2rem' }}>Wk {weekNum}</div>
                                {weekData.length === 0 ? (
                                  <div style={{ fontSize: '0.65rem', color: '#b0b0b0' }}>—</div>
                                ) : weekData.map((row, ri) => (
                                  <div key={ri} style={{ marginBottom: '0.3rem', fontSize: '0.68rem' }}>
                                    <div style={{ fontWeight: 600, color: '#374151' }}>Les {row.les}</div>
                                    {row.planning && <div style={{ color: '#4B5563', lineHeight: 1.3 }}>{row.planning}</div>}
                                    {row.toetsen && <div style={{ color: '#DC2626', fontWeight: 600 }}>{row.toetsen}</div>}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Editor kolom */}
                      <div style={{ flex: 1 }}>
                        {/* Opslaan knop */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginBottom: '0.5rem' }}>
                          <button onClick={async () => {
                            await saveLes(dagEditLes);
                            setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); setDagEditLes(null);
                          }} disabled={saving}
                            style={{ ...btn, background: '#1a7a2e', color: 'white', padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                            {saving ? 'Opslaan...' : 'Opslaan'}
                          </button>
                          <button onClick={() => { setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); setDagEditLes(null); }}
                            style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                            Inklappen
                          </button>
                        </div>

                        {/* Toets strip */}
                        <div style={{ background: '#fafafa', borderRadius: 8, padding: '0.4rem 0.6rem', marginBottom: '0.5rem', border: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.72rem', color: '#374151', marginRight: 3 }}>Toets</span>
                            <select value={dagNewToets.type} onChange={e => setDagNewToets({ ...dagNewToets, type: e.target.value })}
                              style={{ border: '1px solid #d1d5db', borderRadius: 5, padding: '0.2rem 0.3rem', fontSize: '0.72rem', fontWeight: 600, color: toetsKleuren[dagNewToets.type] }}>
                              {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}
                            </select>
                            <input value={dagNewToets.naam} onChange={e => setDagNewToets({ ...dagNewToets, naam: e.target.value })}
                              placeholder="Naam..." onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); } }}
                              style={{ flex: 1, minWidth: 80, border: '1px solid #d1d5db', borderRadius: 5, padding: '0.2rem 0.4rem', fontSize: '0.72rem' }} />
                            <button onClick={async () => {
                              if (!dagNewToets.naam.trim()) return;
                              await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ klas_id: dagEditLes.klas_id, naam: dagNewToets.naam, type: dagNewToets.type, datum: dagEditLes.datum, kleur: toetsKleuren[dagNewToets.type] || '#6B7280' }) });
                              setDagNewToets({ naam: '', type: 'SO' }); fetchToetsen();
                            }} style={{ ...btn, background: toetsKleuren[dagNewToets.type], color: 'white', padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}>+ Toevoegen</button>
                          </div>
                          {cellToetsen.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                              {cellToetsen.map(t => (
                                <span key={t.id} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280',
                                  padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700,
                                }}>
                                  {t.type}: {t.naam}
                                  <button onClick={() => deleteToets(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.6rem', padding: 0 }}>✕</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Lesvoorbereiding editor */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <RichTextEditor
                            label="Lesvoorbereiding" labelColor={kleur}
                            content={buildCombinedContent(dagEditLes)}
                            onChange={val => { const parsed = parseCombinedContent(val); setDagEditLes({ ...dagEditLes, ...parsed }); }}
                            placeholder="" minHeight={160}
                          />
                        </div>

                        {/* Leerdoelen */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <RichTextEditor
                            label="Leerdoelen" labelColor="#2563EB"
                            content={dagEditLes.leerdoelen || ''}
                            onChange={val => setDagEditLes({ ...dagEditLes, leerdoelen: val })}
                            placeholder="Wat moeten leerlingen aan het einde van de les kunnen?"
                            minHeight={50}
                          />
                        </div>

                        {/* Niet vergeten */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <RichTextEditor
                            label="Niet vergeten" labelColor="#DC2626"
                            content={dagEditLes.niet_vergeten || ''}
                            onChange={val => setDagEditLes({ ...dagEditLes, niet_vergeten: val })}
                            placeholder="Reminders voor jezelf"
                            minHeight={35}
                          />
                        </div>

                        {/* Opslaan onderaan */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button onClick={async () => {
                            await saveLes(dagEditLes);
                            setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); setDagEditLes(null);
                          }} disabled={saving}
                            style={{ ...btn, background: '#1a7a2e', color: 'white', padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                            {saving ? 'Opslaan...' : 'Opslaan'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════ */}
      {/* KLASPLANNER VIEW */}
      {/* ═══════════════════════════════════════════════════ */}
      {view === 'klas' && (() => {
        const klas = klassen.find(k => k.id === selectedKlasId);
        const kleur = selectedKlasId ? (klasKleurMap[selectedKlasId] || '#6B7280') : '#6B7280';
        // Build 2 weeks
        const weeks: { weekNr: number; weekStart: string; days: string[] }[] = [];
        for (let w = 0; w < 2; w++) {
          const ws = new Date(new Date(klasWeekStart + 'T12:00:00').getTime() + w * 7 * 86400000);
          const wsStr = getMonday(ws).toISOString().split('T')[0];
          weeks.push({ weekNr: getWeekNumber(wsStr), weekStart: wsStr, days: getDaysOfWeek(wsStr) });
        }

        // Get rooster slots for this klas grouped by day
        const klasSlots = allRooster.filter(r => r.klas_id === selectedKlasId).sort((a, b) => a.dag - b.dag || a.uur - b.uur);
        const slotsByDay: Record<number, number[]> = {};
        klasSlots.forEach(s => {
          if (!slotsByDay[s.dag]) slotsByDay[s.dag] = [];
          slotsByDay[s.dag].push(s.uur);
        });

        // Jaarplanner for this klas
        const jpKlas = klas ? jaarplanners.find(jp => jp.vak === klas.vak && jp.jaarlaag === klas.jaarlaag) : null;

        // Render a single week column
        const renderWeekColumn = (week: typeof weeks[0]) => {
          // Collect all lessons for this week, ordered by day/uur
          const entries: { dag: number; uur: number; isBlok: boolean; datum: string }[] = [];
          Object.entries(slotsByDay).sort(([a],[b]) => Number(a)-Number(b)).forEach(([dagStr, uren]) => {
            const dag = Number(dagStr);
            uren.forEach(uur => {
              if (isBlokuurSecond(dag, uur)) return;
              entries.push({ dag, uur, isBlok: isBlokuurStart(dag, uur), datum: week.days[dag - 1] });
            });
          });

          return (
            <div key={week.weekNr} style={{ flex: 1, minWidth: 0 }}>
              {/* Week header */}
              <div style={{
                background: week.days.includes(today) ? '#1a7a2e' : '#374151',
                borderRadius: '12px 12px 0 0',
                padding: '0.8rem 1rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>Week {week.weekNr}</div>
                <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', fontWeight: 500, marginTop: 2 }}>{formatDate(week.days[0])} – {formatDate(week.days[4])}</div>
              </div>
              {/* Lessons */}
              <div style={{
                border: '1px solid #d1d5db', borderTop: 'none', borderRadius: '0 0 12px 12px',
                background: 'white', overflow: 'hidden',
              }}>
                {entries.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>Geen lessen</div>
                )}
                {entries.map(({ dag, uur, isBlok, datum }) => {
                  const vakantie = isInVakantie(datum, vakanties);
                  const les = extraLessen.find(l => l.klas_id === selectedKlasId && l.datum === datum && l.uur === uur);
                  const cellToetsen = toetsen.filter(t => t.datum === datum && t.klas_id === selectedKlasId);
                  const slotKey = `klas-${datum}-${uur}`;
                  const isExpanded = expandedDagSlots.has(slotKey);
                  const klasEditLes = dagEditLessen[slotKey] || null;
                  const klasNewToets = dagNewToetsen[slotKey] || { naam: '', type: 'SO' };
                  const setKlasEditLes = (l: Les | null) => setDagEditLessen(prev => l ? { ...prev, [slotKey]: l } : (() => { const n = { ...prev }; delete n[slotKey]; return n; })());
                  const setKlasNewToets = (v: { naam: string; type: string }) => setDagNewToetsen(prev => ({ ...prev, [slotKey]: v }));

                  // Jaarplanner context for this lesson
                  const lesWeek = getWeekNumber(datum);
                  const jpWeeks = jpKlas ? getJaarplannerWeeks(jpKlas, lesWeek) : [];

                  if (vakantie) return (
                    <div key={slotKey} style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #f1f5f9', background: '#fef2f2' }}>
                      <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>{dagNamen[dag - 1]} – {vakantie.naam}</span>
                    </div>
                  );

                  return (
                    <div key={slotKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {/* Day header (clickable) */}
                      <div
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; });
                            setKlasEditLes(null);
                          } else {
                            setExpandedDagSlots(prev => new Set(prev).add(slotKey));
                            setKlasEditLes(les || emptyLes(selectedKlasId!, datum, uur));
                          }
                        }}
                        style={{
                          display: 'flex', gap: '0.7rem', padding: '0.6rem 0.8rem', cursor: 'pointer',
                          background: isExpanded ? kleur + '10' : datum === today ? '#f0fdf4' : 'transparent',
                          alignItems: 'flex-start',
                        }}
                      >
                        {/* Date block */}
                        <div style={{
                          width: 48, flex: '0 0 auto', textAlign: 'center',
                          background: datum === today ? '#1a7a2e' : kleur, borderRadius: 8, padding: '0.35rem 0.15rem',
                        }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>
                            {new Date(datum + 'T12:00:00').getDate()}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginTop: 1 }}>
                            {dagNamen[dag - 1].slice(0, 2)}
                          </div>
                          <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
                            {isBlok ? `${uur}–${uur + 1}` : `Les ${uur}`}
                          </div>
                        </div>
                        {/* Content preview */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1f2937' }}>
                              {les?.programma ? stripHtml(les.programma).split('\n')[0].slice(0, 60) || '\u00A0' : ''}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          {cellToetsen.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: 3 }}>
                              {cellToetsen.map(t => (
                                <span key={t.id} style={{
                                  background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280',
                                  padding: '0.05rem 5px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
                                }}>{t.type}: {t.naam}</span>
                              ))}
                            </div>
                          )}
                          {!isExpanded && !les?.programma && (
                            <div style={{ color: '#d4d4d4', fontSize: '0.8rem', marginTop: 2 }}>+ plan les</div>
                          )}
                        </div>
                      </div>

                      {/* Expanded editor */}
                      {isExpanded && klasEditLes && (
                        <div style={{ padding: '0.5rem 0.8rem', background: '#fafafa', borderTop: `1px solid ${kleur}15`, display: 'flex', gap: '0.75rem' }}>

                          {/* Jaarplanner zijpaneel */}
                          {jpKlas && (
                            <div style={{ width: 180, flex: '0 0 auto', paddingRight: '0.5rem', borderRight: '1px solid #e5e7eb', overflow: 'auto', maxHeight: 400 }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Jaarplanner</div>
                              {jpWeeks.map((weekData, weekIdx) => {
                                const weekNum = lesWeek - 1 + weekIdx;
                                const isCenter = weekIdx === 1;
                                return (
                                  <div key={weekIdx} style={{
                                    marginBottom: '0.4rem', padding: '0.3rem 0.4rem',
                                    background: isCenter ? '#f0fdf4' : '#fafafa', borderRadius: 5,
                                    border: isCenter ? '2px solid #1a7a2e' : '1px solid #e5e7eb',
                                  }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: isCenter ? '#1a7a2e' : '#6B7280', marginBottom: '0.15rem' }}>Wk {weekNum}</div>
                                    {weekData.length === 0 ? (
                                      <div style={{ fontSize: '0.6rem', color: '#b0b0b0' }}>—</div>
                                    ) : weekData.map((row, ri) => (
                                      <div key={ri} style={{ marginBottom: '0.2rem', fontSize: '0.62rem' }}>
                                        <div style={{ fontWeight: 600, color: '#374151' }}>Les {row.les}</div>
                                        {row.planning && <div style={{ color: '#4B5563', lineHeight: 1.3 }}>{row.planning}</div>}
                                        {row.toetsen && <div style={{ color: '#DC2626', fontWeight: 600 }}>{row.toetsen}</div>}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Editor */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Toets strip */}
                            <div style={{ background: 'white', borderRadius: 6, padding: '0.3rem 0.5rem', marginBottom: '0.4rem', border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.68rem', color: '#374151' }}>Toets</span>
                                <select value={klasNewToets.type} onChange={e => setKlasNewToets({ ...klasNewToets, type: e.target.value })}
                                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem 0.25rem', fontSize: '0.68rem', fontWeight: 600, color: toetsKleuren[klasNewToets.type] }}>
                                  {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}
                                </select>
                                <input value={klasNewToets.naam} onChange={e => setKlasNewToets({ ...klasNewToets, naam: e.target.value })}
                                  placeholder="Naam..." onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                                  style={{ flex: 1, minWidth: 60, border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem 0.3rem', fontSize: '0.68rem' }} />
                                <button onClick={async () => {
                                  if (!klasNewToets.naam.trim()) return;
                                  await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ klas_id: klasEditLes.klas_id, naam: klasNewToets.naam, type: klasNewToets.type, datum: klasEditLes.datum, kleur: toetsKleuren[klasNewToets.type] || '#6B7280' }) });
                                  setKlasNewToets({ naam: '', type: 'SO' }); fetchToetsen();
                                }} style={{ ...btn, background: toetsKleuren[klasNewToets.type], color: 'white', padding: '0.15rem 0.4rem', fontSize: '0.68rem' }}>+ Toevoegen</button>
                              </div>
                              {cellToetsen.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                                  {cellToetsen.map(t => (
                                    <span key={t.id} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 2,
                                      background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280',
                                      padding: '0.05rem 0.3rem', borderRadius: 3, fontSize: '0.63rem', fontWeight: 700,
                                    }}>
                                      {t.type}: {t.naam}
                                      <button onClick={() => deleteToets(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.55rem', padding: 0 }}>✕</button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Lesvoorbereiding */}
                            <div style={{ marginBottom: '0.4rem' }}>
                              <RichTextEditor
                                label="Lesvoorbereiding" labelColor={kleur}
                                content={buildCombinedContent(klasEditLes)}
                                onChange={val => { const parsed = parseCombinedContent(val); setKlasEditLes({ ...klasEditLes, ...parsed }); }}
                                placeholder="" minHeight={120}
                              />
                            </div>
                            {/* Leerdoelen */}
                            <div style={{ marginBottom: '0.4rem' }}>
                              <RichTextEditor
                                label="Leerdoelen" labelColor="#2563EB"
                                content={klasEditLes.leerdoelen || ''}
                                onChange={val => setKlasEditLes({ ...klasEditLes, leerdoelen: val })}
                                placeholder="Wat moeten leerlingen aan het einde van de les kunnen?"
                                minHeight={40}
                              />
                            </div>
                            {/* Niet vergeten */}
                            <div style={{ marginBottom: '0.4rem' }}>
                              <RichTextEditor
                                label="Niet vergeten" labelColor="#DC2626"
                                content={klasEditLes.niet_vergeten || ''}
                                onChange={val => setKlasEditLes({ ...klasEditLes, niet_vergeten: val })}
                                placeholder="Reminders voor jezelf"
                                minHeight={30}
                              />
                            </div>
                            {/* Opslaan */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.3rem' }}>
                              <button onClick={async () => {
                                await saveLes(klasEditLes);
                                setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); setKlasEditLes(null);
                                fetchExtraLessen(klasWeekStart);
                              }} disabled={saving}
                                style={{ ...btn, background: '#1a7a2e', color: 'white', padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}>
                                {saving ? 'Opslaan...' : 'Opslaan'}
                              </button>
                              <button onClick={() => { setExpandedDagSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); setKlasEditLes(null); }}
                                style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}>
                                Inklappen
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        };

        return (
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!klas ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Selecteer een klas</div>
            ) : (
              <div style={{ display: 'flex', gap: '1rem' }}>
                {weeks.map(w => renderWeekColumn(w))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════ */}
      {/* JAARLAAG PLANNER VIEW */}
      {/* ═══════════════════════════════════════════════════ */}
      {view === 'jaarlaag' && (() => {
        const jaarlaagKlassen = klassen.filter(k => k.jaarlaag === selectedJaarlaag);
        // Build 6 weeks
        const weeks: { weekNr: number; weekStart: string; days: string[] }[] = [];
        for (let w = 0; w < 6; w++) {
          const ws = new Date(new Date(jaarlaagWeekStart + 'T12:00:00').getTime() + w * 7 * 86400000);
          const wsStr = getMonday(ws).toISOString().split('T')[0];
          weeks.push({ weekNr: getWeekNumber(wsStr), weekStart: wsStr, days: getDaysOfWeek(wsStr) });
        }

        return (
          <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid #d4d4d4' }}>
            {jaarlaagKlassen.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Geen klassen voor jaarlaag "{selectedJaarlaag}"</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 60 }}>Week</th>
                    {jaarlaagKlassen.map((k, i) => (
                      <th key={k.id} style={{ ...th, color: klasKleuren[klassen.indexOf(k) % klasKleuren.length] }}>
                        {k.naam}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map(w => {
                    const isCurrentWeek = w.days.includes(today);
                    return (
                      <tr key={w.weekNr}>
                        <td style={{
                          ...td, textAlign: 'center', fontWeight: 700, fontSize: '0.82rem',
                          background: isCurrentWeek ? '#dcfce7' : '#fafafa', color: isCurrentWeek ? '#1a7a2e' : '#9CA3AF',
                        }}>
                          <div>{w.weekNr}</div>
                          <div style={{ fontSize: '0.6rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(w.days[0])}</div>
                        </td>
                        {jaarlaagKlassen.map(k => {
                          const kleur = klasKleurMap[k.id] || '#6B7280';
                          // Find lessons for this class in this week
                          const weekLessen = extraLessen.filter(l => l.klas_id === k.id && w.days.includes(l.datum)).sort((a, b) => a.datum.localeCompare(b.datum) || (a.uur || 0) - (b.uur || 0));
                          const weekToetsen = toetsen.filter(t => t.klas_id === k.id && w.days.includes(t.datum));
                          const vakantie = isInVakantie(w.days[0], vakanties);
                          // Count total planned
                          const planned = weekLessen.filter(l => l.programma).length;
                          const klasSlotCount = allRooster.filter(r => r.klas_id === k.id).length;

                          if (vakantie) return (
                            <td key={k.id} style={{ ...td, background: '#fef2f2', textAlign: 'center', fontSize: '0.65rem', color: '#f87171' }}>{vakantie.naam}</td>
                          );

                          return (
                            <td key={k.id}
                              onClick={() => {
                                // Open first unplanned lesson of the week for this class
                                const slots = allRooster.filter(r => r.klas_id === k.id).sort((a, b) => a.dag - b.dag || a.uur - b.uur);
                                const firstSlot = slots[0];
                                if (firstSlot) {
                                  const datum = w.days[firstSlot.dag - 1];
                                  const existing = weekLessen.find(l => l.datum === datum && l.uur === firstSlot.uur);
                                  setEditingLes(existing || emptyLes(k.id, datum, firstSlot.uur));
                                }
                              }}
                              style={{
                                ...td, cursor: 'pointer', borderLeft: `3px solid ${kleur}`,
                                background: isCurrentWeek ? '#f0fdf4' : planned > 0 ? 'white' : '#fcfcfc',
                                height: 80,
                              }}
                            >
                              {/* Progress indicator */}
                              <div style={{ fontSize: '0.62rem', color: '#9CA3AF', marginBottom: 3 }}>
                                {planned}/{klasSlotCount} gepland
                              </div>

                              {/* Toetsen */}
                              {weekToetsen.map(t => (
                                <div key={t.id} style={{
                                  background: (toetsKleuren[t.type] || '#6B7280') + '15', color: toetsKleuren[t.type] || '#6B7280',
                                  padding: '0 3px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 700, marginBottom: 2,
                                }}>{t.type}: {t.naam.length > 12 ? t.naam.slice(0, 12) + '..' : t.naam}</div>
                              ))}

                              {/* Lesson summaries */}
                              {weekLessen.filter(l => l.programma).slice(0, 3).map((l, i) => (
                                <div key={i} style={{ fontSize: '0.65rem', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                                  {dagNamen[(new Date(l.datum + 'T12:00:00').getDay() - 1)]?.slice(0, 2)} {l.uur}: {stripHtml(l.programma).slice(0, 30)}
                                </div>
                              ))}

                              {planned === 0 && weekToetsen.length === 0 && (
                                <div style={{ color: '#d4d4d4', fontSize: '0.65rem', marginTop: 2 }}>+</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      {/* ── Les Planning Modal ── */}
      {editingLes && (() => {
        const klas = klassen.find(k => k.id === editingLes.klas_id);
        const kleur = klasKleurMap[editingLes.klas_id] || '#1a7a2e';
        const dagIdx = new Date(editingLes.datum + 'T12:00:00').getDay() - 1;
        const modalToetsen = toetsen.filter(t => t.datum === editingLes.datum && t.klas_id === editingLes.klas_id);
        const jaarplanner = getJaarplannerForLesson(editingLes);
        const lesWeek = getWeekNumber(editingLes.datum);
        const jaarplannerWeeks = jaarplanner ? getJaarplannerWeeks(jaarplanner, lesWeek) : [];

        return (
          <div style={overlay} onClick={() => setEditingLes(null)}>
            <div style={{ ...modal, maxWidth: 1200, display: 'flex', gap: '1.5rem' }} onClick={e => e.stopPropagation()}>

            {/* ── Left column: Jaarplanner reference ── */}
            {jaarplanner && (
              <div style={{ width: 280, flex: '0 0 auto', paddingRight: '1rem', borderRight: '1px solid #e5e7eb', overflow: 'auto', maxHeight: '85vh' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Jaarplanner</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a7a2e' }}>{jaarplanner.naam}</div>
                </div>

                {/* Three weeks from jaarplanner */}
                {jaarplannerWeeks.map((weekData, weekIdx) => {
                  const weekNum = lesWeek - 1 + weekIdx;
                  const isCenterWeek = weekIdx === 1;

                  return (
                    <div key={weekIdx} style={{
                      marginBottom: '1rem',
                      padding: '0.6rem 0.7rem',
                      background: isCenterWeek ? '#f0fdf4' : '#fafafa',
                      borderRadius: 8,
                      border: isCenterWeek ? '2px solid #1a7a2e' : '1px solid #e5e7eb',
                    }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isCenterWeek ? '#1a7a2e' : '#6B7280', marginBottom: '0.4rem' }}>
                        Week {weekNum}
                      </div>

                      {weekData.length === 0 ? (
                        <div style={{ fontSize: '0.72rem', color: '#b0b0b0', fontStyle: 'italic' }}>—</div>
                      ) : (
                        weekData.map((row, rowIdx) => (
                          <div key={rowIdx} style={{ marginBottom: '0.5rem', fontSize: '0.73rem' }}>
                            <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.15rem' }}>
                              Les {row.les}
                            </div>
                            {row.planning && (
                              <div style={{ color: '#4B5563', marginBottom: '0.15rem', lineHeight: 1.3 }}>
                                {row.planning}
                              </div>
                            )}
                            {row.toetsen && (
                              <div style={{ color: '#DC2626', fontWeight: 600, fontSize: '0.7rem' }}>
                                {row.toetsen}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Right column: Main editor ── */}
            <div style={{ flex: 1, overflow: 'auto', maxHeight: '85vh' }}>
              {/* ── Header: klas + datum + opslaan + kopieer ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 6, height: 32, borderRadius: 3, background: kleur }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: kleur }}>{klas?.naam}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      Les {editingLes.uur || ''} &middot; {dagNamen[dagIdx]} {formatDate(editingLes.datum)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={async () => { await saveLes(editingLes); setEditingLes(null); }} disabled={saving}
                    style={{ ...btn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}>
                    {saving ? 'Opslaan...' : 'Opslaan'}
                  </button>

                  {/* Copy dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setCopyDropdownOpen(!copyDropdownOpen)}
                      style={{ ...btn, background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}>
                      ⧉ Kopieer
                    </button>
                    {copyDropdownOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: '0.3rem',
                        background: 'white', borderRadius: 8, border: '1px solid #d1d5db',
                        boxShadow: '0 10px 15px rgba(0,0,0,0.1)', zIndex: 100,
                      }}>
                        <button onClick={() => {
                          setCopySource(editingLes);
                          setEditingLes(null);
                          setCopyDropdownOpen(false);
                        }} style={{
                          display: 'block', width: '100%', padding: '0.5rem 0.8rem',
                          background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', fontSize: '0.8rem', fontWeight: 500,
                          color: '#374151', borderBottom: '1px solid #e5e7eb',
                        }}>
                          Kopieer naar andere klas
                        </button>
                        <button onClick={() => {
                          const plainText = stripHtml(buildCombinedContent(editingLes));
                          copyToClipboard(plainText);
                          setCopyDropdownOpen(false);
                        }} style={{
                          display: 'block', width: '100%', padding: '0.5rem 0.8rem',
                          background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', fontSize: '0.8rem', fontWeight: 500,
                          color: '#374151',
                        }}>
                          Kopieer als tekst
                        </button>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setEditingLes(null)} style={closeBtn}>✕</button>
                </div>
              </div>

              {/* ── Toets toevoegen strip ── */}
              <div style={{
                background: '#fafafa', borderRadius: 10, padding: '0.5rem 0.7rem', marginBottom: '0.75rem',
                border: '1px solid #e5e7eb',
              }}>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#374151', marginRight: 4 }}>Toets</span>
                  <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.28rem 0.4rem', fontSize: '0.76rem', fontWeight: 600, color: toetsKleuren[newToets.type] }}>
                    {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}
                  </select>
                  <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })}
                    placeholder="Naam toets..." onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addToetsBtn')?.click(); } }}
                    style={{ flex: 1, minWidth: 120, border: '1px solid #d1d5db', borderRadius: 6, padding: '0.28rem 0.5rem', fontSize: '0.76rem' }} />
                  <button id="addToetsBtn" onClick={async () => {
                    if (!newToets.naam.trim()) return; setSaving(true);
                    await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ klas_id: editingLes.klas_id, naam: newToets.naam, type: newToets.type, datum: editingLes.datum, kleur: toetsKleuren[newToets.type] || '#6B7280' }) });
                    setSaving(false); setNewToets({ naam: '', type: 'SO' }); fetchToetsen();
                  }} style={{ ...btn, background: toetsKleuren[newToets.type], color: 'white', padding: '0.28rem 0.55rem', fontSize: '0.76rem' }}>+ Toevoegen</button>
                </div>

                {/* Bestaande toetsen */}
                {modalToetsen.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {modalToetsen.map(t => (
                      <span key={t.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        background: (toetsKleuren[t.type] || '#6B7280') + '15',
                        color: toetsKleuren[t.type] || '#6B7280',
                        padding: '0.15rem 0.45rem', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700,
                      }}>
                        {t.type}: {t.naam}
                        <button onClick={() => deleteToets(t.id)}
                          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.65rem', padding: 0 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Hoofdblok: Terugkijken + Programma + Maak-/Huiswerk in één editor ── */}
              <div style={{ marginBottom: '0.75rem' }}>
                <RichTextEditor
                  label="Lesvoorbereiding"
                  labelColor={kleur}
                  content={buildCombinedContent(editingLes)}
                  onChange={val => {
                    const parsed = parseCombinedContent(val);
                    setEditingLes({ ...editingLes, ...parsed });
                  }}
                  placeholder=""
                  minHeight={220}
                />
              </div>

              {/* ── Leerdoelen: apart blok ── */}
              <div style={{ marginBottom: '0.75rem' }}>
                <RichTextEditor
                  label="Leerdoelen"
                  labelColor="#2563EB"
                  content={editingLes.leerdoelen || ''}
                  onChange={val => setEditingLes({ ...editingLes, leerdoelen: val })}
                  placeholder="Wat moeten leerlingen aan het einde van de les kunnen?"
                  minHeight={60}
                />
              </div>

              {/* ── Niet vergeten (compact) ── */}
              <div style={{ marginBottom: '0.75rem' }}>
                <RichTextEditor
                  label="Niet vergeten"
                  labelColor="#DC2626"
                  content={editingLes.niet_vergeten || ''}
                  onChange={val => setEditingLes({ ...editingLes, niet_vergeten: val })}
                  placeholder="Reminders voor jezelf"
                  minHeight={40}
                />
              </div>

              {/* ── Opslaan/Annuleren (at bottom) ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => setEditingLes(null)} style={{ ...btn, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
              </div>
            </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ───── Styles ───── */
const th: React.CSSProperties = { padding: '0.5rem', background: '#f0fdf4', color: '#374151', fontSize: '0.82rem', fontWeight: 600, borderBottom: '2px solid #d4d4d4', position: 'sticky', top: 0, zIndex: 10 };
const td: React.CSSProperties = { padding: '0.3rem 0.35rem', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #f0f0f0', fontSize: '0.78rem', verticalAlign: 'top', height: 70 };
const navBtn: React.CSSProperties = { background: '#e8f5e9', border: 'none', borderRadius: 6, padding: '0.35rem 0.55rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#1a7a2e' };
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modal: React.CSSProperties = { background: 'white', borderRadius: 16, padding: '1.25rem', width: '92vw', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6B7280' };
const miniBtn: React.CSSProperties = { background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: 3, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.6rem', color: '#1a7a2e', fontWeight: 700 };
