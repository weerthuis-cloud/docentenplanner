'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ===================== TYPES =====================
interface Klas {
  id: number;
  naam: string;
  vak: string;
  jaarlaag: string;
  lokaal: string;
}

interface Antwoord {
  id?: number;
  vraag_id?: number;
  antwoord_tekst: string;
  is_correct: boolean;
  koppel_tekst?: string;
  volgorde?: number;
}

interface Vraag {
  id?: number;
  toets_id: number;
  vraag_tekst: string;
  vraag_type: 'meerkeuze' | 'open_kort' | 'open_lang' | 'invul' | 'koppel' | 'waar_onwaar';
  wds_niveau: 'weten' | 'doen' | 'snappen';
  bloom_niveau: string;
  doel_id: number | null;
  punten: number;
  volgorde: number;
  bron_tekst: string;
  antwoord_model: string;
  antwoorden: Antwoord[];
}

interface Doel {
  id?: number;
  toets_id: number;
  naam: string;
  omschrijving: string;
  weten_punten: number;
  doen_punten: number;
  snappen_punten: number;
  volgorde: number;
}

interface Toets {
  id: number;
  klas_id: number;
  naam: string;
  type: string;
  datum: string;
  weging: number;
  max_score: number;
  omschrijving: string;
  kleur: string;
  les_id: number | null;
  cesuur_percentage: number;
  cesuur_cijfer: number;
  wizard_stap: number;
  tijd_minuten: number;
  wds_weten_pct: number;
  wds_doen_pct: number;
  wds_snappen_pct: number;
}

// ===================== CONSTANTS =====================
const wdsLeerlijn: Record<string, { weten: number; doen: number; snappen: number }> = {
  V1: { weten: 30, doen: 45, snappen: 25 },
  V2: { weten: 20, doen: 45, snappen: 35 },
  V3: { weten: 15, doen: 40, snappen: 45 },
  V4: { weten: 10, doen: 35, snappen: 55 },
  V5: { weten: 5, doen: 30, snappen: 65 },
  V6: { weten: 5, doen: 25, snappen: 70 },
  H1: { weten: 40, doen: 40, snappen: 20 },
  H2: { weten: 30, doen: 40, snappen: 30 },
  H3: { weten: 20, doen: 40, snappen: 40 },
  H4: { weten: 10, doen: 40, snappen: 50 },
  H5: { weten: 0, doen: 40, snappen: 60 },
  M1: { weten: 45, doen: 45, snappen: 10 },
  M2: { weten: 35, doen: 55, snappen: 10 },
  M3: { weten: 20, doen: 65, snappen: 15 },
  M4: { weten: 10, doen: 75, snappen: 15 },
};

const toetsLabels: Record<string, string> = {
  PW: 'Proefwerk',
  SO: 'Schriftelijke overhoring',
  PO: 'Praktische opdracht',
  MO: 'Mondeling',
  SE: 'Schoolexamen',
  overig: 'Overig',
};

const toetsKleuren: Record<string, string> = {
  PW: '#c95555',
  SO: '#c4892e',
  PO: '#8b5ec0',
  MO: '#2d8a4e',
  SE: '#4a80d4',
  overig: '#8b95a5',
};

const vraagTypes = [
  { key: 'meerkeuze', label: 'Meerkeuze' },
  { key: 'open_kort', label: 'Open (kort)' },
  { key: 'open_lang', label: 'Open (lang)' },
  { key: 'invul', label: 'Invulvak' },
  { key: 'koppel', label: 'Koppel' },
  { key: 'waar_onwaar', label: 'Waar/Onwaar' },
];

const estimatedMinutesPerType: Record<string, number> = {
  meerkeuze: 1,
  open_kort: 3,
  open_lang: 8,
  invul: 1,
  koppel: 2,
  waar_onwaar: 0.5,
};

// ===================== HELPER FUNCTIONS =====================
function extractJaarlaag(klasNaam: string, jaarlaag?: string): string {
  if (jaarlaag && jaarlaag.match(/^[VHM]\d+$/)) return jaarlaag;
  const match = klasNaam.match(/([VHM])(\d)/);
  return match ? `${match[1]}${match[2]}` : 'V3';
}

function bloomMapFromWDS(wds: 'weten' | 'doen' | 'snappen'): string {
  const map = {
    weten: 'onthouden',
    doen: 'toepassen',
    snappen: 'evalueren',
  };
  return map[wds];
}

// ===================== WDS BAR COMPONENT =====================
function WDSBar({ weten, doen, snappen }: { weten: number; doen: number; snappen: number }) {
  const total = weten + doen + snappen || 1;
  const wetenPct = ((weten / total) * 100) | 0;
  const doenPct = ((doen / total) * 100) | 0;
  const snappenPct = ((snappen / total) * 100) | 0;

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
      <div style={{ display: 'flex', flex: 1, height: '24px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #d0d0d0' }}>
        <div style={{ flex: wetenPct, backgroundColor: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>
          {wetenPct > 5 ? `${wetenPct}%` : ''}
        </div>
        <div style={{ flex: doenPct, backgroundColor: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>
          {doenPct > 5 ? `${doenPct}%` : ''}
        </div>
        <div style={{ flex: snappenPct, backgroundColor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>
          {snappenPct > 5 ? `${snappenPct}%` : ''}
        </div>
      </div>
      <div style={{ minWidth: '100px', fontSize: '12px', color: '#666' }}>
        W:{wetenPct}% D:{doenPct}% S:{snappenPct}%
      </div>
    </div>
  );
}

// ===================== STEP 1: BASISGEGEVENS =====================
function Step1({ toets, setToets, klassen, onNext }: {
  toets: Partial<Toets>;
  setToets: (t: Partial<Toets>) => void;
  klassen: Klas[];
  onNext: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedKlas = klassen.find((k) => k.id === toets.klas_id);
  const jaarlaag = extractJaarlaag(selectedKlas?.naam || '', selectedKlas?.jaarlaag);
  const recommended = wdsLeerlijn[jaarlaag] || { weten: 15, doen: 40, snappen: 45 };

  const handleValidateAndNext = () => {
    const newErrors: Record<string, string> = {};
    if (!toets.klas_id) newErrors.klas_id = 'Selecteer een klas';
    if (!toets.naam || toets.naam.trim() === '') newErrors.naam = 'Naam is verplicht';
    if (!toets.type) newErrors.type = 'Type is verplicht';
    if (!toets.datum) newErrors.datum = 'Datum is verplicht';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onNext();
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e3a5f' }}>Stap 1: Basisgegevens</h2>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1e3a5f' }}>Klas *</label>
        <select
          value={toets.klas_id || ''}
          onChange={(e) => setToets({ ...toets, klas_id: Number(e.target.value) })}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '6px',
            border: errors.klas_id ? '2px solid #ef4444' : '1px solid #d0d0d0',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        >
          <option value="">-- Selecteer een klas --</option>
          {klassen.map((k) => (
            <option key={k.id} value={k.id}>
              {k.naam} ({k.vak})
            </option>
          ))}
        </select>
        {errors.klas_id && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{errors.klas_id}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1e3a5f' }}>Naam *</label>
          <input
            type="text"
            value={toets.naam || ''}
            onChange={(e) => setToets({ ...toets, naam: e.target.value })}
            placeholder="bijv. Toets hoofdstuk 5"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: errors.naam ? '2px solid #ef4444' : '1px solid #d0d0d0',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          {errors.naam && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{errors.naam}</div>}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1e3a5f' }}>Type *</label>
          <select
            value={toets.type || ''}
            onChange={(e) => setToets({ ...toets, type: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: errors.type ? '2px solid #ef4444' : '1px solid #d0d0d0',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          >
            <option value="">-- Selecteer type --</option>
            {Object.entries(toetsLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {errors.type && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{errors.type}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1e3a5f' }}>Datum *</label>
          <input
            type="date"
            value={toets.datum || ''}
            onChange={(e) => setToets({ ...toets, datum: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: errors.datum ? '2px solid #ef4444' : '1px solid #d0d0d0',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          {errors.datum && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{errors.datum}</div>}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#1e3a5f' }}>Tijd (minuten)</label>
          <input
            type="number"
            value={toets.tijd_minuten || 45}
            onChange={(e) => setToets({ ...toets, tijd_minuten: Number(e.target.value) })}
            min="0"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #d0d0d0',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ backgroundColor: '#EEF2FF', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f', margin: '0 0 12px 0' }}>Cesuur</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#1e3a5f' }}>Percentage</label>
            <input
              type="number"
              value={Math.round((toets.cesuur_percentage || 0.6) * 100)}
              onChange={(e) => setToets({ ...toets, cesuur_percentage: Number(e.target.value) / 100 })}
              min="0"
              max="100"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #d0d0d0',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#1e3a5f' }}>Cesuur cijfer</label>
            <input
              type="number"
              value={toets.cesuur_cijfer || 5.5}
              onChange={(e) => setToets({ ...toets, cesuur_cijfer: Number(e.target.value) })}
              min="1"
              max="10"
              step="0.1"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #d0d0d0',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#f7f8fa', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f', margin: '0 0 12px 0' }}>WDS-verdeling doel (jaar {jaarlaag})</h3>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px', margin: '0 0 12px 0' }}>Aanbevolen: Weten {recommended.weten}% | Doen {recommended.doen}% | Snappen {recommended.snappen}%</p>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600', alignItems: 'center' }}>
            <span style={{ color: '#60a5fa', minWidth: '80px' }}>Weten {toets.wds_weten_pct || 0}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={toets.wds_weten_pct || recommended.weten}
              onChange={(e) => {
                const newWeten = Number(e.target.value);
                const remaining = 100 - newWeten;
                const doenVal = Math.round((remaining * (toets.wds_doen_pct || recommended.doen)) / ((toets.wds_doen_pct || recommended.doen) + (toets.wds_snappen_pct || recommended.snappen)));
                setToets({ ...toets, wds_weten_pct: newWeten, wds_doen_pct: doenVal, wds_snappen_pct: remaining - doenVal });
              }}
              style={{ width: '100%', margin: '0 12px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600', alignItems: 'center' }}>
            <span style={{ color: '#34d399', minWidth: '80px' }}>Doen {toets.wds_doen_pct || 0}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={toets.wds_doen_pct || recommended.doen}
              onChange={(e) => {
                const newDoen = Number(e.target.value);
                const remaining = 100 - newDoen;
                const wetenVal = Math.round((remaining * (toets.wds_weten_pct || recommended.weten)) / ((toets.wds_weten_pct || recommended.weten) + (toets.wds_snappen_pct || recommended.snappen)));
                setToets({ ...toets, wds_doen_pct: newDoen, wds_weten_pct: wetenVal, wds_snappen_pct: remaining - wetenVal });
              }}
              style={{ width: '100%', margin: '0 12px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '12px', fontWeight: '600', alignItems: 'center' }}>
            <span style={{ color: '#f59e0b', minWidth: '80px' }}>Snappen {toets.wds_snappen_pct || 0}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={toets.wds_snappen_pct || recommended.snappen}
              onChange={(e) => {
                const newSnappen = Number(e.target.value);
                const remaining = 100 - newSnappen;
                const wetenVal = Math.round((remaining * (toets.wds_weten_pct || recommended.weten)) / ((toets.wds_weten_pct || recommended.weten) + (toets.wds_doen_pct || recommended.doen)));
                setToets({ ...toets, wds_snappen_pct: newSnappen, wds_weten_pct: wetenVal, wds_doen_pct: remaining - wetenVal });
              }}
              style={{ width: '100%', margin: '0 12px' }}
            />
          </div>
        </div>

        <WDSBar weten={toets.wds_weten_pct || recommended.weten} doen={toets.wds_doen_pct || recommended.doen} snappen={toets.wds_snappen_pct || recommended.snappen} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={handleValidateAndNext}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2B5BA0',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Volgende →
        </button>
      </div>
    </div>
  );
}

// ===================== STEP 2: TOETSDOELEN =====================
// ===================== LEERLIJN TYPES =====================
interface LeerlijnDomein {
  naam: string;
  kerndoelen: string;
  leerdoelen: Record<string, string[]>;
}

interface LeerlijnTrack {
  leerjaren: string[];
  domeinen: Record<string, LeerlijnDomein>;
}

interface LeerlijnData {
  havo: LeerlijnTrack;
  mavo: LeerlijnTrack;
  vwo: LeerlijnTrack;
}

const domeinIcons: Record<string, string> = {
  leesvaardigheid: '📖',
  mondelinge_taalvaardigheid: '🗣️',
  schrijfvaardigheid: '✍️',
  luistervaardigheid: '👂',
  literatuur: '📚',
  orientatie: '🧭',
};

function Step2({ toets, doelen, setDoelen, klassen, onPrev, onNext }: {
  toets: Partial<Toets>;
  doelen: Doel[];
  setDoelen: (d: Doel[]) => void;
  klassen: Klas[];
  onPrev: () => void;
  onNext: () => void;
}) {
  const [newGoal, setNewGoal] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Doel>>({});
  const [leerlijnData, setLeerlijnData] = useState<LeerlijnData | null>(null);
  const [expandedDomein, setExpandedDomein] = useState<string | null>(null);
  const [showLeerlijn, setShowLeerlijn] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [steekwoorden, setSteekwoorden] = useState('');
  const [theorieContext, setTheorieContext] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'handmatig' | 'leerlijn' | 'ai'>('handmatig');

  // Determine track and year from selected klas
  const selectedKlas = klassen.find(k => k.id === toets.klas_id);
  const jaarlaag = selectedKlas ? extractJaarlaag(selectedKlas.naam, selectedKlas.jaarlaag) : '';
  const trackKey = jaarlaag.startsWith('H') ? 'havo' : jaarlaag.startsWith('M') ? 'mavo' : jaarlaag.startsWith('V') ? 'vwo' : '';
  const trackLabel = trackKey === 'havo' ? 'HAVO' : trackKey === 'mavo' ? 'MAVO' : trackKey === 'vwo' ? 'VWO' : '';

  // Load leerlijn data
  useEffect(() => {
    fetch('/leerlijn-data.json')
      .then(res => res.json())
      .then(data => setLeerlijnData(data))
      .catch(err => console.error('Leerlijn laden mislukt:', err));
  }, []);

  const currentTrack = leerlijnData && trackKey ? (leerlijnData as any)[trackKey] as LeerlijnTrack : null;
  const currentDomeinen = currentTrack?.domeinen || {};

  const handleAddGoal = () => {
    if (!newGoal.trim() || doelen.length >= 10) return;
    const goal: Doel = {
      toets_id: toets.id || 0,
      naam: newGoal,
      omschrijving: '',
      weten_punten: 0,
      doen_punten: 0,
      snappen_punten: 0,
      volgorde: doelen.length,
    };
    setDoelen([...doelen, goal]);
    setNewGoal('');
  };

  const handleAddFromLeerlijn = (goalText: string, domeinNaam: string) => {
    if (doelen.length >= 10) return;
    const goal: Doel = {
      toets_id: toets.id || 0,
      naam: goalText.length > 120 ? goalText.substring(0, 117) + '...' : goalText,
      omschrijving: `Bron: ${domeinNaam} (${trackLabel} ${jaarlaag})`,
      weten_punten: 0,
      doen_punten: 0,
      snappen_punten: 0,
      volgorde: doelen.length,
    };
    setDoelen([...doelen, goal]);
  };

  const handleAiGenerate = async () => {
    if (!steekwoorden.trim()) return;
    setAiGenerating(true);
    setAiSuggestions([]);
    try {
      // Gather relevant leerlijn context for the AI
      let leerlijnContext = '';
      if (currentTrack && jaarlaag) {
        Object.entries(currentDomeinen).forEach(([, domein]) => {
          const goals = domein.leerdoelen[jaarlaag];
          if (goals && goals.length > 0) {
            leerlijnContext += `\n${domein.naam} (kerndoelen ${domein.kerndoelen}):\n`;
            goals.forEach(g => { leerlijnContext += `- ${g}\n`; });
          }
        });
      }

      const res = await fetch('/api/ai-doelen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steekwoorden: steekwoorden.trim(),
          theorie_context: theorieContext.trim(),
          track: trackLabel,
          jaarlaag,
          leerlijn_context: leerlijnContext,
          bestaande_doelen: doelen.map(d => d.naam),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiSuggestions(data.doelen || []);
      } else {
        setAiSuggestions(['Er ging iets mis bij het genereren. Probeer het opnieuw.']);
      }
    } catch {
      setAiSuggestions(['Fout bij verbinden met AI. Controleer je internetverbinding.']);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAddAiSuggestion = (suggestion: string) => {
    if (doelen.length >= 10) return;
    const goal: Doel = {
      toets_id: toets.id || 0,
      naam: suggestion,
      omschrijving: 'Gegenereerd met AI-formuleercoach',
      weten_punten: 0,
      doen_punten: 0,
      snappen_punten: 0,
      volgorde: doelen.length,
    };
    setDoelen([...doelen, goal]);
    setAiSuggestions(aiSuggestions.filter(s => s !== suggestion));
  };

  const handleStartEdit = (goal: Doel, index: number) => {
    setEditingId(index);
    setEditValues(goal);
  };

  const handleSaveEdit = () => {
    if (editingId !== null) {
      setDoelen(doelen.map((d, i) => (i === editingId ? { ...d, ...editValues } : d)));
      setEditingId(null);
      setEditValues({});
    }
  };

  const handleDeleteGoal = (index: number) => {
    setDoelen(doelen.filter((_, i) => i !== index));
  };

  const handleMoveGoal = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === doelen.length - 1)) return;
    const newDoelen = [...doelen];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newDoelen[index], newDoelen[targetIndex]] = [newDoelen[targetIndex], newDoelen[index]];
    setDoelen(newDoelen);
  };

  const tabStyle = (tab: string) => ({
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: activeTab === tab ? '700' as const : '500' as const,
    color: activeTab === tab ? '#1e3a5f' : '#666',
    borderBottom: activeTab === tab ? '3px solid #2B5BA0' : '3px solid transparent',
    cursor: 'pointer' as const,
    background: 'none',
    border: 'none',
    borderBottomStyle: 'solid' as const,
    borderBottomWidth: '3px',
    borderBottomColor: activeTab === tab ? '#2B5BA0' : 'transparent',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1e3a5f' }}>Stap 2: Toetsdoelen</h2>

      {selectedKlas && (
        <div style={{ fontSize: '13px', color: '#2B5BA0', marginBottom: '20px', fontWeight: '500' }}>
          {trackLabel} {jaarlaag} — {selectedKlas.vak || 'Nederlands'}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e0e0e0', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('handmatig')} style={tabStyle('handmatig')}>✏️ Handmatig</button>
        <button onClick={() => setActiveTab('leerlijn')} style={tabStyle('leerlijn')}>📋 Leerlijn</button>
        <button onClick={() => setActiveTab('ai')} style={tabStyle('ai')}>🤖 AI Coach</button>
      </div>

      {/* Tab: Handmatig */}
      {activeTab === 'handmatig' && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#f0f4ff', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', color: '#1e3a5f' }}>
            💡 Formuleer concrete, meetbare doelen. Gebruik werkwoorden als: herkennen, benoemen (Weten), beschrijven, samenvatten (Doen), onderbouwen, beoordelen (Snappen).
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddGoal()}
              placeholder="Beschrijf het leerdoel..."
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d0d0d0',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleAddGoal}
              disabled={doelen.length >= 10}
              style={{
                padding: '10px 16px',
                backgroundColor: doelen.length >= 10 ? '#999' : '#2B5BA0',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: doelen.length >= 10 ? 'not-allowed' : 'pointer',
              }}
            >
              + Toevoegen
            </button>
          </div>
        </div>
      )}

      {/* Tab: Leerlijn Browser */}
      {activeTab === 'leerlijn' && (
        <div style={{ marginBottom: '24px' }}>
          {!currentTrack ? (
            <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#fff8e1', borderRadius: '6px', color: '#856404' }}>
              {!leerlijnData ? 'Leerlijn wordt geladen...' : 'Selecteer eerst een klas in Stap 1 om de leerlijn te zien.'}
            </div>
          ) : (
            <div>
              <div style={{ backgroundColor: '#f0f4ff', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', color: '#1e3a5f' }}>
                📋 Klik op een domein om de leerdoelen voor <strong>{trackLabel} {jaarlaag}</strong> te bekijken. Klik op een doel om het als toetsdoel over te nemen.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(currentDomeinen).map(([domeinKey, domein]) => {
                  const goals = domein.leerdoelen[jaarlaag] || [];
                  const isExpanded = expandedDomein === domeinKey;
                  const icon = domeinIcons[domeinKey] || '📄';

                  return (
                    <div key={domeinKey} style={{ border: '1px solid #d0d0d0', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#fff' }}>
                      <button
                        onClick={() => setExpandedDomein(isExpanded ? null : domeinKey)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: isExpanded ? '#EEF2FF' : '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f' }}>
                          {icon} {domein.naam}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#888', backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '10px' }}>
                            {goals.length} doelen
                          </span>
                          <span style={{ fontSize: '11px', color: '#888' }}>
                            KD {domein.kerndoelen}
                          </span>
                          <span style={{ fontSize: '16px', color: '#999', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                        </span>
                      </button>

                      {isExpanded && goals.length > 0 && (
                        <div style={{ padding: '8px 16px 16px', borderTop: '1px solid #e0e0e0' }}>
                          {goals.map((goal, gIdx) => {
                            const alreadyAdded = doelen.some(d => d.naam === (goal.length > 120 ? goal.substring(0, 117) + '...' : goal));
                            return (
                              <div
                                key={gIdx}
                                onClick={() => !alreadyAdded && doelen.length < 10 && handleAddFromLeerlijn(goal, domein.naam)}
                                style={{
                                  padding: '10px 12px',
                                  margin: '4px 0',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  color: alreadyAdded ? '#999' : '#333',
                                  backgroundColor: alreadyAdded ? '#f5f5f5' : '#fafafa',
                                  cursor: alreadyAdded || doelen.length >= 10 ? 'default' : 'pointer',
                                  borderLeft: alreadyAdded ? '3px solid #34d399' : '3px solid #d0d0d0',
                                  lineHeight: '1.5',
                                  transition: 'background-color 0.15s',
                                }}
                                onMouseEnter={(e) => { if (!alreadyAdded) (e.currentTarget.style.backgroundColor = '#EEF2FF'); }}
                                onMouseLeave={(e) => { if (!alreadyAdded) (e.currentTarget.style.backgroundColor = '#fafafa'); }}
                              >
                                {alreadyAdded && <span style={{ fontSize: '11px', color: '#34d399', marginRight: '6px' }}>✓</span>}
                                {goal}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isExpanded && goals.length === 0 && (
                        <div style={{ padding: '12px 16px', color: '#999', fontSize: '13px', borderTop: '1px solid #e0e0e0' }}>
                          Geen leerdoelen beschikbaar voor {jaarlaag} in dit domein.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: AI Coach */}
      {activeTab === 'ai' && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#fff8e1', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', color: '#856404' }}>
            🤖 De AI-formuleercoach helpt je steekwoorden omzetten in goed geformuleerde WDS-doelen. Jij bepaalt de inhoud, de AI helpt met de formulering op basis van de leerlijn {trackLabel} {jaarlaag}.
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#1e3a5f' }}>
              Steekwoorden / onderwerp *
            </label>
            <textarea
              value={steekwoorden}
              onChange={(e) => setSteekwoorden(e.target.value)}
              placeholder="Bijv.: werkwoordspelling, voltooid deelwoord, sterke werkwoorden, t/d-regels..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d0d0d0',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '60px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#1e3a5f' }}>
              Theorie / oefeningen context (optioneel)
            </label>
            <textarea
              value={theorieContext}
              onChange={(e) => setTheorieContext(e.target.value)}
              placeholder="Welke theorie is behandeld? Welke oefeningen zijn gemaakt? Welke hoofdstukken?"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d0d0d0',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '60px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={handleAiGenerate}
            disabled={!steekwoorden.trim() || aiGenerating || doelen.length >= 10}
            style={{
              padding: '10px 20px',
              backgroundColor: !steekwoorden.trim() || aiGenerating || doelen.length >= 10 ? '#999' : '#2B5BA0',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: !steekwoorden.trim() || aiGenerating || doelen.length >= 10 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {aiGenerating ? '⏳ Bezig met genereren...' : '🤖 Genereer doelen'}
          </button>

          {/* AI Suggestions */}
          {aiSuggestions.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#1e3a5f' }}>
                Voorgestelde doelen — klik om over te nemen:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {aiSuggestions.map((suggestion, sIdx) => (
                  <div
                    key={sIdx}
                    onClick={() => handleAddAiSuggestion(suggestion)}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#1e3a5f',
                      cursor: doelen.length >= 10 ? 'not-allowed' : 'pointer',
                      lineHeight: '1.5',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e0f2fe'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f0f9ff'; }}
                  >
                    <span style={{ marginRight: '8px', color: '#2B5BA0' }}>+</span>
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Doelen overzicht */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e3a5f', margin: 0 }}>
            Geselecteerde doelen ({doelen.length}/10)
          </h3>
        </div>

        {doelen.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#f7f8fa', borderRadius: '6px', color: '#999', fontSize: '13px' }}>
            Nog geen doelen. Voeg ze handmatig toe, selecteer uit de leerlijn, of laat de AI-coach helpen.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {doelen.map((goal, idx) => (
              <div key={idx} style={{ border: '1px solid #d0d0d0', borderRadius: '6px', padding: '12px 16px', backgroundColor: '#fff' }}>
                {editingId === idx ? (
                  <div>
                    <input
                      type="text"
                      value={editValues.naam || ''}
                      onChange={(e) => setEditValues({ ...editValues, naam: e.target.value })}
                      placeholder="Doelnaam"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        border: '1px solid #d0d0d0',
                        fontSize: '14px',
                        marginBottom: '8px',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                    <textarea
                      value={editValues.omschrijving || ''}
                      onChange={(e) => setEditValues({ ...editValues, omschrijving: e.target.value })}
                      placeholder="Omschrijving (optioneel)"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        border: '1px solid #d0d0d0',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        minHeight: '50px',
                        marginBottom: '8px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handleSaveEdit} style={{ padding: '6px 12px', backgroundColor: '#2B5BA0', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Opslaan</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', backgroundColor: '#999', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Annuleren</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#999', fontWeight: '600' }}>#{idx + 1}</span>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f' }}>{goal.naam}</span>
                      </div>
                      {goal.omschrijving && <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0', fontStyle: 'italic' }}>{goal.omschrijving}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginLeft: '12px', flexShrink: 0 }}>
                      <button onClick={() => handleStartEdit(goal, idx)} style={{ padding: '4px 8px', backgroundColor: '#2B5BA0', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Bewerk</button>
                      <button onClick={() => handleMoveGoal(idx, 'up')} disabled={idx === 0} style={{ padding: '4px 6px', backgroundColor: idx === 0 ? '#ddd' : '#4a80d4', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: idx === 0 ? 'not-allowed' : 'pointer' }}>↑</button>
                      <button onClick={() => handleMoveGoal(idx, 'down')} disabled={idx === doelen.length - 1} style={{ padding: '4px 6px', backgroundColor: idx === doelen.length - 1 ? '#ddd' : '#4a80d4', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: idx === doelen.length - 1 ? 'not-allowed' : 'pointer' }}>↓</button>
                      <button onClick={() => handleDeleteGoal(idx)} style={{ padding: '4px 8px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {doelen.length >= 10 && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>Maximum 10 doelen bereikt.</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <button onClick={onPrev} style={{ padding: '10px 20px', backgroundColor: '#999', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          ← Vorige
        </button>
        <button
          onClick={onNext}
          disabled={doelen.length === 0}
          style={{
            padding: '10px 20px',
            backgroundColor: doelen.length === 0 ? '#999' : '#2B5BA0',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: doelen.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Volgende →
        </button>
      </div>
    </div>
  );
}

// ===================== STEP 3: TOETSMATRIJS =====================
function Step3({ toets, doelen, matrijsData, setMatrijsData, onPrev, onNext }: {
  toets: Partial<Toets>;
  doelen: Doel[];
  matrijsData: Record<number, { weten: number; doen: number; snappen: number }>;
  setMatrijsData: (data: Record<number, { weten: number; doen: number; snappen: number }>) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const updateCell = (doelIdx: number, wdsType: 'weten' | 'doen' | 'snappen', value: number) => {
    const newData = { ...matrijsData };
    if (!newData[doelIdx]) newData[doelIdx] = { weten: 0, doen: 0, snappen: 0 };
    newData[doelIdx][wdsType] = Math.max(0, value);
    setMatrijsData(newData);
  };

  const getTotalWeten = () => Object.values(matrijsData).reduce((sum, d) => sum + d.weten, 0);
  const getTotalDoen = () => Object.values(matrijsData).reduce((sum, d) => sum + d.doen, 0);
  const getTotalSnappen = () => Object.values(matrijsData).reduce((sum, d) => sum + d.snappen, 0);
  const getTotalPoints = () => getTotalWeten() + getTotalDoen() + getTotalSnappen();

  const currentWeten = getTotalWeten();
  const currentDoen = getTotalDoen();
  const currentSnappen = getTotalSnappen();
  const totalPoints = getTotalPoints() || 1;

  const currentWetenPct = Math.round((currentWeten / totalPoints) * 100);
  const currentDoenPct = Math.round((currentDoen / totalPoints) * 100);
  const currentSnappenPct = Math.round((currentSnappen / totalPoints) * 100);

  const targetWetenPct = toets.wds_weten_pct || 15;
  const targetDoenPct = toets.wds_doen_pct || 40;
  const targetSnappenPct = toets.wds_snappen_pct || 45;

  const wetenDeviation = Math.abs(currentWetenPct - targetWetenPct);
  const doenDeviation = Math.abs(currentDoenPct - targetDoenPct);
  const snappenDeviation = Math.abs(currentSnappenPct - targetSnappenPct);

  const hasDeviation = wetenDeviation > 10 || doenDeviation > 10 || snappenDeviation > 10;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e3a5f' }}>Stap 3: Toetsmatrijs</h2>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f' }}>WDS-verdeling</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Doel-verdeling</p>
            <WDSBar weten={targetWetenPct} doen={targetDoenPct} snappen={targetSnappenPct} />
          </div>
          <div>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Huidige verdeling</p>
            <WDSBar weten={currentWetenPct} doen={currentDoenPct} snappen={currentSnappenPct} />
            {hasDeviation && <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#fef08a', borderRadius: '4px', fontSize: '12px', color: '#92400e' }}>{'⚠ Verdeling wijkt >10% af van doel'}</div>}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: '24px', border: '1px solid #d0d0d0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7f8fa', borderBottom: '2px solid #d0d0d0' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#1e3a5f', minWidth: '150px' }}>Doel</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#60a5fa', minWidth: '80px', backgroundColor: '#f0f4ff' }}>Weten</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#34d399', minWidth: '80px', backgroundColor: '#f0f8f6' }}>Doen</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#f59e0b', minWidth: '80px', backgroundColor: '#fffbf0' }}>Snappen</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#666', minWidth: '80px' }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {doelen.map((doel, doelIdx) => {
              const data = matrijsData[doelIdx] || { weten: 0, doen: 0, snappen: 0 };
              const doelTotal = data.weten + data.doen + data.snappen;
              return (
                <tr key={doelIdx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '12px', fontWeight: '500', color: '#1e3a5f' }}>{doel.naam}</td>
                  <td style={{ padding: '8px', textAlign: 'center', backgroundColor: '#f0f4ff' }}>
                    <input
                      type="number"
                      min="0"
                      value={data.weten}
                      onChange={(e) => updateCell(doelIdx, 'weten', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #60a5fa',
                        borderRadius: '4px',
                        textAlign: 'center',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', backgroundColor: '#f0f8f6' }}>
                    <input
                      type="number"
                      min="0"
                      value={data.doen}
                      onChange={(e) => updateCell(doelIdx, 'doen', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #34d399',
                        borderRadius: '4px',
                        textAlign: 'center',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', backgroundColor: '#fffbf0' }}>
                    <input
                      type="number"
                      min="0"
                      value={data.snappen}
                      onChange={(e) => updateCell(doelIdx, 'snappen', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #f59e0b',
                        borderRadius: '4px',
                        textAlign: 'center',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#1e3a5f' }}>{doelTotal}</td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: '#f7f8fa', fontWeight: '600', borderTop: '2px solid #d0d0d0' }}>
              <td style={{ padding: '12px', color: '#1e3a5f' }}>Totaal</td>
              <td style={{ padding: '12px', textAlign: 'center', color: '#60a5fa', backgroundColor: '#f0f4ff' }}>{currentWeten}</td>
              <td style={{ padding: '12px', textAlign: 'center', color: '#34d399', backgroundColor: '#f0f8f6' }}>{currentDoen}</td>
              <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', backgroundColor: '#fffbf0' }}>{currentSnappen}</td>
              <td style={{ padding: '12px', textAlign: 'center', color: '#1e3a5f' }}>{getTotalPoints()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <button onClick={onPrev} style={{ padding: '10px 20px', backgroundColor: '#999', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          ← Vorige
        </button>
        <button
          onClick={onNext}
          disabled={getTotalPoints() === 0}
          style={{
            padding: '10px 20px',
            backgroundColor: getTotalPoints() === 0 ? '#999' : '#2B5BA0',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: getTotalPoints() === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Volgende →
        </button>
      </div>
    </div>
  );
}

// ===================== STEP 4: VRAGEN MAKEN =====================
function Step4({ toets, doelen, matrijsData, vragen, setVragen, onPrev, onNext }: {
  toets: Partial<Toets>;
  doelen: Doel[];
  matrijsData: Record<number, { weten: number; doen: number; snappen: number }>;
  vragen: Vraag[];
  setVragen: (v: Vraag[]) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [selectedDoelIdx, setSelectedDoelIdx] = useState<number>(0);
  const [showNewQuestionForm, setShowNewQuestionForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Partial<Vraag>>({
    vraag_tekst: '',
    vraag_type: 'meerkeuze',
    wds_niveau: 'weten',
    punten: 1,
    bron_tekst: '',
    antwoord_model: '',
    antwoorden: [],
  });

  const selectedDoel = doelen[selectedDoelIdx];
  const doelMatrix = matrijsData[selectedDoelIdx] || { weten: 0, doen: 0, snappen: 0 };
  const doelVragen = vragen.filter((v) => v.doel_id === selectedDoelIdx);

  const getDoelStatus = (idx: number) => {
    const doelQuestions = vragen.filter((v) => v.doel_id === idx);
    const totalPunten = doelQuestions.reduce((sum, v) => sum + v.punten, 0);
    const targetPunten = (matrijsData[idx]?.weten || 0) + (matrijsData[idx]?.doen || 0) + (matrijsData[idx]?.snappen || 0);
    return { current: totalPunten, target: targetPunten };
  };

  const handleAddQuestion = () => {
    if (!newQuestion.vraag_tekst?.trim()) return;
    const question: Vraag = {
      toets_id: toets.id || 0,
      vraag_tekst: newQuestion.vraag_tekst || '',
      vraag_type: newQuestion.vraag_type || 'meerkeuze',
      wds_niveau: newQuestion.wds_niveau || 'weten',
      bloom_niveau: bloomMapFromWDS(newQuestion.wds_niveau || 'weten'),
      doel_id: selectedDoelIdx,
      punten: newQuestion.punten || 1,
      volgorde: doelVragen.length,
      bron_tekst: newQuestion.bron_tekst || '',
      antwoord_model: newQuestion.antwoord_model || '',
      antwoorden: newQuestion.antwoorden || [],
    };
    setVragen([...vragen, question]);
    setNewQuestion({
      vraag_tekst: '',
      vraag_type: 'meerkeuze',
      wds_niveau: 'weten',
      punten: 1,
      bron_tekst: '',
      antwoord_model: '',
      antwoorden: [],
    });
    setShowNewQuestionForm(false);
  };

  const handleDeleteQuestion = (idx: number) => {
    setVragen(vragen.filter((_, i) => i !== idx));
  };

  const wdsColors: Record<string, string> = {
    weten: '#60a5fa',
    doen: '#34d399',
    snappen: '#f59e0b',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e3a5f' }}>Stap 4: Vragen maken</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '24px' }}>
        <div style={{ borderRight: '1px solid #d0d0d0', paddingRight: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f' }}>Toetsdoelen</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {doelen.map((doel, idx) => {
              const status = getDoelStatus(idx);
              const isSelected = selectedDoelIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDoelIdx(idx)}
                  style={{
                    padding: '12px',
                    backgroundColor: isSelected ? '#2B5BA0' : '#f7f8fa',
                    color: isSelected ? '#fff' : '#1e3a5f',
                    border: isSelected ? '2px solid #2B5BA0' : '1px solid #d0d0d0',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>{doel.naam}</div>
                  <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.9 }}>
                    {status.current}/{status.target} punten
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          {selectedDoel && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f' }}>{selectedDoel.naam}</h3>
              {selectedDoel.omschrijving && <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px', fontStyle: 'italic' }}>{selectedDoel.omschrijving}</p>}

              <div style={{ backgroundColor: '#f7f8fa', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px' }}>
                <p style={{ margin: 0, marginBottom: '6px', fontWeight: '600', color: '#1e3a5f' }}>Vereenvoudigde WDS-verdeling:</p>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                  <span>
                    <span style={{ color: '#60a5fa', fontWeight: '600' }}>Weten:</span> {doelMatrix.weten} punten
                  </span>
                  <span>
                    <span style={{ color: '#34d399', fontWeight: '600' }}>Doen:</span> {doelMatrix.doen} punten
                  </span>
                  <span>
                    <span style={{ color: '#f59e0b', fontWeight: '600' }}>Snappen:</span> {doelMatrix.snappen} punten
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f' }}>Vragen ({doelVragen.length})</h4>

                {doelVragen.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#f7f8fa', borderRadius: '6px', color: '#999', fontSize: '13px' }}>Geen vragen voor dit doel</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {doelVragen.map((question, idx) => (
                      <div key={idx} style={{ border: '1px solid #d0d0d0', borderRadius: '6px', padding: '12px', backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', margin: 0, color: '#1e3a5f', marginBottom: '4px' }}>{question.vraag_tekst}</p>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  backgroundColor: wdsColors[question.wds_niveau],
                                  color: '#fff',
                                  padding: '2px 8px',
                                  borderRadius: '3px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                }}
                              >
                                {question.wds_niveau.charAt(0).toUpperCase() + question.wds_niveau.slice(1)}
                              </span>
                              <span style={{ fontSize: '12px', color: '#999' }}>
                                {question.vraag_type} • {question.punten} ptn
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteQuestion(vragen.indexOf(question))}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowNewQuestionForm(!showNewQuestionForm)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#2B5BA0',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  + Nieuwe vraag
                </button>

                {showNewQuestionForm && (
                  <div style={{ marginTop: '16px', border: '1px solid #d0d0d0', padding: '16px', borderRadius: '6px', backgroundColor: '#f7f8fa' }}>
                    <input
                      type="text"
                      placeholder="Vraag tekst"
                      value={newQuestion.vraag_tekst || ''}
                      onChange={(e) => setNewQuestion({ ...newQuestion, vraag_tekst: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        border: '1px solid #d0d0d0',
                        fontSize: '13px',
                        marginBottom: '8px',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <select
                        value={newQuestion.vraag_type || 'meerkeuze'}
                        onChange={(e) => setNewQuestion({ ...newQuestion, vraag_type: e.target.value as any })}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid #d0d0d0',
                          fontSize: '12px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="meerkeuze">Meerkeuze</option>
                        <option value="open_kort">Open kort</option>
                        <option value="open_lang">Open lang</option>
                        <option value="waar_onwaar">Waar/Onwaar</option>
                        <option value="invul">Invul</option>
                        <option value="koppel">Koppel</option>
                      </select>

                      <select
                        value={newQuestion.wds_niveau || 'weten'}
                        onChange={(e) => setNewQuestion({ ...newQuestion, wds_niveau: e.target.value as any })}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid #d0d0d0',
                          fontSize: '12px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="weten">Weten</option>
                        <option value="doen">Doen</option>
                        <option value="snappen">Snappen</option>
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={newQuestion.punten || 1}
                        onChange={(e) => setNewQuestion({ ...newQuestion, punten: Number(e.target.value) })}
                        placeholder="Punten"
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid #d0d0d0',
                          fontSize: '12px',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleAddQuestion}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#2B5BA0',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Voeg toe
                      </button>
                      <button
                        onClick={() => setShowNewQuestionForm(false)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#999',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '24px' }}>
        <button onClick={onPrev} style={{ padding: '10px 20px', backgroundColor: '#999', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          ← Vorige
        </button>
        <button
          onClick={onNext}
          disabled={vragen.length < 5}
          style={{
            padding: '10px 20px',
            backgroundColor: vragen.length < 5 ? '#999' : '#2B5BA0',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: vragen.length < 5 ? 'not-allowed' : 'pointer',
          }}
        >
          Volgende →
        </button>
      </div>
      {vragen.length < 5 && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '12px' }}>Minimaal 5 vragen benodigd ({vragen.length}/5)</div>}
    </div>
  );
}

// ===================== STEP 5: REVIEW & EXPORT =====================
function Step5({ toets, doelen, vragen, matrijsData, klassen, onPrev, onComplete }: {
  toets: Partial<Toets>;
  doelen: Doel[];
  vragen: Vraag[];
  matrijsData: Record<number, { weten: number; doen: number; snappen: number }>;
  klassen: Klas[];
  onPrev: () => void;
  onComplete: () => void;
}) {
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  const getTotalWeten = () => Object.values(matrijsData).reduce((sum, d) => sum + d.weten, 0);
  const getTotalDoen = () => Object.values(matrijsData).reduce((sum, d) => sum + d.doen, 0);
  const getTotalSnappen = () => Object.values(matrijsData).reduce((sum, d) => sum + d.snappen, 0);
  const getTotalPoints = () => getTotalWeten() + getTotalDoen() + getTotalSnappen();

  const currentWetenPct = Math.round((getTotalWeten() / (getTotalPoints() || 1)) * 100);
  const currentDoenPct = Math.round((getTotalDoen() / (getTotalPoints() || 1)) * 100);
  const currentSnappenPct = Math.round((getTotalSnappen() / (getTotalPoints() || 1)) * 100);

  const targetWetenPct = toets.wds_weten_pct || 15;
  const targetDoenPct = toets.wds_doen_pct || 40;
  const targetSnappenPct = toets.wds_snappen_pct || 45;

  const wetenDeviation = Math.abs(currentWetenPct - targetWetenPct);
  const doenDeviation = Math.abs(currentDoenPct - targetDoenPct);
  const snappenDeviation = Math.abs(currentSnappenPct - targetSnappenPct);

  const checks = {
    minimalVragen: vragen.length >= 5,
    alleDoelen: doelen.every((d, idx) => vragen.some((v) => v.doel_id === idx)),
    wdsBalance: wetenDeviation <= 10 && doenDeviation <= 10 && snappenDeviation <= 10,
    alleVragenTekst: vragen.every((v) => v.vraag_tekst?.trim()),
    antwoordmodel: vragen.filter((v) => v.vraag_type === 'meerkeuze').length === 0 || vragen.filter((v) => v.vraag_type === 'meerkeuze').every((v) => v.antwoorden?.some((a) => a.is_correct)),
    totaalPunten: getTotalPoints() > 0,
  };

  const allChecksPassed = Object.values(checks).every((c) => c);

  const klas = klassen.find(k => k.id === toets.klas_id);
  const totalPoints = getTotalPoints();
  const totalTime = toets.tijd_minuten || Math.round(vragen.reduce((sum, v) => sum + (estimatedMinutesPerType[v.vraag_type] || 1), 0));

  function handlePrint(version: 'leerling' | 'antwoordmodel', previewOnly = false) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const toetsType = toetsLabels[toets.type || 'overig'];
    const datum = toets.datum
      ? new Date(toets.datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const isAntwoordmodel = version === 'antwoordmodel';

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${toets.naam}${isAntwoordmodel ? ' - Antwoordmodel' : ''}</title>
      <style>
        @page { margin: 1.8cm 2cm; size: A4 portrait; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; font-size: 11pt; line-height: 1.55; color: #222; }
        .header { margin-bottom: 22px; padding-bottom: 14px; border-bottom: 2.5px solid #1e3a5f; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .header-left { flex: 1; }
        .header-right { text-align: right; font-size: 9pt; color: #555; line-height: 1.7; }
        .title { font-size: 20pt; font-weight: 700; color: #1e3a5f; letter-spacing: -0.3px; margin-bottom: 2px; }
        .subtitle { font-size: 10pt; color: #555; font-weight: 400; }
        .antwoordmodel-badge { display: inline-block; background: #1e3a5f; color: white; font-size: 9pt; font-weight: 600; padding: 3px 12px; border-radius: 3px; margin-left: 10px; vertical-align: middle; letter-spacing: 0.5px; text-transform: uppercase; }
        .name-row { display: flex; gap: 20px; margin-bottom: 18px; padding: 10px 14px; background: #f5f7fa; border: 1px solid #dde1e8; border-radius: 4px; }
        .name-field { flex: 1; }
        .name-label { font-size: 8.5pt; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
        .name-line { border-bottom: 1.5px solid #999; height: 22px; }
        .instructions { margin-bottom: 20px; padding: 12px 16px; background: #fafbfc; border-left: 3px solid #1e3a5f; border-radius: 0 4px 4px 0; font-size: 9.5pt; color: #444; line-height: 1.7; }
        .instructions strong { color: #1e3a5f; }
        .instructions ul { margin: 4px 0 0 16px; padding: 0; }
        .instructions li { margin-bottom: 2px; }
        .question { margin-bottom: 20px; page-break-inside: avoid; }
        .q-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e8eaed; }
        .q-number { font-size: 10.5pt; font-weight: 700; color: #1e3a5f; white-space: nowrap; }
        .q-points { font-size: 8.5pt; color: #888; font-weight: 500; margin-left: auto; white-space: nowrap; }
        .q-text { font-size: 11pt; line-height: 1.6; margin-bottom: 8px; color: #222; }
        .q-bron { font-size: 9.5pt; color: #444; margin-bottom: 10px; padding: 8px 12px; background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 3px; font-style: italic; line-height: 1.5; }
        .mc-options { margin: 8px 0 4px 0; }
        .mc-option { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; font-size: 10.5pt; line-height: 1.5; }
        .mc-letter { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1.5px solid #aaa; border-radius: 50%; font-size: 9pt; font-weight: 600; color: #555; flex-shrink: 0; margin-top: 1px; }
        .mc-letter-correct { background: #1e3a5f; color: white; border-color: #1e3a5f; }
        .mc-text { flex: 1; padding-top: 1px; }
        .wo-row { display: flex; gap: 24px; margin: 8px 0; }
        .wo-option { display: flex; align-items: center; gap: 8px; font-size: 10.5pt; }
        .wo-circle { width: 18px; height: 18px; border: 1.5px solid #aaa; border-radius: 50%; flex-shrink: 0; }
        .wo-circle-correct { background: #1e3a5f; border-color: #1e3a5f; }
        .koppel-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
        .koppel-table th { background: #f0f2f5; font-size: 8.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #555; padding: 6px 10px; text-align: left; border: 1px solid #ddd; }
        .koppel-table td { padding: 7px 10px; border: 1px solid #ddd; vertical-align: top; }
        .answer-space { margin: 8px 0; }
        .answer-line { border-bottom: 1px dotted #bbb; height: 28px; }
        .answer-model { margin-top: 8px; padding: 10px 14px; background: #f0faf4; border: 1px solid #b8e6cc; border-left: 4px solid #2d8a4e; border-radius: 0 4px 4px 0; page-break-inside: avoid; }
        .answer-model-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .answer-model-label { font-size: 8.5pt; font-weight: 700; color: #2d8a4e; text-transform: uppercase; letter-spacing: 0.8px; }
        .answer-model-text { font-size: 10pt; color: #333; line-height: 1.6; }
        .wds-badge { font-size: 8pt; padding: 2px 8px; border-radius: 3px; font-weight: 600; color: white; }
        .summary-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 16px 0; }
        .summary-table th { background: #1e3a5f; color: white; font-size: 8.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; }
        .summary-table td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
        .summary-table tr:nth-child(even) td { background: #f9fafb; }
        .summary-table .pts { text-align: center; font-weight: 600; }
      </style></head><body>`;

    // HEADER
    html += `<div class="header"><div class="header-top">
      <div class="header-left">
        <div class="title">${toets.naam}${isAntwoordmodel ? '<span class="antwoordmodel-badge">Antwoordmodel</span>' : ''}</div>
        <div class="subtitle">${toetsType} &mdash; ${klas?.vak || ''}</div>
      </div>
      <div class="header-right">
        <div><strong>Klas:</strong> ${klas?.naam || 'Onbekend'}</div>
        <div><strong>Datum:</strong> ${datum}</div>
        <div><strong>Tijd:</strong> ~${totalTime} minuten</div>
        <div><strong>Totaal:</strong> ${totalPoints} punten</div>
      </div>
    </div></div>`;

    // NAAMVELD (alleen leerlingversie)
    if (!isAntwoordmodel) {
      html += `<div class="name-row">
        <div class="name-field"><div class="name-label">Naam</div><div class="name-line"></div></div>
        <div class="name-field"><div class="name-label">Klas</div><div class="name-line"></div></div>
        <div class="name-field" style="flex:0.5"><div class="name-label">Nr.</div><div class="name-line"></div></div>
        <div class="name-field" style="flex:0.5"><div class="name-label">Cijfer</div><div class="name-line"></div></div>
      </div>`;
    }

    // INSTRUCTIES (alleen leerlingversie)
    if (!isAntwoordmodel) {
      html += `<div class="instructions">
        <strong>Instructies</strong>
        <ul>
          <li>Deze toets bestaat uit <strong>${vragen.length} vragen</strong> en telt <strong>${totalPoints} punten</strong>.</li>
          <li>Lees elke vraag zorgvuldig voordat je antwoord geeft.</li>
          <li>Schrijf duidelijk en leesbaar. Onleesbare antwoorden worden niet beoordeeld.</li>
          ${vragen.some(v => v.vraag_type === 'meerkeuze') ? '<li>Bij meerkeuzevragen: omcirkel het juiste antwoord of vul de letter in.</li>' : ''}
          ${vragen.some(v => v.vraag_type === 'open_lang') ? '<li>Bij open vragen: gebruik volledige zinnen tenzij anders aangegeven.</li>' : ''}
        </ul>
      </div>`;
    }

    // OVERZICHTSTABEL (alleen antwoordmodel)
    if (isAntwoordmodel) {
      html += `<div style="margin-bottom:20px">
        <table class="summary-table"><thead><tr>
          <th>Nr.</th><th>Vraagtype</th><th>WDS</th><th style="text-align:center">Punten</th><th>Antwoord (kort)</th>
        </tr></thead><tbody>`;
      vragen.forEach((v, idx) => {
        const typeL = vraagTypes.find(t => t.key === v.vraag_type)?.label || v.vraag_type;
        const wdsColor = v.wds_niveau === 'weten' ? '#60a5fa' : v.wds_niveau === 'doen' ? '#34d399' : '#f59e0b';
        const wdsLabel = v.wds_niveau === 'weten' ? 'Weten' : v.wds_niveau === 'doen' ? 'Doen' : 'Snappen';
        const shortAnswer = v.antwoord_model ? v.antwoord_model.substring(0, 50) + (v.antwoord_model.length > 50 ? '...' : '') : '-';
        html += `<tr>
          <td>${idx + 1}</td><td>${typeL}</td>
          <td><span style="display:inline-block;background:${wdsColor};color:white;padding:1px 8px;border-radius:3px;font-size:8.5pt;font-weight:600">${wdsLabel}</span></td>
          <td class="pts">${v.punten}</td><td style="font-size:9pt;color:#555">${shortAnswer}</td>
        </tr>`;
      });
      html += `<tr style="font-weight:700;border-top:2px solid #1e3a5f">
        <td colspan="3">Totaal</td><td class="pts">${totalPoints}</td><td></td>
      </tr></tbody></table></div>`;
    }

    // VRAGEN
    vragen.forEach((vraag, idx) => {
      html += `<div class="question">`;
      html += `<div class="q-header">
        <span class="q-number">Vraag ${idx + 1}</span>
        <span class="q-points">${vraag.punten} ${vraag.punten === 1 ? 'punt' : 'punten'}</span>
      </div>`;

      if (vraag.bron_tekst) {
        html += `<div class="q-bron">${vraag.bron_tekst}</div>`;
      }
      html += `<div class="q-text">${vraag.vraag_tekst}</div>`;

      if (vraag.vraag_type === 'meerkeuze') {
        html += `<div class="mc-options">`;
        (vraag.antwoorden || []).forEach((a, i) => {
          const letter = String.fromCharCode(65 + i);
          const isCorrect = isAntwoordmodel && a.is_correct;
          html += `<div class="mc-option">
            <span class="mc-letter ${isCorrect ? 'mc-letter-correct' : ''}">${letter}</span>
            <span class="mc-text">${a.antwoord_tekst}</span>
          </div>`;
        });
        html += `</div>`;
      } else if (vraag.vraag_type === 'waar_onwaar') {
        const correctAntwoord = (vraag.antwoorden || []).find(a => a.is_correct);
        html += `<div class="wo-row">
          <div class="wo-option">
            <span class="wo-circle ${isAntwoordmodel && correctAntwoord?.antwoord_tekst === 'Waar' ? 'wo-circle-correct' : ''}"></span>
            <span>Waar</span>
          </div>
          <div class="wo-option">
            <span class="wo-circle ${isAntwoordmodel && correctAntwoord?.antwoord_tekst === 'Onwaar' ? 'wo-circle-correct' : ''}"></span>
            <span>Onwaar</span>
          </div>
        </div>`;
      } else if (vraag.vraag_type === 'koppel') {
        html += `<table class="koppel-table"><thead><tr><th style="width:45%">Term</th><th style="width:10%"></th><th style="width:45%">${isAntwoordmodel ? 'Koppeling' : 'Antwoord'}</th></tr></thead><tbody>`;
        (vraag.antwoorden || []).forEach(a => {
          html += `<tr><td>${a.antwoord_tekst}</td><td style="text-align:center;color:#999">&rarr;</td><td>${isAntwoordmodel ? (a.koppel_tekst || '') : ''}</td></tr>`;
        });
        html += `</tbody></table>`;
      } else if (vraag.vraag_type === 'invul') {
        if (!isAntwoordmodel) {
          html += `<div class="answer-space"><div class="answer-line"></div></div>`;
        }
      } else if (vraag.vraag_type === 'open_kort') {
        if (!isAntwoordmodel) {
          html += `<div class="answer-space"><div class="answer-line"></div><div class="answer-line"></div><div class="answer-line"></div></div>`;
        }
      } else if (vraag.vraag_type === 'open_lang') {
        if (!isAntwoordmodel) {
          html += `<div class="answer-space">`;
          for (let i = 0; i < 8; i++) html += `<div class="answer-line"></div>`;
          html += `</div>`;
        }
      }

      // Antwoordmodel per vraag
      if (isAntwoordmodel && (vraag.antwoord_model || vraag.vraag_type === 'meerkeuze' || vraag.vraag_type === 'waar_onwaar')) {
        const wdsColor = vraag.wds_niveau === 'weten' ? '#60a5fa' : vraag.wds_niveau === 'doen' ? '#34d399' : '#f59e0b';
        const wdsLabel = vraag.wds_niveau === 'weten' ? 'Weten' : vraag.wds_niveau === 'doen' ? 'Doen' : 'Snappen';
        html += `<div class="answer-model">
          <div class="answer-model-header">
            <span class="answer-model-label">Antwoord</span>
            <span class="wds-badge" style="background:${wdsColor}">${wdsLabel}</span>
          </div>`;

        if (vraag.vraag_type === 'meerkeuze') {
          const correct = (vraag.antwoorden || []).find(a => a.is_correct);
          const correctIdx = (vraag.antwoorden || []).findIndex(a => a.is_correct);
          html += `<div class="answer-model-text"><strong>${String.fromCharCode(65 + correctIdx)}</strong>. ${correct?.antwoord_tekst || ''}</div>`;
        } else if (vraag.vraag_type === 'waar_onwaar') {
          const correct = (vraag.antwoorden || []).find(a => a.is_correct);
          html += `<div class="answer-model-text"><strong>${correct?.antwoord_tekst || ''}</strong></div>`;
        }

        if (vraag.antwoord_model) {
          html += `<div class="answer-model-text" style="margin-top:4px">${vraag.antwoord_model}</div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    });

    // PUNTENTELLING (alleen leerlingversie)
    if (!isAntwoordmodel) {
      html += `<div style="margin-top:30px;padding-top:16px;border-top:2px solid #1e3a5f">
        <table style="width:100%;border-collapse:collapse;font-size:10pt">
          <tr><td style="padding:6px 0;font-weight:600;color:#1e3a5f">Totaal behaald</td>
          <td style="padding:6px 0;text-align:right;font-size:9pt;color:#888">_____ / ${totalPoints} punten</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;color:#1e3a5f">Cijfer</td>
          <td style="padding:6px 0;text-align:right;font-size:9pt;color:#888">_____</td></tr>
        </table>
      </div>`;
    }

    html += `</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    if (!previewOnly) {
      setTimeout(() => printWindow.print(), 200);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', color: '#1e3a5f' }}>Stap 5: Review & Afronden</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f' }}>Doel-verdeling</h3>
          <WDSBar weten={targetWetenPct} doen={targetDoenPct} snappen={targetSnappenPct} />
        </div>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f' }}>Huidige verdeling</h3>
          <WDSBar weten={currentWetenPct} doen={currentDoenPct} snappen={currentSnappenPct} />
        </div>
      </div>

      <div style={{ backgroundColor: '#f7f8fa', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f', margin: '0 0 12px 0' }}>Kwaliteitschecklist</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { check: checks.minimalVragen, label: `Minimaal 5 vragen (${vragen.length}/5)`, warn: false },
            { check: checks.alleDoelen, label: 'Alle doelen hebben vragen', warn: false },
            { check: checks.wdsBalance, label: 'WDS-verdeling binnen 10% van doel', warn: true },
            { check: checks.alleVragenTekst, label: 'Alle vragen hebben tekst', warn: false },
            { check: checks.antwoordmodel, label: 'Meerkeuze vragen hebben correct antwoord', warn: false },
            { check: checks.totaalPunten, label: `Totaal punten > 0 (${getTotalPoints()})`, warn: false },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <span style={{ color: item.check ? '#34d399' : item.warn ? '#f59e0b' : '#ef4444', fontWeight: '600' }}>
                {item.check ? '✓' : item.warn ? '⚠' : '✗'}
              </span>
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: '#EEF2FF', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f', margin: '0 0 12px 0' }}>Toets samenvatting</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
          <div><span style={{ color: '#666' }}>Naam:</span> {toets.naam}</div>
          <div><span style={{ color: '#666' }}>Type:</span> {toetsLabels[toets.type || 'overig']}</div>
          <div><span style={{ color: '#666' }}>Datum:</span> {toets.datum}</div>
          <div><span style={{ color: '#666' }}>Tijd:</span> {totalTime} minuten</div>
          <div><span style={{ color: '#666' }}>Doelen:</span> {doelen.length}</div>
          <div><span style={{ color: '#666' }}>Vragen:</span> {vragen.length}</div>
          <div><span style={{ color: '#666' }}>Totaal punten:</span> {totalPoints}</div>
          <div><span style={{ color: '#666' }}>Cesuur:</span> {Math.round((toets.cesuur_percentage || 0.6) * 100)}% ({toets.cesuur_cijfer})</div>
        </div>
      </div>

      {/* Print knoppen */}
      <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e3a5f', margin: '0 0 12px 0' }}>Afdrukken</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button onClick={() => handlePrint('leerling', true)} style={{ padding: '12px', background: '#f7f8fa', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#333', textAlign: 'left' }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>Voorbeeld leerlingversie</div>
            <div style={{ fontSize: '11px', color: '#888' }}>Bekijk hoe de toets eruitziet voor leerlingen</div>
          </button>
          <button onClick={() => handlePrint('antwoordmodel', true)} style={{ padding: '12px', background: '#f7f8fa', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#333', textAlign: 'left' }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>Voorbeeld antwoordmodel</div>
            <div style={{ fontSize: '11px', color: '#888' }}>Bekijk het antwoordmodel met WDS-niveaus</div>
          </button>
          <button onClick={() => handlePrint('leerling')} style={{ padding: '12px', background: '#1e3a5f', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'white' }}>
            Print leerlingversie
          </button>
          <button onClick={() => handlePrint('antwoordmodel')} style={{ padding: '12px', background: '#1e3a5f', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'white' }}>
            Print antwoordmodel
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <button onClick={onPrev} style={{ padding: '10px 20px', backgroundColor: '#999', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          ← Vorige
        </button>
        <button
          onClick={onComplete}
          disabled={!allChecksPassed}
          style={{
            padding: '12px 24px',
            backgroundColor: allChecksPassed ? '#2d8a4e' : '#999',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: allChecksPassed ? 'pointer' : 'not-allowed',
          }}
        >
          Toets afronden
        </button>
      </div>
    </div>
  );
}

// ===================== PROGRESS BAR =====================
function ProgressBar({ currentStep }: { currentStep: number }) {
  const steps = ['Basisgegevens', 'Doelen', 'Matrijs', 'Vragen', 'Review'];
  return (
    <div style={{ padding: '16px 24px', backgroundColor: '#fff', borderBottom: '1px solid #d0d0d0', marginBottom: '0' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {steps.map((step, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: idx < currentStep ? '#2B5BA0' : idx === currentStep ? '#2B5BA0' : '#e0e0e0',
                  color: idx < currentStep || idx === currentStep ? '#fff' : '#999',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600',
                  fontSize: '14px',
                  flexShrink: 0,
                }}
              >
                {idx < currentStep ? '✓' : idx + 1}
              </div>
              <span style={{ marginLeft: '12px', fontSize: '12px', fontWeight: '600', color: idx <= currentStep ? '#1e3a5f' : '#999' }}>{step}</span>
              {idx < steps.length - 1 && (
                <div style={{ flex: 1, height: '2px', backgroundColor: idx < currentStep ? '#2B5BA0' : '#e0e0e0', margin: '0 12px' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================== MAIN PAGE COMPONENT =====================
function ToetsenMakerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toetsId = searchParams.get('id');

  const [currentStep, setCurrentStep] = useState(1);
  const [toets, setToets] = useState<Partial<Toets>>({
    klas_id: undefined,
    naam: '',
    type: '',
    datum: new Date().toISOString().split('T')[0],
    cesuur_percentage: 0.6,
    cesuur_cijfer: 5.5,
    wizard_stap: 1,
    tijd_minuten: 45,
    wds_weten_pct: 15,
    wds_doen_pct: 40,
    wds_snappen_pct: 45,
  });
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [doelen, setDoelen] = useState<Doel[]>([]);
  const [vragen, setVragen] = useState<Vraag[]>([]);
  const [matrijsData, setMatrijsData] = useState<Record<number, { weten: number; doen: number; snappen: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const klasRes = await fetch('/api/klassen');
        if (klasRes.ok) {
          const klasData = await klasRes.json();
          setKlassen(klasData);
        }

        if (toetsId) {
          const toetsRes = await fetch(`/api/toetsen?id=${toetsId}`);
          if (toetsRes.ok) {
            const toetsData = await toetsRes.json();
            setToets(toetsData[0]);
            setCurrentStep(toetsData[0].wizard_stap || 1);

            const doelRes = await fetch(`/api/toets-doelen?toets_id=${toetsId}`);
            if (doelRes.ok) {
              const doelData = await doelRes.json();
              setDoelen(doelData);
              // Initialize matrijsData from saved doelen
              const mData: Record<number, { weten: number; doen: number; snappen: number }> = {};
              doelData.forEach((d: Doel, idx: number) => {
                mData[idx] = { weten: d.weten_punten || 0, doen: d.doen_punten || 0, snappen: d.snappen_punten || 0 };
              });
              setMatrijsData(mData);
            }

            const vragenRes = await fetch(`/api/toets-vragen?toets_id=${toetsId}`);
            if (vragenRes.ok) {
              const vragenData = await vragenRes.json();
              setVragen(vragenData);
            }
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [toetsId]);

  const handleSaveAndNext = async (nextStep: number) => {
    setSaving(true);
    try {
      let savedToets = toets;

      if (toets.id) {
        // Update existing toets
        await fetch('/api/toetsen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...toets, wizard_stap: nextStep }),
        });
        savedToets = { ...toets, wizard_stap: nextStep };
      } else {
        // Create new toets
        const res = await fetch('/api/toetsen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...toets,
            wizard_stap: nextStep,
            kleur: toetsKleuren[toets.type || 'overig'] || '#8b95a5',
          }),
        });
        if (res.ok) {
          savedToets = await res.json();
          // Update URL without reload
          window.history.replaceState(null, '', `/toetsen/maker?id=${savedToets.id}`);
        }
      }

      setToets(savedToets);
      const toetsIdToUse = savedToets.id;

      if (toetsIdToUse && doelen.length > 0) {
        // Merge matrijsData into doelen before saving
        const doelenToSave = doelen.map((d, idx) => ({
          ...d,
          toets_id: toetsIdToUse,
          volgorde: idx,
          weten_punten: matrijsData[idx]?.weten ?? d.weten_punten ?? 0,
          doen_punten: matrijsData[idx]?.doen ?? d.doen_punten ?? 0,
          snappen_punten: matrijsData[idx]?.snappen ?? d.snappen_punten ?? 0,
        }));

        const savedDoelen: Doel[] = [];
        for (const d of doelenToSave) {
          const method = d.id ? 'PUT' : 'POST';
          const res = await fetch('/api/toets-doelen', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d),
          });
          if (res.ok) {
            const saved = await res.json();
            savedDoelen.push(method === 'POST' ? saved : d);
          }
        }
        if (savedDoelen.length > 0) setDoelen(savedDoelen);
      }

      if (toetsIdToUse && vragen.length > 0) {
        for (let idx = 0; idx < vragen.length; idx++) {
          const v = vragen[idx];
          await fetch('/api/toets-vragen', {
            method: v.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...v, toets_id: toetsIdToUse, volgorde: idx }),
          });
        }
      }

      setCurrentStep(nextStep);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      if (toets.id) {
        await fetch('/api/toetsen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...toets, wizard_stap: 5 }),
        });
      }
      router.push('/toetsen');
    } catch (error) {
      console.error('Error completing:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f7f8fa' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '16px' }}>Toets Wizard</div>
          <div style={{ color: '#666' }}>Laden...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f7f8fa', minHeight: '100vh' }}>
      <ProgressBar currentStep={currentStep} />

      <div style={{ paddingBottom: '40px' }}>
        {currentStep === 1 && <Step1 toets={toets} setToets={setToets} klassen={klassen} onNext={() => handleSaveAndNext(2)} />}
        {currentStep === 2 && <Step2 toets={toets} doelen={doelen} setDoelen={setDoelen} klassen={klassen} onPrev={() => setCurrentStep(1)} onNext={() => handleSaveAndNext(3)} />}
        {currentStep === 3 && <Step3 toets={toets} doelen={doelen} matrijsData={matrijsData} setMatrijsData={setMatrijsData} onPrev={() => setCurrentStep(2)} onNext={() => handleSaveAndNext(4)} />}
        {currentStep === 4 && <Step4 toets={toets} doelen={doelen} matrijsData={matrijsData} vragen={vragen} setVragen={setVragen} onPrev={() => setCurrentStep(3)} onNext={() => handleSaveAndNext(5)} />}
        {currentStep === 5 && <Step5 toets={toets} doelen={doelen} vragen={vragen} matrijsData={matrijsData} klassen={klassen} onPrev={() => setCurrentStep(4)} onComplete={handleComplete} />}
      </div>

      {saving && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#2B5BA0', color: '#fff', padding: '12px 16px', borderRadius: '6px', fontSize: '13px' }}>
          Aan het opslaan...
        </div>
      )}
    </div>
  );
}

export default function ToetsenMakerPage() {
  return (
    <Suspense fallback={<div>Laden...</div>}>
      <ToetsenMakerContent />
    </Suspense>
  );
}
