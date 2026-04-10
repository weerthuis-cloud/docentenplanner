'use client';

import { useEffect, useState } from 'react';

interface Klas { id: number; naam: string; }
interface Toets { id: number; naam: string; type: string; weging: number; datum: string; }
interface Leerling { id: number; voornaam: string; achternaam: string; }
interface CijferData { toets_id: number; leerling_id: number; score: number; voornaam: string; achternaam: string; toets_naam: string; weging: number; }

export default function ResultatenPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<number>(1);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [leerlingen, setLeerlingen] = useState<Leerling[]>([]);
  const [allCijfers, setAllCijfers] = useState<CijferData[]>([]);

  useEffect(() => { fetch('/api/klassen').then(r => r.json()).then(setKlassen).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedKlas) return;
    Promise.all([
      fetch(`/api/toetsen?klas_id=${selectedKlas}`).then(r => r.json()),
      fetch(`/api/leerlingen?klas_id=${selectedKlas}`).then(r => r.json()),
      fetch(`/api/cijfers?klas_id=${selectedKlas}`).then(r => r.json()),
    ]).then(([t, l, c]) => {
      setToetsen(t); setLeerlingen(l); setAllCijfers(c);
    }).catch(() => {});
  }, [selectedKlas]);

  // Bereken gewogen gemiddelde per leerling
  function getGemiddelde(leerlingId: number) {
    const lCijfers = allCijfers.filter(c => c.leerling_id === leerlingId && c.score != null);
    if (lCijfers.length === 0) return null;
    let totalWeight = 0, totalScore = 0;
    lCijfers.forEach(c => {
      totalWeight += c.weging;
      totalScore += c.score * c.weging;
    });
    return totalWeight > 0 ? totalScore / totalWeight : null;
  }

  function getScore(leerlingId: number, toetsId: number) {
    const c = allCijfers.find(c => c.leerling_id === leerlingId && c.toets_id === toetsId);
    return c ? c.score : null;
  }

  const scoreColor = (s: number | null) => {
    if (s === null) return '#94a3b8';
    if (s >= 7.5) return '#16a34a';
    if (s >= 5.5) return '#1e293b';
    return '#dc2626';
  };

  const scoreBg = (s: number | null) => {
    if (s === null) return 'transparent';
    if (s >= 7.5) return '#EEF2FF';
    if (s >= 5.5) return 'transparent';
    return '#fef2f2';
  };

  // Sort leerlingen by gemiddelde (lowest first for aandacht)
  const leerlingenMetGem = leerlingen.map(l => ({ ...l, gem: getGemiddelde(l.id) }));

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>Resultaten</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {klassen.map(k => (
          <button key={k.id} onClick={() => setSelectedKlas(k.id)} style={{
            padding: '0.5rem 1rem', borderRadius: 8,
            border: selectedKlas === k.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            background: selectedKlas === k.id ? '#eff6ff' : 'white',
            color: selectedKlas === k.id ? '#1d4ed8' : '#475569',
            cursor: 'pointer', fontWeight: selectedKlas === k.id ? 700 : 500,
          }}>{k.naam}</button>
        ))}
      </div>

      {toetsen.length > 0 && leerlingen.length > 0 ? (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.85rem', color: '#64748b', position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>Leerling</th>
                {toetsen.map(t => (
                  <th key={t.id} style={{ textAlign: 'center', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', minWidth: 70 }}>
                    <div>{t.naam}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>×{t.weging}</div>
                  </th>
                ))}
                <th style={{ textAlign: 'center', padding: '0.75rem', fontSize: '0.85rem', color: '#3b82f6', fontWeight: 700, minWidth: 80 }}>Gem.</th>
              </tr>
            </thead>
            <tbody>
              {leerlingenMetGem.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                    {l.voornaam} {l.achternaam}
                  </td>
                  {toetsen.map(t => {
                    const s = getScore(l.id, t.id);
                    return (
                      <td key={t.id} style={{
                        textAlign: 'center', padding: '0.5rem',
                        color: scoreColor(s), fontWeight: s !== null ? 600 : 400,
                        background: scoreBg(s), fontSize: '0.95rem',
                      }}>
                        {s !== null ? s.toFixed(1) : '–'}
                      </td>
                    );
                  })}
                  <td style={{
                    textAlign: 'center', padding: '0.5rem', fontWeight: 700, fontSize: '1rem',
                    color: scoreColor(l.gem), background: l.gem !== null ? (l.gem >= 5.5 ? '#f0f9ff' : '#fef2f2') : 'transparent',
                  }}>
                    {l.gem !== null ? l.gem.toFixed(1) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: '1.1rem' }}>
            {toetsen.length === 0 ? 'Nog geen toetsen voor deze klas.' : 'Nog geen cijfers ingevoerd.'}
          </p>
        </div>
      )}
    </div>
  );
}
