'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; aantal_leerlingen: number; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; weging: number; max_score: number; omschrijving: string; kleur: string; les_id: number | null; }

const toetsKleuren: Record<string, string> = { PW: '#c95555', SO: '#c4892e', PO: '#8b5ec0', MO: '#2d8a4e', SE: '#4a80d4', overig: '#8b95a5' };
const toetsLabels: Record<string, string> = { PW: 'Proefwerk', SO: 'Schriftelijke overhoring', PO: 'Praktische opdracht', MO: 'Mondeling', SE: 'Schoolexamen', overig: 'Overig' };
const klasKleuren = ['#2d8a4e', '#4a80d4', '#8b5ec0', '#c95555', '#c4892e', '#2ba0b0', '#b04e7a', '#6060c0'];

type ViewMode = 'lijst' | 'kalender' | 'statistieken';
type FilterType = 'alle' | 'PW' | 'SO' | 'PO' | 'MO' | 'SE' | 'overig';

function formatDate(d: string | null) {
  if (!d) return '–';
  return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
function formatDateLong(d: string | null) {
  if (!d) return '–';
  return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' });
}
function getWeekNumber(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}
function daysUntil(datum: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(datum + 'T12:00:00'); target.setHours(0,0,0,0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ToetsenPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [view, setView] = useState<ViewMode>('lijst');
  const [filterKlas, setFilterKlas] = useState<number | 'alle'>('alle');
  const [filterType, setFilterType] = useState<FilterType>('alle');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editToets, setEditToets] = useState<Toets | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO', datum: '', weging: 1.0, max_score: 10, omschrijving: '' });
  const [kalenderMaand, setKalenderMaand] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen).catch(() => {});
    fetchToetsen();
  }, []);

  async function fetchToetsen() {
    const res = await fetch('/api/toetsen');
    setToetsen(await res.json().catch(() => []));
  }

  const klasKleurMap: Record<number, string> = {};
  klassen.forEach((k, i) => { klasKleurMap[k.id] = klasKleuren[i % klasKleuren.length]; });

  /* ───── Filtering ───── */
  const filtered = useMemo(() => {
    let result = [...toetsen];
    if (filterKlas !== 'alle') result = result.filter(t => t.klas_id === filterKlas);
    if (filterType !== 'alle') result = result.filter(t => t.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.naam.toLowerCase().includes(q) || (t.omschrijving || '').toLowerCase().includes(q));
    }
    return result.sort((a, b) => (a.datum || '9999').localeCompare(b.datum || '9999'));
  }, [toetsen, filterKlas, filterType, searchQuery]);

  const upcoming = filtered.filter(t => t.datum && t.datum >= today);
  const past = filtered.filter(t => !t.datum || t.datum < today).reverse();

  /* ───── Stats ───── */
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byKlas: Record<number, number> = {};
    const byWeek: Record<number, number> = {};
    toetsen.forEach(t => {
      byType[t.type] = (byType[t.type] || 0) + 1;
      byKlas[t.klas_id] = (byKlas[t.klas_id] || 0) + 1;
      if (t.datum) {
        const wk = getWeekNumber(t.datum);
        byWeek[wk] = (byWeek[wk] || 0) + 1;
      }
    });
    const upcomingCount = toetsen.filter(t => t.datum && t.datum >= today).length;
    const thisWeekCount = toetsen.filter(t => {
      if (!t.datum) return false;
      const days = daysUntil(t.datum);
      return days >= 0 && days <= 7;
    }).length;
    return { byType, byKlas, byWeek, total: toetsen.length, upcomingCount, thisWeekCount };
  }, [toetsen, today]);

  /* ───── CRUD ───── */
  async function createToets(openMaker = false) {
    if (!newToets.naam.trim() || filterKlas === 'alle') return;
    const res = await fetch('/api/toetsen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newToets, klas_id: filterKlas, kleur: toetsKleuren[newToets.type] || '#8b95a5' }),
    });
    const created = await res.json();
    setNewToets({ naam: '', type: 'SO', datum: '', weging: 1.0, max_score: 10, omschrijving: '' });
    setShowNew(false);
    if (openMaker && created?.id) {
      window.location.href = `/toetsen/maker?id=${created.id}`;
    } else {
      fetchToetsen();
    }
  }

  async function saveEdit() {
    if (!editToets) return;
    await fetch('/api/toetsen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editToets),
    });
    setEditToets(null);
    fetchToetsen();
  }

  async function deleteToets(id: number) {
    if (!confirm('Toets verwijderen? Alle cijfers worden ook verwijderd.')) return;
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' });
    fetchToetsen();
  }

  /* ───── Kalender helpers ───── */
  const kalenderDagen = useMemo(() => {
    const [jaar, maand] = kalenderMaand.split('-').map(Number);
    const eerstedag = new Date(jaar, maand - 1, 1);
    const laatstedag = new Date(jaar, maand, 0);
    const startDag = eerstedag.getDay() === 0 ? 6 : eerstedag.getDay() - 1; // ma=0
    const dagen: Array<{ datum: string; dag: number; maandDag: boolean }> = [];

    // Vorige maand opvullen
    for (let i = startDag - 1; i >= 0; i--) {
      const d = new Date(jaar, maand - 1, -i);
      dagen.push({ datum: d.toISOString().split('T')[0], dag: d.getDate(), maandDag: false });
    }
    // Deze maand
    for (let i = 1; i <= laatstedag.getDate(); i++) {
      const d = new Date(jaar, maand - 1, i);
      dagen.push({ datum: d.toISOString().split('T')[0], dag: i, maandDag: true });
    }
    // Volgende maand opvullen tot 42 (6 weken)
    const rest = 42 - dagen.length;
    for (let i = 1; i <= rest; i++) {
      const d = new Date(jaar, maand, i);
      dagen.push({ datum: d.toISOString().split('T')[0], dag: i, maandDag: false });
    }
    return dagen;
  }, [kalenderMaand]);

  function changeKalenderMaand(delta: number) {
    const [j, m] = kalenderMaand.split('-').map(Number);
    const d = new Date(j, m - 1 + delta, 1);
    setKalenderMaand(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const maandNaam = new Date(kalenderMaand + '-01T12:00:00').toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  /* ───── Styles ───── */
  const navBtn: React.CSSProperties = { padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white', fontWeight: 600, fontSize: '0.95rem', color: '#334155' };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f7f8fa' }}>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 1rem', background: 'white', borderBottom: '1px solid #e0e0e0', gap: '0.6rem', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* View tabs */}
        <div style={{ display: 'flex', background: '#eef4f0', borderRadius: 8, overflow: 'hidden' }}>
          {(['lijst', 'kalender', 'statistieken'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.4rem 0.8rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
              background: view === v ? '#2B5BA0' : 'transparent',
              color: view === v ? 'white' : '#2B5BA0',
            }}>{{ lijst: 'Lijst', kalender: 'Kalender', statistieken: 'Statistieken' }[v]}</button>
          ))}
        </div>

        {/* Klas filter */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={() => setFilterKlas('alle')} style={{
            padding: '0.25rem 0.6rem', borderRadius: 6, border: filterKlas === 'alle' ? '2px solid #2B5BA0' : '2px solid transparent',
            background: filterKlas === 'alle' ? '#EEF2FF' : '#f1f5f9', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
            color: filterKlas === 'alle' ? '#2B5BA0' : '#6b7280',
          }}>Alle</button>
          {klassen.map((k, i) => {
            const kleur = klasKleuren[i % klasKleuren.length];
            const active = filterKlas === k.id;
            return (
              <button key={k.id} onClick={() => setFilterKlas(k.id)} style={{
                padding: '0.25rem 0.6rem', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
                border: active ? `2px solid ${kleur}` : '2px solid transparent',
                background: active ? kleur + '20' : kleur + '10',
                color: kleur,
              }}>{k.naam}</button>
            );
          })}
        </div>

        {/* Type filter */}
        <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)} style={{
          padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#475569', cursor: 'pointer',
        }}>
          <option value="alle">Alle types</option>
          {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 250 }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Zoek toets..."
            style={{ width: '100%', padding: '0.35rem 0.7rem 0.35rem 2rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }} />
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: '#94a3b8' }}>🔍</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.88rem', color: '#6b7280' }}>
          <span><strong style={{ color: '#2B5BA0' }}>{stats.upcomingCount}</strong> gepland</span>
          <span><strong style={{ color: '#c4892e' }}>{stats.thisWeekCount}</strong> deze week</span>
        </div>

        {/* New button */}
        <button onClick={() => {
          if (filterKlas === 'alle' && klassen.length > 0) setFilterKlas(klassen[0].id);
          setShowNew(true);
        }} style={{
          padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontWeight: 700, fontSize: '0.95rem', background: '#2B5BA0', color: 'white',
        }}>+ Nieuwe toets</button>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>

        {/* ═══ NEW TOETS FORM ═══ */}
        {showNew && (
          <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '2px solid #2B5BA0', marginBottom: '1rem', maxWidth: 900, margin: '0 auto 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontWeight: 700, color: '#1e3a5f', fontSize: '1.1rem' }}>Nieuwe toets</h3>
              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                Klas: <strong style={{ color: klasKleurMap[filterKlas as number] || '#2B5BA0' }}>{klassen.find(k => k.id === filterKlas)?.naam || '–'}</strong>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.7fr 0.7fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Naam *</label>
                <input style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                  value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') createToets(); if (e.key === 'Escape') setShowNew(false); }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Type</label>
                <select style={{ width: '100%', padding: '0.45rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                  value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}>
                  {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Datum</label>
                <input type="date" style={{ width: '100%', padding: '0.45rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                  value={newToets.datum} onChange={e => setNewToets({ ...newToets, datum: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Weging</label>
                <input type="number" step="0.5" min="0.5" style={{ width: '100%', padding: '0.45rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                  value={newToets.weging} onChange={e => setNewToets({ ...newToets, weging: Number(e.target.value) })} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Max score</label>
                <input type="number" style={{ width: '100%', padding: '0.45rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                  value={newToets.max_score} onChange={e => setNewToets({ ...newToets, max_score: Number(e.target.value) })} />
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Omschrijving (optioneel)</label>
              <input style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                value={newToets.omschrijving} onChange={e => setNewToets({ ...newToets, omschrijving: e.target.value })} placeholder="Hoofdstuk 3 + 4, schrijfvaardigheid..." />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => createToets(false)} style={{ background: '#2B5BA0', color: 'white', border: 'none', borderRadius: 8, padding: '0.45rem 1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>Opslaan</button>
              <button onClick={() => createToets(true)} style={{ background: '#34d399', color: 'white', border: 'none', borderRadius: 8, padding: '0.45rem 1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>Opslaan & vragen maken →</button>
              <button onClick={() => setShowNew(false)} style={{ background: '#f1f5f9', color: '#6b7280', border: 'none', borderRadius: 8, padding: '0.45rem 1rem', cursor: 'pointer', fontSize: '0.95rem' }}>Annuleren</button>
            </div>
          </div>
        )}

        {/* ═══ LIJST VIEW ═══ */}
        {view === 'lijst' && (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {/* Komende toetsen */}
            {upcoming.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Komende toetsen
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', background: '#2B5BA0', padding: '1px 10px', borderRadius: 12 }}>{upcoming.length}</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {upcoming.map(t => (
                    <ToetsRow key={t.id} t={t} klassen={klassen} klasKleurMap={klasKleurMap}
                      editToets={editToets} setEditToets={setEditToets} saveEdit={saveEdit}
                      deleteToets={deleteToets} today={today} />
                  ))}
                </div>
              </div>
            )}

            {/* Afgelopen toetsen */}
            {past.length > 0 && (
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#6b7280', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Afgelopen toetsen
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', background: '#94a3b8', padding: '1px 10px', borderRadius: 12 }}>{past.length}</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {past.map(t => (
                    <ToetsRow key={t.id} t={t} klassen={klassen} klasKleurMap={klasKleurMap}
                      editToets={editToets} setEditToets={setEditToets} saveEdit={saveEdit}
                      deleteToets={deleteToets} today={today} isPast />
                  ))}
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📝</div>
                <p style={{ fontSize: '1.15rem', fontWeight: 600 }}>Geen toetsen gevonden</p>
                <p style={{ fontSize: '0.95rem' }}>
                  {searchQuery ? 'Probeer een andere zoekterm' : 'Maak een nieuwe toets aan met de knop hierboven'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══ KALENDER VIEW ═══ */}
        {view === 'kalender' && (
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* Maand navigatie */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <button onClick={() => changeKalenderMaand(-1)} style={navBtn}>◀</button>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e3a5f', margin: 0, textTransform: 'capitalize', minWidth: 200, textAlign: 'center' }}>{maandNaam}</h2>
              <button onClick={() => changeKalenderMaand(1)} style={navBtn}>▶</button>
              <button onClick={() => {
                const d = new Date();
                setKalenderMaand(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }} style={{ ...navBtn, background: '#2B5BA0', color: 'white', border: 'none' }}>Vandaag</button>
            </div>

            {/* Kalender grid */}
            <div style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid #e5e7eb' }}>
                {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
                  <div key={d} style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', color: '#6b7280', background: '#f8fafc' }}>{d}</div>
                ))}
              </div>
              {/* Dagen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {kalenderDagen.map((dag, idx) => {
                  const dagToetsen = filtered.filter(t => t.datum === dag.datum);
                  const isToday = dag.datum === today;
                  const isWeekend = idx % 7 >= 5;
                  return (
                    <div key={idx} style={{
                      minHeight: 80, padding: '4px', borderRight: idx % 7 < 6 ? '1px solid #f1f5f9' : 'none',
                      borderBottom: '1px solid #f1f5f9',
                      background: isToday ? '#EEF2FF' : isWeekend ? '#fafafa' : 'white',
                      opacity: dag.maandDag ? 1 : 0.4,
                    }}>
                      <div style={{
                        fontSize: '0.8rem', fontWeight: isToday ? 800 : 500, textAlign: 'right', padding: '2px 4px',
                        color: isToday ? '#2B5BA0' : '#6b7280',
                      }}>{dag.dag}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {dagToetsen.map(t => {
                          const tKleur = toetsKleuren[t.type] || '#8b95a5';
                          const klas = klassen.find(k => k.id === t.klas_id);
                          return (
                            <div key={t.id} onClick={() => setEditToets({ ...t })} style={{
                              background: tKleur + '20', color: tKleur, padding: '2px 5px', borderRadius: 5,
                              fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderLeft: `3px solid ${tKleur}`,
                            }}>
                              <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>{t.type}</span> {klas?.naam} {t.naam.length > 12 ? t.naam.slice(0, 12) + '…' : t.naam}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legenda */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
              {Object.entries(toetsLabels).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: '#6b7280' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: toetsKleuren[k] || '#8b95a5' }} />
                  {v}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STATISTIEKEN VIEW ═══ */}
        {view === 'statistieken' && (
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* Totaal overzicht */}
            <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center' }}>
                <StatBlock label="Totaal" value={stats.total} color="#1e3a5f" />
                <StatBlock label="Gepland" value={stats.upcomingCount} color="#2B5BA0" />
                <StatBlock label="Deze week" value={stats.thisWeekCount} color="#c4892e" />
                <StatBlock label="Afgerond" value={stats.total - stats.upcomingCount} color="#22c55e" />
              </div>
            </div>

            {/* Per type */}
            <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 1rem', fontWeight: 700, color: '#1e3a5f', fontSize: '1.05rem' }}>Per type</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(toetsLabels).map(([k, v]) => {
                  const count = stats.byType[k] || 0;
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  const kleur = toetsKleuren[k] || '#8b95a5';
                  return (
                    <div key={k}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 3 }}>
                        <span style={{ color: '#374151', fontWeight: 600 }}>{v}</span>
                        <span style={{ color: '#6b7280' }}>{count}</span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: kleur, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per klas */}
            <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 1rem', fontWeight: 700, color: '#1e3a5f', fontSize: '1.05rem' }}>Per klas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {klassen.map((k, i) => {
                  const count = stats.byKlas[k.id] || 0;
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  const kleur = klasKleuren[i % klasKleuren.length];
                  return (
                    <div key={k.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 3 }}>
                        <span style={{ color: kleur, fontWeight: 700 }}>{k.naam}</span>
                        <span style={{ color: '#6b7280' }}>{count}</span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: kleur, borderRadius: 4, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Toetslast overzicht - komende 4 weken */}
            <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
              <h3 style={{ margin: '0 0 1rem', fontWeight: 700, color: '#1e3a5f', fontSize: '1.05rem' }}>Toetslast komende 4 weken</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                {[0, 1, 2, 3].map(weekOffset => {
                  const d = new Date();
                  d.setDate(d.getDate() + weekOffset * 7);
                  const wk = getWeekNumber(d.toISOString().split('T')[0]);
                  const weekToetsen = toetsen.filter(t => {
                    if (!t.datum) return false;
                    return getWeekNumber(t.datum) === wk;
                  });
                  const isCurrent = weekOffset === 0;
                  return (
                    <div key={wk} style={{
                      background: isCurrent ? '#EEF2FF' : '#f8fafc', borderRadius: 12, padding: '1rem',
                      border: isCurrent ? '2px solid #2B5BA0' : '1px solid #e5e7eb', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 4 }}>{isCurrent ? 'Deze week' : `Week ${wk}`}</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800, color: weekToetsen.length > 3 ? '#c95555' : '#1e3a5f' }}>{weekToetsen.length}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{weekToetsen.length === 1 ? 'toets' : 'toetsen'}</div>
                      {weekToetsen.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                          {weekToetsen.slice(0, 5).map(t => (
                            <span key={t.id} style={{ fontSize: '0.7rem', fontWeight: 700, color: toetsKleuren[t.type] || '#8b95a5',
                              background: (toetsKleuren[t.type] || '#8b95a5') + '20', padding: '1px 5px', borderRadius: 4 }}>{t.type}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ═══ EDIT MODAL ═══ */}
      {editToets && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setEditToets(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, padding: '1.5rem', width: '95%', maxWidth: 600, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontWeight: 700, color: '#1e3a5f', fontSize: '1.15rem' }}>Toets bewerken</h3>
              <button onClick={() => setEditToets(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Naam</label>
                <input style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.naam} onChange={e => setEditToets({ ...editToets, naam: e.target.value })} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Type</label>
                <select style={{ width: '100%', padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.type} onChange={e => setEditToets({ ...editToets, type: e.target.value })}>
                  {Object.entries(toetsLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Datum</label>
                <input type="date" style={{ width: '100%', padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.datum || ''} onChange={e => setEditToets({ ...editToets, datum: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Klas</label>
                <select style={{ width: '100%', padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.klas_id} onChange={e => setEditToets({ ...editToets, klas_id: Number(e.target.value) })}>
                  {klassen.map(k => <option key={k.id} value={k.id}>{k.naam} ({k.vak})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Weging</label>
                <input type="number" step="0.5" min="0.5" style={{ width: '100%', padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.weging} onChange={e => setEditToets({ ...editToets, weging: Number(e.target.value) })} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Max score</label>
                <input type="number" style={{ width: '100%', padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.max_score} onChange={e => setEditToets({ ...editToets, max_score: Number(e.target.value) })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Omschrijving</label>
                <input style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '1rem' }}
                  value={editToets.omschrijving || ''} onChange={e => setEditToets({ ...editToets, omschrijving: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
              <button onClick={() => { deleteToets(editToets.id); setEditToets(null); }}
                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>
                Verwijderen
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setEditToets(null)}
                  style={{ background: '#f1f5f9', color: '#6b7280', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                  Annuleren
                </button>
                <button onClick={saveEdit}
                  style={{ background: '#2B5BA0', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                  Opslaan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ───── ToetsRow component ───── */
function ToetsRow({ t, klassen, klasKleurMap, editToets, setEditToets, saveEdit, deleteToets, today, isPast }: {
  t: Toets; klassen: Klas[]; klasKleurMap: Record<number, string>;
  editToets: Toets | null; setEditToets: (t: Toets | null) => void;
  saveEdit: () => void; deleteToets: (id: number) => void;
  today: string; isPast?: boolean;
}) {
  const router = useRouter();
  const tKleur = toetsKleuren[t.type] || '#8b95a5';
  const klas = klassen.find(k => k.id === t.klas_id);
  const klasKleur = klasKleurMap[t.klas_id] || '#6b7280';
  const days = t.datum ? daysUntil(t.datum) : null;

  let urgencyLabel = '';
  let urgencyColor = '#6b7280';
  if (days !== null && !isPast) {
    if (days === 0) { urgencyLabel = 'Vandaag'; urgencyColor = '#dc2626'; }
    else if (days === 1) { urgencyLabel = 'Morgen'; urgencyColor = '#c4892e'; }
    else if (days <= 7) { urgencyLabel = `Over ${days} dagen`; urgencyColor = '#2B5BA0'; }
  }

  return (
    <div onClick={() => setEditToets({ ...t })} style={{
      background: 'white', borderRadius: 14, padding: '0.8rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer',
      borderLeft: `4px solid ${tKleur}`, opacity: isPast ? 0.7 : 1,
      transition: 'box-shadow 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}>
      {/* Type badge */}
      <span style={{
        background: tKleur + '18', color: tKleur, padding: '0.3rem 0.65rem', borderRadius: 7,
        fontSize: '0.82rem', fontWeight: 800, minWidth: 42, textAlign: 'center',
      }}>{t.type}</span>

      {/* Klas badge */}
      <span style={{
        fontWeight: 700, fontSize: '0.85rem', color: 'white', background: klasKleur,
        padding: '2px 8px', borderRadius: 5,
      }}>{klas?.naam || '?'}</span>

      {/* Naam + omschrijving */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.98rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.naam}</div>
        {t.omschrijving && <div style={{ fontSize: '0.82rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.omschrijving}</div>}
      </div>

      {/* Urgency label */}
      {urgencyLabel && (
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: urgencyColor, whiteSpace: 'nowrap' }}>{urgencyLabel}</span>
      )}

      {/* Edit button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/toetsen/maker?id=${t.id}`);
        }}
        style={{
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          color: '#1e3a5f',
          borderRadius: '6px',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Bewerk deze toets"
      >
        ✏️
      </button>

      {/* Datum + meta */}
      <div style={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151' }}>{formatDate(t.datum)}</div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>×{t.weging} · max {t.max_score}</div>
      </div>
    </div>
  );
}

/* ───── StatBlock component ───── */
function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}
