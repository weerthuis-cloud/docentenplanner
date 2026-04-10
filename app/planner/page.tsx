'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Editor } from '@tiptap/react';

const InlineEditor = dynamic(() => import('@/components/InlineEditor'), { ssr: false });

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface RoosterSlot { id?: number; klas_id: number; dag: number; uur: number; vak: string; lokaal: string; is_blokuur: boolean; periode_id?: number; }
interface Les { id?: number; klas_id: number; datum: string; uur: number | null; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; notities: string; custom_velden?: Record<string, string>; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; kleur: string; les_id: number | null; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; type?: 'vakantie' | 'toetsweek' | 'studiedag'; }
interface Jaarplanner { id: number; vak: string; jaarlaag: string; schooljaar: string; naam: string; data: Array<{ week: number; les: number; planning: string; toetsen: string }>; created_at: string; }
interface RoosterPeriode { id: number; naam: string; start_datum: string; eind_datum: string; bron: string; created_at: string; }
interface Vervallen { id: number; datum: string; uur: number | null; reden: string; created_at: string; }
interface LesveldConfig { id: number; veld_key: string; label: string; icoon: string; zichtbaar: boolean; volgorde: number; is_custom: boolean; }

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
function kalenderKleur(v: Vakantie | null): { bg: string; text: string; accent: string } {
  if (!v) return { bg: '#f9fafb', text: '#6B7280', accent: '#d1d5db' };
  if (v.type === 'toetsweek') return { bg: '#fef2f2', text: '#dc2626', accent: '#fca5a5' };
  if (v.type === 'studiedag') return { bg: '#eff6ff', text: '#2563EB', accent: '#93c5fd' };
  return { bg: '#fefce8', text: '#ca8a04', accent: '#fde68a' }; // vakantie
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

  const [view, setView] = useState<'overzicht' | 'week' | 'dag' | 'klas' | 'jaarlaag' | 'rooster' | 'instellingen'>('overzicht');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedKlasId, setSelectedKlasId] = useState<number | null>(null);
  const [selectedJaarlaag, setSelectedJaarlaag] = useState('');
  const [klasWeekStart, setKlasWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [jaarlaagWeekStart, setJaarlaagWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
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
  const [zermeloNieuwStart, setZermeloNieuwStart] = useState('');
  const [zermeloNieuwEind, setZermeloNieuwEind] = useState('');
  const [zermeloWeekStart, setZermeloWeekStart] = useState('');
  const [showNewKlasForm, setShowNewKlasForm] = useState(false);
  // Inline toets aanmaken in cel: key = "klas_id-datum"
  const [inlineToetsCell, setInlineToetsCell] = useState<string | null>(null);
  const [inlineToetsType, setInlineToetsType] = useState('SO');
  const [inlineToetsNaam, setInlineToetsNaam] = useState('');

  // Rooster weeknavigatie + vervallen
  const [roosterWeekStart, setRoosterWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [vervallen, setVervallen] = useState<Vervallen[]>([]);
  const [vervallenReden, setVervallenReden] = useState('');
  const [editVervallenId, setEditVervallenId] = useState<number | null>(null);

  // Lesveld configuratie
  const [lesveldConfig, setLesveldConfig] = useState<LesveldConfig[]>([]);
  const [showLesveldSettings, setShowLesveldSettings] = useState(false);
  const [newLesveldLabel, setNewLesveldLabel] = useState('');
  const [newLesveldIcoon, setNewLesveldIcoon] = useState('📌');

  // Overzicht aanpasbaar
  const [overzichtItems, setOverzichtItems] = useState<Array<{ id: number; type: string; titel: string; inhoud: string; datum: string | null; kleur: string }>>([]);
  const [overzichtInstellingen, setOverzichtInstellingen] = useState<Record<string, boolean>>({ vandaag: true, lege_lessen: true, komende_toetsen: true, notities: true, agenda: true });
  const [showOverzichtSettings, setShowOverzichtSettings] = useState(false);
  const [editOvItemId, setEditOvItemId] = useState<number | null>(null);

  // Kopieer/verplaats les
  const [showKopieerModal, setShowKopieerModal] = useState<'kopieer' | null>(null);
  const [kopieerDoelKlas, setKopieerDoelKlas] = useState<number | ''>('');
  const [kopieerDoelDatum, setKopieerDoelDatum] = useState('');
  const [kopieerDoelUur, setKopieerDoelUur] = useState<number | ''>('');
  const [kopieerStatus, setKopieerStatus] = useState('');

  // Werklijst sidebar
  interface WerklijstItem { id: number; titel: string; categorie: string; kleur: string; sub: string; datum: string | null; afgerond: boolean; volgorde: number; }
  const [werklijst, setWerklijst] = useState<WerklijstItem[]>([]);
  const [showWerklijstForm, setShowWerklijstForm] = useState(false);
  const [nieuwWerkItem, setNieuwWerkItem] = useState({ titel: '', categorie: 'taak', sub: '', datum: '' });
  const [werklijstTab, setWerklijstTab] = useState<'werklijst' | 'notities'>('werklijst');

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

  const fetchLesveldConfig = useCallback(() => {
    fetch('/api/lesvelden').then(r => r.json()).then(setLesveldConfig);
  }, []);

  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen);
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
    fetch('/api/jaarplanners').then(r => r.json()).then(setJaarplanners);
    fetchPeriodes();
    fetchLesveldConfig();
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

  const fetchVervallen = useCallback(() => {
    fetch('/api/vervallen').then(r => r.json()).then(setVervallen);
  }, []);

  const fetchOverzichtItems = useCallback(() => {
    fetch('/api/overzicht').then(r => r.json()).then(setOverzichtItems);
  }, []);
  const fetchOverzichtInstellingen = useCallback(() => {
    fetch('/api/overzicht?wat=instellingen').then(r => r.json()).then((data: Array<{ blok: string; zichtbaar: boolean }>) => {
      const map: Record<string, boolean> = {};
      data.forEach(d => { map[d.blok] = d.zichtbaar; });
      setOverzichtInstellingen(map);
    });
  }, []);

  const fetchWerklijst = useCallback(() => {
    fetch('/api/werklijst').then(r => r.json()).then(setWerklijst);
  }, []);

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { fetchLessen(); }, [fetchLessen]);
  useEffect(() => { fetchToetsen(); }, [fetchToetsen]);
  useEffect(() => { fetchVervallen(); }, [fetchVervallen]);
  useEffect(() => { fetchOverzichtItems(); fetchOverzichtInstellingen(); }, [fetchOverzichtItems, fetchOverzichtInstellingen]);
  useEffect(() => { fetchWerklijst(); }, [fetchWerklijst]);
  useEffect(() => { if (klassen.length > 0 && !selectedKlasId) setSelectedKlasId(klassen[0].id); }, [klassen, selectedKlasId]);
  useEffect(() => { if (klassen.length > 0 && !selectedJaarlaag) setSelectedJaarlaag([...new Set(klassen.map(k => k.jaarlaag))][0] || ''); }, [klassen, selectedJaarlaag]);

  /* ───── Helpers ───── */
  const getSlot = (dag: number, uur: number): RoosterSlot | undefined => allRooster.find(r => r.dag === dag && r.uur === uur);
  const getLes = (klas_id: number, datum: string, uur: number): Les | undefined => lessen.find(l => l.klas_id === klas_id && l.datum === datum && l.uur === uur);
  const getToetsenForDateKlas = (datum: string, klas_id: number): Toets[] => toetsen.filter(t => t.datum === datum && t.klas_id === klas_id);
  const isBlokuurStart = (dag: number, uur: number): boolean => { const s = getSlot(dag, uur); const n = getSlot(dag, uur + 1); return !!(s && n && s.klas_id === n.klas_id && s.is_blokuur); };
  const isBlokuurSecond = (dag: number, uur: number): boolean => { const s = getSlot(dag, uur); const p = getSlot(dag, uur - 1); return !!(s && p && s.klas_id === p.klas_id && p.is_blokuur); };
  const canBeBlokuur = (dag: number, uur: number): boolean => { const s = getSlot(dag, uur); const n = getSlot(dag, uur + 1); return !!(s && n && s.klas_id === n.klas_id); };

  /* ───── Lesveld helpers ───── */
  const standardKeys = ['programma', 'startopdracht', 'terugkijken', 'leerdoelen', 'huiswerk', 'niet_vergeten', 'notities'];
  const visibleFields = lesveldConfig.filter(f => f.zichtbaar).sort((a, b) => a.volgorde - b.volgorde);

  function getFieldValue(les: Les, key: string): string {
    if (standardKeys.includes(key)) return (les as unknown as Record<string, string>)[key] || '';
    return (les.custom_velden || {})[key] || '';
  }

  function isFieldFilled(les: Les, key: string): boolean {
    return stripHtml(getFieldValue(les, key)).length > 0;
  }

  /* ───── Vervallen helpers ───── */
  const isVervallenDag = (datum: string): Vervallen | undefined => vervallen.find(v => v.datum === datum && v.uur === null);
  const isVervallenUur = (datum: string, uur: number): Vervallen | undefined => vervallen.find(v => v.datum === datum && v.uur === uur);
  const isVervallen = (datum: string, uur: number): Vervallen | undefined => isVervallenDag(datum) || isVervallenUur(datum, uur);

  async function toggleVervallen(datum: string, uur: number | null, reden?: string) {
    const existing = uur !== null
      ? vervallen.find(v => v.datum === datum && v.uur === uur)
      : vervallen.find(v => v.datum === datum && v.uur === null);
    if (existing) {
      await fetch(`/api/vervallen?id=${existing.id}`, { method: 'DELETE' });
    } else {
      await fetch('/api/vervallen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum, uur, reden: reden || '' }) });
    }
    fetchVervallen();
  }

  async function updateVervallenReden(id: number, reden: string) {
    await fetch('/api/vervallen', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reden }) });
    fetchVervallen();
  }

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
    let updated: Les;
    if (field === 'custom_velden') {
      updated = { ...les, custom_velden: JSON.parse(value) };
    } else {
      updated = { ...les, [field]: value };
    }
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
    const extraVelden = visibleFields.filter(f => f.veld_key !== 'programma');
    const filledExtras = extraVelden.filter(f => isFieldFilled(les, f.veld_key));

    const hasToets = cellToetsen.length > 0;
    const toetsAccent = hasToets ? (toetsKleuren[cellToetsen[0].type] || '#6B7280') : '';

    return (
      <div key={cellKey} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: isBlok ? 210 : 105, borderRadius: 12, overflow: 'hidden', background: hasToets ? toetsAccent + '30' : kleur + '30', cursor: 'pointer', position: 'relative' }}
        onClick={(e) => { if ((e.target as HTMLElement).closest('button') === null && (e.target as HTMLElement).closest('[contenteditable]') === null) setSelectedLesPanel({ klas_id: slot.klas_id, datum, uur: slot.uur }); }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '5px 8px', flexWrap: 'wrap', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'white', background: kleur, padding: '1px 7px', borderRadius: 5 }}>{klas?.naam}</span>
          <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{klas?.lokaal}</span>
          <button onClick={(e) => { e.stopPropagation(); const tk = `${slot.klas_id}-${datum}`; setInlineToetsCell(inlineToetsCell === tk ? null : tk); setInlineToetsNaam(''); setInlineToetsType('SO'); }}
            title="Toets inplannen"
            style={{ background: 'none', border: 'none', color: '#c4892e', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, padding: '0 2px', marginLeft: 'auto', opacity: 0.5 }}>
            +T
          </button>
        </div>
        {/* Toetsen blok */}
        {cellToetsen.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 6px 4px', flexShrink: 0 }}>
            {cellToetsen.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: (toetsKleuren[t.type] || '#6B7280') + '20', color: toetsKleuren[t.type] || '#6B7280', padding: '3px 8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700 }}>
                <span>{t.type}: {t.naam}</span>
                <button onClick={() => deleteToets(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.72rem', padding: 0, marginLeft: 'auto' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {/* Inline toets form */}
        {inlineToetsCell === `${slot.klas_id}-${datum}` && (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 3, padding: '3px 6px', background: '#fef3c7', borderBottom: '1px solid #f59e0b40', alignItems: 'center', flexShrink: 0 }}>
            <select value={inlineToetsType} onChange={e => setInlineToetsType(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 3, padding: '2px 4px', fontSize: '0.9rem', fontWeight: 700 }}>
              {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={inlineToetsNaam} onChange={e => setInlineToetsNaam(e.target.value)} placeholder="Naam..."
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && inlineToetsNaam.trim()) {
                  await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ klas_id: slot.klas_id, naam: inlineToetsNaam.trim(), type: inlineToetsType, datum, kleur: toetsKleuren[inlineToetsType] || '#6B7280' }) });
                  fetch('/api/toetsen').then(r => r.json()).then(setToetsen);
                  setInlineToetsCell(null); setInlineToetsNaam('');
                }
                if (e.key === 'Escape') { setInlineToetsCell(null); setInlineToetsNaam(''); }
              }}
              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 3, padding: '2px 6px', fontSize: '0.9rem', minWidth: 50 }} />
            <button onClick={async () => {
              if (!inlineToetsNaam.trim()) return;
              await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ klas_id: slot.klas_id, naam: inlineToetsNaam.trim(), type: inlineToetsType, datum, kleur: toetsKleuren[inlineToetsType] || '#6B7280' }) });
              fetch('/api/toetsen').then(r => r.json()).then(setToetsen);
              setInlineToetsCell(null); setInlineToetsNaam('');
            }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
              ✓
            </button>
            <button onClick={() => { setInlineToetsCell(null); setInlineToetsNaam(''); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.86rem', padding: 0 }}>✕</button>
          </div>
        )}
        {/* JP suggestie */}
        {jpSuggestion && !les.programma && (
          <div onClick={(e) => { e.stopPropagation(); updateCell(cellKey, les, 'programma', `<p>${jpSuggestion}</p>`); }}
            style={{ padding: '2px 6px', fontSize: '0.88rem', color: '#2d8a4e', background: '#f0fdf4', borderBottom: '1px dashed #bbf7d0', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}
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
              <span key={f.veld_key} title={f.label} style={{ fontSize: '0.8rem', lineHeight: 1, opacity: 0.7 }}>{f.icoon}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ───── Styles ───── */
  const th: React.CSSProperties = { padding: '0.5rem 0.4rem', fontWeight: 700, fontSize: '1.05rem', textAlign: 'center', background: '#f1f5f9', color: '#64748b', borderBottom: '1px solid #e2e8f0' };
  const td: React.CSSProperties = { padding: '6px 5px', borderBottom: 'none', borderRight: 'none', verticalAlign: 'top' };
  const navBtn: React.CSSProperties = { padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white', fontWeight: 600, fontSize: '1.0rem', color: '#334155' };

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
          {(['overzicht', 'week', 'dag', 'klas', 'jaarlaag', 'rooster', 'instellingen'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.45rem 0.85rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem',
              background: view === v ? (v === 'instellingen' ? '#6B7280' : '#2d8a4e') : 'transparent',
              color: view === v ? 'white' : (v === 'instellingen' ? '#6B7280' : '#2d8a4e'),
            }}>{{ overzicht: 'Overzicht', week: 'Week', dag: 'Dag', klas: 'Klas', jaarlaag: 'Jaarlaag', rooster: 'Rooster', instellingen: '⚙ Instellingen' }[v]}</button>
          ))}
        </div>

        {klassen.map((k, i) => (
          <span key={k.id} style={{ padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.92rem', fontWeight: 700,
            background: klasKleuren[i % klasKleuren.length] + '15', color: klasKleuren[i % klasKleuren.length] }}>{k.naam}</span>
        ))}

        <div style={{ flex: 1 }} />

        {saving && <span style={{ fontSize: '0.92rem', color: '#2d8a4e', fontWeight: 600 }}>💾 Opslaan...</span>}

        {/* Overzicht nav */}
        {view === 'overzicht' && (
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        )}

        {/* Week nav */}
        {view === 'week' && (<>
          <button onClick={() => changeWeek(-1)} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', minWidth: 55, textAlign: 'center', fontSize: '1.18rem' }}>Wk {getWeekNumber(weekStart)}</span>
          <button onClick={() => changeWeek(1)} style={navBtn}>▶</button>
          <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Dag nav */}
        {view === 'dag' && (<>
          <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', fontSize: '1.18rem' }}>
            {dagNamen[new Date(selectedDate + 'T12:00:00').getDay() - 1] || 'Weekend'} {formatDate(selectedDate)}
          </span>
          <button onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Klas nav */}
        {view === 'klas' && (<>
          <select value={selectedKlasId || ''} onChange={e => setSelectedKlasId(Number(e.target.value))}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '1.05rem', fontWeight: 600 }}>
            {klassen.map((k, i) => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', fontSize: '1.12rem' }}>Wk {getWeekNumber(klasWeekStart)}–{getWeekNumber(klasWeekStart) + 1}</span>
          <button onClick={() => { const d = new Date(klasWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setKlasWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setKlasWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

        {/* Jaarlaag nav */}
        {view === 'jaarlaag' && (<>
          <select value={selectedJaarlaag} onChange={e => setSelectedJaarlaag(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '1.05rem', fontWeight: 600 }}>
            {[...new Set(klassen.map(k => k.jaarlaag))].map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
          <span style={{ fontWeight: 700, color: '#2d8a4e', fontSize: '1.12rem' }}>Wk {getWeekNumber(jaarlaagWeekStart)}–{getWeekNumber(jaarlaagWeekStart) + 1}</span>
          <button onClick={() => { const d = new Date(jaarlaagWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setJaarlaagWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
          <button onClick={() => setJaarlaagWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, background: '#2d8a4e', color: 'white', border: 'none' }}>Vandaag</button>
        </>)}

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
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 4px', fontSize: '0.95rem', background: 'white', cursor: 'pointer' }}>
            <option value="" disabled>Grootte</option>
            {FONTS.map(s => <option key={s} value={s}>{parseInt(s)}pt</option>)}
          </select>
          <Sep />
          <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#9CA3AF', marginRight: 2 }}>A</span>
            {COLORS.map(c => (
              <button key={c} onClick={() => activeEditor?.chain().focus().setColor(c).run()} style={{ width: 16, height: 16, borderRadius: 3, border: '1px solid #d1d5db', background: c, cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <Sep />
          <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#9CA3AF', marginRight: 2 }}>🖍</span>
            {HIGHLIGHTS.map(c => (
              <button key={c} onClick={() => { if (c === 'transparent') activeEditor?.chain().focus().unsetHighlight().run(); else activeEditor?.chain().focus().setHighlight({ color: c }).run(); }}
                style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${c === 'transparent' ? '#d1d5db' : c}`, background: c === 'transparent' ? 'white' : c, cursor: 'pointer', padding: 0, position: 'relative' }}>
                {c === 'transparent' && <span style={{ position: 'absolute', top: -1, left: 3, fontSize: '0.86rem', color: '#DC2626' }}>✕</span>}
              </button>
            ))}
          </div>
          {!activeEditor && <span style={{ fontSize: '0.92rem', color: '#b0b0b0', marginLeft: '0.5rem' }}>Klik in een cel om te bewerken</span>}
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

          const ovNotities = overzichtItems.filter(i => i.type === 'notitie');
          const ovAgenda = overzichtItems.filter(i => i.type === 'agenda').sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
          const blokZichtbaar = (blok: string) => overzichtInstellingen[blok] !== false;

          return (
            <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* Vandaag */}
              {blokZichtbaar('vandaag') && <div>
                <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#2d8a4e', marginBottom: '0.75rem' }}>Vandaag ({dagNamen[todayDagNum - 1] || 'Weekend'})</h2>
                {todayVakantie ? (
                  <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: '1.18rem', fontWeight: 600 }}>{todayVakantie.naam}</div>
                ) : todaySlots.length === 0 ? (
                  <div style={{ padding: '1rem', background: '#f3f4f6', borderRadius: 8, color: '#9CA3AF', fontSize: '1.18rem' }}>Geen lessen vandaag</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {todaySlots.map(slot => {
                      const les = getLes(slot.klas_id, today, slot.uur);
                      const klas = klassen.find(k => k.id === slot.klas_id);
                      const kleur = klasKleurMap[slot.klas_id] || '#6B7280';
                      const ovExtraVelden = visibleFields.filter(f => f.veld_key !== 'programma');
                      const filledFields = les ? ovExtraVelden.filter(f => isFieldFilled(les, f.veld_key)) : [];
                      const ovToetsen = getToetsenForDateKlas(today, slot.klas_id);
                      const ovToetsKey = `${slot.klas_id}-${today}`;
                      return (
                        <div key={slot.uur} onClick={() => setSelectedLesPanel({ klas_id: slot.klas_id, datum: today, uur: slot.uur })}
                          style={{ padding: '0.75rem 1rem', background: kleur + '30', borderRadius: 12, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.18rem', color: 'white', background: kleur, padding: '1px 8px', borderRadius: 5 }}>{slot.uur}</span>
                            <span style={{ fontSize: '1.12rem', fontWeight: 600, color: '#374151' }}>{klas?.naam}</span>
                            <span style={{ fontSize: '1.0rem', color: '#9CA3AF' }}>({klas?.lokaal})</span>
                            <button onClick={(e) => { e.stopPropagation(); setInlineToetsCell(inlineToetsCell === ovToetsKey ? null : ovToetsKey); setInlineToetsNaam(''); setInlineToetsType('SO'); }}
                              title="Toets inplannen" style={{ background: 'none', border: 'none', color: '#c4892e', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, padding: '0 2px', marginLeft: 'auto', opacity: 0.5 }}>+T</button>
                            {filledFields.length > 0 && (
                              <span style={{ display: 'flex', gap: 3 }}>
                                {filledFields.map(f => <span key={f.veld_key} title={f.label} style={{ fontSize: '0.86rem', opacity: 0.7 }}>{f.icoon}</span>)}
                              </span>
                            )}
                          </div>
                          {/* Toetsen blok */}
                          {ovToetsen.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
                              {ovToetsen.map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: (toetsKleuren[t.type] || '#6B7280') + '20', color: toetsKleuren[t.type] || '#6B7280', padding: '3px 8px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 700 }}>
                                  <span>{t.type}: {t.naam}</span>
                                  <button onClick={(e) => { e.stopPropagation(); deleteToets(t.id); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.72rem', padding: 0, marginLeft: 'auto' }}>✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Inline toets form in overzicht */}
                          {inlineToetsCell === ovToetsKey && (
                            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, padding: '4px 0', alignItems: 'center' }}>
                              <select value={inlineToetsType} onChange={e => setInlineToetsType(e.target.value)}
                                style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 4px', fontSize: '1.0rem', fontWeight: 700 }}>
                                {Object.entries(toetsLabels).map(([k]) => <option key={k} value={k}>{k}</option>)}
                              </select>
                              <input value={inlineToetsNaam} onChange={e => setInlineToetsNaam(e.target.value)} placeholder="Naam toets..."
                                autoFocus
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && inlineToetsNaam.trim()) {
                                    await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ klas_id: slot.klas_id, naam: inlineToetsNaam.trim(), type: inlineToetsType, datum: today, kleur: toetsKleuren[inlineToetsType] || '#6B7280' }) });
                                    fetch('/api/toetsen').then(r => r.json()).then(setToetsen);
                                    setInlineToetsCell(null); setInlineToetsNaam('');
                                  }
                                  if (e.key === 'Escape') { setInlineToetsCell(null); setInlineToetsNaam(''); }
                                }}
                                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px', fontSize: '1.0rem' }} />
                              <button onClick={async () => {
                                if (!inlineToetsNaam.trim()) return;
                                await fetch('/api/toetsen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ klas_id: slot.klas_id, naam: inlineToetsNaam.trim(), type: inlineToetsType, datum: today, kleur: toetsKleuren[inlineToetsType] || '#6B7280' }) });
                                fetch('/api/toetsen').then(r => r.json()).then(setToetsen);
                                setInlineToetsCell(null); setInlineToetsNaam('');
                              }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>✓</button>
                              <button onClick={() => { setInlineToetsCell(null); setInlineToetsNaam(''); }}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.92rem' }}>✕</button>
                            </div>
                          )}
                          {les?.programma && <div style={{ fontSize: '1.05rem', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(les.programma).slice(0, 80)}</div>}
                          {!les?.programma && <div style={{ fontSize: '1.05rem', color: '#d1d5db', fontStyle: 'italic' }}>Niet gepland...</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>}

              {/* Lege lessen */}
              {blokZichtbaar('lege_lessen') && emptyLessons.length > 0 && (
                <div>
                  <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#d97706', marginBottom: '0.75rem' }}>Lege lessen deze week</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {emptyLessons.slice(0, 10).map((item, idx) => {
                      const kleur = klasKleurMap[item.klas.id] || '#6B7280';
                      return (
                        <div key={idx} onClick={() => setSelectedLesPanel({ klas_id: item.slot.klas_id, datum: item.datum, uur: item.slot.uur })}
                          style={{ padding: '0.75rem 1rem', background: kleur + '30', borderRadius: 12, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '1.0rem', color: '#6B7280', minWidth: 60 }}>{dagNamenKort[new Date(item.datum + 'T12:00:00').getDay() - 1]} {formatDate(item.datum)}</span>
                            <span style={{ fontSize: '1.12rem', fontWeight: 600, color: '#374151' }}>Uur {item.slot.uur}</span>
                            <span style={{ fontSize: '1.12rem', fontWeight: 700, color: 'white', background: kleur, padding: '1px 8px', borderRadius: 5 }}>{item.klas.naam}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Komende toetsen */}
              {blokZichtbaar('komende_toetsen') && upcomingToetsen.length > 0 && (
                <div>
                  <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#c95555', marginBottom: '0.75rem' }}>Komende toetsen</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {upcomingToetsen.map(t => {
                      const klas = klassen.find(k => k.id === t.klas_id);
                      const kleur = klasKleurMap[t.klas_id] || '#6B7280';
                      const tKleur = toetsKleuren[t.type] || '#6B7280';
                      return (
                        <div key={t.id} style={{ padding: '0.75rem 1rem', background: tKleur + '30', borderRadius: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.0rem', color: '#6B7280', minWidth: 60 }}>{formatDate(t.datum)}</span>
                            <span style={{ fontSize: '1.0rem', fontWeight: 700, background: tKleur, color: 'white', padding: '1px 8px', borderRadius: 5 }}>{t.type}</span>
                            <span style={{ fontSize: '1.12rem', fontWeight: 600, color: '#374151' }}>{t.naam}</span>
                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white', background: kleur, padding: '1px 8px', borderRadius: 5, marginLeft: 'auto' }}>{klas?.naam}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notities */}
              {blokZichtbaar('notities') && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#8b5ec0' }}>Notities</h2>
                    <button onClick={async () => {
                      const res = await fetch('/api/overzicht', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: 'notitie', titel: '', inhoud: '', kleur: '#8b5ec0' }) });
                      const item = await res.json();
                      fetchOverzichtItems();
                      setEditOvItemId(item.id);
                    }}
                      style={{ background: '#faf5ff', border: '1px solid #d8b4fe', color: '#8b5ec0', borderRadius: 6, padding: '2px 10px', fontSize: '1.0rem', fontWeight: 700, cursor: 'pointer' }}>+</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ovNotities.length === 0 && (
                      <div style={{ padding: '0.75rem 1rem', background: '#e8eaed', borderRadius: 12, color: '#9CA3AF', fontSize: '1.0rem', fontStyle: 'italic' }}>Nog geen notities. Klik + om er een toe te voegen.</div>
                    )}
                    {ovNotities.map(item => (
                      <div key={item.id} style={{ padding: '0.75rem 1rem', background: item.kleur + '30', borderRadius: 12 }}>
                        {editOvItemId === item.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <input value={item.titel} onChange={e => setOverzichtItems(prev => prev.map(p => p.id === item.id ? { ...p, titel: e.target.value } : p))}
                              placeholder="Titel..." style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: '1.05rem', fontWeight: 700 }} />
                            <textarea value={item.inhoud} onChange={e => setOverzichtItems(prev => prev.map(p => p.id === item.id ? { ...p, inhoud: e.target.value } : p))}
                              placeholder="Inhoud..." rows={3} style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: '1.0rem', resize: 'vertical' }} />
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button onClick={async () => {
                                await fetch('/api/overzicht', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: item.id, titel: item.titel, inhoud: item.inhoud }) });
                                setEditOvItemId(null); fetchOverzichtItems();
                              }} style={{ background: '#8b5ec0', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>Opslaan</button>
                              <button onClick={() => { setEditOvItemId(null); fetchOverzichtItems(); }}
                                style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 12px', fontSize: '0.95rem', cursor: 'pointer', color: '#6B7280' }}>Annuleer</button>
                              <button onClick={async () => {
                                await fetch(`/api/overzicht?id=${item.id}`, { method: 'DELETE' });
                                setEditOvItemId(null); fetchOverzichtItems();
                              }} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.95rem', cursor: 'pointer', marginLeft: 'auto' }}>Verwijder</button>
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => setEditOvItemId(item.id)} style={{ cursor: 'pointer' }}>
                            {item.titel && <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#374151', marginBottom: 2 }}>{item.titel}</div>}
                            <div style={{ fontSize: '1.0rem', color: '#6B7280', whiteSpace: 'pre-wrap' }}>{item.inhoud || 'Klik om te bewerken...'}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agenda */}
              {blokZichtbaar('agenda') && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#2563EB' }}>Agenda</h2>
                    <button onClick={async () => {
                      const res = await fetch('/api/overzicht', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: 'agenda', titel: '', inhoud: '', datum: new Date().toISOString().split('T')[0], kleur: '#2563EB' }) });
                      const item = await res.json();
                      fetchOverzichtItems();
                      setEditOvItemId(item.id);
                    }}
                      style={{ background: '#eff6ff', border: '1px solid #93c5fd', color: '#2563EB', borderRadius: 6, padding: '2px 10px', fontSize: '1.0rem', fontWeight: 700, cursor: 'pointer' }}>+</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ovAgenda.length === 0 && (
                      <div style={{ padding: '0.75rem 1rem', background: '#e8eaed', borderRadius: 12, color: '#9CA3AF', fontSize: '1.0rem', fontStyle: 'italic' }}>Nog geen agenda-items. Klik + om er een toe te voegen.</div>
                    )}
                    {ovAgenda.map(item => {
                      const isPast = item.datum && item.datum < today;
                      return (
                        <div key={item.id} style={{ padding: '0.75rem 1rem', background: isPast ? '#e8eaed' : '#2563EB30', borderRadius: 12, opacity: isPast ? 0.6 : 1 }}>
                          {editOvItemId === item.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <input type="date" value={item.datum || ''} onChange={e => setOverzichtItems(prev => prev.map(p => p.id === item.id ? { ...p, datum: e.target.value } : p))}
                                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: '1.0rem' }} />
                                <input value={item.titel} onChange={e => setOverzichtItems(prev => prev.map(p => p.id === item.id ? { ...p, titel: e.target.value } : p))}
                                  placeholder="Wat staat er op de planning?" style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: '1.05rem', fontWeight: 700 }} />
                              </div>
                              <textarea value={item.inhoud} onChange={e => setOverzichtItems(prev => prev.map(p => p.id === item.id ? { ...p, inhoud: e.target.value } : p))}
                                placeholder="Details (optioneel)..." rows={2} style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: '1.0rem', resize: 'vertical' }} />
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button onClick={async () => {
                                  await fetch('/api/overzicht', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: item.id, titel: item.titel, inhoud: item.inhoud, datum: item.datum }) });
                                  setEditOvItemId(null); fetchOverzichtItems();
                                }} style={{ background: '#2563EB', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>Opslaan</button>
                                <button onClick={() => { setEditOvItemId(null); fetchOverzichtItems(); }}
                                  style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 12px', fontSize: '0.95rem', cursor: 'pointer', color: '#6B7280' }}>Annuleer</button>
                                <button onClick={async () => {
                                  await fetch(`/api/overzicht?id=${item.id}`, { method: 'DELETE' });
                                  setEditOvItemId(null); fetchOverzichtItems();
                                }} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.95rem', cursor: 'pointer', marginLeft: 'auto' }}>Verwijder</button>
                              </div>
                            </div>
                          ) : (
                            <div onClick={() => setEditOvItemId(item.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ fontSize: '1.0rem', color: '#9CA3AF', minWidth: 70 }}>{item.datum ? formatDate(item.datum) : '—'}</span>
                              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#374151' }}>{item.titel || 'Nieuw item...'}</span>
                              {item.inhoud && <span style={{ fontSize: '0.95rem', color: '#9CA3AF', marginLeft: 'auto' }}>{item.inhoud.slice(0, 40)}{item.inhoud.length > 40 ? '...' : ''}</span>}
                            </div>
                          )}
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
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#374151' }}>Periode:</span>
              <select value={selectedPeriodeId || ''} onChange={e => setSelectedPeriodeId(Number(e.target.value))}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '1.05rem', fontWeight: 600 }}>
                {periodes.map(p => (
                  <option key={p.id} value={p.id}>{p.naam} ({p.start_datum} t/m {p.eind_datum})</option>
                ))}
              </select>

              {/* Periode datums aanpassen */}
              {selectedPeriodeId && (() => {
                const cur = periodes.find(p => p.id === selectedPeriodeId);
                if (!cur) return null;
                return (
                  <>
                    <span style={{ fontSize: '1.0rem', color: '#6B7280' }}>van</span>
                    <input type="date" value={cur.start_datum}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        await fetch('/api/rooster-periodes', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: selectedPeriodeId, start_datum: val }) });
                        fetchPeriodes();
                      }}
                      style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '1.02rem' }} />
                    <span style={{ fontSize: '1.0rem', color: '#6B7280' }}>t/m</span>
                    <input type="date" value={cur.eind_datum}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        await fetch('/api/rooster-periodes', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: selectedPeriodeId, eind_datum: val }) });
                        fetchPeriodes();
                      }}
                      style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '1.02rem' }} />
                  </>
                );
              })()}

              {/* Nieuw leeg rooster */}
              <button onClick={() => setShowPeriodeForm(!showPeriodeForm)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #8b5ec0', background: showPeriodeForm ? '#8b5ec0' : '#faf5ff', color: showPeriodeForm ? 'white' : '#8b5ec0', fontWeight: 600, fontSize: '1.02rem', cursor: 'pointer' }}>
                + Nieuw rooster
              </button>

              {/* Zermelo import */}
              <button onClick={() => setShowZermeloForm(!showZermeloForm)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #c4892e', background: showZermeloForm ? '#c4892e' : '#fef3c7', color: showZermeloForm ? 'white' : '#c4892e', fontWeight: 600, fontSize: '1.02rem', cursor: 'pointer' }}>
                Zermelo import
              </button>

              {/* Verwijderen */}
              {selectedPeriodeId && periodes.length > 1 && (
                <button onClick={async () => {
                  if (!confirm('Weet je zeker dat je deze periode en alle bijbehorende roosterslots wilt verwijderen?')) return;
                  await fetch(`/api/rooster-periodes?id=${selectedPeriodeId}`, { method: 'DELETE' });
                  setSelectedPeriodeId(null);
                  fetchPeriodes(); fetchAllRooster();
                }} style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #c95555', background: 'white', color: '#c95555', fontWeight: 600, fontSize: '1.02rem', cursor: 'pointer', marginLeft: 'auto' }}>
                  Verwijder
                </button>
              )}
            </div>

            {/* Nieuwe periode form */}
            {showPeriodeForm && (
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', padding: '0.75rem', background: '#faf5ff', borderRadius: 8, border: '1px solid #d8b4fe', alignItems: 'center', flexWrap: 'wrap' }}>
                <input id="np-naam" placeholder="Naam..." style={{ flex: '1 1 120px', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.4rem 0.65rem', fontSize: '1.05rem' }} />
                <input id="np-start" type="date" style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem', fontSize: '1.05rem' }} />
                <span style={{ fontSize: '1.05rem', color: '#94a3b8' }}>t/m</span>
                <input id="np-eind" type="date" style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem', fontSize: '1.05rem' }} />
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
                }} style={{ background: '#8b5ec0', color: 'white', border: 'none', borderRadius: 6, padding: '0.45rem 0.85rem', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
                  Aanmaken
                </button>
              </div>
            )}

            {/* Zermelo import form */}
            {showZermeloForm && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.18rem', color: '#92400e' }}>Rooster importeren vanuit Zermelo</span>
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
                      style={{ flex: '1 1 140px', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.4rem 0.65rem', fontSize: '1.05rem' }} />
                    <span style={{ fontSize: '1.0rem', color: '#94a3b8' }}>.zportal.nl</span>
                    <input value={zermeloCode} onChange={e => setZermeloCode(e.target.value)} placeholder="Koppelcode" type="password"
                      style={{ flex: '1 1 100px', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.4rem 0.65rem', fontSize: '1.05rem' }} />
                    <button onClick={async () => {
                      setZermeloStatus('Verbinden...');
                      const res = await fetch('/api/zermelo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'auth', school: zermeloSchool, code: zermeloCode }) });
                      const data = await res.json();
                      if (data.token) { setZermeloToken(data.token); setZermeloStep('fetch'); setZermeloStatus('Verbonden! Kies een week.'); }
                      else { setZermeloStatus(data.error || 'Authenticatie mislukt'); }
                    }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 6, padding: '0.45rem 0.85rem', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
                      Verbinden
                    </button>
                    <div style={{ fontSize: '0.95rem', color: '#92400e', marginTop: 4, width: '100%' }}>
                      Maak een koppelcode aan in Zermelo: Instellingen → Koppel apps → Nieuwe koppeling
                    </div>
                  </div>
                )}

                {/* Stap 2: Week kiezen en rooster ophalen */}
                {zermeloToken && zermeloStep === 'fetch' && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.05rem', color: '#2d8a4e', fontWeight: 600 }}>✓ Verbonden</span>
                    <span style={{ fontSize: '1.02rem', color: '#6B7280' }}>Kies een lesweek:</span>
                    <input id="z-week" type="date" defaultValue={getMonday(new Date()).toISOString().split('T')[0]}
                      style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '0.3rem', fontSize: '1.05rem' }} />
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
                        // Defaults voor nieuwe periode datums
                        const defaultStart = zermeloWeekStart || getMonday(new Date()).toISOString().split('T')[0];
                        setZermeloNieuwStart(defaultStart);
                        const defaultYr = new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear();
                        setZermeloNieuwEind(`${defaultYr}-07-17`);
                        setZermeloStep('preview');
                        const matched = Object.values(autoMap).filter(v => v !== 'new').length;
                        setZermeloStatus(`${data.slots.length} lessen gevonden, ${matched}/${uniqueGroepen.length} groepen herkend`);
                      } else { setZermeloStatus(data.error || 'Ophalen mislukt'); }
                    }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 6, padding: '0.45rem 0.85rem', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
                      Ophalen
                    </button>
                  </div>
                )}

                {/* Stap 3: Preview + koppelen + direct importeren */}
                {zermeloToken && zermeloStep === 'preview' && zermeloPreview && (
                  <div>
                    {/* Compact rooster preview */}
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                      {zermeloPreview.length} lessen gevonden
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      {[1,2,3,4,5].map(dag => {
                        const dagSlots = zermeloPreview.filter(s => s.dag === dag);
                        if (dagSlots.length === 0) return null;
                        return (
                          <div key={dag} style={{ flex: '1 1 100px', background: '#fefce8', borderRadius: 6, padding: '0.3rem 0.4rem', border: '1px solid #fde68a', minWidth: 90 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#92400e', marginBottom: 2 }}>{dagNamenKort[dag - 1]}</div>
                            {dagSlots.map((s, i) => (
                              <div key={i} style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.4 }}>
                                <span style={{ fontWeight: 700, color: '#92400e' }}>u{s.uur}</span> {s.vak} <span style={{ color: '#94a3b8' }}>({s.groep})</span>
                                <div style={{ fontSize: '0.88rem', color: '#b08040', marginLeft: 16 }}>
                                  {s.start_time}-{s.end_time} ({String((s as Record<string, unknown>).duur ?? '?')}min)
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>

                    {/* Groepen koppelen */}
                    <div style={{ fontSize: '1.02rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Koppel Zermelo-groepen aan je klassen:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.6rem' }}>
                      {Object.entries(zermeloMapping).map(([groep, value]) => {
                        const slotInfo = zermeloPreview.find(s => s.groep === groep);
                        const isMatched = value !== 'new' && value !== 0;
                        const isSkipped = value === 0;
                        return (
                          <div key={groep} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.45rem 0.75rem', background: isSkipped ? '#f9fafb' : isMatched ? '#f0fdf4' : '#fffbeb', borderRadius: 6, border: `1px solid ${isSkipped ? '#e5e7eb' : isMatched ? '#bbf7d0' : '#fde68a'}` }}>
                            <div style={{ minWidth: 90, fontSize: '1.02rem' }}>
                              <span style={{ fontWeight: 700, color: '#374151' }}>{groep}</span>
                              {slotInfo && <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: '0.92rem' }}>({slotInfo.vak})</span>}
                            </div>
                            <span style={{ fontSize: '0.95rem', color: '#94a3b8' }}>→</span>
                            <select
                              value={value === 'new' ? 'new' : (value === 0 ? 'skip' : String(value))}
                              onChange={e => {
                                const v = e.target.value;
                                setZermeloMapping(prev => ({
                                  ...prev,
                                  [groep]: v === 'new' ? 'new' : (v === 'skip' ? 0 as unknown as number : Number(v))
                                }));
                              }}
                              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '0.4rem 0.65rem', fontSize: '1.02rem', background: 'white' }}
                            >
                              <option value="new">+ Nieuwe klas aanmaken</option>
                              <option value="skip">Overslaan</option>
                              <optgroup label="Bestaande klassen">
                                {klassen.map(k => (
                                  <option key={k.id} value={String(k.id)}>{k.naam} ({k.vak})</option>
                                ))}
                              </optgroup>
                            </select>
                            {isMatched && <span style={{ color: '#2d8a4e', fontSize: '1.05rem' }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Periode keuze + Importeer knop */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.5rem 0', borderTop: '1px solid #f59e0b40' }}>
                      <label style={{ fontSize: '1.02rem', fontWeight: 600, color: '#374151' }}>Periode:</label>
                      <select
                        value={zermeloImportPeriodeId === 'new' ? 'new' : String(zermeloImportPeriodeId)}
                        onChange={e => setZermeloImportPeriodeId(e.target.value === 'new' ? 'new' : Number(e.target.value))}
                        style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '1.02rem', background: 'white', minWidth: 200 }}
                      >
                        {periodes.map(p => (
                          <option key={p.id} value={String(p.id)}>{p.naam} ({p.start_datum} t/m {p.eind_datum})</option>
                        ))}
                        <option value="new">+ Nieuwe periode aanmaken</option>
                      </select>
                      {zermeloImportPeriodeId === 'new' && (
                        <>
                          <span style={{ fontSize: '0.95rem', color: '#6B7280' }}>van</span>
                          <input type="date" value={zermeloNieuwStart} onChange={e => setZermeloNieuwStart(e.target.value)}
                            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '1.02rem' }} />
                          <span style={{ fontSize: '0.95rem', color: '#6B7280' }}>t/m</span>
                          <input type="date" value={zermeloNieuwEind} onChange={e => setZermeloNieuwEind(e.target.value)}
                            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '1.02rem' }} />
                        </>
                      )}
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
                          if (!zermeloNieuwStart || !zermeloNieuwEind) { setZermeloStatus('Vul start- en einddatum in'); return; }
                          importBody.periode_naam = `Zermelo ${new Date().toLocaleDateString('nl-NL')}`;
                          importBody.start_datum = zermeloNieuwStart;
                          importBody.eind_datum = zermeloNieuwEind;
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
                      }} style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 6, padding: '0.5rem 1.2rem', fontWeight: 700, fontSize: '1.12rem', cursor: 'pointer' }}>
                        Importeer rooster
                      </button>
                      <button onClick={() => { setZermeloPreview(null); setZermeloStep('fetch'); setZermeloStatus(''); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.02rem', cursor: 'pointer', marginLeft: 'auto' }}>
                        ← Terug
                      </button>
                    </div>
                  </div>
                )}

                {zermeloStatus && <div style={{ marginTop: '0.5rem', fontSize: '1.02rem', color: '#92400e', fontWeight: 500 }}>{zermeloStatus}</div>}
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
                      style={{ padding: '0.4rem 0.75rem', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                        border: isActive ? '2px solid #2d8a4e' : '1px solid #d1d5db',
                        background: isActive ? '#f0fdf4' : 'white',
                        color: isActive ? '#2d8a4e' : '#6B7280' }}>
                      {p.naam}
                      {isCurrent && <span style={{ marginLeft: 4, color: '#2d8a4e' }}>●</span>}
                      <div style={{ fontSize: '0.86rem', fontWeight: 400, color: '#94a3b8' }}>
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
              <span style={{ fontSize: '0.92rem', color: '#9CA3AF' }}>
                {klassen.length} klassen: {klassen.map(k => k.naam).join(', ')}
              </span>
            </div>

            {/* Week navigatie */}
            {(() => {
              const roosterDays = getDaysOfWeek(roosterWeekStart);
              const roosterWeekNum = getWeekNumber(roosterWeekStart);
              const curPeriode = periodes.find(p => p.id === selectedPeriodeId);
              return (
                <>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                  <button onClick={() => { const d = new Date(roosterWeekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); setRoosterWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>◀</button>
                  <span style={{ fontWeight: 700, color: '#2d8a4e', minWidth: 55, textAlign: 'center', fontSize: '1.05rem' }}>Wk {roosterWeekNum}</span>
                  <span style={{ fontSize: '0.92rem', color: '#6B7280' }}>{formatDate(roosterDays[0])} – {formatDate(roosterDays[4])}</span>
                  <button onClick={() => { const d = new Date(roosterWeekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); setRoosterWeekStart(d.toISOString().split('T')[0]); }} style={navBtn}>▶</button>
                  <button onClick={() => setRoosterWeekStart(getMonday(new Date()).toISOString().split('T')[0])} style={{ ...navBtn, fontSize: '0.92rem', color: '#2d8a4e' }}>Vandaag</button>
                  {curPeriode && (roosterWeekStart < curPeriode.start_datum || roosterDays[4] > curPeriode.eind_datum) && (
                    <span style={{ fontSize: '0.88rem', color: '#DC2626', fontWeight: 600 }}>⚠ Buiten periode</span>
                  )}
                </div>

                {/* Rooster grid met weekweergave */}
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, tableLayout: 'fixed', background: 'white', borderRadius: 20, overflow: 'hidden' }}>
                  <thead><tr>
                    <th style={{ ...th, width: 50 }}>Uur</th>
                    {roosterDays.map((d, idx) => {
                      const dagVerv = isVervallenDag(d);
                      const vakantie = isInVakantie(d, vakanties);
                      return (
                        <th key={d} style={{ ...th, background: dagVerv ? '#fef2f2' : vakantie ? kalenderKleur(vakantie).bg : '#f9fafb', position: 'relative' }}>
                          <div>{dagNamen[idx]}</div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(d)}</div>
                          {vakantie && <div style={{ fontSize: '0.82rem', color: kalenderKleur(vakantie).text, fontWeight: 600 }}>{vakantie.naam}</div>}
                          {dagVerv && <div style={{ fontSize: '0.82rem', color: '#DC2626', fontWeight: 600 }}>VERVALLEN</div>}
                          {!vakantie && (
                            <button onClick={() => toggleVervallen(d, null)}
                              style={{ fontSize: '0.82rem', padding: '1px 6px', borderRadius: 3, marginTop: 2,
                                border: dagVerv ? '1px solid #DC2626' : '1px solid #d1d5db',
                                background: dagVerv ? '#fef2f2' : '#f9fafb',
                                color: dagVerv ? '#DC2626' : '#9CA3AF', cursor: 'pointer', fontWeight: 600 }}>
                              {dagVerv ? '✓ Dag vervalt' : 'Dag laten vervallen'}
                            </button>
                          )}
                          {dagVerv && (
                            <div style={{ marginTop: 2 }}>
                              {editVervallenId === dagVerv.id ? (
                                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                  <input autoFocus value={vervallenReden} onChange={e => setVervallenReden(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { updateVervallenReden(dagVerv.id, vervallenReden); setEditVervallenId(null); } }}
                                    placeholder="Reden..."
                                    style={{ border: '1px solid #d1d5db', borderRadius: 3, padding: '2px 4px', fontSize: '0.82rem', width: '100%' }} />
                                  <button onClick={() => { updateVervallenReden(dagVerv.id, vervallenReden); setEditVervallenId(null); }}
                                    style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 3, padding: '2px 6px', fontSize: '0.82rem', cursor: 'pointer' }}>✓</button>
                                </div>
                              ) : (
                                <div onClick={() => { setEditVervallenId(dagVerv.id); setVervallenReden(dagVerv.reden); }}
                                  style={{ fontSize: '0.82rem', color: '#b91c1c', fontStyle: dagVerv.reden ? 'normal' : 'italic', cursor: 'pointer' }}>
                                  {dagVerv.reden || 'Klik voor reden...'}
                                </div>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr></thead>
                  <tbody>
                    {[1,2,3,4,5,6,7,8,9,10].map(uur => (
                      <tr key={uur}>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '1.12rem', padding: '0.3rem 0.25rem' }}>
                          {uur}
                          <div style={{ fontSize: '0.82rem', fontWeight: 400, color: '#b0b8c4', lineHeight: 1 }}>{uurTijden[uur]}</div>
                        </td>
                        {roosterDays.map((d, idx) => {
                          const dag = idx + 1;
                          const slot = getSlot(dag, uur); const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                          const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                          if (isBlokuurSecond(dag, uur)) return null;
                          const isBlok = isBlokuurStart(dag, uur);
                          const dagVerv = isVervallenDag(d);
                          const uurVerv = isVervallenUur(d, uur);
                          const vakantie = isInVakantie(d, vakanties);
                          const cellVerv = dagVerv || uurVerv;

                          if (vakantie) {
                            const kk = kalenderKleur(vakantie);
                            return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, background: kk.bg, textAlign: 'center', verticalAlign: 'middle' }}>
                              {uur === 1 && <span style={{ fontSize: '0.86rem', color: kk.text, fontWeight: 600 }}>{vakantie.naam}</span>}
                            </td>;
                          }

                          return (
                            <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{
                              ...td, padding: '6px 5px', position: 'relative',
                              background: cellVerv ? '#fef2f2' : slot ? kleur + '30' : '#e8eaed',
                              borderRadius: 12,
                              opacity: cellVerv ? 0.7 : 1,
                            }}>
                              {/* Klas selectie (basisrooster) */}
                              <select value={slot?.klas_id || ''} onChange={e => setRoosterKlas(dag, uur, e.target.value ? Number(e.target.value) : null)}
                                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '1.0rem', fontWeight: 700, cursor: 'pointer',
                                  color: cellVerv ? '#d4a0a0' : (kleur || '#c4c4c4'), textDecoration: cellVerv ? 'line-through' : 'none' }}>
                                <option value="">—</option>
                                {klassen.map((k, i) => <option key={k.id} value={k.id} style={{ color: klasKleuren[i % klasKleuren.length] }}>{k.naam} ({k.lokaal})</option>)}
                              </select>
                              {slot && klas && <div style={{ fontSize: '0.92rem', color: cellVerv ? '#d4a0a0' : '#9CA3AF', marginTop: 2, textDecoration: cellVerv ? 'line-through' : 'none' }}>{klas.vak} - {klas.lokaal}</div>}
                              {canBeBlokuur(dag, uur) && !cellVerv && !isBlok && (
                                <button onClick={() => toggleBlokuur(dag, uur)} style={{ marginTop: 3, fontSize: '0.88rem', padding: '2px 7px', borderRadius: 3,
                                  border: '1px solid #d1d5db', background: '#f9fafb', color: '#9CA3AF', cursor: 'pointer', fontWeight: 600 }}>
                                  Maak blokuur
                                </button>
                              )}

                              {/* Vervallen toggle per uur */}
                              {slot && !dagVerv && (
                                <div style={{ marginTop: 4 }}>
                                  <button onClick={() => toggleVervallen(d, uur)}
                                    style={{ fontSize: '0.82rem', padding: '1px 5px', borderRadius: 3,
                                      border: uurVerv ? '1px solid #DC2626' : '1px solid #e5e7eb',
                                      background: uurVerv ? '#fef2f2' : 'white',
                                      color: uurVerv ? '#DC2626' : '#b0b8c4', cursor: 'pointer', fontWeight: 600 }}>
                                    {uurVerv ? '✕ Vervalt' : 'Vervallen'}
                                  </button>
                                  {uurVerv && (
                                    <div style={{ marginTop: 2 }}>
                                      {editVervallenId === uurVerv.id ? (
                                        <div style={{ display: 'flex', gap: 2 }}>
                                          <input autoFocus value={vervallenReden} onChange={e => setVervallenReden(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { updateVervallenReden(uurVerv.id, vervallenReden); setEditVervallenId(null); } }}
                                            placeholder="Reden..."
                                            style={{ border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 4px', fontSize: '0.82rem', width: '100%' }} />
                                          <button onClick={() => { updateVervallenReden(uurVerv.id, vervallenReden); setEditVervallenId(null); }}
                                            style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 3, padding: '1px 5px', fontSize: '0.82rem', cursor: 'pointer' }}>✓</button>
                                        </div>
                                      ) : (
                                        <div onClick={() => { setEditVervallenId(uurVerv.id); setVervallenReden(uurVerv.reden); }}
                                          style={{ fontSize: '0.82rem', color: '#b91c1c', fontStyle: uurVerv.reden ? 'normal' : 'italic', cursor: 'pointer' }}>
                                          {uurVerv.reden || 'Reden...'}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Vervallen label als hele dag vervalt */}
                              {dagVerv && slot && (
                                <div style={{ fontSize: '0.82rem', color: '#DC2626', fontWeight: 600, marginTop: 2 }}>Vervallen</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              );
            })()}
          </div>
        )}

        {/* ═══ WEEKPLANNER ═══ */}
        {view === 'week' && (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, tableLayout: 'fixed', background: 'white', borderRadius: 20, overflow: 'hidden' }}>
            <thead><tr>
              <th style={{ ...th, width: 42 }}>Uur</th>
              {days.map((d, idx) => {
                const vak = isInVakantie(d, vakanties);
                return (
                  <th key={d} style={{ ...th, background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f9fafb', color: d === today ? '#2d8a4e' : vak ? '#b91c1c' : '#374151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <div style={{ fontSize: '1.05rem' }}>{dagNamen[idx]}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(d)}</div>
                    {vak && <div style={{ fontSize: '0.84rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
                  </th>
                );
              })}
            </tr></thead>
            <tbody>
              {[1,2,3,4,5,6,7,8,9,10].map(uur => (
                <tr key={uur}>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '1.05rem', padding: '0.3rem 0.25rem' }}>
                    {uur}
                    <div style={{ fontSize: '0.82rem', fontWeight: 400, color: '#b0b8c4', lineHeight: 1 }}>{uurTijden[uur]}</div>
                  </td>
                  {days.map((d, idx) => {
                    const dag = idx + 1; const slot = getSlot(dag, uur); const vakantie = isInVakantie(d, vakanties);
                    /* Exact zelfde patroon als rooster: blokuur-second → null */
                    if (isBlokuurSecond(dag, uur)) return null;
                    const isBlok = isBlokuurStart(dag, uur);
                    const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;
                    /* Vakantie */
                    if (vakantie) { const kk = kalenderKleur(vakantie); return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, background: kk.bg, padding: '0.3rem', verticalAlign: 'middle', textAlign: 'center' }}>{uur === 1 && <span style={{ fontSize: '0.9rem', color: kk.text, fontWeight: 600 }}>{vakantie.naam}</span>}</td>; }
                    /* Leeg uur */
                    if (!slot) return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td }}><div style={{ minHeight: isBlok ? 210 : 105, borderRadius: 12, background: '#e8eaed' }} /></td>;
                    /* Les cel — height:1px trick zodat height:100% in kinderen werkt */
                    return <td key={`${d}-${uur}`} rowSpan={isBlok ? 2 : 1} style={{ ...td, height: '1px' }}>{renderCell(slot, d, isBlok)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ═══ DAGPLANNER (tijdlijn-stijl met kaarten) ═══ */}
        {view === 'dag' && (() => {
          const dagIdx = new Date(selectedDate + 'T12:00:00').getDay();
          const dagNr = dagIdx >= 1 && dagIdx <= 5 ? dagIdx : 0;
          const vakantie = isInVakantie(selectedDate, vakanties);
          if (dagNr === 0) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', padding: '3rem' }}>Geen lesdag (weekend).</div>;
          if (vakantie) { const kk = kalenderKleur(vakantie); return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kk.text, fontWeight: 600, padding: '3rem', background: kk.bg, borderRadius: 12, margin: '1rem' }}>{vakantie.naam}</div>; }

          // Alle mogelijke uren (1-10), toon les als er een slot is, anders vrij uur
          const maxUur = Math.max(...allRooster.filter(r => r.dag === dagNr).map(r => r.uur), 7);
          const alleUren = Array.from({ length: maxUur }, (_, i) => i + 1);
          const dagSlots = allRooster.filter(r => r.dag === dagNr).sort((a, b) => a.uur - b.uur);

          // Huidig uur bepalen
          const nu = new Date();
          const nuUur = nu.getHours();
          const nuMin = nu.getMinutes();
          const isVandaag = selectedDate === new Date().toISOString().split('T')[0];
          // Map schooluren naar kloktijden
          const uurStart: Record<number, number> = { 1: 830, 2: 915, 3: 1020, 4: 1105, 5: 1230, 6: 1315, 7: 1415, 8: 1500, 9: 1545, 10: 1630 };
          const uurEind: Record<number, number> = { 1: 915, 2: 1000, 3: 1105, 4: 1150, 5: 1315, 6: 1400, 7: 1500, 8: 1545, 9: 1630, 10: 1715 };
          const nuTijd = nuUur * 100 + nuMin;
          const huidigUur = isVandaag ? alleUren.find(u => uurStart[u] && nuTijd >= uurStart[u] && nuTijd < (uurEind[u] || 9999)) : null;

          const uurTijdStr = (u: number) => {
            const s = uurStart[u];
            if (!s) return '';
            return `${Math.floor(s / 100)}:${String(s % 100).padStart(2, '0')}`;
          };

          return (
            <div style={{ padding: '0 0 1.5rem 0' }}>
              {alleUren.map(uurNr => {
                const slot = dagSlots.find(s => s.uur === uurNr);
                const isSecondBlok = slot ? isBlokuurSecond(dagNr, slot.uur) : false;
                if (isSecondBlok) return null;
                const isBlok = slot ? isBlokuurStart(dagNr, slot.uur) : false;
                const isNow = huidigUur === uurNr;
                const hasLes = !!slot;
                const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : '#e2e8f0';
                const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                const les = slot ? getCellLes(slot.klas_id, selectedDate, slot.uur) : null;
                const cellToetsen = slot ? getToetsenForDateKlas(selectedDate, slot.klas_id) : [];
                const hasToets = cellToetsen.length > 0;
                const toetsAccent = hasToets ? (toetsKleuren[cellToetsen[0].type] || '#6B7280') : '';
                const programmaText = les ? stripHtml(les.programma || '') : '';
                const filledExtras = hasLes ? visibleFields.filter(f => f.veld_key !== 'programma' && les && isFieldFilled(les, f.veld_key)) : [];
                const jpSuggestion = slot ? getJpSuggestion(slot.klas_id, selectedDate) : null;

                return (
                  <div key={uurNr} style={{ display: 'flex', minHeight: hasLes ? (isBlok ? 120 : 82) : 44, borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                    {/* Tijdkolom */}
                    <div style={{ width: 64, flexShrink: 0, padding: '10px 8px 10px 14px', textAlign: 'right', position: 'relative' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: isNow ? '#ef4444' : '#94a3b8', lineHeight: 1.3 }}>
                        {uurTijdStr(uurNr)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: 1 }}>uur {uurNr}</div>
                      {isNow && <div style={{ position: 'absolute', right: -4, top: 14, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />}
                    </div>

                    {/* "Nu" lijn */}
                    {isNow && <div style={{ position: 'absolute', left: 64, right: 0, top: 16, height: 2, background: '#ef4444', zIndex: 2, opacity: 0.4 }} />}

                    {/* Leskaart of vrij slot */}
                    <div style={{ flex: 1, padding: '4px 14px 4px 0' }}>
                      {hasLes && les ? (
                        <div
                          onClick={() => setSelectedLesPanel({ klas_id: slot!.klas_id, datum: selectedDate, uur: slot!.uur })}
                          style={{
                            background: hasToets ? toetsAccent + '30' : kleur + '30',
                            border: 'none',
                            borderRadius: 12,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'all 0.12s ease',
                            minHeight: isBlok ? 100 : 64,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(3px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 10px ${kleur}20`; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                        >
                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'white', background: kleur, padding: '1px 8px', borderRadius: 5 }}>{klas?.naam}</span>
                            <span style={{ fontSize: '0.84rem', color: kleur, fontWeight: 600 }}>{klas?.vak}</span>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{klas?.lokaal}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: '#b0b8c4' }}>▸</span>
                          </div>
                          {/* Toetsen blok */}
                          {cellToetsen.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 10px 4px' }}>
                              {cellToetsen.map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: (toetsKleuren[t.type] || '#6B7280') + '20', color: toetsKleuren[t.type] || '#6B7280', padding: '3px 8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700 }}>
                                  {t.type}: {t.naam}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Programma */}
                          <div style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, padding: '2px 12px' }}>
                            {programmaText
                              ? (programmaText.length > 80 ? programmaText.slice(0, 80) + '...' : programmaText)
                              : (jpSuggestion
                                ? <span style={{ color: '#2d8a4e', fontStyle: 'italic' }}>📅 {jpSuggestion.slice(0, 50)}{jpSuggestion.length > 50 ? '...' : ''}</span>
                                : <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Plan les...</span>
                              )
                            }
                          </div>
                          {/* Ingevulde velden indicators */}
                          {filledExtras.length > 0 && (
                            <div style={{ display: 'flex', gap: 3, marginTop: 5, padding: '0 12px 4px' }}>
                              {filledExtras.map(f => <span key={f.veld_key} title={f.label} style={{ fontSize: '0.76rem', opacity: 0.6 }}>{f.icoon}</span>)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{
                          borderRadius: 12, background: '#e8eaed',
                          height: '100%', minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#b0b8c4', fontSize: '0.82rem',
                          transition: 'all 0.12s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#dde0e4'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#e8eaed'; (e.currentTarget as HTMLElement).style.color = '#b0b8c4'; }}
                        >
                          Vrij
                        </div>
                      )}
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
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, tableLayout: 'fixed', background: 'white', borderRadius: 20, overflow: 'hidden' }}>
              <thead><tr>
                <th style={{ ...th, width: 42 }} />
                {weekColumns.map((week, wi) => {
                  const isCurrentWeek = week.startDate <= today && today <= week.days[4];
                  return (
                    <th key={wi} colSpan={1} style={{ ...th, background: isCurrentWeek ? '#f0fdf4' : '#f9fafb', color: isCurrentWeek ? kleur : '#374151' }}>
                      <div style={{ fontSize: '1.12rem' }}>Week {week.weekNum}</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 400, opacity: 0.6 }}>{formatDate(week.days[0])} – {formatDate(week.days[4])}</div>
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
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.95rem', padding: '0.2rem', verticalAlign: 'top' }}>
                        {weekColumns[0].lesDagen[rowIdx] ? (
                          <>{dagNamenKort[weekColumns[0].lesDagen[rowIdx].di]}<br/><span style={{ fontSize: '0.86rem', fontWeight: 400 }}>{formatDate(weekColumns[0].lesDagen[rowIdx].datum)}</span></>
                        ) : ''}
                      </td>
                      {weekColumns.map((week, wi) => {
                        const lesdag = week.lesDagen[rowIdx];
                        if (!lesdag) return <td key={wi} style={{ ...td }}><div style={{ minHeight: 80, borderRadius: 12, background: '#e8eaed' }} /></td>;
                        const { datum, dag, vakantie, slots } = lesdag;
                        const isToday = datum === today;
                        if (vakantie) { const kk = kalenderKleur(vakantie); return <td key={wi} style={{ ...td, background: kk.bg, verticalAlign: 'middle', textAlign: 'center', padding: '0.5rem' }}><span style={{ fontSize: '0.92rem', color: kk.text, fontWeight: 600 }}>{vakantie.naam}</span></td>; }
                        return (
                          <td key={wi} style={{ ...td, height: '1px', background: isToday ? '#f0fdf408' : undefined }}>
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

        {/* ═══ JAARLAAGPLANNER (klassen als rijen, dagen als kolommen) ═══ */}
        {view === 'jaarlaag' && (() => {
          const jlKlassen = klassen.filter(k => k.jaarlaag === selectedJaarlaag);
          if (jlKlassen.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Geen klassen in deze jaarlaag.</div>;
          const weeks = getTwoWeeks(jaarlaagWeekStart);

          /* Verzamel lesdagen (kolommen) per week */
          const allLesDagen: Array<{ datum: string; dag: number; di: number; vakantie: Vakantie | null; weekIdx: number; isCurrentWeek: boolean }> = [];
          weeks.forEach((week, wi) => {
            const isCurrentWeek = week.startDate <= today && today <= week.days[4];
            week.days.forEach((datum, di) => {
              const dag = di + 1;
              const anyLes = jlKlassen.some(k => allRooster.some(r => r.dag === dag && r.klas_id === k.id));
              if (anyLes) {
                const vakantie = isInVakantie(datum, vakanties);
                allLesDagen.push({ datum, dag, di, vakantie, weekIdx: wi, isCurrentWeek });
              }
            });
          });

          /* Groepeer kolommen per week voor weekheaders */
          const week0Count = allLesDagen.filter(d => d.weekIdx === 0).length;
          const week1Count = allLesDagen.filter(d => d.weekIdx === 1).length;

          return (
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, tableLayout: 'fixed', background: 'white', borderRadius: 20, overflow: 'hidden' }}>
              <thead>
                {/* Week headers als colspan */}
                <tr>
                  <th style={{ ...th, width: 100 }} />
                  {week0Count > 0 && (
                    <th colSpan={week0Count} style={{ ...th, background: allLesDagen.find(d => d.weekIdx === 0)?.isCurrentWeek ? '#f0fdf4' : '#f9fafb', color: allLesDagen.find(d => d.weekIdx === 0)?.isCurrentWeek ? '#2d8a4e' : '#374151' }}>
                      Week {weeks[0].weekNum} <span style={{ fontWeight: 400, fontSize: '0.9rem', color: '#94a3b8', marginLeft: 4 }}>{formatDate(weeks[0].days[0])} – {formatDate(weeks[0].days[4])}</span>
                    </th>
                  )}
                  {week1Count > 0 && (
                    <th colSpan={week1Count} style={{ ...th, background: allLesDagen.find(d => d.weekIdx === 1)?.isCurrentWeek ? '#f0fdf4' : '#f9fafb', color: allLesDagen.find(d => d.weekIdx === 1)?.isCurrentWeek ? '#2d8a4e' : '#374151' }}>
                      Week {weeks[1].weekNum} <span style={{ fontWeight: 400, fontSize: '0.9rem', color: '#94a3b8', marginLeft: 4 }}>{formatDate(weeks[1].days[0])} – {formatDate(weeks[1].days[4])}</span>
                    </th>
                  )}
                </tr>
                {/* Dag headers */}
                <tr>
                  <th style={{ ...th, width: 100 }}>Klas</th>
                  {allLesDagen.map(ld => {
                    const isToday = ld.datum === today;
                    return (
                      <th key={ld.datum} style={{ ...th, background: isToday ? '#f0fdf4' : ld.vakantie ? kalenderKleur(ld.vakantie).bg : undefined, color: isToday ? '#2d8a4e' : undefined }}>
                        <div>{dagNamenKort[ld.di]}</div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 400, color: '#94a3b8' }}>{formatDate(ld.datum)}</div>
                        {ld.vakantie && <div style={{ fontSize: '0.78rem', color: kalenderKleur(ld.vakantie).text, fontWeight: 600 }}>{ld.vakantie.naam}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {jlKlassen.map(klas => {
                  const kleur = klasKleurMap[klas.id] || '#6B7280';
                  return (
                    <tr key={klas.id}>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', padding: '0.3rem', verticalAlign: 'top' }}>
                        <div style={{ color: kleur, fontSize: '1.05rem' }}>{klas.naam}</div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 400, color: '#94a3b8' }}>{klas.vak}</div>
                      </td>
                      {allLesDagen.map(ld => {
                        if (ld.vakantie) { const kk = kalenderKleur(ld.vakantie); return <td key={ld.datum} style={{ ...td, background: kk.bg, verticalAlign: 'middle', textAlign: 'center' }}><span style={{ fontSize: '0.82rem', color: kk.text }}>{ld.vakantie.naam}</span></td>; }
                        const slots = allRooster.filter(r => r.dag === ld.dag && r.klas_id === klas.id).sort((a, b) => a.uur - b.uur).filter(s => !isBlokuurSecond(ld.dag, s.uur));
                        if (slots.length === 0) return <td key={ld.datum} style={{ ...td }}><div style={{ minHeight: 60, borderRadius: 12, background: '#e8eaed' }} /></td>;
                        return (
                          <td key={ld.datum} style={{ ...td, height: '1px' }}>
                            {slots.map(slot => renderCell(slot, ld.datum, isBlokuurStart(ld.dag, slot.uur)))}
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

        {/* ═══ INSTELLINGEN ═══ */}
        {view === 'instellingen' && (
          <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Lesvelden */}
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#374151', marginBottom: '0.75rem' }}>Lesvelden</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1rem' }}>Pas de velden aan die je per les wilt invullen. Je kunt velden hernoemen, verbergen, de volgorde wijzigen en eigen velden toevoegen.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {lesveldConfig.sort((a, b) => a.volgorde - b.volgorde).map((f, idx) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <input value={f.icoon} onChange={e => {
                      setLesveldConfig(prev => prev.map(p => p.id === f.id ? { ...p, icoon: e.target.value } : p));
                    }}
                      onBlur={async () => {
                        await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: f.id, icoon: f.icoon }) });
                      }}
                      style={{ width: 40, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '1.18rem', textAlign: 'center', padding: '4px' }} />
                    <input value={f.label} onChange={e => {
                      setLesveldConfig(prev => prev.map(p => p.id === f.id ? { ...p, label: e.target.value } : p));
                    }}
                      onBlur={async () => {
                        await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: f.id, label: f.label }) });
                      }}
                      style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '1.05rem', fontWeight: 600, padding: '6px 10px' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', minWidth: 80 }}>
                      <input type="checkbox" checked={f.zichtbaar} style={{ width: 18, height: 18 }} onChange={async () => {
                        const newVal = !f.zichtbaar;
                        setLesveldConfig(prev => prev.map(p => p.id === f.id ? { ...p, zichtbaar: newVal } : p));
                        await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: f.id, zichtbaar: newVal }) });
                      }} />
                      <span style={{ fontSize: '1.0rem', color: f.zichtbaar ? '#2d8a4e' : '#9CA3AF', fontWeight: 600 }}>{f.zichtbaar ? 'Aan' : 'Uit'}</span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {idx > 0 && <button onClick={async () => {
                        const sorted = [...lesveldConfig].sort((a, b) => a.volgorde - b.volgorde);
                        const curIdx = sorted.findIndex(s => s.id === f.id);
                        if (curIdx <= 0) return;
                        const items = [{ id: sorted[curIdx].id, volgorde: sorted[curIdx - 1].volgorde }, { id: sorted[curIdx - 1].id, volgorde: sorted[curIdx].volgorde }];
                        await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reorder', items }) });
                        fetchLesveldConfig();
                      }} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', fontSize: '0.92rem', color: '#6B7280', padding: '0 6px', lineHeight: '20px' }}>▲</button>}
                      {idx < lesveldConfig.length - 1 && <button onClick={async () => {
                        const sorted = [...lesveldConfig].sort((a, b) => a.volgorde - b.volgorde);
                        const curIdx = sorted.findIndex(s => s.id === f.id);
                        if (curIdx >= sorted.length - 1) return;
                        const items = [{ id: sorted[curIdx].id, volgorde: sorted[curIdx + 1].volgorde }, { id: sorted[curIdx + 1].id, volgorde: sorted[curIdx].volgorde }];
                        await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reorder', items }) });
                        fetchLesveldConfig();
                      }} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', fontSize: '0.92rem', color: '#6B7280', padding: '0 6px', lineHeight: '20px' }}>▼</button>}
                    </div>
                    {f.is_custom && <button onClick={async () => {
                      if (!confirm(`Weet je zeker dat je "${f.label}" wilt verwijderen?`)) return;
                      await fetch(`/api/lesvelden?id=${f.id}`, { method: 'DELETE' });
                      fetchLesveldConfig();
                    }} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: '1.0rem', color: '#DC2626', padding: '4px 8px' }}>Verwijder</button>}
                  </div>
                ))}
              </div>
              {/* Nieuw veld toevoegen */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: 8, border: '1px dashed #86efac' }}>
                <input value={newLesveldIcoon} onChange={e => setNewLesveldIcoon(e.target.value)}
                  style={{ width: 40, border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1.18rem', textAlign: 'center', padding: '4px' }} />
                <input value={newLesveldLabel} onChange={e => setNewLesveldLabel(e.target.value)} placeholder="Naam nieuw veld..."
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && newLesveldLabel.trim()) {
                      await fetch('/api/lesvelden', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label: newLesveldLabel.trim(), icoon: newLesveldIcoon || '📌' }) });
                      setNewLesveldLabel(''); setNewLesveldIcoon('📌');
                      fetchLesveldConfig();
                    }
                  }}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: '1.05rem' }} />
                <button onClick={async () => {
                  if (!newLesveldLabel.trim()) return;
                  await fetch('/api/lesvelden', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label: newLesveldLabel.trim(), icoon: newLesveldIcoon || '📌' }) });
                  setNewLesveldLabel(''); setNewLesveldIcoon('📌');
                  fetchLesveldConfig();
                }} style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer' }}>+ Toevoegen</button>
              </div>
            </div>

            {/* Overzicht blokken */}
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#374151', marginBottom: '0.75rem' }}>Overzicht blokken</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1rem' }}>Kies welke blokken zichtbaar zijn op het overzicht.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  { key: 'vandaag', label: 'Vandaag', beschrijving: 'Lessen van vandaag met programma' },
                  { key: 'lege_lessen', label: 'Lege lessen', beschrijving: 'Lessen deze week zonder programma' },
                  { key: 'komende_toetsen', label: 'Komende toetsen', beschrijving: 'Toetsen in de komende 14 dagen' },
                  { key: 'notities', label: 'Notities', beschrijving: 'Vrije notities en memo\'s' },
                  { key: 'agenda', label: 'Agenda', beschrijving: 'Eigen agenda-items met datum' },
                ].map(b => (
                  <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}>
                      <input type="checkbox" checked={overzichtInstellingen[b.key] !== false} style={{ width: 18, height: 18 }}
                        onChange={async () => {
                          const newVal = !(overzichtInstellingen[b.key] !== false);
                          setOverzichtInstellingen(prev => ({ ...prev, [b.key]: newVal }));
                          await fetch('/api/overzicht', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'toggle_blok', blok: b.key, zichtbaar: newVal }) });
                        }} />
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#374151' }}>{b.label}</div>
                        <div style={{ fontSize: '0.92rem', color: '#9CA3AF' }}>{b.beschrijving}</div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Schoolkalender */}
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: 700, color: '#374151', marginBottom: '0.75rem' }}>Schoolkalender</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1rem' }}>Voeg vakanties, toetsweken en studiedagen toe. Deze worden in alle planners getoond.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {vakanties.length === 0 && (
                  <div style={{ padding: '0.75rem 1rem', background: '#e8eaed', borderRadius: 12, color: '#9CA3AF', fontSize: '1.0rem', fontStyle: 'italic' }}>Nog geen items. Voeg hieronder iets toe.</div>
                )}
                {vakanties.map(v => {
                  const typeKleur = v.type === 'toetsweek' ? '#dc2626' : v.type === 'studiedag' ? '#2563EB' : '#ca8a04';
                  const typeLabel = v.type === 'toetsweek' ? 'Toetsweek' : v.type === 'studiedag' ? 'Studiedag' : 'Vakantie';
                  return (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: typeKleur + '18', borderRadius: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'white', background: typeKleur, padding: '2px 8px', borderRadius: 5 }}>{typeLabel}</span>
                      <span style={{ fontWeight: 600, fontSize: '1.05rem', color: '#374151', flex: 1 }}>{v.naam}</span>
                      <span style={{ fontSize: '0.92rem', color: '#6B7280' }}>{formatDate(v.start_datum)} – {formatDate(v.eind_datum)}</span>
                      <button onClick={async () => {
                        if (!confirm(`"${v.naam}" verwijderen?`)) return;
                        await fetch(`/api/vakanties?id=${v.id}`, { method: 'DELETE' });
                        fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
                      }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1.0rem', padding: '2px 6px' }}>✕</button>
                    </div>
                  );
                })}
              </div>
              {/* Toevoeg formulier */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <select id="kalender-type" defaultValue="vakantie" style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.5rem', fontSize: '1.0rem', fontWeight: 600 }}>
                  <option value="vakantie">Vakantie</option>
                  <option value="toetsweek">Toetsweek</option>
                  <option value="studiedag">Studiedag</option>
                </select>
                <input id="kalender-naam" placeholder="Naam..." style={{ flex: 1, minWidth: 120, border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.6rem', fontSize: '1.0rem' }} />
                <input id="kalender-start" type="date" style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.5rem', fontSize: '1.0rem' }} />
                <span style={{ color: '#9CA3AF' }}>t/m</span>
                <input id="kalender-eind" type="date" style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.5rem', fontSize: '1.0rem' }} />
                <button onClick={async () => {
                  const type = (document.getElementById('kalender-type') as HTMLSelectElement).value;
                  const naam = (document.getElementById('kalender-naam') as HTMLInputElement).value.trim();
                  const start = (document.getElementById('kalender-start') as HTMLInputElement).value;
                  const eind = (document.getElementById('kalender-eind') as HTMLInputElement).value;
                  if (!naam || !start) return;
                  await fetch('/api/vakanties', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ naam, start_datum: start, eind_datum: eind || start, type }) });
                  fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
                  (document.getElementById('kalender-naam') as HTMLInputElement).value = '';
                  (document.getElementById('kalender-start') as HTMLInputElement).value = '';
                  (document.getElementById('kalender-eind') as HTMLInputElement).value = '';
                }} style={{ background: '#374151', color: 'white', border: 'none', borderRadius: 6, padding: '0.4rem 1rem', fontWeight: 700, fontSize: '1.0rem', cursor: 'pointer' }}>
                  + Toevoegen
                </button>
              </div>
            </div>

          </div>
        )}

        </div>

        {/* ═══ LESSON DETAIL PANEL (tabbed) ═══ */}
        {selectedLesPanel && (() => {
          const panelLes = getCellLes(selectedLesPanel.klas_id, selectedLesPanel.datum, selectedLesPanel.uur || 0);
          const panelKlas = klassen.find(k => k.id === selectedLesPanel.klas_id);
          const panelKleur = klasKleurMap[selectedLesPanel.klas_id] || '#6B7280';
          const panelKey = `${selectedLesPanel.klas_id}-${selectedLesPanel.datum}-${selectedLesPanel.uur}`;
          const tabs = visibleFields.map(f => ({ key: f.veld_key, label: f.label, placeholder: f.label + '...', icon: f.icoon, isCustom: f.is_custom }));
          const activeTab = tabs.find(t => t.key === panelTab) || tabs[0];
          const hasContent = (key: string) => isFieldFilled(panelLes, key);

          return (
            <div style={{ width: 380, background: 'white', borderLeft: `1px solid #e5e7eb`, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 12px rgba(0,0,0,0.06)' }}>
              {/* Panel header */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: `3px solid ${panelKleur}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: panelKleur + '08' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '1.12rem', color: panelKleur }}>{panelKlas?.naam}</span>
                  <span style={{ fontSize: '1.0rem', color: '#94a3b8', marginLeft: 8 }}>Uur {selectedLesPanel.uur || '—'} · {formatDate(selectedLesPanel.datum)}</span>
                  <div style={{ fontSize: '0.92rem', color: '#94a3b8', marginTop: 2 }}>{panelKlas?.vak} · {panelKlas?.lokaal}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button onClick={() => { setShowKopieerModal('kopieer'); setKopieerDoelKlas(''); setKopieerDoelDatum(''); setKopieerDoelUur(''); setKopieerStatus(''); }}
                    title="Kopieer naar andere klas/datum"
                    style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#0369a1' }}>📋</button>
                  <button onClick={async () => {
                      if (!confirm('Alle lessen en toetsen vanaf dit punt 1 les vooruit schuiven?')) return;
                      const res = await fetch('/api/lessen/verschuif', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ klas_id: selectedLesPanel.klas_id, datum: selectedLesPanel.datum, uur: selectedLesPanel.uur, periode_id: selectedPeriodeId })
                      });
                      if (res.ok) { fetchLessen(); fetch('/api/toetsen').then(r => r.json()).then(setToetsen); }
                    }}
                    title="Verschuif alle lessen 1 les vooruit"
                    style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#92400e' }}>↗️</button>
                  <button onClick={() => setSelectedLesPanel(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px', borderRadius: 4 }}>✕</button>
                </div>
              </div>

              {/* Kopieer/verplaats form */}
              {showKopieerModal && (
                <div style={{ padding: '0.6rem 0.8rem', background: '#f0f9ff', borderBottom: '2px solid #7dd3fc', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0369a1', marginBottom: 6 }}>
                    📋 Kopieer les naar...
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <select value={kopieerDoelKlas} onChange={e => setKopieerDoelKlas(e.target.value ? Number(e.target.value) : '')}
                      style={{ border: '1px solid #d1d5db', borderRadius: 5, padding: '0.35rem 0.5rem', fontSize: '0.95rem' }}>
                      <option value="">Kies klas...</option>
                      {klassen.map(k => <option key={k.id} value={k.id}>{k.naam} ({k.vak})</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="date" value={kopieerDoelDatum} onChange={e => setKopieerDoelDatum(e.target.value)}
                        style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 5, padding: '0.35rem 0.5rem', fontSize: '0.95rem' }} />
                      <select value={kopieerDoelUur} onChange={e => setKopieerDoelUur(e.target.value ? Number(e.target.value) : '')}
                        style={{ width: 80, border: '1px solid #d1d5db', borderRadius: 5, padding: '0.35rem 0.5rem', fontSize: '0.95rem' }}>
                        <option value="">Uur</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={async () => {
                        if (!kopieerDoelKlas || !kopieerDoelDatum) { setKopieerStatus('Kies klas en datum'); return; }
                        setKopieerStatus('Bezig...');
                        const res = await fetch('/api/lessen/kopie', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ...(panelLes.id ? { bron_id: panelLes.id } : { bron_data: panelLes }),
                            doel_klas_id: kopieerDoelKlas,
                            doel_datum: kopieerDoelDatum,
                            doel_uur: kopieerDoelUur || null,
                            modus: 'kopieer',
                          })
                        });
                        if (res.ok) {
                          setKopieerStatus('Gekopieerd!');
                          fetchLessen();
                          setTimeout(() => { setShowKopieerModal(null); setKopieerStatus(''); }, 1200);
                        } else {
                          setKopieerStatus('Fout bij opslaan');
                        }
                      }} style={{
                        background: '#0369a1', color: 'white', border: 'none', borderRadius: 5,
                        padding: '0.4rem 1rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer'
                      }}>
                        📋 Kopiëren
                      </button>
                      <button onClick={() => setShowKopieerModal(null)}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 5, padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.9rem', color: '#6b7280' }}>
                        Annuleren
                      </button>
                      {kopieerStatus && <span style={{ fontSize: '0.88rem', fontWeight: 600, color: kopieerStatus.includes('!') ? '#16a34a' : '#dc2626' }}>{kopieerStatus}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '0.4rem 0.5rem', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setPanelTab(tab.key)}
                    style={{ padding: '0.45rem 0.75rem', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.92rem', fontWeight: 600,
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
                {activeTab && (
                  <InlineEditor
                    key={`${panelKey}-${activeTab.key}`}
                    content={getFieldValue(panelLes, activeTab.key)}
                    onChange={(val) => {
                      if (activeTab.isCustom) {
                        const newCustom = { ...(panelLes.custom_velden || {}), [activeTab.key]: val };
                        updateCell(panelKey, panelLes, 'custom_velden' as keyof Les, JSON.stringify(newCustom));
                      } else {
                        updateCell(panelKey, panelLes, activeTab.key as keyof Les, val);
                      }
                    }}
                    onFocus={(editor) => setActiveEditor(editor)}
                    placeholder={activeTab.placeholder}
                    borderColor={panelKleur}
                    grow
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* ═══ WERKLIJST SIDEBAR (zichtbaar in dagweergave) ═══ */}
        {view === 'dag' && !selectedLesPanel && (
          <div style={{ width: 260, background: 'white', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {(['werklijst', 'notities'] as const).map(tab => (
                <button key={tab} onClick={() => setWerklijstTab(tab)} style={{
                  flex: 1, padding: '11px 8px 9px', border: 'none', cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 700, background: 'transparent',
                  color: werklijstTab === tab ? '#0f172a' : '#94a3b8',
                  borderBottom: werklijstTab === tab ? '2px solid #0f172a' : '2px solid transparent',
                  textTransform: 'capitalize',
                }}>
                  {tab === 'werklijst' ? `Werklijst` : 'Notities'}
                  {tab === 'werklijst' && werklijst.filter(w => !w.afgerond).length > 0 && (
                    <span style={{ fontSize: '0.7rem', background: werklijstTab === tab ? '#0f172a' : '#e2e8f0', color: werklijstTab === tab ? 'white' : '#64748b', padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>
                      {werklijst.filter(w => !w.afgerond).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {werklijstTab === 'werklijst' ? (
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 8px' }}>
                {/* Prioriteit */}
                {werklijst.filter(w => w.categorie === 'prio' && !w.afgerond).length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 4px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} /> Prioriteit
                    </div>
                    {werklijst.filter(w => w.categorie === 'prio' && !w.afgerond).map(item => (
                      <div key={item.id} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 7, background: item.kleur + '08', borderLeft: `3px solid ${item.kleur}`, cursor: 'pointer', transition: 'all 0.1s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <input type="checkbox" checked={false} onChange={async () => {
                            await fetch('/api/werklijst', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, afgerond: true }) });
                            fetchWerklijst();
                          }} style={{ cursor: 'pointer', accentColor: item.kleur }} />
                          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>{item.titel}</span>
                        </div>
                        {item.sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, marginLeft: 22 }}>{item.sub}</div>}
                      </div>
                    ))}
                  </>
                )}

                {/* Taken */}
                {werklijst.filter(w => w.categorie === 'taak' && !w.afgerond).length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 4px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: '#64748b', display: 'inline-block' }} /> Taken
                    </div>
                    {werklijst.filter(w => w.categorie === 'taak' && !w.afgerond).map(item => (
                      <div key={item.id} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 7, background: '#f8fafc', borderLeft: `3px solid ${item.kleur}`, cursor: 'pointer', transition: 'all 0.1s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <input type="checkbox" checked={false} onChange={async () => {
                            await fetch('/api/werklijst', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, afgerond: true }) });
                            fetchWerklijst();
                          }} style={{ cursor: 'pointer' }} />
                          <span style={{ fontSize: '0.84rem', fontWeight: 500, color: '#475569' }}>{item.titel}</span>
                        </div>
                        {item.sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, marginLeft: 22 }}>{item.sub}</div>}
                      </div>
                    ))}
                  </>
                )}

                {/* Agenda */}
                {werklijst.filter(w => w.categorie === 'agenda' && !w.afgerond).length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 4px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: '#3b82f6', display: 'inline-block' }} /> Agenda
                    </div>
                    {werklijst.filter(w => w.categorie === 'agenda' && !w.afgerond).map(item => (
                      <div key={item.id} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 7, background: item.kleur + '08', borderLeft: `3px solid ${item.kleur}` }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>{item.titel}</div>
                        {item.datum && <div style={{ fontSize: '0.72rem', color: item.kleur, fontWeight: 600, marginTop: 2 }}>📅 {formatDate(item.datum)}</div>}
                        {item.sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{item.sub}</div>}
                      </div>
                    ))}
                  </>
                )}

                {/* Voorbereiding */}
                {werklijst.filter(w => w.categorie === 'voorbereiding' && !w.afgerond).length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 4px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: '#94a3b8', display: 'inline-block' }} /> Voorbereiding
                    </div>
                    {werklijst.filter(w => w.categorie === 'voorbereiding' && !w.afgerond).map(item => (
                      <div key={item.id} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 7, background: '#f8fafc', borderLeft: `3px solid ${item.kleur}` }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 500, color: '#475569' }}>{item.titel}</div>
                        {item.sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{item.sub}</div>}
                      </div>
                    ))}
                  </>
                )}

                {/* Leeg state */}
                {werklijst.filter(w => !w.afgerond).length === 0 && !showWerklijstForm && (
                  <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: '0.84rem', padding: '2rem 1rem' }}>
                    Geen items. Voeg er een toe!
                  </div>
                )}

                {/* Nieuw item form */}
                {showWerklijstForm && (
                  <div style={{ padding: '8px', background: '#f8fafc', borderRadius: 8, marginTop: 8, border: '1px solid #e2e8f0' }}>
                    <input value={nieuwWerkItem.titel} onChange={e => setNieuwWerkItem({ ...nieuwWerkItem, titel: e.target.value })}
                      placeholder="Titel..." autoFocus
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && nieuwWerkItem.titel.trim()) {
                          await fetch('/api/werklijst', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nieuwWerkItem) });
                          setNieuwWerkItem({ titel: '', categorie: 'taak', sub: '', datum: '' }); setShowWerklijstForm(false); fetchWerklijst();
                        }
                        if (e.key === 'Escape') setShowWerklijstForm(false);
                      }}
                      style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 5, padding: '6px 8px', fontSize: '0.86rem', marginBottom: 6 }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <select value={nieuwWerkItem.categorie} onChange={e => setNieuwWerkItem({ ...nieuwWerkItem, categorie: e.target.value })}
                        style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '4px', fontSize: '0.8rem' }}>
                        <option value="prio">Prioriteit</option>
                        <option value="taak">Taak</option>
                        <option value="agenda">Agenda</option>
                        <option value="voorbereiding">Voorbereiding</option>
                      </select>
                      <button onClick={async () => {
                        if (!nieuwWerkItem.titel.trim()) return;
                        await fetch('/api/werklijst', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nieuwWerkItem) });
                        setNieuwWerkItem({ titel: '', categorie: 'taak', sub: '', datum: '' }); setShowWerklijstForm(false); fetchWerklijst();
                      }} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: 5, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, padding: '2rem 1rem', textAlign: 'center', color: '#cbd5e1', fontSize: '0.84rem' }}>
                Notities komen hier
              </div>
            )}

            {/* Add button */}
            <div style={{ padding: '8px 10px', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowWerklijstForm(!showWerklijstForm)} style={{
                width: '100%', padding: '8px', borderRadius: 7, border: '2px dashed #e2e8f0',
                background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8',
              }}>+ Nieuw item</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function TBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '1.05rem',
      background: active ? '#2d8a4e20' : 'transparent', color: active ? '#2d8a4e' : '#374151', fontWeight: active ? 700 : 400,
    }}>{children}</button>
  );
}
function Sep() { return <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />; }
