'use client';

import { useEffect, useState, useCallback } from 'react';

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface RoosterSlot { id?: number; klas_id: number; dag: number; uur: number; vak: string; lokaal: string; is_blokuur: boolean; }
interface Les { id?: number; klas_id: number; datum: string; uur: number | null; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; notities: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; kleur: string; les_id: number | null; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; }

const dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const klasKleuren = ['#1a7a2e', '#2563EB', '#9333EA', '#DC2626', '#D97706', '#0891B2', '#BE185D', '#4338CA'];
const toetsKleuren: Record<string, string> = {
  PW: '#DC2626', SO: '#D97706', PO: '#7C3AED', MO: '#059669', SE: '#2563EB', overig: '#6B7280',
};
const toetsLabels: Record<string, string> = {
  PW: 'Proefwerk', SO: 'Schriftelijke overhoring', PO: 'Praktische opdracht', MO: 'Mondeling', SE: 'Schoolexamen', overig: 'Overig',
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}
function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
function getWeekNumber(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
function getDaysOfWeek(weekStart: string): string[] {
  const days: string[] = [];
  const start = new Date(weekStart + 'T12:00:00');
  for (let i = 0; i < 5; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}
function isInVakantie(datum: string, vakanties: Vakantie[]): Vakantie | null {
  for (const v of vakanties) {
    if (datum >= v.start_datum && datum <= v.eind_datum) return v;
  }
  return null;
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

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()).toISOString().split('T')[0]);
  const [editingLes, setEditingLes] = useState<Les | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO' });
  const [copySource, setCopySource] = useState<Les | null>(null);
  const [saving, setSaving] = useState(false);

  const days = getDaysOfWeek(weekStart);
  const weekEnd = days[4];
  const today = new Date().toISOString().split('T')[0];

  // Kleur per klas
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
    Promise.all(
      klassen.map(k =>
        fetch(`/api/lessen?klas_id=${k.id}&week_start=${weekStart}&week_end=${weekEnd}`)
          .then(r => r.json())
          .then((d: Les[] | Les | null) => Array.isArray(d) ? d : d ? [d] : [])
      )
    ).then(r => setLessen(r.flat()));
  }, [klassen, weekStart, weekEnd]);

  const fetchToetsen = useCallback(() => {
    if (klassen.length === 0) return;
    Promise.all(klassen.map(k => fetch(`/api/toetsen?klas_id=${k.id}`).then(r => r.json())))
      .then(r => setToetsen(r.flat()));
  }, [klassen]);

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { fetchLessen(); }, [fetchLessen]);
  useEffect(() => { fetchToetsen(); }, [fetchToetsen]);

  /* ───── Helpers ───── */
  const getSlot = (dag: number, uur: number): RoosterSlot | undefined =>
    allRooster.find(r => r.dag === dag && r.uur === uur);

  const getLes = (klas_id: number, datum: string, uur: number): Les | undefined =>
    lessen.find(l => l.klas_id === klas_id && l.datum === datum && l.uur === uur);

  const getToetsenForDateKlas = (datum: string, klas_id: number): Toets[] =>
    toetsen.filter(t => t.datum === datum && t.klas_id === klas_id);

  /* ───── Rooster: dropdown klas kiezen per cel ───── */
  async function setRoosterKlas(dag: number, uur: number, klasId: number | null) {
    const existing = getSlot(dag, uur);

    // Verwijder bestaande slot
    if (existing?.id) {
      await fetch(`/api/roosters?id=${existing.id}`, { method: 'DELETE' });
    }

    // Nieuwe klas toewijzen
    if (klasId) {
      const klas = klassen.find(k => k.id === klasId);
      await fetch('/api/roosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          klas_id: klasId, dag, uur,
          vak: klas?.vak || '', lokaal: klas?.lokaal || '',
          is_blokuur: false,
        }),
      });
    }
    fetchAllRooster();
  }

  /* ───── Save lesson ───── */
  async function saveLes(les: Les) {
    setSaving(true);
    await fetch('/api/lessen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(les),
    });
    setSaving(false);
    fetchLessen();
  }

  /* ───── Toets ───── */
  async function deleteToets(id: number) {
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' });
    fetchToetsen();
  }

  /* ───── Week nav ───── */
  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  /* ───── Render ───── */
  return (
    <div style={{ padding: '1rem 1.5rem', maxWidth: 1600, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1a7a2e' }}>Weekplanner</h1>
          {/* Legenda */}
          {klassen.map((k, i) => (
            <span key={k.id} style={{
              padding: '0.2rem 0.5rem', borderRadius: 5, fontSize: '0.75rem', fontWeight: 600,
              background: klasKleuren[i % klasKleuren.length] + '15',
              color: klasKleuren[i % klasKleuren.length],
              border: `1px solid ${klasKleuren[i % klasKleuren.length]}30`,
            }}>{k.naam} - {k.vak} ({k.lokaal})</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {copySource && (
            <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, padding: '0.2rem 0.5rem', background: '#FEF3C7', borderRadius: 6 }}>
              Les gekopieerd
              <button onClick={() => setCopySource(null)} style={{ background: 'none', border: 'none', color: '#D97706', cursor: 'pointer', fontWeight: 700, marginLeft: 4 }}>✕</button>
            </span>
          )}
          <button onClick={() => changeWeek(-1)} style={navBtn}>&#9664;</button>
          <span style={{ fontWeight: 700, color: '#1a7a2e', minWidth: 80, textAlign: 'center', fontSize: '0.9rem' }}>
            Wk {getWeekNumber(weekStart)}
          </span>
          <button onClick={() => changeWeek(1)} style={navBtn}>&#9654;</button>
          <button onClick={() => setWeekStart(getMonday(new Date()).toISOString().split('T')[0])}
            style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.35rem 0.7rem' }}>Vandaag</button>
        </div>
      </div>

      {/* Week Grid */}
      <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid #d4d4d4' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 42 }}></th>
              {days.map((d, idx) => {
                const vak = isInVakantie(d, vakanties);
                return (
                  <th key={d} style={{
                    ...th,
                    background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f0fdf4',
                    color: d === today ? '#1a7a2e' : vak ? '#b91c1c' : '#374151',
                  }}>
                    <div style={{ fontSize: '0.88rem' }}>{dagNamen[idx]}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 400, opacity: 0.65 }}>{formatDate(d)}</div>
                    {vak && <div style={{ fontSize: '0.65rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
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

                  // Vakantie cel
                  if (vakantie) {
                    return (
                      <td key={`${d}-${uur}`} style={{ ...td, background: '#fef2f2', textAlign: 'center' }}>
                        {uur === 1 && <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 600 }}>{vakantie.naam}</span>}
                      </td>
                    );
                  }

                  return (
                    <td key={`${d}-${uur}`} style={{
                      ...td,
                      borderLeft: slot ? `3px solid ${kleur}` : undefined,
                      background: d === today ? '#f0fdf4' : slot ? 'white' : '#fcfcfc',
                      position: 'relative',
                    }}>
                      {/* Dropdown klas kiezen */}
                      <select
                        value={slot?.klas_id || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setRoosterKlas(dag, uur, val ? Number(val) : null);
                        }}
                        style={{
                          width: '100%', border: 'none', background: 'transparent',
                          fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                          color: kleur || '#c4c4c4', outline: 'none',
                          padding: '0 0 2px 0', marginBottom: 1,
                        }}
                      >
                        <option value="" style={{ color: '#c4c4c4' }}>— kies klas —</option>
                        {klassen.map((k, i) => (
                          <option key={k.id} value={k.id} style={{ color: klasKleuren[i % klasKleuren.length], fontWeight: 600 }}>
                            {k.naam} ({k.lokaal})
                          </option>
                        ))}
                      </select>

                      {/* Als er een klas is: lesinhoud + toetsen */}
                      {slot && klas && (
                        <div
                          onClick={() => {
                            if (copySource && slot) {
                              saveLes({ ...copySource, klas_id: slot.klas_id, datum: d, uur, id: undefined });
                              setCopySource(null);
                              return;
                            }
                            setEditingLes(les || emptyLes(slot.klas_id, d, uur));
                          }}
                          style={{ cursor: 'pointer', minHeight: 32 }}
                        >
                          {/* Toetsen */}
                          {cellToetsen.map(t => (
                            <div key={t.id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 2,
                              background: (toetsKleuren[t.type] || '#6B7280') + '15',
                              color: toetsKleuren[t.type] || '#6B7280',
                              padding: '0 4px', borderRadius: 3, fontSize: '0.63rem',
                              fontWeight: 700, marginBottom: 2, marginRight: 2,
                            }}>
                              {t.type}: {t.naam.length > 12 ? t.naam.slice(0, 12) + '..' : t.naam}
                              <button onClick={e => { e.stopPropagation(); deleteToets(t.id); }}
                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.58rem', padding: 0 }}>✕</button>
                            </div>
                          ))}

                          {/* Lesinhoud preview */}
                          {les?.programma ? (
                            <div style={{ fontSize: '0.7rem', lineHeight: 1.3, color: '#334155' }}>
                              {les.programma.split('\n').slice(0, 2).map((l, i) => (
                                <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: '#d4d4d4', fontSize: '0.68rem' }}>+ plan les</div>
                          )}
                          {les?.huiswerk && (
                            <div style={{ color: '#D97706', fontWeight: 600, fontSize: '0.63rem', marginTop: 1 }}>
                              HW: {les.huiswerk.split('\n')[0].slice(0, 28)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Hover actions */}
                      {les && (
                        <div style={{ position: 'absolute', top: 1, right: 1, display: 'flex', gap: 1 }}>
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

      {/* ── Les Planning Modal ── */}
      {editingLes && (() => {
        const klas = klassen.find(k => k.id === editingLes.klas_id);
        const kleur = klasKleurMap[editingLes.klas_id] || '#1a7a2e';
        const dagIdx = new Date(editingLes.datum + 'T12:00:00').getDay() - 1;
        return (
          <div style={overlay} onClick={() => setEditingLes(null)}>
            <div style={{ ...modal, maxWidth: 680, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', background: kleur + '15', color: kleur }}>{klas?.naam}</span>
                  <span style={{ color: '#374151', fontWeight: 600, fontSize: '0.95rem' }}>
                    {dagNamen[dagIdx]} {formatDate(editingLes.datum)}{editingLes.uur ? `, uur ${editingLes.uur}` : ''}
                  </span>
                </div>
                <button onClick={() => setEditingLes(null)} style={closeBtn}>✕</button>
              </div>

              {[
                { key: 'terugkijken', label: 'Terugkijken', placeholder: 'Wat hebben we vorige les behandeld?', rows: 2 },
                { key: 'programma', label: 'Programma', placeholder: 'Wat gaan we doen deze les?', rows: 3 },
                { key: 'leerdoelen', label: 'Leerdoelen', placeholder: 'Wat moeten leerlingen aan het einde kunnen?', rows: 2 },
                { key: 'startopdracht', label: 'Startopdracht', placeholder: 'Opdracht bij binnenkomst', rows: 2 },
                { key: 'huiswerk', label: 'Maak-/Huiswerk', placeholder: 'Op te geven huiswerk', rows: 2 },
                { key: 'niet_vergeten', label: 'Niet vergeten', placeholder: 'Reminders voor jezelf', rows: 2 },
                { key: 'notities', label: 'Notities', placeholder: 'Vrije notities', rows: 2 },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '0.6rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: 3 }}>{f.label}</label>
                  <textarea
                    value={(editingLes[f.key as keyof Les] as string) || ''}
                    onChange={e => setEditingLes({ ...editingLes, [f.key]: e.target.value })}
                    placeholder={f.placeholder} rows={f.rows}
                    style={{ width: '100%', border: `1.5px solid ${kleur}30`, borderRadius: 8, padding: '0.45rem 0.7rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', background: '#fafffe', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              {/* Toets quick-add */}
              <div style={{ background: '#fafafa', padding: '0.6rem', borderRadius: 8, marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>Toets toevoegen</div>
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem', fontSize: '0.78rem', fontWeight: 600, color: toetsKleuren[newToets.type] }}>
                    {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })}
                    placeholder="Naam" style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.78rem' }} />
                  <button onClick={async () => {
                    if (!newToets.naam.trim()) return;
                    setSaving(true);
                    await fetch('/api/toetsen', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ klas_id: editingLes.klas_id, naam: newToets.naam, type: newToets.type, datum: editingLes.datum, kleur: toetsKleuren[newToets.type] || '#6B7280' }),
                    });
                    setSaving(false); setNewToets({ naam: '', type: 'SO' }); fetchToetsen();
                  }} style={{ ...btn, background: toetsKleuren[newToets.type], color: 'white', padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}>+</button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => { setCopySource(editingLes); setEditingLes(null); }}
                  style={{ ...btn, background: '#FEF3C7', color: '#92400E', fontSize: '0.8rem' }}>Kopieer les</button>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => setEditingLes(null)} style={{ ...btn, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                  <button onClick={async () => { await saveLes(editingLes); setEditingLes(null); }} disabled={saving}
                    style={{ ...btn, background: '#1a7a2e', color: 'white' }}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
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
