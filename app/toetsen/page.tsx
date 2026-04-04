'use client';

import { useEffect, useState } from 'react';

interface Klas { id: number; naam: string; aantal_leerlingen: number; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; weging: number; max_score: number; omschrijving: string; }

const typeLabels: Record<string, string> = { SO: 'SO', PW: 'Proefwerk', SE: 'Schoolexamen', mondeling: 'Mondeling', overig: 'Overig' };
const typeColors: Record<string, string> = { SO: '#f59e0b', PW: '#3b82f6', SE: '#8b5cf6', mondeling: '#10b981', overig: '#6b7280' };

export default function ToetsenPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<number>(1);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editToets, setEditToets] = useState<Toets | null>(null);
  const [newToets, setNewToets] = useState({ naam: '', type: 'SO', datum: '', weging: 1.0, max_score: 10, omschrijving: '' });

  useEffect(() => { fetch('/api/klassen').then(r => r.json()).then(setKlassen).catch(() => {}); }, []);
  useEffect(() => { if (selectedKlas) fetchToetsen(); }, [selectedKlas]);

  async function fetchToetsen() {
    const res = await fetch(`/api/toetsen?klas_id=${selectedKlas}`);
    setToetsen(await res.json().catch(() => []));
  }

  async function createToets() {
    if (!newToets.naam.trim()) return;
    await fetch('/api/toetsen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newToets, klas_id: selectedKlas }),
    });
    setNewToets({ naam: '', type: 'SO', datum: '', weging: 1.0, max_score: 10, omschrijving: '' });
    setShowNew(false);
    fetchToetsen();
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

  const formatDate = (d: string | null) => {
    if (!d) return '–';
    return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const card: React.CSSProperties = { background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
  const input: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.9rem', width: '100%' };
  const btnP: React.CSSProperties = { background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600 };
  const btnS: React.CSSProperties = { background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer' };
  const btnD: React.CSSProperties = { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' };
  const label: React.CSSProperties = { fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 };

  const upcoming = toetsen.filter(t => t.datum && t.datum >= new Date().toISOString().split('T')[0]);
  const past = toetsen.filter(t => !t.datum || t.datum < new Date().toISOString().split('T')[0]);

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>Toetsen</h1>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {klassen.map(k => (
          <button key={k.id} onClick={() => setSelectedKlas(k.id)} style={{
            padding: '0.5rem 1rem', borderRadius: 8,
            border: selectedKlas === k.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            background: selectedKlas === k.id ? '#eff6ff' : 'white',
            color: selectedKlas === k.id ? '#1d4ed8' : '#475569',
            cursor: 'pointer', fontWeight: selectedKlas === k.id ? 700 : 500,
          }}>{k.naam}</button>
        ))}
        <button onClick={() => setShowNew(true)} style={btnP}>+ Nieuwe toets</button>
      </div>

      {showNew && (
        <div style={{ ...card, marginBottom: '1.5rem', border: '2px solid #3b82f6' }}>
          <h3 style={{ margin: '0 0 1rem', fontWeight: 600 }}>Nieuwe toets</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div><label style={label}>Naam *</label><input style={input} value={newToets.naam} onChange={e => setNewToets({ ...newToets, naam: e.target.value })} /></div>
            <div><label style={label}>Type</label>
              <select style={input} value={newToets.type} onChange={e => setNewToets({ ...newToets, type: e.target.value })}>
                <option value="SO">SO</option><option value="PW">Proefwerk</option><option value="SE">Schoolexamen</option>
                <option value="mondeling">Mondeling</option><option value="overig">Overig</option>
              </select>
            </div>
            <div><label style={label}>Datum</label><input style={input} type="date" value={newToets.datum} onChange={e => setNewToets({ ...newToets, datum: e.target.value })} /></div>
            <div><label style={label}>Weging</label><input style={input} type="number" step="0.5" min="0.5" value={newToets.weging} onChange={e => setNewToets({ ...newToets, weging: Number(e.target.value) })} /></div>
            <div><label style={label}>Max score</label><input style={input} type="number" value={newToets.max_score} onChange={e => setNewToets({ ...newToets, max_score: Number(e.target.value) })} /></div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={label}>Omschrijving</label>
            <input style={input} value={newToets.omschrijving} onChange={e => setNewToets({ ...newToets, omschrijving: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={createToets} style={btnP}>Opslaan</button>
            <button onClick={() => setShowNew(false)} style={btnS}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', marginBottom: '0.75rem' }}>Komende toetsen</h2>
          <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '2rem' }}>
            {upcoming.map(t => (
              <ToetsCard key={t.id} t={t} editToets={editToets} setEditToets={setEditToets} saveEdit={saveEdit}
                deleteToets={deleteToets} formatDate={formatDate} input={input} label={label} btnP={btnP} btnS={btnS} btnD={btnD} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#475569', marginBottom: '0.75rem' }}>Afgelopen toetsen</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {past.map(t => (
              <ToetsCard key={t.id} t={t} editToets={editToets} setEditToets={setEditToets} saveEdit={saveEdit}
                deleteToets={deleteToets} formatDate={formatDate} input={input} label={label} btnP={btnP} btnS={btnS} btnD={btnD} />
            ))}
          </div>
        </>
      )}

      {toetsen.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>
          <p style={{ fontSize: '1.1rem' }}>Nog geen toetsen voor deze klas.</p>
        </div>
      )}
    </div>
  );
}

function ToetsCard({ t, editToets, setEditToets, saveEdit, deleteToets, formatDate, input, label, btnP, btnS, btnD }: {
  t: Toets; editToets: Toets | null; setEditToets: (t: Toets | null) => void;
  saveEdit: () => void; deleteToets: (id: number) => void; formatDate: (d: string | null) => string;
  input: React.CSSProperties; label: React.CSSProperties;
  btnP: React.CSSProperties; btnS: React.CSSProperties; btnD: React.CSSProperties;
}) {
  const isEditing = editToets?.id === t.id;
  const typeColor = typeColors[t.type] || '#6b7280';

  if (isEditing && editToets) {
    return (
      <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '2px solid #3b82f6' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div><label style={label}>Naam</label><input style={input} value={editToets.naam} onChange={e => setEditToets({ ...editToets, naam: e.target.value })} /></div>
          <div><label style={label}>Type</label>
            <select style={input} value={editToets.type} onChange={e => setEditToets({ ...editToets, type: e.target.value })}>
              <option value="SO">SO</option><option value="PW">Proefwerk</option><option value="SE">Schoolexamen</option>
              <option value="mondeling">Mondeling</option><option value="overig">Overig</option>
            </select>
          </div>
          <div><label style={label}>Datum</label><input style={input} type="date" value={editToets.datum || ''} onChange={e => setEditToets({ ...editToets, datum: e.target.value })} /></div>
          <div><label style={label}>Weging</label><input style={input} type="number" step="0.5" value={editToets.weging} onChange={e => setEditToets({ ...editToets, weging: Number(e.target.value) })} /></div>
          <div><label style={label}>Max</label><input style={input} type="number" value={editToets.max_score} onChange={e => setEditToets({ ...editToets, max_score: Number(e.target.value) })} /></div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={saveEdit} style={btnP}>Opslaan</button>
          <button onClick={() => setEditToets(null)} style={btnS}>Annuleren</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <span style={{
        background: typeColor + '20', color: typeColor, padding: '0.3rem 0.7rem', borderRadius: 6,
        fontSize: '0.8rem', fontWeight: 700, minWidth: 60, textAlign: 'center',
      }}>{typeLabels[t.type] || t.type}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#1e293b' }}>{t.naam}</div>
        {t.omschrijving && <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>{t.omschrijving}</div>}
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.9rem', color: '#475569', minWidth: 100 }}>
        <div>{formatDate(t.datum)}</div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Weging: ×{t.weging}</div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button onClick={() => setEditToets({ ...t })} style={btnS}>Bewerken</button>
        <button onClick={() => deleteToets(t.id)} style={btnD}>×</button>
      </div>
    </div>
  );
}

interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; weging: number; max_score: number; omschrijving: string; }
