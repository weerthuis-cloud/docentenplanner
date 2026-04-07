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
  const [showRoosterSetup, setShowRoosterSetup] = useState(false);
  const [roosterPaintKlas, setRoosterPaintKlas] = useState<number | null>(null);
  const [editingLes, setEditingLes] = useState<Les | null>(null);
  const [editingToets, setEditingToets] = useState<{ klas_id: number; datum: string } | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO' });
  const [copySource, setCopySource] = useState<Les | null>(null);
  const [saving, setSaving] = useState(false);

  const days = getDaysOfWeek(weekStart);
  const weekEnd = days[4];
  const today = new Date().toISOString().split('T')[0];

  // Kleuren map per klas
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
    // Fetch lessen for all klassen at once
    Promise.all(
      klassen.map(k =>
        fetch(`/api/lessen?klas_id=${k.id}&week_start=${weekStart}&week_end=${weekEnd}`)
          .then(r => r.json())
          .then((data: Les[] | Les | null) => Array.isArray(data) ? data : data ? [data] : [])
      )
    ).then(results => setLessen(results.flat()));
  }, [klassen, weekStart, weekEnd]);

  const fetchToetsen = useCallback(() => {
    Promise.all(
      klassen.map(k => fetch(`/api/toetsen?klas_id=${k.id}`).then(r => r.json()))
    ).then(results => setToetsen(results.flat()));
  }, [klassen]);

  useEffect(() => { fetchAllRooster(); }, [fetchAllRooster]);
  useEffect(() => { if (klassen.length > 0) fetchLessen(); }, [fetchLessen, klassen]);
  useEffect(() => { if (klassen.length > 0) fetchToetsen(); }, [fetchToetsen, klassen]);

  /* ───── Helpers ───── */
  const getSlot = (dag: number, uur: number): RoosterSlot | undefined =>
    allRooster.find(r => r.dag === dag && r.uur === uur);

  const getLes = (klas_id: number, datum: string, uur: number): Les | undefined =>
    lessen.find(l => l.klas_id === klas_id && l.datum === datum && l.uur === uur);

  const getToetsenForDateKlas = (datum: string, klas_id: number): Toets[] =>
    toetsen.filter(t => t.datum === datum && t.klas_id === klas_id);

  // Which uren are used in the rooster?
  const usedUren = (): number[] => {
    const uren = new Set<number>();
    allRooster.forEach(r => uren.add(r.uur));
    if (uren.size === 0) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return Array.from(uren).sort((a, b) => a - b);
  };

  /* ───── Week nav ───── */
  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
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

  /* ───── Rooster toggle ───── */
  async function toggleRoosterSlot(dag: number, uur: number) {
    if (!roosterPaintKlas) return;
    const existing = getSlot(dag, uur);

    if (existing && existing.klas_id === roosterPaintKlas) {
      // Remove
      if (existing.id) await fetch(`/api/roosters?id=${existing.id}`, { method: 'DELETE' });
    } else if (existing) {
      // Replace with different klas
      if (existing.id) await fetch(`/api/roosters?id=${existing.id}`, { method: 'DELETE' });
      const klas = klassen.find(k => k.id === roosterPaintKlas);
      await fetch('/api/roosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klas_id: roosterPaintKlas, dag, uur, vak: klas?.vak || '', lokaal: klas?.lokaal || '', is_blokuur: false }),
      });
    } else {
      // Add new
      const klas = klassen.find(k => k.id === roosterPaintKlas);
      await fetch('/api/roosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klas_id: roosterPaintKlas, dag, uur, vak: klas?.vak || '', lokaal: klas?.lokaal || '', is_blokuur: false }),
      });
    }
    fetchAllRooster();
  }

  /* ───── Toets ───── */
  async function addToets() {
    if (!editingToets || !newToets.naam.trim()) return;
    setSaving(true);
    await fetch('/api/toetsen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        klas_id: editingToets.klas_id, naam: newToets.naam, type: newToets.type,
        datum: editingToets.datum, kleur: toetsKleuren[newToets.type] || '#6B7280',
      }),
    });
    setSaving(false);
    setEditingToets(null);
    setNewToets({ naam: '', type: 'SO' });
    fetchToetsen();
  }

  async function deleteToets(id: number) {
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' });
    fetchToetsen();
  }

  /* ───── Copy/paste ───── */
  async function pasteLes(klas_id: number, datum: string, uur: number) {
    if (!copySource) return;
    await saveLes({ ...copySource, klas_id, datum, uur, id: undefined });
    setCopySource(null);
  }

  /* ───── Render ───── */
  const uren = usedUren();

  return (
    <div style={{ padding: '1rem 1.5rem', maxWidth: 1600, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1a7a2e' }}>Weekplanner</h1>
          {klassen.map((k, i) => (
            <span key={k.id} style={{
              padding: '0.25rem 0.6rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
              background: klasKleuren[i % klasKleuren.length] + '18',
              color: klasKleuren[i % klasKleuren.length],
              border: `1px solid ${klasKleuren[i % klasKleuren.length]}30`,
            }}>{k.naam}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {copySource && (
            <span style={{ fontSize: '0.78rem', color: '#D97706', fontWeight: 600, padding: '0.25rem 0.5rem', background: '#FEF3C7', borderRadius: 6 }}>
              Les gekopieerd. Klik een cel om te plakken.
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
          <button onClick={() => { setShowRoosterSetup(true); setRoosterPaintKlas(klassen[0]?.id || null); }}
            style={{ ...navBtn, padding: '0.35rem 0.7rem' }}>Rooster</button>
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
                  <th key={d} style={{ ...th, background: d === today ? '#dcfce7' : vak ? '#fef2f2' : '#f0fdf4', color: d === today ? '#1a7a2e' : vak ? '#b91c1c' : '#374151' }}>
                    <div style={{ fontSize: '0.88rem' }}>{dagNamen[idx]}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.65 }}>{formatDate(d)}</div>
                    {vak && <div style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 600 }}>{vak.naam}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {uren.map(uur => (
              <tr key={uur}>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa', fontSize: '0.85rem' }}>{uur}</td>
                {days.map((d, idx) => {
                  const dag = idx + 1;
                  const slot = getSlot(dag, uur);
                  const vakantie = isInVakantie(d, vakanties);

                  if (vakantie) {
                    return <td key={`${d}-${uur}`} style={{ ...td, background: '#fef2f2' }}></td>;
                  }

                  if (!slot) {
                    return (
                      <td key={`${d}-${uur}`} style={{ ...td, background: '#fafafa' }}>
                        {copySource && (
                          <div onClick={() => pasteLes(copySource.klas_id, d, uur)}
                            style={{ color: '#D97706', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'center' }}>+ plak</div>
                        )}
                      </td>
                    );
                  }

                  const klas = klassen.find(k => k.id === slot.klas_id);
                  const kleur = klasKleurMap[slot.klas_id] || '#6B7280';
                  const les = getLes(slot.klas_id, d, uur);
                  const cellToetsen = getToetsenForDateKlas(d, slot.klas_id);
                  const isToday = d === today;

                  return (
                    <td key={`${d}-${uur}`}
                      onClick={() => {
                        if (copySource) { pasteLes(slot.klas_id, d, uur); return; }
                        setEditingLes(les || emptyLes(slot.klas_id, d, uur));
                      }}
                      style={{
                        ...td,
                        borderLeft: `3px solid ${kleur}`,
                        background: isToday ? '#f0fdf4' : les?.programma ? 'white' : '#fcfcfc',
                        cursor: 'pointer', position: 'relative',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = kleur + '08'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isToday ? '#f0fdf4' : les?.programma ? 'white' : '#fcfcfc'; }}
                    >
                      {/* Klas label */}
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: kleur, marginBottom: 2 }}>
                        {klas?.naam}
                        {slot.lokaal && <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 4 }}>{slot.lokaal}</span>}
                      </div>

                      {/* Toetsen */}
                      {cellToetsen.map(t => (
                        <div key={t.id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          background: (toetsKleuren[t.type] || '#6B7280') + '15',
                          color: toetsKleuren[t.type] || '#6B7280',
                          padding: '0px 5px', borderRadius: 3, fontSize: '0.66rem',
                          fontWeight: 700, marginBottom: 2, marginRight: 2,
                        }}>
                          {t.type}: {t.naam.length > 15 ? t.naam.slice(0, 15) + '...' : t.naam}
                          <button onClick={(e) => { e.stopPropagation(); deleteToets(t.id); }}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.6rem', padding: 0 }}>✕</button>
                        </div>
                      ))}

                      {/* Les inhoud */}
                      {les?.programma ? (
                        <div style={{ fontSize: '0.72rem', lineHeight: 1.3, color: '#334155' }}>
                          {les.programma.split('\n').slice(0, 2).map((l, i) => (
                            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#d4d4d4', fontSize: '0.7rem' }}>+</div>
                      )}
                      {les?.huiswerk && (
                        <div style={{ color: '#D97706', fontWeight: 600, fontSize: '0.66rem', marginTop: 1 }}>
                          HW: {les.huiswerk.split('\n')[0].slice(0, 30)}
                        </div>
                      )}

                      {/* Hover actions */}
                      {les && (
                        <div style={{ position: 'absolute', top: 1, right: 1, display: 'flex', gap: 1 }} className="cell-actions">
                          <button onClick={(e) => { e.stopPropagation(); setCopySource(les); }}
                            title="Kopieer" style={miniBtn}>&#9112;</button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingToets({ klas_id: slot.klas_id, datum: d }); }}
                            title="Toets" style={miniBtn}>T</button>
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

      {/* ── Rooster Setup ── */}
      {showRoosterSetup && (
        <div style={overlay} onClick={() => setShowRoosterSetup(false)}>
          <div style={{ ...modal, maxWidth: 850 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, color: '#1a7a2e', fontSize: '1.15rem' }}>Rooster instellen</h2>
              <button onClick={() => setShowRoosterSetup(false)} style={closeBtn}>✕</button>
            </div>

            {/* Klas paint selector */}
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#6B7280', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>
                Selecteer een klas en klik op de uren in het rooster. Klik opnieuw om te verwijderen.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {klassen.map((k, i) => {
                  const kleur = klasKleuren[i % klasKleuren.length];
                  const selected = roosterPaintKlas === k.id;
                  return (
                    <button key={k.id} onClick={() => setRoosterPaintKlas(k.id)} style={{
                      padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                      border: selected ? `2px solid ${kleur}` : '2px solid transparent',
                      background: selected ? kleur : kleur + '15',
                      color: selected ? 'white' : kleur,
                      transition: 'all 0.15s',
                    }}>
                      {k.naam}
                      <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 6, opacity: 0.8 }}>{k.vak} - {k.lokaal}</span>
                    </button>
                  );
                })}
                {/* Eraser */}
                <button onClick={() => setRoosterPaintKlas(-1)} style={{
                  padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                  border: roosterPaintKlas === -1 ? '2px solid #DC2626' : '2px solid transparent',
                  background: roosterPaintKlas === -1 ? '#DC2626' : '#fef2f2',
                  color: roosterPaintKlas === -1 ? 'white' : '#DC2626',
                }}>Wissen</button>
              </div>
            </div>

            {/* Rooster grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 42 }}></th>
                  {dagNamen.map((n, i) => <th key={i} style={th}>{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(uur => (
                  <tr key={uur}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#9CA3AF', background: '#fafafa' }}>{uur}</td>
                    {[1, 2, 3, 4, 5].map(dag => {
                      const slot = allRooster.find(r => r.dag === dag && r.uur === uur);
                      const klas = slot ? klassen.find(k => k.id === slot.klas_id) : null;
                      const kleur = slot ? (klasKleurMap[slot.klas_id] || '#6B7280') : undefined;

                      return (
                        <td key={dag}
                          onClick={async () => {
                            if (roosterPaintKlas === -1 && slot?.id) {
                              await fetch(`/api/roosters?id=${slot.id}`, { method: 'DELETE' });
                              fetchAllRooster();
                            } else if (roosterPaintKlas && roosterPaintKlas > 0) {
                              await toggleRoosterSlot(dag, uur);
                            }
                          }}
                          style={{
                            ...td,
                            cursor: 'pointer',
                            background: slot ? kleur + '12' : '#fefefe',
                            borderLeft: slot ? `3px solid ${kleur}` : '3px solid transparent',
                            textAlign: 'center',
                            height: 44,
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => {
                            if (!slot) (e.currentTarget as HTMLElement).style.background = roosterPaintKlas === -1 ? '#fef2f2' :
                              (roosterPaintKlas && roosterPaintKlas > 0 ? (klasKleurMap[roosterPaintKlas] || '#6B7280') + '15' : '#f5f5f5');
                          }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = slot ? kleur + '12' : '#fefefe'; }}
                        >
                          {klas ? (
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: kleur }}>{klas.naam}</div>
                              <div style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{klas.lokaal}</div>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button onClick={() => setShowRoosterSetup(false)} style={{ ...btn, background: '#1a7a2e', color: 'white' }}>Klaar</button>
            </div>
          </div>
        </div>
      )}

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
                    value={(editingLes as Record<string, unknown>)[f.key] as string || ''}
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

      {/* ── Toets Quick-Add ── */}
      {editingToets && (
        <div style={overlay} onClick={() => setEditingToets(null)}>
          <div style={{ ...modal, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.75rem', color: '#1a7a2e', fontSize: '1rem' }}>Toets toevoegen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.45rem', fontSize: '0.85rem' }}>
                {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}
              </select>
              <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })}
                placeholder="Naam toets" style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.45rem', fontSize: '0.85rem' }} />
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.3rem' }}>
                <button onClick={() => setEditingToets(null)} style={{ ...btn, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                <button onClick={addToets} style={{ ...btn, background: toetsKleuren[newToets.type], color: 'white' }}>Toevoegen</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Styles ───── */
const th: React.CSSProperties = { padding: '0.5rem', background: '#f0fdf4', color: '#374151', fontSize: '0.82rem', fontWeight: 600, borderBottom: '2px solid #d4d4d4', position: 'sticky', top: 0, zIndex: 10 };
const td: React.CSSProperties = { padding: '0.35rem 0.4rem', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #f0f0f0', fontSize: '0.78rem', verticalAlign: 'top' };
const navBtn: React.CSSProperties = { background: '#e8f5e9', border: 'none', borderRadius: 6, padding: '0.35rem 0.55rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#1a7a2e' };
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modal: React.CSSProperties = { background: 'white', borderRadius: 16, padding: '1.25rem', width: '92vw', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6B7280' };
const miniBtn: React.CSSProperties = { background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: 3, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.6rem', color: '#1a7a2e', fontWeight: 700 };
