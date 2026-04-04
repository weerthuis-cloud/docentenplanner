'use client';

import { useEffect, useState } from 'react';

interface Klas { id: number; naam: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; weging: number; max_score: number; }
interface Leerling { id: number; voornaam: string; achternaam: string; }
interface Cijfer { id: number; toets_id: number; leerling_id: number; score: number | null; opmerking: string | null; voornaam: string; achternaam: string; }

export default function CijfersPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<number>(1);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [selectedToets, setSelectedToets] = useState<number | null>(null);
  const [leerlingen, setLeerlingen] = useState<Leerling[]>([]);
  const [cijfers, setCijfers] = useState<Record<number, { score: string; opmerking: string }>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch('/api/klassen').then(r => r.json()).then(setKlassen).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedKlas) return;
    fetch(`/api/toetsen?klas_id=${selectedKlas}`).then(r => r.json()).then(data => {
      setToetsen(data);
      if (data.length > 0 && !selectedToets) setSelectedToets(data[0].id);
    }).catch(() => {});
    fetch(`/api/leerlingen?klas_id=${selectedKlas}`).then(r => r.json()).then(setLeerlingen).catch(() => {});
  }, [selectedKlas]);

  useEffect(() => {
    if (!selectedToets) return;
    fetch(`/api/cijfers?toets_id=${selectedToets}`).then(r => r.json()).then((data: Cijfer[]) => {
      const map: Record<number, { score: string; opmerking: string }> = {};
      data.forEach(c => {
        map[c.leerling_id] = { score: c.score !== null ? String(c.score) : '', opmerking: c.opmerking || '' };
      });
      setCijfers(map);
    }).catch(() => {});
  }, [selectedToets]);

  async function saveCijfers() {
    if (!selectedToets) return;
    const batch = leerlingen.map(l => ({
      toets_id: selectedToets,
      leerling_id: l.id,
      score: cijfers[l.id]?.score ? Number(cijfers[l.id].score) : null,
      opmerking: cijfers[l.id]?.opmerking || null,
    })).filter(c => c.score !== null);

    await fetch('/api/cijfers', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cijfers: batch }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateCijfer(leerlingId: number, field: 'score' | 'opmerking', value: string) {
    setCijfers(prev => ({
      ...prev,
      [leerlingId]: { ...prev[leerlingId] || { score: '', opmerking: '' }, [field]: value },
    }));
  }

  const currentToets = toetsen.find(t => t.id === selectedToets);
  const scores = leerlingen.map(l => Number(cijfers[l.id]?.score)).filter(s => !isNaN(s) && s > 0);
  const gemiddelde = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '–';
  const hoogste = scores.length > 0 ? Math.max(...scores).toFixed(1) : '–';
  const laagste = scores.length > 0 ? Math.min(...scores).toFixed(1) : '–';
  const voldoende = scores.filter(s => s >= 5.5).length;

  const input: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.9rem' };

  const scoreColor = (s: string) => {
    const n = Number(s);
    if (isNaN(n) || s === '') return '#1e293b';
    if (n >= 7.5) return '#16a34a';
    if (n >= 5.5) return '#1e293b';
    return '#dc2626';
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>Cijfers invoeren</h1>

      {/* Klas selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {klassen.map(k => (
          <button key={k.id} onClick={() => { setSelectedKlas(k.id); setSelectedToets(null); }} style={{
            padding: '0.5rem 1rem', borderRadius: 8,
            border: selectedKlas === k.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            background: selectedKlas === k.id ? '#eff6ff' : 'white',
            color: selectedKlas === k.id ? '#1d4ed8' : '#475569',
            cursor: 'pointer', fontWeight: selectedKlas === k.id ? 700 : 500,
          }}>{k.naam}</button>
        ))}
      </div>

      {/* Toets selector */}
      {toetsen.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {toetsen.map(t => (
            <button key={t.id} onClick={() => setSelectedToets(t.id)} style={{
              padding: '0.4rem 0.8rem', borderRadius: 6, fontSize: '0.9rem',
              border: selectedToets === t.id ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
              background: selectedToets === t.id ? '#f5f3ff' : 'white',
              color: selectedToets === t.id ? '#6d28d9' : '#475569',
              cursor: 'pointer', fontWeight: selectedToets === t.id ? 600 : 400,
            }}>{t.naam}</button>
          ))}
        </div>
      )}

      {currentToets && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Gemiddelde', value: gemiddelde, color: '#3b82f6' },
              { label: 'Hoogste', value: hoogste, color: '#16a34a' },
              { label: 'Laagste', value: laagste, color: '#dc2626' },
              { label: 'Voldoende', value: `${voldoende}/${scores.length}`, color: '#8b5cf6' },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Cijfer invoer tabel */}
          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>{currentToets.naam}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {saved && <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.9rem' }}>✓ Opgeslagen!</span>}
                <button onClick={saveCijfers} style={{
                  background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8,
                  padding: '0.5rem 1.2rem', cursor: 'pointer', fontWeight: 600,
                }}>Opslaan</button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontSize: '0.85rem', color: '#64748b' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontSize: '0.85rem', color: '#64748b' }}>Leerling</th>
                  <th style={{ textAlign: 'center', padding: '0.6rem', fontSize: '0.85rem', color: '#64748b', width: 100 }}>Cijfer</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontSize: '0.85rem', color: '#64748b' }}>Opmerking</th>
                </tr>
              </thead>
              <tbody>
                {leerlingen.map((l, idx) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem 0.6rem', color: '#94a3b8', fontSize: '0.85rem' }}>{idx + 1}</td>
                    <td style={{ padding: '0.5rem 0.6rem', fontWeight: 500, color: '#1e293b' }}>{l.voornaam} {l.achternaam}</td>
                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                      <input
                        style={{ ...input, width: 70, textAlign: 'center', fontWeight: 700, color: scoreColor(cijfers[l.id]?.score || '') }}
                        type="number" step="0.1" min="1" max="10" placeholder="–"
                        value={cijfers[l.id]?.score || ''}
                        onChange={e => updateCijfer(l.id, 'score', e.target.value)}
                      />
                    </td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        style={{ ...input, width: '100%' }} placeholder="optioneel"
                        value={cijfers[l.id]?.opmerking || ''}
                        onChange={e => updateCijfer(l.id, 'opmerking', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {toetsen.length === 0 && (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: '1.1rem' }}>Nog geen toetsen voor deze klas. Maak er eerst een aan bij Toetsen.</p>
        </div>
      )}
    </div>
  );
}
