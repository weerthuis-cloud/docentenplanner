'use client';

import { useEffect, useState, useCallback } from 'react';

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface RoosterSlot { id?: number; klas_id: number; dag: number; uur: number; vak: string; lokaal: string; is_blokuur: boolean; }
interface Les { id?: number; klas_id: number; datum: string; uur: number | null; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; notities: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; kleur: string; les_id: number | null; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; }

const dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const dagNamenKort = ['Ma', 'Di', 'Wo', 'Do', 'Vr'];
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
  // Data state
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [rooster, setRooster] = useState<RoosterSlot[]>([]);
  const [lessen, setLessen] = useState<Les[]>([]);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [vakanties, setVakanties] = useState<Vakantie[]>([]);

  // UI state
  const [selectedKlas, setSelectedKlas] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(() => {
    const m = getMonday(new Date());
    return m.toISOString().split('T')[0];
  });
  const [showRoosterSetup, setShowRoosterSetup] = useState(false);
  const [editingLes, setEditingLes] = useState<Les | null>(null);
  const [editingToets, setEditingToets] = useState<{ klas_id: number; datum: string; uur: number | null } | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO' as string });
  const [copySource, setCopySource] = useState<Les | null>(null);
  const [saving, setSaving] = useState(false);

  const days = getDaysOfWeek(weekStart);
  const weekEnd = days[4];
  const today = new Date().toISOString().split('T')[0];

  /* ───── Data fetching ───── */
  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then((data: Klas[]) => {
      setKlassen(data);
      if (data.length > 0 && !selectedKlas) setSelectedKlas(data[0].id);
    });
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
  }, []);

  const fetchRooster = useCallback(() => {
    if (!selectedKlas) return;
    fetch(`/api/roosters?klas_id=${selectedKlas}`).then(r => r.json()).then(setRooster);
  }, [selectedKlas]);

  const fetchLessen = useCallback(() => {
    if (!selectedKlas) return;
    fetch(`/api/lessen?klas_id=${selectedKlas}&week_start=${weekStart}&week_end=${weekEnd}`)
      .then(r => r.json()).then((data: Les[] | null) => setLessen(Array.isArray(data) ? data : []));
  }, [selectedKlas, weekStart, weekEnd]);

  const fetchToetsen = useCallback(() => {
    if (!selectedKlas) return;
    fetch(`/api/toetsen?klas_id=${selectedKlas}`).then(r => r.json()).then(setToetsen);
  }, [selectedKlas]);

  useEffect(() => { fetchRooster(); }, [fetchRooster]);
  useEffect(() => { fetchLessen(); }, [fetchLessen]);
  useEffect(() => { fetchToetsen(); }, [fetchToetsen]);

  /* ───── Helpers ───── */
  const currentKlas = klassen.find(k => k.id === selectedKlas);

  // Get rooster slots for this class for a specific day (1-5)
  const getRoosterForDay = (dag: number): RoosterSlot[] => {
    return rooster.filter(r => r.dag === dag).sort((a, b) => a.uur - b.uur);
  };

  // Get unique uren from the rooster
  const getUren = (): number[] => {
    const uren = new Set<number>();
    rooster.forEach(r => uren.add(r.uur));
    if (uren.size === 0) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return Array.from(uren).sort((a, b) => a - b);
  };

  // Find lesson for a specific date + uur
  const getLes = (datum: string, uur: number): Les | undefined => {
    return lessen.find(l => l.datum === datum && l.uur === uur);
  };

  // Find toetsen for a specific date
  const getToetsenForDate = (datum: string): Toets[] => {
    return toetsen.filter(t => t.datum === datum);
  };

  // Check if a specific uur on a specific dag has a rooster entry
  const hasRoosterSlot = (dag: number, uur: number): RoosterSlot | undefined => {
    return rooster.find(r => r.dag === dag && r.uur === uur);
  };

  /* ───── Week navigation ───── */
  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  function goToThisWeek() {
    const m = getMonday(new Date());
    setWeekStart(m.toISOString().split('T')[0]);
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

  /* ───── Copy les ───── */
  async function pasteLes(datum: string, uur: number) {
    if (!copySource || !selectedKlas) return;
    const newLes = { ...copySource, klas_id: selectedKlas, datum, uur, id: undefined };
    await saveLes(newLes);
    setCopySource(null);
  }

  /* ───── Add toets ───── */
  async function addToets() {
    if (!editingToets || !newToets.naam.trim()) return;
    setSaving(true);
    await fetch('/api/toetsen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        klas_id: editingToets.klas_id,
        naam: newToets.naam,
        type: newToets.type,
        datum: editingToets.datum,
        kleur: toetsKleuren[newToets.type] || '#6B7280',
      }),
    });
    setSaving(false);
    setEditingToets(null);
    setNewToets({ naam: '', type: 'SO' });
    fetchToetsen();
  }

  /* ───── Delete toets ───── */
  async function deleteToets(id: number) {
    await fetch(`/api/toetsen?id=${id}`, { method: 'DELETE' });
    fetchToetsen();
  }

  /* ───── Rooster setup ───── */
  const [roosterEdit, setRoosterEdit] = useState<Record<string, { vak: string; lokaal: string }>>({});

  function initRoosterEdit() {
    const edit: Record<string, { vak: string; lokaal: string }> = {};
    for (let dag = 1; dag <= 5; dag++) {
      for (let uur = 1; uur <= 9; uur++) {
        const slot = hasRoosterSlot(dag, uur);
        edit[`${dag}-${uur}`] = { vak: slot?.vak || '', lokaal: slot?.lokaal || '' };
      }
    }
    setRoosterEdit(edit);
  }

  async function saveRooster() {
    if (!selectedKlas) return;
    setSaving(true);
    const slots: RoosterSlot[] = [];
    for (let dag = 1; dag <= 5; dag++) {
      for (let uur = 1; uur <= 9; uur++) {
        const e = roosterEdit[`${dag}-${uur}`];
        if (e && e.vak.trim()) {
          slots.push({ klas_id: selectedKlas, dag, uur, vak: e.vak, lokaal: e.lokaal, is_blokuur: false });
        }
      }
    }
    // Delete existing and re-insert
    await fetch(`/api/roosters?klas_id=${selectedKlas}`, { method: 'DELETE' });
    if (slots.length > 0) {
      await fetch('/api/roosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slots),
      });
    }
    setSaving(false);
    setShowRoosterSetup(false);
    fetchRooster();
  }

  /* ───── Shift lessen ───── */
  async function shiftLessen(direction: 'forward' | 'backward') {
    if (!selectedKlas) return;
    const delta = direction === 'forward' ? 7 : -7;
    setSaving(true);

    for (const les of lessen) {
      if (!les.id) continue;
      const d = new Date(les.datum + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      const newDatum = d.toISOString().split('T')[0];
      await saveLes({ ...les, datum: newDatum, id: undefined });
    }

    setSaving(false);
    changeWeek(direction === 'forward' ? 1 : -1);
  }

  /* ───── Render ───── */
  const uren = getUren();

  return (
    <div style={{ padding: '1rem 1.5rem', maxWidth: 1600, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Topbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0, flexWrap: 'wrap', gap: '0.5rem' }}>
        {/* Klas selector */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {klassen.map(k => (
            <button key={k.id} onClick={() => setSelectedKlas(k.id)} style={{
              padding: '0.5rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
              background: selectedKlas === k.id ? '#1a7a2e' : '#e8f5e9',
              color: selectedKlas === k.id ? 'white' : '#1a7a2e',
              transition: 'all 0.15s',
            }}>{k.naam}</button>
          ))}
        </div>

        {/* Week navigation */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button onClick={() => changeWeek(-1)} style={navBtnStyle}>&#9664;</button>
          <span style={{ fontWeight: 700, color: '#1a7a2e', minWidth: 90, textAlign: 'center', fontSize: '0.95rem' }}>
            Week {getWeekNumber(weekStart)}
          </span>
          <button onClick={() => changeWeek(1)} style={navBtnStyle}>&#9654;</button>
          <button onClick={goToThisWeek} style={{ ...navBtnStyle, background: '#1a7a2e', color: 'white', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            Vandaag
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {copySource && (
            <span style={{ fontSize: '0.8rem', color: '#D97706', fontWeight: 600, padding: '0.3rem 0.6rem', background: '#FEF3C7', borderRadius: 6 }}>
              Les gekopieerd - klik op een cel om te plakken
            </span>
          )}
          <button onClick={() => { setShowRoosterSetup(true); initRoosterEdit(); }} style={{ ...navBtnStyle, fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
            ⚙ Rooster
          </button>
          <button onClick={() => shiftLessen('forward')} title="Schuif alle lessen 1 week vooruit" style={{ ...navBtnStyle, fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}>
            ⤵ +1 wk
          </button>
          <button onClick={() => shiftLessen('backward')} title="Schuif alle lessen 1 week terug" style={{ ...navBtnStyle, fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}>
            ⤴ -1 wk
          </button>
        </div>
      </div>

      {/* ── Week Grid ── */}
      <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid #d1d5db' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 50 }}>Uur</th>
              {days.map((d, idx) => {
                const vakantie = isInVakantie(d, vakanties);
                return (
                  <th key={d} style={{ ...thStyle, background: d === today ? '#dcfce7' : vakantie ? '#fef2f2' : '#f0fdf4', color: d === today ? '#1a7a2e' : vakantie ? '#DC2626' : '#374151' }}>
                    <div style={{ fontSize: '0.9rem' }}>{dagNamen[idx]}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 400, opacity: 0.7 }}>{formatDate(d)}</div>
                    {vakantie && <div style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600 }}>{vakantie.naam}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {uren.map(uur => (
              <tr key={uur}>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#6B7280', fontSize: '0.9rem', background: '#f9fafb' }}>{uur}</td>
                {days.map((d, idx) => {
                  const dag = idx + 1;
                  const slot = hasRoosterSlot(dag, uur);
                  const vakantie = isInVakantie(d, vakanties);
                  const les = getLes(d, uur);
                  const dayToetsen = getToetsenForDate(d);
                  const isToday = d === today;

                  if (vakantie) {
                    return (
                      <td key={`${d}-${uur}`} style={{ ...tdStyle, background: '#fef2f2', color: '#fca5a5', textAlign: 'center', fontStyle: 'italic', fontSize: '0.75rem' }}>
                        {uur === uren[0] ? vakantie.naam : ''}
                      </td>
                    );
                  }

                  if (!slot) {
                    return (
                      <td key={`${d}-${uur}`} style={{ ...tdStyle, background: isToday ? '#f0fdf4' : '#fafafa', color: '#d1d5db' }}>
                        {copySource && (
                          <button onClick={() => pasteLes(d, uur)} style={{ fontSize: '0.7rem', color: '#D97706', cursor: 'pointer', background: 'none', border: 'none' }}>
                            Plak hier
                          </button>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td key={`${d}-${uur}`}
                      onClick={() => {
                        if (copySource) { pasteLes(d, uur); return; }
                        setEditingLes(les || emptyLes(selectedKlas!, d, uur));
                      }}
                      style={{
                        ...tdStyle,
                        background: isToday ? '#f0fdf4' : les ? 'white' : '#fafffe',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                        verticalAlign: 'top',
                        position: 'relative',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ecfdf5'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isToday ? '#f0fdf4' : les ? 'white' : '#fafffe'; }}
                    >
                      {/* Toetsen badges */}
                      {dayToetsen.map(t => (
                        <div key={t.id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: (toetsKleuren[t.type] || '#6B7280') + '18',
                          color: toetsKleuren[t.type] || '#6B7280',
                          padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem',
                          fontWeight: 700, marginBottom: 3, marginRight: 3,
                          border: `1px solid ${(toetsKleuren[t.type] || '#6B7280')}40`,
                        }}>
                          {t.type}
                          <button onClick={(e) => { e.stopPropagation(); deleteToets(t.id); }}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.65rem', padding: 0, lineHeight: 1 }}>✕</button>
                        </div>
                      ))}

                      {/* Les inhoud */}
                      {les ? (
                        <div style={{ fontSize: '0.76rem', lineHeight: 1.35 }}>
                          {les.programma && (
                            <div style={{ color: '#1e293b', fontWeight: 500 }}>
                              {les.programma.split('\n').slice(0, 2).map((l, i) => (
                                <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
                              ))}
                            </div>
                          )}
                          {les.huiswerk && (
                            <div style={{ color: '#D97706', fontWeight: 600, fontSize: '0.7rem', marginTop: 2 }}>
                              HW: {les.huiswerk.split('\n')[0]}
                            </div>
                          )}
                          {les.terugkijken && (
                            <div style={{ color: '#6B7280', fontSize: '0.68rem', marginTop: 1, fontStyle: 'italic' }}>
                              ↩ {les.terugkijken.split('\n')[0]}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: '#c4d4c6', fontSize: '0.72rem', fontStyle: 'italic' }}>+</div>
                      )}

                      {/* Context actions - top right */}
                      {les && (
                        <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2, opacity: 0.5 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
                        >
                          <button onClick={(e) => { e.stopPropagation(); setCopySource(les); }}
                            title="Kopieer les" style={cellBtnStyle}>⧉</button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingToets({ klas_id: selectedKlas!, datum: d, uur }); }}
                            title="Toets toevoegen" style={cellBtnStyle}>T</button>
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

      {/* ── Rooster Setup Modal ── */}
      {showRoosterSetup && (
        <div style={overlayStyle} onClick={() => setShowRoosterSetup(false)}>
          <div style={{ ...modalStyle, maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: '#1a7a2e', fontSize: '1.2rem' }}>Rooster instellen - {currentKlas?.naam}</h2>
              <button onClick={() => setShowRoosterSetup(false)} style={closeBtnStyle}>✕</button>
            </div>
            <p style={{ color: '#6B7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Vul het vak in bij de uren dat {currentKlas?.naam} les heeft. Laat leeg als er geen les is.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 50 }}>Uur</th>
                  {dagNamen.map((n, i) => <th key={i} style={thStyle}>{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(uur => (
                  <tr key={uur}>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#6B7280' }}>{uur}</td>
                    {[1, 2, 3, 4, 5].map(dag => {
                      const key = `${dag}-${uur}`;
                      const val = roosterEdit[key] || { vak: '', lokaal: '' };
                      return (
                        <td key={dag} style={{ ...tdStyle, padding: '4px' }}>
                          <input
                            value={val.vak}
                            onChange={e => setRoosterEdit(prev => ({ ...prev, [key]: { ...val, vak: e.target.value } }))}
                            placeholder="Vak"
                            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: '0.8rem', marginBottom: 2 }}
                          />
                          <input
                            value={val.lokaal}
                            onChange={e => setRoosterEdit(prev => ({ ...prev, [key]: { ...val, lokaal: e.target.value } }))}
                            placeholder="Lokaal"
                            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 6px', fontSize: '0.72rem', color: '#6B7280' }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRoosterSetup(false)} style={{ ...btnStyle, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
              <button onClick={saveRooster} disabled={saving} style={{ ...btnStyle, background: '#1a7a2e', color: 'white' }}>
                {saving ? 'Opslaan...' : 'Rooster opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Les Planning Modal ── */}
      {editingLes && (
        <div style={overlayStyle} onClick={() => setEditingLes(null)}>
          <div style={{ ...modalStyle, maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1a7a2e', fontSize: '1.1rem' }}>
                  {currentKlas?.naam} - {dagNamen[new Date(editingLes.datum + 'T12:00:00').getDay() - 1]} {formatDate(editingLes.datum)}
                  {editingLes.uur ? `, uur ${editingLes.uur}` : ''}
                </h2>
              </div>
              <button onClick={() => setEditingLes(null)} style={closeBtnStyle}>✕</button>
            </div>

            {/* Terugkijken */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>↩ Terugkijken</label>
              <textarea value={editingLes.terugkijken || ''} onChange={e => setEditingLes({ ...editingLes, terugkijken: e.target.value })}
                placeholder="Wat hebben we vorige les behandeld?" rows={2} style={textareaStyle} />
            </div>

            {/* Programma */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>📋 Programma</label>
              <textarea value={editingLes.programma || ''} onChange={e => setEditingLes({ ...editingLes, programma: e.target.value })}
                placeholder="Wat gaan we doen deze les?" rows={3} style={textareaStyle} />
            </div>

            {/* Leerdoelen */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>🎯 Leerdoelen</label>
              <textarea value={editingLes.leerdoelen || ''} onChange={e => setEditingLes({ ...editingLes, leerdoelen: e.target.value })}
                placeholder="Wat moeten leerlingen aan het einde kunnen?" rows={2} style={textareaStyle} />
            </div>

            {/* Startopdracht */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>🚀 Startopdracht</label>
              <textarea value={editingLes.startopdracht || ''} onChange={e => setEditingLes({ ...editingLes, startopdracht: e.target.value })}
                placeholder="Opdracht bij binnenkomst" rows={2} style={textareaStyle} />
            </div>

            {/* Huiswerk */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>📚 Maak-/Huiswerk</label>
              <textarea value={editingLes.huiswerk || ''} onChange={e => setEditingLes({ ...editingLes, huiswerk: e.target.value })}
                placeholder="Op te geven huiswerk" rows={2} style={textareaStyle} />
            </div>

            {/* Niet vergeten */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>⚠ Niet vergeten</label>
              <textarea value={editingLes.niet_vergeten || ''} onChange={e => setEditingLes({ ...editingLes, niet_vergeten: e.target.value })}
                placeholder="Reminders voor jezelf" rows={2} style={textareaStyle} />
            </div>

            {/* Notities */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>📝 Notities</label>
              <textarea value={editingLes.notities || ''} onChange={e => setEditingLes({ ...editingLes, notities: e.target.value })}
                placeholder="Vrije notities" rows={2} style={textareaStyle} />
            </div>

            {/* Toets toevoegen */}
            <div style={{ ...fieldGroupStyle, background: '#fafafa', padding: '0.75rem', borderRadius: 8 }}>
              <label style={{ ...labelStyle, marginBottom: '0.4rem' }}>Toets toevoegen bij deze les</label>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
                  style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: toetsKleuren[newToets.type] }}>
                  {Object.entries(toetsLabels).map(([key, label]) => (
                    <option key={key} value={key}>{key} - {label}</option>
                  ))}
                </select>
                <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })}
                  placeholder="Naam toets" style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} />
                <button onClick={() => {
                  if (!newToets.naam.trim()) return;
                  addToetsFromModal();
                }} style={{ ...btnStyle, background: toetsKleuren[newToets.type], color: 'white', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                  + Toets
                </button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={() => { setCopySource(editingLes); setEditingLes(null); }}
                  style={{ ...btnStyle, background: '#FEF3C7', color: '#92400E', fontSize: '0.8rem' }}>⧉ Kopieer les</button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setEditingLes(null)} style={{ ...btnStyle, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                <button onClick={async () => {
                  await saveLes(editingLes);
                  setEditingLes(null);
                }} disabled={saving} style={{ ...btnStyle, background: '#1a7a2e', color: 'white' }}>
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toets Quick-Add Modal ── */}
      {editingToets && (
        <div style={overlayStyle} onClick={() => setEditingToets(null)}>
          <div style={{ ...modalStyle, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', color: '#1a7a2e' }}>Toets toevoegen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <select value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.5rem', fontSize: '0.85rem' }}>
                {Object.entries(toetsLabels).map(([key, label]) => (
                  <option key={key} value={key}>{key} - {label}</option>
                ))}
              </select>
              <input value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })}
                placeholder="Naam toets" style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.5rem', fontSize: '0.85rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button onClick={() => setEditingToets(null)} style={{ ...btnStyle, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                <button onClick={addToets} style={{ ...btnStyle, background: toetsKleuren[newToets.type], color: 'white' }}>Toevoegen</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function addToetsFromModal() {
    if (!editingLes || !newToets.naam.trim() || !selectedKlas) return;
    setSaving(true);
    await fetch('/api/toetsen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        klas_id: selectedKlas,
        naam: newToets.naam,
        type: newToets.type,
        datum: editingLes.datum,
        kleur: toetsKleuren[newToets.type] || '#6B7280',
      }),
    });
    setSaving(false);
    setNewToets({ naam: '', type: 'SO' });
    fetchToetsen();
  }
}

/* ───── Shared Styles ───── */
const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.5rem', background: '#f0fdf4', color: '#374151',
  fontSize: '0.85rem', fontWeight: 600, borderBottom: '2px solid #d1d5db',
  position: 'sticky', top: 0, zIndex: 10,
};

const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #f0f0f0',
  fontSize: '0.8rem', minHeight: 60, verticalAlign: 'top',
};

const navBtnStyle: React.CSSProperties = {
  background: '#e8f5e9', border: 'none', borderRadius: 6, padding: '0.4rem 0.6rem',
  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#1a7a2e',
};

const btnStyle: React.CSSProperties = {
  border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: 'white', borderRadius: 16, padding: '1.5rem', width: '90vw',
  boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6B7280', padding: '0.25rem',
};

const cellBtnStyle: React.CSSProperties = {
  background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: 4, width: 20, height: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: '0.65rem', color: '#1a7a2e', fontWeight: 700,
};

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem',
};

const textareaStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid #d1fae5', borderRadius: 8, padding: '0.5rem 0.75rem',
  fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', background: '#fafffe',
  outline: 'none', boxSizing: 'border-box',
};
