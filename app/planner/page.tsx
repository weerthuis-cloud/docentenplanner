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

/* Strip HTML tags for plain text preview */
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/* Combineer terugkijken + programma + huiswerk in één HTML blok met sectielabels */
function buildCombinedContent(les: Les): string {
  // Als alle drie leeg zijn, toon een leeg veld (docent vult zelf in)
  const hasContent = les.terugkijken || les.programma || les.huiswerk;
  if (!hasContent) return '';

  const sections: string[] = [];
  const label = (text: string, color: string) =>
    `<p><strong><span style="color: ${color}">${text}</span></strong></p>`;

  sections.push(label('Terugkijken', '#1a7a2e'));
  sections.push(les.terugkijken || '<p></p>');
  sections.push(label('Programma', '#1a7a2e'));
  sections.push(les.programma || '<p></p>');
  sections.push(label('Maak- / Huiswerk', '#D97706'));
  sections.push(les.huiswerk || '<p></p>');

  return sections.join('');
}

/* Parse gecombineerde content terug naar losse velden */
function parseCombinedContent(html: string): { terugkijken: string; programma: string; huiswerk: string } {
  // Split op de sectielabels
  const terugkijkenMarker = 'Terugkijken</span></strong></p>';
  const programmaMarker = 'Programma</span></strong></p>';
  const huiswerkMarker = 'Maak- / Huiswerk</span></strong></p>';

  let terugkijken = '';
  let programma = '';
  let huiswerk = '';

  const tIdx = html.indexOf(terugkijkenMarker);
  const pIdx = html.indexOf(programmaMarker);
  const hIdx = html.indexOf(huiswerkMarker);

  if (tIdx !== -1 && pIdx !== -1 && hIdx !== -1) {
    const afterT = tIdx + terugkijkenMarker.length;
    const afterP = pIdx + programmaMarker.length;
    const afterH = hIdx + huiswerkMarker.length;

    terugkijken = html.substring(afterT, pIdx).trim();
    programma = html.substring(afterP, hIdx).trim();
    huiswerk = html.substring(afterH).trim();
  } else {
    // Fallback: alles als programma
    programma = html;
  }

  // Strip lege paragraaf-tags die alleen uit de label-regel bestaan
  const cleanLabel = (s: string) => s.replace(/^<p><strong><span[^>]*>[^<]*<\/span><\/strong><\/p>/, '').trim();
  terugkijken = cleanLabel(terugkijken);
  programma = cleanLabel(programma);
  huiswerk = cleanLabel(huiswerk);

  return { terugkijken, programma, huiswerk };
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

  const [view, setView] = useState<'rooster' | 'week'>('rooster');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [editingLes, setEditingLes] = useState<Les | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO' });
  const [copySource, setCopySource] = useState<Les | null>(null);
  const [saving, setSaving] = useState(false);

  const days = getDaysOfWeek(weekStart);
  const weekEnd = days[4];
  const today = new Date().toISOString().split('T')[0];

  const klasKleurMap: Record<number, string> = {};
  klassen.forEach((k, i) => { klasKleurMap[k.id] = klasKleuren[i % klasKleuren.length]; });

  /* ───── Fetching ───── */
  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen);
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
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

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { if (view === 'week') fetchLessen(); }, [fetchLessen, view]);
  useEffect(() => { if (view === 'week') fetchToetsen(); }, [fetchToetsen, view]);

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
    setSaving(false); fetchLessen();
  }

  async function deleteToets(id: number) {
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' }); fetchToetsen();
  }

  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
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
            <button onClick={() => setView('rooster')} style={{
              padding: '0.4rem 0.8rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: view === 'rooster' ? '#1a7a2e' : 'transparent', color: view === 'rooster' ? 'white' : '#1a7a2e',
            }}>Rooster</button>
            <button onClick={() => setView('week')} style={{
              padding: '0.4rem 0.8rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: view === 'week' ? '#1a7a2e' : 'transparent', color: view === 'week' ? 'white' : '#1a7a2e',
            }}>Weekplanner</button>
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

        {/* Week nav (alleen bij weekplanner) */}
        {view === 'week' && (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {copySource && (
              <span style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 600, padding: '0.2rem 0.5rem', background: '#FEF3C7', borderRadius: 6 }}>
                Gekopieerd <button onClick={() => setCopySource(null)} style={{ background: 'none', border: 'none', color: '#D97706', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </span>
            )}
            <button onClick={() => changeWeek(-1)} style={navBtn}>&#9664;</button>
            <span style={{ fontWeight: 700, color: '#1a7a2e', minWidth: 80, textAlign: 'center', fontSize: '0.9rem' }}>Wk {getWeekNumber(weekStart)}</span>
            <button onClick={() => changeWeek(1)} style={navBtn}>&#9654;</button>
            <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])}
              style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem' }}>Vandaag</button>
          </div>
        )}

        {view === 'rooster' && (
          <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
            Stel je weekrooster in. Koppel het daarna aan weken via <strong>Weekplanner</strong>.
          </div>
        )}
      </div>

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

                      // Als dit het 2e uur van een blokuur is, toon niets (wordt gemerged)
                      if (isSecond) {
                        return (
                          <td key={`${dag}-${uur}`} style={{
                            ...td, borderLeft: `3px solid ${kleur}`, background: kleur + '08',
                            textAlign: 'center', color: kleur, fontSize: '0.68rem', fontStyle: 'italic',
                          }}>
                            ↑ blokuur
                          </td>
                        );
                      }

                      return (
                        <td key={`${dag}-${uur}`} style={{
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

                    // Blokuur 2e uur: toon "↑ blokuur" subtiel
                    if (isSecond) {
                      return (
                        <td key={`${d}-${uur}`} style={{
                          ...td, borderLeft: `3px solid ${kleur}`, background: kleur + '05',
                          textAlign: 'center', color: kleur, fontSize: '0.65rem', opacity: 0.5,
                        }}>
                          ↑ zie hierboven
                        </td>
                      );
                    }

                    return (
                      <td key={`${d}-${uur}`}
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

      {/* ── Les Planning Modal ── */}
      {editingLes && (() => {
        const klas = klassen.find(k => k.id === editingLes.klas_id);
        const kleur = klasKleurMap[editingLes.klas_id] || '#1a7a2e';
        const dagIdx = new Date(editingLes.datum + 'T12:00:00').getDay() - 1;
        const modalToetsen = toetsen.filter(t => t.datum === editingLes.datum && t.klas_id === editingLes.klas_id);
        return (
          <div style={overlay} onClick={() => setEditingLes(null)}>
            <div style={{ ...modal, maxWidth: 780 }} onClick={e => e.stopPropagation()}>

              {/* ── Header: klas + datum + kopieer ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 6, height: 32, borderRadius: 3, background: kleur }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: kleur }}>{klas?.naam}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      Les {editingLes.uur || ''} &middot; {dagNamen[dagIdx]} {formatDate(editingLes.datum)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button onClick={() => { setCopySource(editingLes); setEditingLes(null); }}
                    style={{ ...btn, background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}>
                    ⧉ Kopieer les
                  </button>
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

              {/* ── Opslaan/Annuleren ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => setEditingLes(null)} style={{ ...btn, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                <button onClick={async () => { await saveLes(editingLes); setEditingLes(null); }} disabled={saving}
                  style={{ ...btn, background: '#1a7a2e', color: 'white', padding: '0.5rem 1.5rem' }}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
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
