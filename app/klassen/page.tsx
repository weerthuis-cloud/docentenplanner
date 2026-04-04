'use client';

import { useEffect, useState } from 'react';

interface Klas {
  id: number; naam: string; vak: string; lokaal: string; jaarlaag: string; schooljaar: string; aantal_leerlingen: number;
}

interface Leerling {
  id: number; klas_id: number; voornaam: string; achternaam: string; boek_titel: string; boek_kleur: string;
}

export default function KlassenPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<number | null>(null);
  const [leerlingen, setLeerlingen] = useState<Leerling[]>([]);
  const [showNewKlas, setShowNewKlas] = useState(false);
  const [showNewLeerling, setShowNewLeerling] = useState(false);
  const [newKlas, setNewKlas] = useState({ naam: '', vak: 'Nederlands', lokaal: '', jaarlaag: '' });
  const [newLeerling, setNewLeerling] = useState({ voornaam: '', achternaam: '', boek_titel: '', boek_kleur: '#2E4057' });
  const [editLeerling, setEditLeerling] = useState<Leerling | null>(null);

  useEffect(() => {
    fetchKlassen();
  }, []);

  useEffect(() => {
    if (selectedKlas) fetchLeerlingen(selectedKlas);
  }, [selectedKlas]);

  async function fetchKlassen() {
    const res = await fetch('/api/klassen');
    const data = await res.json().catch(() => []);
    setKlassen(data);
    if (data.length > 0 && !selectedKlas) setSelectedKlas(data[0].id);
  }

  async function fetchLeerlingen(klasId: number) {
    const res = await fetch(`/api/leerlingen?klas_id=${klasId}`);
    const data = await res.json().catch(() => []);
    setLeerlingen(data);
  }

  async function createKlas() {
    if (!newKlas.naam.trim()) return;
    await fetch('/api/klassen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newKlas) });
    setNewKlas({ naam: '', vak: 'Nederlands', lokaal: '', jaarlaag: '' });
    setShowNewKlas(false);
    fetchKlassen();
  }

  async function createLeerling() {
    if (!newLeerling.voornaam.trim() || !newLeerling.achternaam.trim() || !selectedKlas) return;
    await fetch('/api/leerlingen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newLeerling, klas_id: selectedKlas }),
    });
    setNewLeerling({ voornaam: '', achternaam: '', boek_titel: '', boek_kleur: '#2E4057' });
    setShowNewLeerling(false);
    fetchLeerlingen(selectedKlas);
    fetchKlassen();
  }

  async function updateLeerling() {
    if (!editLeerling) return;
    await fetch('/api/leerlingen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editLeerling),
    });
    setEditLeerling(null);
    if (selectedKlas) fetchLeerlingen(selectedKlas);
  }

  async function deleteLeerling(id: number) {
    if (!confirm('Weet je zeker dat je deze leerling wilt verwijderen?')) return;
    await fetch(`/api/leerlingen?id=${id}`, { method: 'DELETE' });
    if (selectedKlas) fetchLeerlingen(selectedKlas);
    fetchKlassen();
  }

  async function deleteKlas(id: number) {
    if (!confirm('Weet je zeker dat je deze klas wilt verwijderen? Alle leerlingen worden ook verwijderd.')) return;
    await fetch(`/api/klassen?id=${id}`, { method: 'DELETE' });
    setSelectedKlas(null);
    setLeerlingen([]);
    fetchKlassen();
  }

  const selectedKlasData = klassen.find(k => k.id === selectedKlas);

  const cardStyle: React.CSSProperties = {
    background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  };
  const btnPrimary: React.CSSProperties = {
    background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem',
    cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
  };
  const btnSecondary: React.CSSProperties = {
    background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 8, padding: '0.5rem 1rem',
    cursor: 'pointer', fontSize: '0.9rem',
  };
  const btnDanger: React.CSSProperties = {
    background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '0.4rem 0.8rem',
    cursor: 'pointer', fontSize: '0.85rem',
  };
  const inputStyle: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.9rem', width: '100%',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>
        Klassen
      </h1>

      {/* Klas selector */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {klassen.map(k => (
          <button
            key={k.id}
            onClick={() => setSelectedKlas(k.id)}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 10,
              border: selectedKlas === k.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
              background: selectedKlas === k.id ? '#eff6ff' : 'white',
              color: selectedKlas === k.id ? '#1d4ed8' : '#475569',
              cursor: 'pointer',
              fontWeight: selectedKlas === k.id ? 700 : 500,
              fontSize: '0.95rem',
            }}
          >
            {k.naam} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({k.aantal_leerlingen})</span>
          </button>
        ))}
        <button onClick={() => setShowNewKlas(true)} style={btnPrimary}>+ Nieuwe klas</button>
      </div>

      {/* New klas form */}
      {showNewKlas && (
        <div style={{ ...cardStyle, marginBottom: '1.5rem', border: '2px solid #3b82f6' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600 }}>Nieuwe klas toevoegen</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Naam *</label>
              <input style={inputStyle} placeholder="bijv. M3B" value={newKlas.naam} onChange={e => setNewKlas({ ...newKlas, naam: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Vak</label>
              <input style={inputStyle} value={newKlas.vak} onChange={e => setNewKlas({ ...newKlas, vak: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Lokaal</label>
              <input style={inputStyle} placeholder="bijv. 214" value={newKlas.lokaal} onChange={e => setNewKlas({ ...newKlas, lokaal: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Jaarlaag</label>
              <input style={inputStyle} placeholder="bijv. 3 mavo" value={newKlas.jaarlaag} onChange={e => setNewKlas({ ...newKlas, jaarlaag: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={createKlas} style={btnPrimary}>Opslaan</button>
            <button onClick={() => setShowNewKlas(false)} style={btnSecondary}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Selected klas info + leerlingen */}
      {selectedKlasData && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>
                {selectedKlasData.naam}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                {selectedKlasData.vak} · {selectedKlasData.jaarlaag} · Lokaal {selectedKlasData.lokaal} · {selectedKlasData.aantal_leerlingen} leerlingen
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowNewLeerling(true)} style={btnPrimary}>+ Leerling toevoegen</button>
              <button onClick={() => deleteKlas(selectedKlasData.id)} style={btnDanger}>Klas verwijderen</button>
            </div>
          </div>

          {/* New leerling form */}
          {showNewLeerling && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1.2rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Nieuwe leerling</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Voornaam *</label>
                  <input style={inputStyle} value={newLeerling.voornaam} onChange={e => setNewLeerling({ ...newLeerling, voornaam: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Achternaam *</label>
                  <input style={inputStyle} value={newLeerling.achternaam} onChange={e => setNewLeerling({ ...newLeerling, achternaam: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Boek</label>
                  <input style={inputStyle} placeholder="optioneel" value={newLeerling.boek_titel} onChange={e => setNewLeerling({ ...newLeerling, boek_titel: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={createLeerling} style={btnPrimary}>Toevoegen</button>
                  <button onClick={() => setShowNewLeerling(false)} style={btnSecondary}>×</button>
                </div>
              </div>
            </div>
          )}

          {/* Leerlingen table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>#</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Naam</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Leesboek</th>
                <th style={{ textAlign: 'right', padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {leerlingen.map((l, idx) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8', fontSize: '0.9rem' }}>{idx + 1}</td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    {editLeerling?.id === l.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input style={{ ...inputStyle, width: 120 }} value={editLeerling.voornaam}
                          onChange={e => setEditLeerling({ ...editLeerling, voornaam: e.target.value })} />
                        <input style={{ ...inputStyle, width: 150 }} value={editLeerling.achternaam}
                          onChange={e => setEditLeerling({ ...editLeerling, achternaam: e.target.value })} />
                      </div>
                    ) : (
                      <span style={{ fontWeight: 500, color: '#1e293b' }}>{l.voornaam} {l.achternaam}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    {editLeerling?.id === l.id ? (
                      <input style={inputStyle} value={editLeerling.boek_titel}
                        onChange={e => setEditLeerling({ ...editLeerling, boek_titel: e.target.value })} />
                    ) : (
                      <span style={{ color: '#475569', fontSize: '0.9rem' }}>
                        {l.boek_titel && (
                          <span style={{
                            display: 'inline-block', width: 12, height: 16, borderRadius: 2,
                            background: l.boek_kleur || '#ccc', marginRight: 8, verticalAlign: 'middle',
                          }} />
                        )}
                        {l.boek_titel || '–'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                    {editLeerling?.id === l.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={updateLeerling} style={btnPrimary}>Opslaan</button>
                        <button onClick={() => setEditLeerling(null)} style={btnSecondary}>Annuleren</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditLeerling({ ...l })} style={btnSecondary}>Bewerken</button>
                        <button onClick={() => deleteLeerling(l.id)} style={btnDanger}>Verwijderen</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {leerlingen.length === 0 && (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.95rem' }}>
              Nog geen leerlingen in deze klas. Voeg er een toe!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
