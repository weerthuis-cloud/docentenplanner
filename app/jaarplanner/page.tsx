'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false });

/* ───── Types ───── */
interface Jaarplanner {
  id: number;
  vak: string;
  jaarlaag: string;
  schooljaar: string;
  naam: string;
  auteur: string;
  beschrijving: string;
  data: JaarplannerRow[];
  created_at: string;
}
interface JaarplannerRow {
  week: number;
  les: number;
  planning: string;
  toetsen: string;
}
interface Vakantie {
  id: number;
  naam: string;
  start_datum: string;
  eind_datum: string;
  schooljaar: string;
  type: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Agenda', href: '/agenda' },
  { label: 'Planner', href: '/planner' },
  { label: 'Klassen', href: '/klassen' },
  { label: 'Cijfers', href: '/cijfers' },
  { label: 'Resultaten', href: '/resultaten' },
  { label: 'Toetsen', href: '/toetsen' },
  { label: 'Jaarplanner', href: '/jaarplanner' },
];

/* ───── Helpers ───── */
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function getWeekNumber(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

// Get Monday of a given ISO week number and year
function getMondayOfWeek(week: number, year: number): string {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const mondayW1 = new Date(jan4);
  mondayW1.setDate(jan4.getDate() - dayOfWeek + 1);
  const targetMonday = new Date(mondayW1);
  targetMonday.setDate(mondayW1.getDate() + (week - 1) * 7);
  return targetMonday.toISOString().split('T')[0];
}

// Generate all school weeks for a given schooljaar
function getSchoolWeeks(schooljaar: string): { week: number; year: number; label: string; startDate: string }[] {
  // schooljaar = "2025-2026" means aug 2025 - jul 2026
  const [startYear] = schooljaar.split('-').map(Number);
  const weeks: { week: number; year: number; label: string; startDate: string }[] = [];

  // Roughly week 35 of startYear to week 27 of endYear
  for (let w = 35; w <= 52; w++) {
    const mon = getMondayOfWeek(w, startYear);
    weeks.push({ week: w, year: startYear, label: `Week ${w}`, startDate: mon });
  }
  // Check if there's a week 53
  const mon53 = getMondayOfWeek(53, startYear);
  if (new Date(mon53).getFullYear() === startYear) {
    weeks.push({ week: 53, year: startYear, label: `Week 53`, startDate: mon53 });
  }
  for (let w = 1; w <= 27; w++) {
    const mon = getMondayOfWeek(w, startYear + 1);
    weeks.push({ week: w, year: startYear + 1, label: `Week ${w}`, startDate: mon });
  }
  return weeks;
}

function formatDateShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/* ───── Styles ───── */
const navBtn: React.CSSProperties = {
  padding: '0.4rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: '0.85rem', transition: 'background 0.15s',
};

/* ───── Component ───── */
export default function JaarplannerPage() {
  const router = useRouter();
  const [jaarplanners, setJaarplanners] = useState<Jaarplanner[]>([]);
  const [vakanties, setVakanties] = useState<Vakantie[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  // Editor state
  const [editing, setEditing] = useState<Jaarplanner | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  // New jaarplanner form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ naam: '', vak: '', jaarlaag: '', schooljaar: '2025-2026', auteur: '', beschrijving: '' });

  // Vakantie/vrije dag form
  const [showVakantieForm, setShowVakantieForm] = useState(false);
  const [vakantieForm, setVakantieForm] = useState({ naam: '', start_datum: '', eind_datum: '', type: 'vakantie', schooljaar: '2025-2026' });
  const [editingVakantie, setEditingVakantie] = useState<Vakantie | null>(null);

  // Tab
  const [tab, setTab] = useState<'planners' | 'vakanties'>('planners');

  const fetchAll = useCallback(() => {
    fetch('/api/jaarplanners').then(r => r.json()).then(setJaarplanners);
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ───── CRUD Jaarplanner ───── */
  async function createJaarplanner() {
    if (!newForm.naam || !newForm.vak || !newForm.jaarlaag) { alert('Vul naam, vak en jaarlaag in'); return; }

    // Generate empty weeks for the school year
    const weeks = getSchoolWeeks(newForm.schooljaar);
    const data: JaarplannerRow[] = weeks.map(w => ({
      week: w.week, les: 1, planning: '', toetsen: '',
    }));

    const res = await fetch('/api/jaarplanners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newForm, data }),
    });
    const result = await res.json();
    if (result.id) {
      setShowNewForm(false);
      setNewForm({ naam: '', vak: '', jaarlaag: '', schooljaar: '2025-2026', auteur: '', beschrijving: '' });
      fetchAll();
      // Open the newly created planner
      const full = await fetch(`/api/jaarplanners?id=${result.id}`).then(r => r.json());
      if (full) setEditing(full);
    }
  }

  async function saveJaarplanner() {
    if (!editing) return;
    await fetch('/api/jaarplanners', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    fetchAll();
  }

  async function deleteJaarplanner(id: number) {
    if (!confirm('Weet je zeker dat je deze jaarplanner wilt verwijderen?')) return;
    await fetch(`/api/jaarplanners?id=${id}`, { method: 'DELETE' });
    if (editing?.id === id) setEditing(null);
    fetchAll();
  }

  async function openJaarplanner(id: number) {
    const full = await fetch(`/api/jaarplanners?id=${id}`).then(r => r.json());
    if (full) {
      setEditing(full);
      setExpandedWeeks(new Set());
    }
  }

  function updateWeekData(weekNum: number, field: 'planning' | 'toetsen', value: string) {
    if (!editing) return;
    const newData = editing.data.map(row =>
      row.week === weekNum ? { ...row, [field]: value } : row
    );
    setEditing({ ...editing, data: newData });
  }

  function addWeekRow(weekNum: number) {
    if (!editing) return;
    const existingForWeek = editing.data.filter(r => r.week === weekNum);
    const maxLes = existingForWeek.length > 0 ? Math.max(...existingForWeek.map(r => r.les)) : 0;
    const newRow: JaarplannerRow = { week: weekNum, les: maxLes + 1, planning: '', toetsen: '' };
    setEditing({ ...editing, data: [...editing.data, newRow] });
  }

  function removeWeekRow(weekNum: number, les: number) {
    if (!editing) return;
    setEditing({ ...editing, data: editing.data.filter(r => !(r.week === weekNum && r.les === les)) });
  }

  function updateLesData(weekNum: number, les: number, field: 'planning' | 'toetsen', value: string) {
    if (!editing) return;
    const newData = editing.data.map(row =>
      (row.week === weekNum && row.les === les) ? { ...row, [field]: value } : row
    );
    setEditing({ ...editing, data: newData });
  }

  /* ───── CRUD Vakanties ───── */
  async function saveVakantie() {
    if (!vakantieForm.naam || !vakantieForm.start_datum || !vakantieForm.eind_datum) {
      alert('Vul alle velden in'); return;
    }
    if (editingVakantie) {
      await fetch('/api/vakanties', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vakantieForm, id: editingVakantie.id }),
      });
    } else {
      await fetch('/api/vakanties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vakantieForm),
      });
    }
    setShowVakantieForm(false);
    setEditingVakantie(null);
    setVakantieForm({ naam: '', start_datum: '', eind_datum: '', type: 'vakantie', schooljaar: '2025-2026' });
    fetchAll();
  }

  async function deleteVakantie(id: number) {
    if (!confirm('Verwijderen?')) return;
    await fetch(`/api/vakanties?id=${id}`, { method: 'DELETE' });
    fetchAll();
  }

  function editVakantie(v: Vakantie) {
    setEditingVakantie(v);
    setVakantieForm({ naam: v.naam, start_datum: v.start_datum, eind_datum: v.eind_datum, type: v.type || 'vakantie', schooljaar: v.schooljaar });
    setShowVakantieForm(true);
  }

  /* ───── Week in vakantie check ───── */
  function isWeekInVakantie(startDate: string): Vakantie | null {
    for (const v of vakanties) {
      // Check if any day of the week falls in a vacation
      for (let i = 0; i < 5; i++) {
        const d = new Date(startDate + 'T12:00:00');
        d.setDate(d.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        if (ds >= v.start_datum && ds <= v.eind_datum) return v;
      }
    }
    return null;
  }

  /* ───── Render ───── */
  const schoolWeeks = editing ? getSchoolWeeks(editing.schooljaar) : [];
  const vakantiesFiltered = vakanties.filter(v => (v.type || 'vakantie') === 'vakantie');
  const vrijeDagen = vakanties.filter(v => v.type === 'vrije_dag');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f5f5f5' }}>
      {/* ── Top Navigation ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 1rem', background: 'white', borderBottom: '1px solid #e0e0e0', gap: '0.5rem', flexShrink: 0 }}>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}>☰</button>
        <span style={{ fontWeight: 700, color: '#1a7a2e', fontSize: '1.1rem' }}>Docentenplanner</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      {/* ── Menu Overlay ── */}
      {menuOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000 }} onClick={() => setMenuOpen(false)}>
          <div style={{ background: 'white', width: 260, height: '100%', padding: '1rem', boxShadow: '2px 0 12px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1a7a2e', marginBottom: '1.5rem' }}>Menu</div>
            {NAV_ITEMS.map(item => (
              <button key={item.href} onClick={() => { router.push(item.href); setMenuOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '0.7rem 0.8rem',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                  background: item.href === '/jaarplanner' ? '#dcfce7' : 'transparent',
                  color: item.href === '/jaarplanner' ? '#1a7a2e' : '#374151',
                  marginBottom: '0.2rem',
                }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Header Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1rem', background: 'white', borderBottom: '1px solid #e5e7eb', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1a7a2e' }}>
          {editing ? `✏️ ${editing.naam}` : '📅 Jaarplanner Bouwer'}
        </div>
        <div style={{ flex: 1 }} />

        {editing ? (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={async () => { await saveJaarplanner(); }} style={{ ...navBtn, background: '#1a7a2e', color: 'white' }}>
              💾 Opslaan
            </button>
            <button onClick={() => setEditing(null)} style={{ ...navBtn, background: '#e5e7eb', color: '#374151' }}>
              ← Terug
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={() => setTab('planners')}
              style={{ ...navBtn, background: tab === 'planners' ? '#1a7a2e' : '#e5e7eb', color: tab === 'planners' ? 'white' : '#374151' }}>
              Jaarplanners
            </button>
            <button onClick={() => setTab('vakanties')}
              style={{ ...navBtn, background: tab === 'vakanties' ? '#1a7a2e' : '#e5e7eb', color: tab === 'vakanties' ? 'white' : '#374151' }}>
              Vakanties & Vrije dagen
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>

        {/* ═══ EDITOR VIEW ═══ */}
        {editing && (
          <div>
            {/* Meta info */}
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Naam</label>
                  <input value={editing.naam} onChange={e => setEditing({ ...editing, naam: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Vak</label>
                  <input value={editing.vak} onChange={e => setEditing({ ...editing, vak: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                </div>
                <div style={{ flex: '0 0 80px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Jaarlaag</label>
                  <input value={editing.jaarlaag} onChange={e => setEditing({ ...editing, jaarlaag: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Schooljaar</label>
                  <input value={editing.schooljaar} onChange={e => setEditing({ ...editing, schooljaar: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                </div>
                <div style={{ flex: '0 0 140px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Auteur</label>
                  <input value={editing.auteur} onChange={e => setEditing({ ...editing, auteur: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Beschrijving</label>
                <input value={editing.beschrijving} onChange={e => setEditing({ ...editing, beschrijving: e.target.value })}
                  placeholder="Korte beschrijving van de jaarplanner..."
                  style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
              </div>
            </div>

            {/* Expand/Collapse all */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.8rem' }}>
              <button onClick={() => { const all = new Set(schoolWeeks.map(w => `w-${w.week}-${w.year}`)); setExpandedWeeks(all); }}
                style={{ ...navBtn, background: '#e5e7eb', color: '#374151', fontSize: '0.78rem' }}>
                ▼ Alles uitklappen
              </button>
              <button onClick={() => setExpandedWeeks(new Set())}
                style={{ ...navBtn, background: '#e5e7eb', color: '#374151', fontSize: '0.78rem' }}>
                ▲ Alles inklappen
              </button>
              <button onClick={async () => { await saveJaarplanner(); }}
                style={{ ...navBtn, background: '#1a7a2e', color: 'white', fontSize: '0.78rem', marginLeft: 'auto' }}>
                💾 Opslaan
              </button>
            </div>

            {/* Week rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {schoolWeeks.map(sw => {
                const weekKey = `w-${sw.week}-${sw.year}`;
                const isExpanded = expandedWeeks.has(weekKey);
                const vakantie = isWeekInVakantie(sw.startDate);
                const weekRows = editing.data
                  .filter(r => r.week === sw.week)
                  .sort((a, b) => a.les - b.les);
                const hasContent = weekRows.some(r => stripHtml(r.planning) || stripHtml(r.toetsen));
                const endDate = new Date(sw.startDate + 'T12:00:00');
                endDate.setDate(endDate.getDate() + 4);
                const endStr = endDate.toISOString().split('T')[0];

                return (
                  <div key={weekKey} style={{
                    borderRadius: 10, border: `1px solid ${vakantie ? '#fcd34d' : isExpanded ? '#1a7a2e40' : '#e5e7eb'}`,
                    background: vakantie ? '#fffbeb' : 'white',
                    overflow: 'hidden',
                  }}>
                    {/* Week header */}
                    <div
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedWeeks(prev => { const n = new Set(prev); n.delete(weekKey); return n; });
                        } else {
                          setExpandedWeeks(prev => new Set(prev).add(weekKey));
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '0.6rem 0.8rem', cursor: 'pointer',
                        background: vakantie ? '#fef3c7' : isExpanded ? '#1a7a2e' : hasContent ? '#f0fdf4' : '#fafafa',
                        color: isExpanded && !vakantie ? 'white' : '#374151',
                        gap: '0.5rem',
                      }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', minWidth: 80 }}>
                        {isExpanded ? '▼' : '▶'} Week {sw.week}
                      </span>
                      <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                        {formatDateShort(sw.startDate)} – {formatDateShort(endStr)}
                      </span>
                      {vakantie && (
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, background: '#f59e0b', color: 'white',
                          padding: '0.1rem 0.5rem', borderRadius: 4,
                        }}>
                          🏖️ {vakantie.naam}
                        </span>
                      )}
                      {!vakantie && hasContent && !isExpanded && (
                        <span style={{ fontSize: '0.72rem', color: '#6B7280', marginLeft: 'auto', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stripHtml(weekRows[0]?.planning || '').slice(0, 60)}
                        </span>
                      )}
                      {!vakantie && (
                        <span style={{
                          fontSize: '0.7rem', marginLeft: 'auto',
                          color: isExpanded ? 'rgba(255,255,255,0.7)' : '#9CA3AF',
                        }}>
                          {weekRows.length} les{weekRows.length !== 1 ? 'sen' : ''}
                        </span>
                      )}
                    </div>

                    {/* Expanded content */}
                    {isExpanded && !vakantie && (
                      <div style={{ padding: '0.8rem' }}>
                        {weekRows.map((row, idx) => (
                          <div key={`${row.week}-${row.les}`} style={{
                            marginBottom: idx < weekRows.length - 1 ? '0.8rem' : 0,
                            padding: '0.6rem', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.4rem', gap: '0.5rem' }}>
                              <span style={{
                                fontWeight: 700, fontSize: '0.82rem', color: 'white',
                                background: '#1a7a2e', padding: '0.1rem 0.5rem', borderRadius: 4,
                              }}>
                                Les {row.les}
                              </span>
                              {weekRows.length > 1 && (
                                <button onClick={() => removeWeekRow(row.week, row.les)}
                                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.75rem', fontWeight: 600 }}>
                                  ✕ Verwijder
                                </button>
                              )}
                            </div>

                            <div style={{ marginBottom: '0.4rem' }}>
                              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.75rem', color: '#374151', marginBottom: '0.2rem' }}>Planning</label>
                              <RichTextEditor
                                content={row.planning}
                                onChange={(val: string) => updateLesData(row.week, row.les, 'planning', val)}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.75rem', color: '#D97706', marginBottom: '0.2rem' }}>Toetsen</label>
                              <RichTextEditor
                                content={row.toetsen}
                                onChange={(val: string) => updateLesData(row.week, row.les, 'toetsen', val)}
                              />
                            </div>
                          </div>
                        ))}

                        <button onClick={() => addWeekRow(sw.week)}
                          style={{
                            marginTop: '0.5rem', ...navBtn, background: '#f0fdf4', color: '#1a7a2e',
                            border: '1px dashed #1a7a2e80', width: '100%', fontSize: '0.8rem',
                          }}>
                          + Les toevoegen
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom save bar */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
              <button onClick={async () => { await saveJaarplanner(); }}
                style={{ ...navBtn, background: '#1a7a2e', color: 'white', padding: '0.6rem 2rem', fontSize: '1rem' }}>
                💾 Jaarplanner opslaan
              </button>
            </div>
          </div>
        )}

        {/* ═══ PLANNERS LIST VIEW ═══ */}
        {!editing && tab === 'planners' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#374151' }}>Alle jaarplanners</h2>
              <button onClick={() => setShowNewForm(true)}
                style={{ ...navBtn, background: '#1a7a2e', color: 'white' }}>
                + Nieuwe jaarplanner
              </button>
            </div>

            {/* New form */}
            {showNewForm && (
              <div style={{ background: 'white', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '2px solid #1a7a2e40' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a7a2e', marginBottom: '0.8rem' }}>Nieuwe jaarplanner</div>
                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Naam *</label>
                    <input value={newForm.naam} onChange={e => setNewForm({ ...newForm, naam: e.target.value })}
                      placeholder="Bijv. Nederlands V3 2025-2026"
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                  <div style={{ flex: '0 0 120px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Vak *</label>
                    <input value={newForm.vak} onChange={e => setNewForm({ ...newForm, vak: e.target.value })}
                      placeholder="Nederlands"
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                  <div style={{ flex: '0 0 80px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Jaarlaag *</label>
                    <input value={newForm.jaarlaag} onChange={e => setNewForm({ ...newForm, jaarlaag: e.target.value })}
                      placeholder="V3"
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                  <div style={{ flex: '0 0 120px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Schooljaar</label>
                    <input value={newForm.schooljaar} onChange={e => setNewForm({ ...newForm, schooljaar: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                  <div style={{ flex: '0 0 140px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Auteur</label>
                    <input value={newForm.auteur} onChange={e => setNewForm({ ...newForm, auteur: e.target.value })}
                      placeholder="Jouw naam"
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Beschrijving</label>
                    <input value={newForm.beschrijving} onChange={e => setNewForm({ ...newForm, beschrijving: e.target.value })}
                      placeholder="Korte omschrijving..."
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowNewForm(false)} style={{ ...navBtn, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                  <button onClick={createJaarplanner} style={{ ...navBtn, background: '#1a7a2e', color: 'white' }}>Aanmaken</button>
                </div>
              </div>
            )}

            {/* Planners grid */}
            {jaarplanners.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9CA3AF' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📅</div>
                <div>Nog geen jaarplanners. Maak er een aan!</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
                {jaarplanners.map(jp => (
                  <div key={jp.id} style={{
                    background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb',
                    cursor: 'pointer', transition: 'box-shadow 0.15s',
                  }}
                    onClick={() => openJaarplanner(jp.id)}
                    onMouseOver={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                    onMouseOut={e => (e.currentTarget.style.boxShadow = 'none')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{
                        fontWeight: 700, fontSize: '0.78rem', color: 'white',
                        background: '#1a7a2e', padding: '0.1rem 0.5rem', borderRadius: 4,
                      }}>
                        {jp.vak}
                      </span>
                      <span style={{
                        fontWeight: 600, fontSize: '0.78rem', color: 'white',
                        background: '#2563EB', padding: '0.1rem 0.5rem', borderRadius: 4,
                      }}>
                        {jp.jaarlaag}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{jp.schooljaar}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1f2937', marginBottom: '0.2rem' }}>{jp.naam}</div>
                    {jp.beschrijving && (
                      <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.3rem' }}>{jp.beschrijving}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>
                        {jp.auteur && `Door ${jp.auteur} · `}{new Date(jp.created_at).toLocaleDateString('nl-NL')}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); deleteJaarplanner(jp.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.75rem', fontWeight: 600 }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ VAKANTIES TAB ═══ */}
        {!editing && tab === 'vakanties' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#374151' }}>Vakanties & Vrije dagen</h2>
              <button onClick={() => { setEditingVakantie(null); setVakantieForm({ naam: '', start_datum: '', eind_datum: '', type: 'vakantie', schooljaar: '2025-2026' }); setShowVakantieForm(true); }}
                style={{ ...navBtn, background: '#1a7a2e', color: 'white' }}>
                + Toevoegen
              </button>
            </div>

            {/* Vakantie form */}
            {showVakantieForm && (
              <div style={{ background: 'white', borderRadius: 12, padding: '1rem', marginBottom: '1rem', border: '2px solid #1a7a2e40' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a7a2e', marginBottom: '0.8rem' }}>
                  {editingVakantie ? 'Bewerken' : 'Nieuwe vakantie / vrije dag'}
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                  <div style={{ flex: '0 0 130px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Type</label>
                    <select value={vakantieForm.type} onChange={e => setVakantieForm({ ...vakantieForm, type: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }}>
                      <option value="vakantie">Vakantie</option>
                      <option value="vrije_dag">Vrije dag</option>
                    </select>
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Naam *</label>
                    <input value={vakantieForm.naam} onChange={e => setVakantieForm({ ...vakantieForm, naam: e.target.value })}
                      placeholder="Bijv. Herfstvakantie"
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                  <div style={{ flex: '0 0 150px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Startdatum *</label>
                    <input type="date" value={vakantieForm.start_datum} onChange={e => setVakantieForm({ ...vakantieForm, start_datum: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                  <div style={{ flex: '0 0 150px' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.2rem' }}>Einddatum *</label>
                    <input type="date" value={vakantieForm.eind_datum} onChange={e => setVakantieForm({ ...vakantieForm, eind_datum: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowVakantieForm(false); setEditingVakantie(null); }}
                    style={{ ...navBtn, background: '#e5e7eb', color: '#374151' }}>Annuleren</button>
                  <button onClick={saveVakantie} style={{ ...navBtn, background: '#1a7a2e', color: 'white' }}>
                    {editingVakantie ? 'Opslaan' : 'Toevoegen'}
                  </button>
                </div>
              </div>
            )}

            {/* Vakanties list */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', color: '#374151', marginBottom: '0.5rem' }}>🏖️ Vakanties</h3>
              {vakantiesFiltered.length === 0 ? (
                <div style={{ padding: '1rem', color: '#9CA3AF', fontSize: '0.85rem' }}>Geen vakanties ingesteld.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {vakantiesFiltered.map(v => (
                    <div key={v.id} style={{
                      display: 'flex', alignItems: 'center', background: 'white', padding: '0.6rem 0.8rem',
                      borderRadius: 8, border: '1px solid #e5e7eb', gap: '0.8rem',
                    }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{v.naam}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                        {new Date(v.start_datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {new Date(v.eind_datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <button onClick={() => editVakantie(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>✏️</button>
                      <button onClick={() => deleteVakantie(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.8rem' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', color: '#374151', marginBottom: '0.5rem' }}>📌 Vrije dagen</h3>
              {vrijeDagen.length === 0 ? (
                <div style={{ padding: '1rem', color: '#9CA3AF', fontSize: '0.85rem' }}>Geen vrije dagen ingesteld.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {vrijeDagen.map(v => (
                    <div key={v.id} style={{
                      display: 'flex', alignItems: 'center', background: 'white', padding: '0.6rem 0.8rem',
                      borderRadius: 8, border: '1px solid #e5e7eb', gap: '0.8rem',
                    }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{v.naam}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                        {new Date(v.start_datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        {v.start_datum !== v.eind_datum && ` – ${new Date(v.eind_datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`}
                      </span>
                      <button onClick={() => editVakantie(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>✏️</button>
                      <button onClick={() => deleteVakantie(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.8rem' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
