'use client';

import { useEffect, useState } from 'react';

interface Klas { id: number; naam: string; vak: string; lokaal: string; jaarlaag: string; aantal_leerlingen: number; }
interface Les { id: number; klas_id: number; datum: string; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; }

export default function AgendaPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<number>(1);
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);
  const [les, setLes] = useState<Partial<Les>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedKlas) return;
    fetch(`/api/lessen?klas_id=${selectedKlas}&datum=${datum}`)
      .then(r => r.json())
      .then(data => {
        if (data) {
          setLes(data);
        } else {
          setLes({ klas_id: selectedKlas, datum, startopdracht: '', terugkijken: '', programma: '', leerdoelen: '', huiswerk: '', niet_vergeten: '' });
        }
      })
      .catch(() => {});
  }, [selectedKlas, datum]);

  async function saveLes() {
    await fetch('/api/lessen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...les, klas_id: selectedKlas, datum }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function changeDate(days: number) {
    const d = new Date(datum);
    d.setDate(d.getDate() + days);
    setDatum(d.toISOString().split('T')[0]);
  }

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const cardStyle: React.CSSProperties = {
    background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  };
  const inputStyle: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.9rem', width: '100%',
  };
  const textareaStyle: React.CSSProperties = {
    ...inputStyle, minHeight: 80, resize: 'vertical' as const, fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.85rem', color: '#475569', fontWeight: 600, display: 'block', marginBottom: 6,
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>Agenda</h1>

      {/* Klas + datum selector */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {klassen.map(k => (
            <button key={k.id} onClick={() => setSelectedKlas(k.id)} style={{
              padding: '0.5rem 1rem', borderRadius: 8,
              border: selectedKlas === k.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
              background: selectedKlas === k.id ? '#eff6ff' : 'white',
              color: selectedKlas === k.id ? '#1d4ed8' : '#475569',
              cursor: 'pointer', fontWeight: selectedKlas === k.id ? 700 : 500,
            }}>
              {k.naam}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
          <button onClick={() => changeDate(-1)} style={{
            background: '#e2e8f0', border: 'none', borderRadius: 8, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '1rem',
          }}>←</button>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }} />
          <button onClick={() => changeDate(1)} style={{
            background: '#e2e8f0', border: 'none', borderRadius: 8, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '1rem',
          }}>→</button>
          <button onClick={() => setDatum(new Date().toISOString().split('T')[0])} style={{
            background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
          }}>Vandaag</button>
        </div>
      </div>

      <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '1rem', textTransform: 'capitalize' }}>
        {formatDate(datum)}
      </p>

      {/* Les form */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Startopdracht</label>
            <textarea style={textareaStyle} placeholder="De opdracht waarmee leerlingen starten als ze binnenkomen..."
              value={les.startopdracht || ''} onChange={e => setLes({ ...les, startopdracht: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Terugkijken (vorige les)</label>
            <textarea style={textareaStyle} placeholder="Wat hebben we vorige les gedaan?"
              value={les.terugkijken || ''} onChange={e => setLes({ ...les, terugkijken: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Programma</label>
            <textarea style={{ ...textareaStyle, minHeight: 100 }} placeholder="Wat gaan we deze les doen?"
              value={les.programma || ''} onChange={e => setLes({ ...les, programma: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Leerdoelen</label>
            <textarea style={textareaStyle} placeholder="Wat moeten leerlingen aan het eind van de les kunnen?"
              value={les.leerdoelen || ''} onChange={e => setLes({ ...les, leerdoelen: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Maak-/huiswerk</label>
            <textarea style={textareaStyle} placeholder="Wat moeten leerlingen thuis doen?"
              value={les.huiswerk || ''} onChange={e => setLes({ ...les, huiswerk: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Niet vergeten</label>
            <textarea style={textareaStyle} placeholder="Toetsen, deadlines, bijzonderheden..."
              value={les.niet_vergeten || ''} onChange={e => setLes({ ...les, niet_vergeten: e.target.value })} />
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={saveLes} style={{
            background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8,
            padding: '0.6rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
          }}>
            Opslaan
          </button>
          {saved && <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Opgeslagen!</span>}
        </div>
      </div>
    </div>
  );
}
