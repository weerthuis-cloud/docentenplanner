'use client';

import { useEffect, useState } from 'react';

interface Klas { id: number; naam: string; }
interface Toets { id: number; klas_id: number; naam: string; type: string; datum: string; }
interface Les { klas_id: number; datum: string; startopdracht: string; programma: string; huiswerk: string; }

const typeColors: Record<string, string> = { SO: '#f59e0b', PW: '#3b82f6', SE: '#8b5cf6', mondeling: '#10b981', overig: '#6b7280' };

export default function PlannerPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [toetsen, setToetsen] = useState<Toets[]>([]);
  const [weekLessen, setWeekLessen] = useState<Record<string, Les>>({});
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split('T')[0];
  });

  useEffect(() => {
    fetch('/api/klassen').then(r => r.json()).then(setKlassen).catch(() => {});
  }, []);

  useEffect(() => {
    // Fetch toetsen voor alle klassen
    Promise.all(
      klassen.map(k => fetch(`/api/toetsen?klas_id=${k.id}`).then(r => r.json()))
    ).then(results => {
      setToetsen(results.flat());
    }).catch(() => {});
  }, [klassen]);

  useEffect(() => {
    // Fetch lessen voor elke dag van de week, elke klas
    const days = getDays();
    const fetches = klassen.flatMap(k =>
      days.map(d =>
        fetch(`/api/lessen?klas_id=${k.id}&datum=${d}`)
          .then(r => r.json())
          .then(data => data ? { key: `${k.id}-${d}`, les: data } : null)
          .catch(() => null)
      )
    );
    Promise.all(fetches).then(results => {
      const map: Record<string, Les> = {};
      results.forEach(r => { if (r) map[r.key] = r.les; });
      setWeekLessen(map);
    });
  }, [klassen, weekStart]);

  function getDays() {
    const days: string[] = [];
    const start = new Date(weekStart + 'T12:00:00');
    for (let i = 0; i < 5; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }

  function changeWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  const days = getDays();
  const dayNames = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
  const today = new Date().toISOString().split('T')[0];

  const formatDay = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  const weekNumber = () => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Planner</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => changeWeek(-1)} style={{
            background: '#e2e8f0', border: 'none', borderRadius: 8, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '1rem',
          }}>←</button>
          <span style={{ fontWeight: 600, color: '#475569', minWidth: 100, textAlign: 'center' }}>Week {weekNumber()}</span>
          <button onClick={() => changeWeek(1)} style={{
            background: '#e2e8f0', border: 'none', borderRadius: 8, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '1rem',
          }}>→</button>
          <button onClick={() => {
            const now = new Date();
            const day = now.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            setWeekStart(monday.toISOString().split('T')[0]);
          }} style={{
            background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
          }}>Deze week</button>
        </div>
      </div>

      {/* Week grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(5, 1fr)', gap: '1px', background: '#e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ background: '#f8fafc', padding: '0.75rem', fontWeight: 600, color: '#64748b', fontSize: '0.85rem' }}></div>
        {days.map((d, idx) => (
          <div key={d} style={{
            background: d === today ? '#eff6ff' : '#f8fafc', padding: '0.75rem', textAlign: 'center',
            fontWeight: 600, color: d === today ? '#1d4ed8' : '#475569',
          }}>
            <div style={{ fontSize: '0.9rem' }}>{dayNames[idx]}</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 400, color: d === today ? '#3b82f6' : '#94a3b8' }}>{formatDay(d)}</div>
          </div>
        ))}

        {/* Klas rows */}
        {klassen.map(k => (
          <>
            <div key={`label-${k.id}`} style={{
              background: 'white', padding: '0.75rem', fontWeight: 700, color: '#1e293b',
              display: 'flex', alignItems: 'flex-start', fontSize: '0.95rem',
            }}>{k.naam}</div>
            {days.map(d => {
              const les = weekLessen[`${k.id}-${d}`];
              const dayToetsen = toetsen.filter(t => t.klas_id === k.id && t.datum === d);
              return (
                <div key={`${k.id}-${d}`} style={{
                  background: d === today ? '#fafbff' : 'white', padding: '0.6rem',
                  minHeight: 80, fontSize: '0.8rem', color: '#475569',
                }}>
                  {dayToetsen.map(t => (
                    <div key={t.id} style={{
                      background: (typeColors[t.type] || '#6b7280') + '20',
                      color: typeColors[t.type] || '#6b7280',
                      padding: '0.2rem 0.4rem', borderRadius: 4, fontSize: '0.75rem',
                      fontWeight: 600, marginBottom: 4,
                    }}>
                      {t.type}: {t.naam}
                    </div>
                  ))}
                  {les ? (
                    <>
                      {les.programma && (
                        <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.3 }}>
                          {les.programma.split('\n').slice(0, 3).map((line, i) => (
                            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>
                          ))}
                        </div>
                      )}
                      {les.huiswerk && (
                        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#6366f1', fontWeight: 500 }}>
                          HW: {les.huiswerk.split('\n')[0]}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#cbd5e1', fontSize: '0.75rem', fontStyle: 'italic' }}>Geen les gepland</div>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
