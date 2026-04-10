'use client';

import { useEffect, useState, useCallback } from 'react';

/* ───── Types ───── */
interface Klas { id: number; naam: string; vak: string; jaarlaag: string; lokaal: string; }
interface Vakantie { id: number; naam: string; start_datum: string; eind_datum: string; type?: 'vakantie' | 'toetsweek' | 'studiedag'; }
interface LesveldConfig { id: number; veld_key: string; label: string; icoon: string; zichtbaar: boolean; volgorde: number; is_custom: boolean; dashboard_binnenkomst: boolean; dashboard_les: boolean; }
interface RoosterPeriode { id: number; naam: string; start_datum: string; eind_datum: string; bron: string; created_at: string; }

function formatDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }
function getMonday(d: Date): Date {
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d); m.setDate(d.getDate() + diff); return m;
}

export default function InstellingenPage() {
  const [section, setSection] = useState<'lesvelden' | 'overzicht' | 'kalender' | 'zermelo' | 'jaarkalender'>('lesvelden');

  // Lesvelden
  const [lesveldConfig, setLesveldConfig] = useState<LesveldConfig[]>([]);
  const [newLesveldLabel, setNewLesveldLabel] = useState('');
  const [newLesveldIcoon, setNewLesveldIcoon] = useState('📌');

  // Overzicht blokken
  const [overzichtInstellingen, setOverzichtInstellingen] = useState<Record<string, boolean>>({ vandaag: true, lege_lessen: true, komende_toetsen: true, notities: true, agenda: true });

  // Schoolkalender
  const [vakanties, setVakanties] = useState<Vakantie[]>([]);

  // Zermelo import
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [periodes, setPeriodes] = useState<RoosterPeriode[]>([]);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<number | null>(null);
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

  // Jaarkalender import
  const [jaarkalenderFile, setJaarkalenderFile] = useState<File | null>(null);
  const [jaarkalenderStatus, setJaarkalenderStatus] = useState('');
  const [jaarkalenderPreview, setJaarkalenderPreview] = useState<Array<{ naam: string; start_datum: string; eind_datum: string; type: string }> | null>(null);

  const dagNamenKort = ['Ma', 'Di', 'Wo', 'Do', 'Vr'];

  /* ───── Fetching ───── */
  const fetchLesveldConfig = useCallback(() => {
    fetch('/api/lesvelden').then(r => r.json()).then(setLesveldConfig);
  }, []);

  const fetchPeriodes = useCallback(() => {
    fetch('/api/rooster-periodes').then(r => r.json()).then((data: RoosterPeriode[]) => {
      setPeriodes(data);
      if (data.length > 0 && !selectedPeriodeId) {
        const today = new Date().toISOString().split('T')[0];
        const actief = data.find(p => p.start_datum <= today && p.eind_datum >= today);
        if (actief) setSelectedPeriodeId(actief.id);
        else {
          const sorted = [...data].sort((a, b) => Math.abs(new Date(a.start_datum).getTime() - Date.now()) - Math.abs(new Date(b.start_datum).getTime() - Date.now()));
          setSelectedPeriodeId(sorted[0].id);
        }
      }
    });
  }, [selectedPeriodeId]);

  useEffect(() => {
    fetchLesveldConfig();
    fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
    fetch('/api/klassen').then(r => r.json()).then(setKlassen);
    fetchPeriodes();
  }, []);

  /* ───── Sections config ───── */
  const sections = [
    { key: 'lesvelden' as const, label: 'Lesvelden', icon: '📝', beschrijving: 'Velden per les aanpassen' },
    { key: 'overzicht' as const, label: 'Overzicht blokken', icon: '📊', beschrijving: 'Dashboard configuratie' },
    { key: 'kalender' as const, label: 'Schoolkalender', icon: '📅', beschrijving: 'Vakanties, toetsweken, studiedagen' },
    { key: 'zermelo' as const, label: 'Zermelo import', icon: '🔗', beschrijving: 'Rooster importeren uit Zermelo' },
    { key: 'jaarkalender' as const, label: 'Jaarkalender import', icon: '📥', beschrijving: 'Excel jaarplanner inlezen' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Zijpaneel */}
      <div style={{ width: 260, background: 'white', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '1.25rem 1rem 0.75rem' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a7a2e', margin: 0 }}>⚙️ Instellingen</h1>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
          {sections.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem 1rem',
                background: section === s.key ? '#f0fdf4' : 'transparent',
                border: section === s.key ? '1px solid #bbf7d0' : '1px solid transparent',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', marginBottom: 4,
                transition: 'all 0.15s',
              }}>
              <span style={{ fontSize: '1.3rem' }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: '1.02rem', fontWeight: 700, color: section === s.key ? '#1a7a2e' : '#374151' }}>{s.label}</div>
                <div style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>{s.beschrijving}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '2rem', background: '#f8faf8' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          {/* ═══ LESVELDEN ═══ */}
          {section === 'lesvelden' && (
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#374151', marginBottom: '0.5rem' }}>Lesvelden</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1.25rem' }}>Pas de velden aan die je per les wilt invullen. Je kunt velden hernoemen, verbergen, de volgorde wijzigen en eigen velden toevoegen.</p>
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

              {/* Dashboard weergave sectie */}
              <div style={{ marginTop: '2rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#374151', marginBottom: '0.25rem' }}>Dashboard weergave</h3>
                <p style={{ fontSize: '0.95rem', color: '#9CA3AF', marginBottom: '1rem' }}>Bepaal welke velden zichtbaar zijn op het dashboard in de binnenkomst- en lesmodus.</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#6B7280' }}>Veld</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#6B7280' }}>Binnenkomst</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#6B7280' }}>Les</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lesveldConfig.filter(f => f.zichtbaar).sort((a, b) => a.volgorde - b.volgorde).map(f => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.1rem' }}>{f.icoon}</span>
                            <span style={{ fontSize: '0.95rem', color: '#374151' }}>{f.label}</span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={f.dashboard_binnenkomst || false}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                              onChange={async (e) => {
                                const newVal = e.target.checked;
                                setLesveldConfig(prev => prev.map(p => p.id === f.id ? { ...p, dashboard_binnenkomst: newVal } : p));
                                await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: f.id, dashboard_binnenkomst: newVal }) });
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={f.dashboard_les || false}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                              onChange={async (e) => {
                                const newVal = e.target.checked;
                                setLesveldConfig(prev => prev.map(p => p.id === f.id ? { ...p, dashboard_les: newVal } : p));
                                await fetch('/api/lesvelden', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: f.id, dashboard_les: newVal }) });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ OVERZICHT BLOKKEN ═══ */}
          {section === 'overzicht' && (
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#374151', marginBottom: '0.5rem' }}>Overzicht blokken</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1.25rem' }}>Kies welke blokken zichtbaar zijn op het overzicht.</p>
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
          )}

          {/* ═══ SCHOOLKALENDER ═══ */}
          {section === 'kalender' && (
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#374151', marginBottom: '0.5rem' }}>Schoolkalender</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1.25rem' }}>Voeg vakanties, toetsweken en studiedagen toe. Deze worden in alle planners getoond.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {vakanties.length === 0 && (
                  <div style={{ padding: '0.75rem 1rem', background: '#e8eaed', borderRadius: 12, color: '#9CA3AF', fontSize: '1.0rem', fontStyle: 'italic' }}>Nog geen items. Voeg hieronder iets toe, of gebruik de Jaarkalender import.</div>
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
          )}

          {/* ═══ ZERMELO IMPORT ═══ */}
          {section === 'zermelo' && (
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#374151', marginBottom: '0.5rem' }}>Zermelo rooster import</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1.25rem' }}>Importeer je rooster rechtstreeks vanuit Zermelo. Je hebt een koppelcode nodig vanuit Zermelo (Instellingen → Koppel apps → Nieuwe koppeling).</p>

              {/* Stappen indicator */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {[
                  { key: 'auth', label: '1. Verbinden', active: true },
                  { key: 'fetch', label: '2. Week kiezen', active: !!zermeloToken },
                  { key: 'preview', label: '3. Importeren', active: zermeloStep === 'preview' },
                ].map(step => (
                  <div key={step.key} style={{
                    flex: 1, padding: '0.6rem 0.75rem', borderRadius: 8, textAlign: 'center',
                    background: step.active ? '#fef3c7' : '#f3f4f6',
                    border: `1px solid ${step.active ? '#f59e0b' : '#e5e7eb'}`,
                    fontWeight: step.active ? 700 : 400,
                    color: step.active ? '#92400e' : '#9CA3AF',
                    fontSize: '0.95rem',
                  }}>{step.label}</div>
                ))}
              </div>

              <div style={{ padding: '1.25rem', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                {/* Stap 1: Authenticatie */}
                {!zermeloToken && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={zermeloSchool} onChange={e => setZermeloSchool(e.target.value)} placeholder="Schoolnaam (bijv. mijnschool)"
                      style={{ flex: '1 1 140px', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '1.05rem' }} />
                    <span style={{ fontSize: '1.0rem', color: '#94a3b8' }}>.zportal.nl</span>
                    <input value={zermeloCode} onChange={e => setZermeloCode(e.target.value)} placeholder="Koppelcode" type="password"
                      style={{ flex: '1 1 100px', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '1.05rem' }} />
                    <button onClick={async () => {
                      setZermeloStatus('Verbinden...');
                      const res = await fetch('/api/zermelo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'auth', school: zermeloSchool, code: zermeloCode }) });
                      const data = await res.json();
                      if (data.token) { setZermeloToken(data.token); setZermeloStep('fetch'); setZermeloStatus('Verbonden! Kies een week.'); }
                      else { setZermeloStatus(data.error || 'Authenticatie mislukt'); }
                    }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
                      Verbinden
                    </button>
                  </div>
                )}

                {/* Stap 2: Week kiezen */}
                {zermeloToken && zermeloStep === 'fetch' && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.05rem', color: '#2d8a4e', fontWeight: 600 }}>✓ Verbonden</span>
                    <span style={{ fontSize: '1.02rem', color: '#6B7280' }}>Kies een lesweek:</span>
                    <input id="z-week-inst" type="date" defaultValue={getMonday(new Date()).toISOString().split('T')[0]}
                      style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem', fontSize: '1.05rem' }} />
                    <button onClick={async () => {
                      const ws = (document.getElementById('z-week-inst') as HTMLInputElement).value;
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
                        setZermeloImportPeriodeId(selectedPeriodeId || 'new');
                        const defaultStart = ws || getMonday(new Date()).toISOString().split('T')[0];
                        setZermeloNieuwStart(defaultStart);
                        const defaultYr = new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear();
                        setZermeloNieuwEind(`${defaultYr}-07-17`);
                        setZermeloStep('preview');
                        const matched = Object.values(autoMap).filter(v => v !== 'new').length;
                        setZermeloStatus(`${data.slots.length} lessen gevonden, ${matched}/${uniqueGroepen.length} groepen herkend`);
                      } else { setZermeloStatus(data.error || 'Ophalen mislukt'); }
                    }} style={{ background: '#c4892e', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
                      Ophalen
                    </button>
                  </div>
                )}

                {/* Stap 3: Preview + koppelen */}
                {zermeloToken && zermeloStep === 'preview' && zermeloPreview && (
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                      {zermeloPreview.length} lessen gevonden
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      {[1,2,3,4,5].map(dag => {
                        const dagSlots = zermeloPreview.filter(s => s.dag === dag);
                        if (dagSlots.length === 0) return null;
                        return (
                          <div key={dag} style={{ flex: '1 1 100px', background: '#fefce8', borderRadius: 8, padding: '0.4rem 0.5rem', border: '1px solid #fde68a', minWidth: 90 }}>
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
                          <div key={groep} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.45rem 0.75rem', background: isSkipped ? '#f9fafb' : isMatched ? '#f0fdf4' : '#fffbeb', borderRadius: 8, border: `1px solid ${isSkipped ? '#e5e7eb' : isMatched ? '#bbf7d0' : '#fde68a'}` }}>
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
                              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.65rem', fontSize: '1.02rem', background: 'white' }}
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

                    {/* Periode keuze */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.5rem 0', borderTop: '1px solid #e5e7eb' }}>
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
                          setZermeloPreview(null); setZermeloStep('auth'); setZermeloToken('');
                          setZermeloMapping({}); setZermeloImportPeriodeId('new');
                          fetch('/api/klassen').then(r => r.json()).then(setKlassen);
                          fetchPeriodes();
                        } else { setZermeloStatus(data.error || 'Import mislukt'); }
                      }} style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1.2rem', fontWeight: 700, fontSize: '1.12rem', cursor: 'pointer' }}>
                        Importeer rooster
                      </button>
                      <button onClick={() => { setZermeloPreview(null); setZermeloStep('fetch'); setZermeloStatus(''); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.02rem', cursor: 'pointer', marginLeft: 'auto' }}>
                        ← Terug
                      </button>
                    </div>
                  </div>
                )}

                {zermeloStatus && <div style={{ marginTop: '0.75rem', fontSize: '1.02rem', color: '#92400e', fontWeight: 500, padding: '0.5rem 0.75rem', background: '#fef3c7', borderRadius: 8 }}>{zermeloStatus}</div>}
              </div>
            </div>
          )}

          {/* ═══ JAARKALENDER IMPORT ═══ */}
          {section === 'jaarkalender' && (
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#374151', marginBottom: '0.5rem' }}>Jaarkalender import</h2>
              <p style={{ fontSize: '1.0rem', color: '#6B7280', marginBottom: '1.25rem' }}>Upload de jaarplanner van je school (Excel) om automatisch vakanties, toetsweken en studiedagen in te laden.</p>

              <div style={{ padding: '1.25rem', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                {/* Upload */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem',
                    background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8,
                    cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem', color: '#2563EB',
                  }}>
                    📥 Kies Excel bestand
                    <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) { setJaarkalenderFile(file); setJaarkalenderPreview(null); setJaarkalenderStatus(''); }
                    }} />
                  </label>
                  {jaarkalenderFile && (
                    <span style={{ fontSize: '1.0rem', color: '#374151', fontWeight: 500 }}>{jaarkalenderFile.name}</span>
                  )}
                </div>

                {jaarkalenderFile && !jaarkalenderPreview && (
                  <button onClick={async () => {
                    setJaarkalenderStatus('Bestand analyseren...');
                    const formData = new FormData();
                    formData.append('file', jaarkalenderFile);
                    const res = await fetch('/api/jaarkalender-import', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (data.items) {
                      setJaarkalenderPreview(data.items);
                      setJaarkalenderStatus(`${data.items.length} items gevonden`);
                    } else {
                      setJaarkalenderStatus(data.error || 'Analyse mislukt');
                    }
                  }} style={{ background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1.2rem', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
                    Analyseer bestand
                  </button>
                )}

                {/* Preview */}
                {jaarkalenderPreview && (
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>
                      Gevonden items ({jaarkalenderPreview.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                      {jaarkalenderPreview.map((item, i) => {
                        const typeKleur = item.type === 'toetsweek' ? '#dc2626' : item.type === 'studiedag' ? '#2563EB' : '#ca8a04';
                        const typeLabel = item.type === 'toetsweek' ? 'Toetsweek' : item.type === 'studiedag' ? 'Studiedag' : 'Vakantie';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: typeKleur + '12', borderRadius: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'white', background: typeKleur, padding: '2px 6px', borderRadius: 4, minWidth: 75, textAlign: 'center' }}>{typeLabel}</span>
                            <span style={{ fontWeight: 600, fontSize: '1.0rem', color: '#374151', flex: 1 }}>{item.naam}</span>
                            <span style={{ fontSize: '0.92rem', color: '#6B7280' }}>{formatDate(item.start_datum)} – {formatDate(item.eind_datum)}</span>
                            <button onClick={() => {
                              setJaarkalenderPreview(prev => prev!.filter((_, j) => j !== i));
                            }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.92rem' }}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={async () => {
                        if (jaarkalenderPreview.length === 0) return;
                        setJaarkalenderStatus('Importeren...');
                        const res = await fetch('/api/vakanties', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(jaarkalenderPreview),
                        });
                        if (res.ok) {
                          setJaarkalenderStatus(`✓ ${jaarkalenderPreview.length} items geïmporteerd`);
                          setJaarkalenderPreview(null);
                          setJaarkalenderFile(null);
                          fetch('/api/vakanties').then(r => r.json()).then(setVakanties);
                        } else {
                          setJaarkalenderStatus('Import mislukt');
                        }
                      }} style={{ background: '#2d8a4e', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1.2rem', fontWeight: 700, fontSize: '1.08rem', cursor: 'pointer' }}>
                        Importeer {jaarkalenderPreview.length} items
                      </button>
                      <button onClick={() => { setJaarkalenderPreview(null); setJaarkalenderStatus(''); }}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '1.0rem', color: '#6B7280' }}>
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}

                {jaarkalenderStatus && (
                  <div style={{ marginTop: '0.75rem', fontSize: '1.02rem', fontWeight: 500, padding: '0.5rem 0.75rem', borderRadius: 8,
                    color: jaarkalenderStatus.includes('✓') ? '#166534' : '#92400e',
                    background: jaarkalenderStatus.includes('✓') ? '#f0fdf4' : '#fef3c7',
                  }}>{jaarkalenderStatus}</div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
