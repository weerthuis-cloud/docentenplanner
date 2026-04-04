'use client';

import { useEffect, useState, useCallback } from 'react';

// Types
interface Klas { id: number; naam: string; vak: string; lokaal: string; jaarlaag: string; aantal_leerlingen: number; }
interface Leerling { id: number; klas_id: number; voornaam: string; achternaam: string; foto_url: string | null; seat_row: number; seat_col: number; boek_titel: string; boek_kleur: string; }
interface Les { id: number; klas_id: number; datum: string; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; }
interface Registratie { id: number; leerling_id: number; type: string; details: string | null; datum: string; }
interface Layout { layout_data: (number | null)[][]; }

type Mode = 'binnenkomst' | 'les' | 'lezen';

// State per leerling (session only, not persisted yet for warnings/compliments in real-time)
interface LeerlingState { warnings: number; compliments: number; statuses: string[]; materiaal: string[]; }

export default function Dashboard() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [activeKlas, setActiveKlas] = useState<number>(1);
  const [leerlingen, setLeerlingen] = useState<Leerling[]>([]);
  const [les, setLes] = useState<Les | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [mode, setMode] = useState<Mode>('binnenkomst');
  const [clock, setClock] = useState('');
  const [date, setDate] = useState('');
  const [lState, setLState] = useState<Record<number, LeerlingState>>({});
  const [mirrorH, setMirrorH] = useState(false);
  const [openDD, setOpenDD] = useState<number | null>(null);

  // Timer state
  const [timerSec, setTimerSec] = useState(900);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInputMin, setTimerInputMin] = useState(15);
  const [timerInputSec, setTimerInputSec] = useState(0);

  // Fetch data
  const fetchData = useCallback(async () => {
    const [kRes, lRes, lesRes, layRes] = await Promise.all([
      fetch('/api/klassen'),
      fetch(`/api/leerlingen?klas_id=${activeKlas}`),
      fetch(`/api/lessen?klas_id=${activeKlas}&datum=${new Date().toISOString().split('T')[0]}`),
      fetch(`/api/layout?klas_id=${activeKlas}`),
    ]);
    const kData = kRes.ok ? await kRes.json().catch(() => []) : [];
    const lData = lRes.ok ? await lRes.json().catch(() => []) : [];
    const lesData = lesRes.ok ? await lesRes.json().catch(() => null) : null;
    const layData = layRes.ok ? await layRes.json().catch(() => null) : null;

    setKlassen(kData);
    setLeerlingen(lData);
    setLes(lesData);
    setLayout(layData);

    // Init state for each leerling
    const newState: Record<number, LeerlingState> = {};
    lData.forEach((l: Leerling) => {
      newState[l.id] = lState[l.id] || { warnings: 0, compliments: 0, statuses: [], materiaal: [] };
    });
    setLState(newState);
  }, [activeKlas]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  // Timer
  useEffect(() => {
    if (!timerRunning) return;
    if (timerSec <= 0) { setTimerRunning(false); return; }
    const i = setInterval(() => setTimerSec(s => s - 1), 1000);
    return () => clearInterval(i);
  }, [timerRunning, timerSec]);

  const timerDisplay = `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(timerSec % 60).padStart(2, '0')}`;
  const resetTimer = () => { setTimerRunning(false); setTimerSec(timerInputMin * 60 + timerInputSec); };

  // Helpers
  const activeKlasObj = klassen.find(k => k.id === activeKlas);
  const getInitials = (l: Leerling) => `${l.voornaam[0]}${l.achternaam[0]}`.toUpperCase();

  const toggleStatus = (id: number, status: string) => {
    setLState(prev => {
      const s = { ...prev[id] };
      if (s.statuses.includes(status)) {
        s.statuses = s.statuses.filter(x => x !== status);
        if (status === 'materiaal') s.materiaal = [];
      } else {
        s.statuses = [...s.statuses, status];
      }
      return { ...prev, [id]: s };
    });
  };

  const toggleMateriaal = (id: number, item: string) => {
    setLState(prev => {
      const s = { ...prev[id] };
      s.materiaal = s.materiaal.includes(item) ? s.materiaal.filter(x => x !== item) : [...s.materiaal, item];
      return { ...prev, [id]: s };
    });
  };

  const addWarning = (id: number) => {
    setLState(prev => ({ ...prev, [id]: { ...prev[id], warnings: prev[id].warnings + 1 } }));
    // Also persist to DB
    fetch('/api/registraties', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leerling_id: id, type: 'waarschuwing' }) });
  };

  const addCompliment = (id: number) => {
    setLState(prev => ({ ...prev, [id]: { ...prev[id], compliments: prev[id].compliments + 1 } }));
    fetch('/api/registraties', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leerling_id: id, type: 'compliment' }) });
  };

  // Render seat
  const renderSeat = (leerlingId: number | null) => {
    if (leerlingId === null) return <div key={Math.random()} className="border-2 border-dashed border-gray-300 rounded-lg min-h-[70px]" />;

    const l = leerlingen.find(x => x.id === leerlingId);
    if (!l) return <div key={Math.random()} className="border-2 border-dashed border-gray-300 rounded-lg min-h-[70px]" />;

    const s = lState[l.id] || { warnings: 0, compliments: 0, statuses: [], materiaal: [] };
    const warned = s.warnings >= 3;

    return (
      <div key={l.id}
        className={`relative bg-white border-2 rounded-lg p-1.5 flex flex-col items-center justify-center min-h-[70px] transition-all group hover:border-blue-400 hover:shadow-md
          ${warned ? 'bg-red-50 border-red-200' : 'border-gray-200'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Status dots */}
        {s.statuses.length > 0 && (
          <div className="absolute top-1 right-1 flex gap-0.5">
            {s.statuses.includes('telaat') && <span className="w-2 h-2 rounded-full bg-red-500" />}
            {s.statuses.includes('absent') && <span className="w-2 h-2 rounded-full bg-gray-400" />}
            {s.statuses.includes('huiswerk') && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
            {s.statuses.includes('materiaal') && <span className="w-2 h-2 rounded-full bg-orange-500" />}
            {s.statuses.includes('verwijderd') && <span className="w-2 h-2 rounded-full bg-purple-500" />}
          </div>
        )}

        {/* Dropdown trigger */}
        <button className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full text-[9px] flex items-center justify-center transition-opacity
          ${s.statuses.length > 0 ? 'bg-orange-500 text-white opacity-100' : 'opacity-0 group-hover:opacity-100 bg-gray-100 text-gray-500'}`}
          onClick={e => { e.stopPropagation(); setOpenDD(openDD === l.id ? null : l.id); }}>&#9662;</button>

        {/* Status dropdown */}
        {openDD === l.id && (
          <div className="absolute top-5 right-0 bg-white border border-gray-200 rounded-lg p-2 z-30 shadow-lg min-w-[180px] text-sm" onClick={e => e.stopPropagation()}>
            {['telaat','absent','huiswerk','materiaal','verwijderd'].map(st => (
              <label key={st} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" checked={s.statuses.includes(st)} onChange={() => toggleStatus(l.id, st)} className="accent-blue-600" />
                {{ telaat: 'Te laat', absent: 'Absent', huiswerk: 'Huiswerk vergeten', materiaal: 'Materiaal vergeten', verwijderd: 'Verwijderd' }[st]}
              </label>
            ))}
            {s.statuses.includes('materiaal') && (
              <div className="ml-5 text-xs text-gray-500">
                {['laptop','schoolboeken','schrijfmateriaal','schrijfgerei'].map(m => (
                  <label key={m} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                    <input type="checkbox" checked={s.materiaal.includes(m)} onChange={() => toggleMateriaal(l.id, m)} className="accent-blue-600" />
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Avatar */}
        <div className={`relative w-10 h-10 rounded-full bg-[#2d6a9f] text-white flex items-center justify-center font-bold text-xs ${warned ? 'ring-2 ring-red-300' : ''}`}>
          {s.warnings > 0 && <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">{s.warnings}</span>}
          {s.compliments > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">{s.compliments}</span>}
          {getInitials(l)}
        </div>
        <div className="text-[10px] font-semibold mt-1 text-center truncate w-full">{l.voornaam} {l.achternaam}</div>

        {/* Hover actions */}
        <div className="absolute bottom-0.5 left-0.5 right-0.5 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity px-0.5">
          <button className="w-5 h-5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center" onClick={() => addWarning(l.id)}>!</button>
          <button className="w-5 h-5 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center" onClick={() => addCompliment(l.id)}>&#10003;</button>
        </div>
      </div>
    );
  };

  // Render grid from layout
  const renderGrid = (gridClass: string) => {
    if (!layout || !layout.layout_data) return <div className="text-gray-400 text-center">Geen plattegrond beschikbaar</div>;

    return (
      <div className={`grid gap-2 flex-1 content-center ${gridClass}`} style={{ direction: mirrorH ? 'rtl' : 'ltr' }}>
        {layout.layout_data.flat().map((cell, idx) => {
          const colInRow = idx % 8;
          if (colInRow === 2 || colInRow === 5) return <div key={`aisle-${idx}`} style={{ direction: 'ltr' }} />;
          return <div key={idx} style={{ direction: 'ltr' }}>{renderSeat(cell)}</div>;
        })}
      </div>
    );
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handler = () => setOpenDD(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="h-screen flex flex-col" onClick={() => setOpenDD(null)}>
      {/* TOP BAR */}
      <div className="bg-[#1e3a5f] text-white px-6 py-1.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-base">Docentenplanner</h1>
          <nav className="flex gap-1">
            {['Dashboard','Agenda','Planner','Klassen','Cijfers','Resultaten','Toetsen'].map(tab => (
              <button key={tab} className={`px-3 py-1.5 rounded text-xs ${tab === 'Dashboard' ? 'bg-white/20 font-semibold' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>{tab}</button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <select className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs" value={activeKlas} onChange={e => setActiveKlas(Number(e.target.value))}>
            {klassen.map(k => <option key={k.id} value={k.id} className="text-gray-800">{k.naam} - {k.vak}</option>)}
          </select>
          <span className="text-[11px] text-white/50">{activeKlasObj ? `${activeKlasObj.aantal_leerlingen} ll · Lok ${activeKlasObj.lokaal}` : ''}</span>
          <button onClick={() => setMirrorH(!mirrorH)} className={`px-2 py-1 rounded text-xs border ${mirrorH ? 'bg-blue-500 border-blue-500' : 'bg-white/5 border-white/15'}`}>&#8596;</button>
          <div className="flex bg-white/10 rounded p-0.5">
            {(['binnenkomst','les','lezen'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded text-xs font-semibold transition-all ${mode === m ? 'bg-white text-[#1e3a5f]' : 'text-white/60'}`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* === BINNENKOMST === */}
      {mode === 'binnenkomst' && (
        <div className="flex-1 grid grid-cols-[1fr_380px]">
          <div className="bg-[#f0f4f8] p-4 flex flex-col">
            <div className="bg-[#1e3a5f] text-white text-center py-1.5 rounded-lg text-xs font-semibold mb-3">DOCENT - BORD</div>
            {renderGrid('grid-cols-[1fr_1fr_30px_1fr_1fr_30px_1fr_1fr]')}
          </div>
          <div className="bg-[#1e3a5f] flex flex-col items-center justify-center p-8 gap-8">
            <div className="text-center">
              <div className="text-7xl font-extrabold text-white tabular-nums tracking-tighter">{clock}</div>
              <div className="text-white/50 text-lg mt-1">{date}</div>
            </div>
            <div className="bg-white/10 border-2 border-white/15 rounded-2xl p-7 w-full">
              <span className="inline-block bg-blue-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider mb-3">Startopdracht</span>
              <div className="text-white/85 text-lg leading-relaxed">{les?.startopdracht || 'Geen startopdracht ingesteld'}</div>
            </div>
          </div>
        </div>
      )}

      {/* === LES === */}
      {mode === 'les' && (
        <div className="flex-1 flex flex-col">
          {/* Plattegrond top 60% */}
          <div className="flex-[6] bg-[#f0f4f8] p-3 px-6 flex flex-col relative">
            <div className="bg-[#1e3a5f] text-white text-center py-1 rounded text-xs font-semibold mb-2">DOCENT - BORD</div>
            <div className="px-10 flex-1 flex">{renderGrid('grid-cols-[1fr_1fr_30px_1fr_1fr_30px_1fr_1fr]')}</div>
            {/* Floating clock + timer */}
            <div className="absolute top-2 right-5 bg-white rounded-xl p-3 px-5 shadow-md text-right">
              <div className="text-3xl font-extrabold text-[#1e3a5f] tabular-nums">{clock}</div>
              <div className="flex items-center gap-2 justify-end mt-1">
                <input type="number" value={timerInputMin} onChange={e => setTimerInputMin(Number(e.target.value))} className="w-9 text-center border border-gray-200 rounded px-1 text-sm" />
                <span className="text-[10px] text-gray-400">m</span>
                <input type="number" value={timerInputSec} onChange={e => setTimerInputSec(Number(e.target.value))} className="w-9 text-center border border-gray-200 rounded px-1 text-sm" />
                <span className="text-[10px] text-gray-400">s</span>
                <span className={`text-2xl font-extrabold tabular-nums ${timerSec <= 0 && !timerRunning ? 'text-red-500 animate-pulse' : ''}`}>{timerDisplay}</span>
                <button onClick={() => timerRunning ? setTimerRunning(false) : (timerSec <= 0 ? resetTimer() : setTimerRunning(true), setTimerRunning(true))}
                  className={`px-3 py-1 rounded text-xs font-semibold ${timerRunning ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>
                  {timerRunning ? 'Pauze' : 'Start'}
                </button>
                <button onClick={resetTimer} className="px-3 py-1 rounded text-xs bg-gray-100 border border-gray-200">Reset</button>
              </div>
            </div>
          </div>
          {/* Four blocks bottom 40% */}
          <div className="flex-[4] grid grid-cols-4">
            <div className="bg-[#f8fafc] p-5 border-r border-gray-200">
              <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Terugkijken</h3>
              <div className="text-base leading-relaxed whitespace-pre-line">{les?.terugkijken}</div>
            </div>
            <div className="bg-[#f0f7ff] p-5 border-r border-gray-200">
              <h3 className="text-xs uppercase tracking-wide text-blue-500 mb-2 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Programma</h3>
              <div className="text-base leading-relaxed whitespace-pre-line">{les?.programma}</div>
              {les?.leerdoelen && (
                <div className="mt-3 pt-2 border-t border-gray-200 text-sm text-gray-500">
                  <strong className="text-[10px] uppercase tracking-wide text-blue-500">Leerdoelen</strong>
                  <div className="whitespace-pre-line mt-1">{les.leerdoelen}</div>
                </div>
              )}
            </div>
            <div className="bg-[#fffcf0] p-5 border-r border-gray-200">
              <h3 className="text-xs uppercase tracking-wide text-orange-500 mb-2 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Maak- en huiswerk</h3>
              <div className="text-base leading-relaxed whitespace-pre-line">{les?.huiswerk}</div>
            </div>
            <div className="bg-[#fff5f5] p-5">
              <h3 className="text-xs uppercase tracking-wide text-red-500 mb-2 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Niet vergeten</h3>
              <div className="text-base leading-relaxed whitespace-pre-line">{les?.niet_vergeten}</div>
            </div>
          </div>
        </div>
      )}

      {/* === LEZEN === */}
      {mode === 'lezen' && (
        <div className="flex-1 grid grid-cols-[340px_1fr]">
          {/* Timer left */}
          <div className="bg-[#1e3a5f] flex flex-col items-center justify-center p-10 gap-3">
            <div className="text-5xl opacity-30">&#128214;</div>
            <div className="text-white/40 uppercase tracking-[4px] font-bold text-sm">Leestijd</div>
            <div className={`text-[7rem] font-black text-white tabular-nums tracking-tighter leading-none ${timerSec <= 0 && !timerRunning ? 'text-red-500 animate-pulse' : ''}`}>{timerDisplay}</div>
            <div className="flex items-center gap-2 mt-2">
              <input type="number" value={timerInputMin} onChange={e => setTimerInputMin(Number(e.target.value))}
                className="w-12 text-center p-1.5 border border-white/20 rounded-lg bg-white/10 text-white font-bold text-lg" />
              <span className="text-white/40 text-sm">min</span>
              <input type="number" value={timerInputSec} onChange={e => setTimerInputSec(Number(e.target.value))}
                className="w-12 text-center p-1.5 border border-white/20 rounded-lg bg-white/10 text-white font-bold text-lg" />
              <span className="text-white/40 text-sm">sec</span>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => timerRunning ? setTimerRunning(false) : (timerSec <= 0 ? resetTimer() : null, setTimerRunning(true))}
                className={`px-6 py-2.5 rounded-xl font-bold text-base ${timerRunning ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>
                {timerRunning ? 'Pauze' : 'Start'}
              </button>
              <button onClick={resetTimer} className="px-6 py-2.5 rounded-xl font-bold text-base bg-white/10 text-white/70 border border-white/20">Reset</button>
            </div>
            <div className="text-white/30 text-lg mt-6 tabular-nums">{clock}</div>
          </div>
          {/* Books right */}
          <div className="bg-[#f0f4f8] p-5 overflow-y-auto">
            <h2 className="text-sm font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
              &#128218; Wat leest de klas?
              <span className="text-[10px] bg-[#1e3a5f] text-white px-2.5 py-0.5 rounded-full">{activeKlasObj?.naam}</span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {leerlingen.map(l => (
                <div key={l.id} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="aspect-[2/3] flex items-center justify-center text-white text-xs font-bold text-center p-2.5 relative" style={{ background: l.boek_kleur || '#2E4057' }}>
                    <span className="text-3xl absolute opacity-20">&#128214;</span>
                    <span className="relative z-10 leading-tight">{l.boek_titel}</span>
                  </div>
                  <div className="px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold truncate">{l.voornaam} {l.achternaam}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
