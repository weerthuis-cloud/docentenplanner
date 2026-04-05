'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Types
interface Klas { id: number; naam: string; vak: string; lokaal: string; jaarlaag: string; aantal_leerlingen: number; }
interface Leerling { id: number; klas_id: number; voornaam: string; achternaam: string; foto_url: string | null; foto_data: string | null; seat_row: number; seat_col: number; boek_titel: string; boek_kleur: string; }
interface Les { id: number; klas_id: number; datum: string; startopdracht: string; terugkijken: string; programma: string; leerdoelen: string; huiswerk: string; niet_vergeten: string; }
interface Layout { layout_data: (number | null)[][]; }

type Mode = 'binnenkomst' | 'les' | 'lezen';

interface LeerlingState { warnings: number; compliments: number; statuses: string[]; materiaal: string[]; }

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Agenda', href: '/agenda' },
  { label: 'Planner', href: '/planner' },
  { label: 'Klassen', href: '/klassen' },
  { label: 'Cijfers', href: '/cijfers' },
  { label: 'Resultaten', href: '/resultaten' },
  { label: 'Toetsen', href: '/toetsen' },
];

export default function Dashboard() {
  const router = useRouter();
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
  const [mirrorV, setMirrorV] = useState(false);
  const [openDD, setOpenDD] = useState<number | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const ignoreNextClick = useRef(false);

  // Timer state
  const [timerSec, setTimerSec] = useState(900);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInput, setTimerInput] = useState('15:00');

  // Parse timer input "mm:ss" or "m:ss" or just "mm"
  const parseTimerInput = (val: string): number => {
    const parts = val.split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0]) || 0;
      const s = parseInt(parts[1]) || 0;
      return m * 60 + s;
    }
    const m = parseInt(val) || 0;
    return m * 60;
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    const [kRes, lRes, lesRes, layRes] = await Promise.all([
      fetch('/api/klassen'),
      fetch(`/api/leerlingen?klas_id=${activeKlas}`),
      fetch(`/api/lessen?klas_id=${activeKlas}&datum=${new Date().toISOString().split('T')[0]}`),
      fetch(`/api/layout?klas_id=${activeKlas}&actief=true`),
    ]);
    const kData = kRes.ok ? await kRes.json().catch(() => []) : [];
    const lData = lRes.ok ? await lRes.json().catch(() => []) : [];
    const lesData = lesRes.ok ? await lesRes.json().catch(() => null) : null;
    const layData = layRes.ok ? await layRes.json().catch(() => null) : null;

    setKlassen(kData);
    setLeerlingen(lData);
    setLes(lesData);
    setLayout(layData);

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

  // Timer countdown
  useEffect(() => {
    if (!timerRunning) return;
    if (timerSec <= 0) { setTimerRunning(false); return; }
    const i = setInterval(() => setTimerSec(s => s - 1), 1000);
    return () => clearInterval(i);
  }, [timerRunning, timerSec]);

  const timerDisplay = `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(timerSec % 60).padStart(2, '0')}`;

  const startTimer = () => {
    if (timerSec <= 0) {
      const secs = parseTimerInput(timerInput);
      setTimerSec(secs);
    }
    setTimerRunning(true);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    const secs = parseTimerInput(timerInput);
    setTimerSec(secs);
  };

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
    if (leerlingId === null) return <div key={Math.random()} className="h-full min-h-0 rounded-md" style={{ border: '2px dashed #999' }} />;

    const l = leerlingen.find(x => x.id === leerlingId);
    if (!l) return <div key={Math.random()} className="h-full min-h-0 rounded-md" style={{ border: '2px dashed #999' }} />;

    const s = lState[l.id] || { warnings: 0, compliments: 0, statuses: [], materiaal: [] };
    const warned = s.warnings >= 3;
    const isSelected = selectedSeat === l.id;

    const hasFoto = !!(l.foto_data || l.foto_url);

    return (
      <div key={l.id}
        className={`relative rounded-md transition-all cursor-pointer h-full min-h-0 flex flex-col items-center bg-white
          ${warned ? 'ring-2 ring-red-300' : isSelected ? 'ring-2 ring-blue-400 shadow-md' : 'border border-gray-200'}`}
        onClick={() => { setSelectedSeat(isSelected ? null : l.id); setOpenDD(null); }}
      >
        {/* Status dots */}
        {s.statuses.length > 0 && (
          <div className="absolute top-0.5 right-0.5 flex gap-0.5 z-10">
            {s.statuses.includes('telaat') && <span className="w-2 h-2 rounded-full bg-red-500" />}
            {s.statuses.includes('absent') && <span className="w-2 h-2 rounded-full bg-gray-400" />}
            {s.statuses.includes('huiswerk') && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
            {s.statuses.includes('materiaal') && <span className="w-2 h-2 rounded-full bg-orange-500" />}
            {s.statuses.includes('verwijderd') && <span className="w-2 h-2 rounded-full bg-purple-500" />}
          </div>
        )}

        {/* Warning/compliment badges */}
        {s.warnings > 0 && <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold z-10">{s.warnings}</span>}
        {s.compliments > 0 && <span className={`absolute ${s.warnings > 0 ? 'top-5' : 'top-0.5'} left-0.5 w-4 h-4 bg-green-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold z-10`}>{s.compliments}</span>}

        {/* Photo area: takes most of the card */}
        <div className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-t-md min-h-0">
          {hasFoto ? (
            <img src={l.foto_data || l.foto_url || ''} alt={l.voornaam}
              className="w-full h-full object-cover" />
          ) : (
            <div className={`w-8 h-8 rounded-full bg-[#2d6a9f] text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0`}>
              {getInitials(l)}
            </div>
          )}
        </div>
        {/* Name below photo */}
        <div className="w-full px-0.5 py-0.5 text-center flex-shrink-0">
          <div className="text-[8px] font-semibold text-gray-800 truncate leading-tight">{l.voornaam}</div>
          <div className="text-[7px] text-gray-500 truncate leading-tight">{l.achternaam}</div>
        </div>

        {/* Actieknoppen bij selectie */}
        {isSelected && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-lg z-20">
            <button className="w-7 h-7 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold"
              onClick={e => { e.stopPropagation(); addWarning(l.id); }}>!</button>
            <button className="w-7 h-7 rounded-full bg-green-500 text-white text-xs flex items-center justify-center"
              onClick={e => { e.stopPropagation(); addCompliment(l.id); }}>&#10003;</button>
            <button className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center"
              onClick={e => { e.stopPropagation(); setOpenDD(openDD === l.id ? null : l.id); }}>&#9662;</button>
          </div>
        )}

        {/* Status dropdown */}
        {openDD === l.id && (
          <div className="absolute top-full mt-8 right-0 bg-white border border-gray-200 rounded-lg p-2 z-30 shadow-lg min-w-[180px] text-sm" onClick={e => e.stopPropagation()}>
            {['telaat','absent','huiswerk','materiaal','verwijderd'].map(st => (
              <label key={st} className="flex items-center gap-2 px-1 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" checked={s.statuses.includes(st)} onChange={() => toggleStatus(l.id, st)} className="accent-blue-600 w-4 h-4" />
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
      </div>
    );
  };

  // Render grid
  const renderGrid = () => {
    if (!layout || !layout.layout_data) return <div className="text-gray-400 text-center">Geen plattegrond beschikbaar</div>;

    let rows = layout.layout_data;
    if (mirrorV) rows = [...rows].reverse();
    const numRows = rows.length;

    return (
      <div ref={gridRef} className="grid gap-1 h-full"
        style={{
          direction: mirrorH ? 'rtl' : 'ltr',
          gridTemplateColumns: '1fr 1fr 12px 1fr 1fr 12px 1fr 1fr',
          gridTemplateRows: `repeat(${numRows}, 1fr)`,
        }}>
        {rows.flat().map((cell, idx) => {
          const colInRow = idx % 8;
          if (colInRow === 2 || colInRow === 5) return <div key={`aisle-${idx}`} style={{ direction: 'ltr' }} />;
          return <div key={idx} style={{ direction: 'ltr' }}>{renderSeat(cell)}</div>;
        })}
      </div>
    );
  };

  // Geen document event listeners meer - we gebruiken overlay divs

  // Timer component (herbruikbaar in topbar en lezen-modus)
  const TimerCompact = () => (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={timerRunning ? timerDisplay : timerInput}
        onChange={e => { if (!timerRunning) setTimerInput(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter' && !timerRunning) { setTimerSec(parseTimerInput(timerInput)); startTimer(); } }}
        placeholder="mm:ss"
        disabled={timerRunning}
        className={`w-16 text-center bg-white/10 border border-white/20 rounded px-1 py-0.5 text-sm font-bold tabular-nums ${timerRunning ? 'text-white' : 'text-white/80'}`}
      />
      <button onClick={() => timerRunning ? setTimerRunning(false) : startTimer()}
        className={`px-2.5 py-0.5 rounded text-[10px] font-semibold ${timerRunning ? 'bg-orange-500' : 'bg-green-500'}`}>
        {timerRunning ? 'Pauze' : 'Start'}
      </button>
      <button onClick={resetTimer} className="px-2.5 py-0.5 rounded text-[10px] bg-white/10 border border-white/20">Reset</button>
    </div>
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Overlay om menu/dropdown te sluiten */}
      {(menuOpen || openDD !== null || selectedSeat !== null) && (
        <div className="fixed inset-0 z-30" onClick={() => { setMenuOpen(false); setOpenDD(null); setSelectedSeat(null); }} />
      )}

      {/* TOP BAR - strak en minimaal */}
      <div className="bg-[#1e3a5f] text-white px-4 py-1.5 flex items-center justify-between text-sm relative z-40">
        <div className="flex items-center gap-3">
          {/* Hamburger menu */}
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-8 flex flex-col items-center justify-center gap-1 rounded hover:bg-white/10">
              <span className="block w-5 h-0.5 bg-white" />
              <span className="block w-5 h-0.5 bg-white" />
              <span className="block w-5 h-0.5 bg-white" />
            </button>
            {menuOpen && (
              <div className="absolute top-10 left-0 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[180px]">
                {NAV_ITEMS.map(item => (
                  <button key={item.label}
                    onClick={() => { router.push(item.href); setMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors
                      ${item.href === '/' ? 'bg-blue-50 text-blue-600 font-semibold' : ''}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h1 className="font-bold text-base">Docentenplanner</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Klas selector */}
          <select className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs" value={activeKlas} onChange={e => setActiveKlas(Number(e.target.value))}>
            {klassen.map(k => <option key={k.id} value={k.id} className="text-gray-800">{k.naam} - {k.vak}</option>)}
          </select>
          <span className="text-[11px] text-white/50">{activeKlasObj ? `${activeKlasObj.aantal_leerlingen} ll · Lok ${activeKlasObj.lokaal}` : ''}</span>

          {/* Spiegel knoppen */}
          <button onClick={() => setMirrorH(!mirrorH)} className={`px-2 py-1 rounded text-xs border ${mirrorH ? 'bg-blue-500 border-blue-500' : 'bg-white/5 border-white/15'}`} title="Spiegel links/rechts">&#8596;</button>
          <button onClick={() => setMirrorV(!mirrorV)} className={`px-2 py-1 rounded text-xs border ${mirrorV ? 'bg-blue-500 border-blue-500' : 'bg-white/5 border-white/15'}`} title="Spiegel boven/onder">&#8597;</button>

          {/* Timer in topbar (altijd ruimte reserveren) */}
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1" style={{ visibility: mode === 'les' ? 'visible' : 'hidden' }}>
            <span className="text-lg font-extrabold tabular-nums">{clock}</span>
            <span className="text-white/30">|</span>
            <TimerCompact />
          </div>

          {/* Mode switch - altijd op dezelfde plek */}
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
        <div className="flex-1 flex">
          {/* Links: plattegrond volle hoogte */}
          <div className="bg-[#f0f4f8] p-3 flex-1 min-w-0">
            {renderGrid()}
          </div>
          {/* Rechts: welkom + startopdracht + opdracht */}
          <div className="bg-[#f0faf8] flex flex-col justify-center p-10 gap-6" style={{ width: '42%', minWidth: 360 }}>
            <h2 className="text-3xl font-black uppercase tracking-wide" style={{ color: '#0d9488' }}>
              Welkom bij {activeKlasObj?.vak || 'de les'}
            </h2>
            {les?.startopdracht && (
              <div>
                <h3 className="text-xl font-bold uppercase tracking-wide mb-2" style={{ color: '#0d9488' }}>Startopdracht</h3>
                <div className="text-xl leading-relaxed text-gray-800">{les.startopdracht}</div>
              </div>
            )}
            {les?.terugkijken && (
              <div>
                <h3 className="text-xl font-bold uppercase tracking-wide mb-2" style={{ color: '#0d9488' }}>Opdracht</h3>
                <div className="text-xl leading-relaxed text-gray-800">{les.terugkijken}</div>
              </div>
            )}
            {!les?.startopdracht && !les?.terugkijken && (
              <div className="text-lg text-gray-400">Geen opdrachten ingesteld voor deze les</div>
            )}
          </div>
        </div>
      )}

      {/* === LES === */}
      {mode === 'les' && (
        <div className="flex-1 flex">
          {/* Links: plattegrond volle hoogte */}
          <div className="bg-[#f0f4f8] p-3 flex-1 min-w-0">
            {renderGrid()}
          </div>
          {/* Rechts: programma + timer */}
          <div className="flex flex-col" style={{ width: '40%', minWidth: 360 }}>
            {/* Programma */}
            <div className="flex-1 bg-[#f0faf5] p-6 overflow-auto">
              <h3 className="text-lg uppercase tracking-wide text-teal-700 font-bold mb-3">Programma</h3>
              <div className="text-base leading-relaxed whitespace-pre-line">{les?.programma || 'Geen programma ingesteld'}</div>
              {les?.leerdoelen && (
                <div className="mt-4 pt-3 border-t border-teal-200 text-sm text-gray-600">
                  <strong className="text-xs uppercase tracking-wide text-teal-600">Leerdoelen</strong>
                  <div className="whitespace-pre-line mt-1">{les.leerdoelen}</div>
                </div>
              )}
              {les?.huiswerk && (
                <div className="mt-4 pt-3 border-t border-teal-200 text-sm text-gray-600">
                  <strong className="text-xs uppercase tracking-wide text-orange-500">Huiswerk</strong>
                  <div className="whitespace-pre-line mt-1">{les.huiswerk}</div>
                </div>
              )}
              {les?.niet_vergeten && (
                <div className="mt-4 pt-3 border-t border-teal-200 text-sm text-gray-600">
                  <strong className="text-xs uppercase tracking-wide text-red-500">Niet vergeten</strong>
                  <div className="whitespace-pre-line mt-1">{les.niet_vergeten}</div>
                </div>
              )}
            </div>
            {/* Timer */}
            <div className="bg-white border-t border-gray-200 p-6 flex items-center justify-center gap-6">
              <div className="text-6xl font-black tabular-nums tracking-tighter text-[#1e3a5f]">{timerDisplay}</div>
              <div className="flex flex-col gap-2">
                <button onClick={() => timerRunning ? setTimerRunning(false) : startTimer()}
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl ${timerRunning ? 'bg-orange-500' : 'bg-green-500'}`}>
                  {timerRunning ? '⏸' : '▶'}
                </button>
                <button onClick={resetTimer}
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-200 text-gray-600 text-xl">
                  ⏹
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === LEZEN === */}
      {mode === 'lezen' && (
        <div className="flex-1 grid grid-cols-[340px_1fr]">
          <div className="bg-[#1e3a5f] flex flex-col items-center justify-center p-10 gap-3">
            <div className="text-5xl opacity-30">&#128214;</div>
            <div className="text-white/40 uppercase tracking-[4px] font-bold text-sm">Leestijd</div>
            <div className={`text-[7rem] font-black text-white tabular-nums tracking-tighter leading-none ${timerSec <= 0 && !timerRunning ? 'text-red-500 animate-pulse' : ''}`}>{timerDisplay}</div>
            <div className="flex items-center gap-3 mt-4">
              <input
                type="text"
                value={timerRunning ? timerDisplay : timerInput}
                onChange={e => { if (!timerRunning) setTimerInput(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter' && !timerRunning) { setTimerSec(parseTimerInput(timerInput)); startTimer(); } }}
                placeholder="mm:ss"
                disabled={timerRunning}
                className="w-20 text-center p-2 border border-white/20 rounded-lg bg-white/10 text-white font-bold text-lg tabular-nums"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => timerRunning ? setTimerRunning(false) : startTimer()}
                className={`px-6 py-2.5 rounded-xl font-bold text-base ${timerRunning ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>
                {timerRunning ? 'Pauze' : 'Start'}
              </button>
              <button onClick={resetTimer} className="px-6 py-2.5 rounded-xl font-bold text-base bg-white/10 text-white/70 border border-white/20">Reset</button>
            </div>
            <div className="text-white/30 text-lg mt-6 tabular-nums">{clock}</div>
          </div>
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
