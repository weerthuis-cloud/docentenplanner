'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/* ───── Types ───── */
interface Klas {
  id: number;
  naam: string;
  vak: string;
  jaarlaag: string;
  lokaal: string;
  aantal_leerlingen: number;
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
  bloom_niveau: 'onthouden' | 'begrijpen' | 'toepassen' | 'analyseren' | 'evalueren' | 'creeren';
  punten: number;
  volgorde: number;
  bron_tekst: string;
  antwoord_model: string;
  antwoorden: Antwoord[];
}

interface GeneratedQuestion {
  vraag_tekst: string;
  vraag_type: 'meerkeuze' | 'open_kort' | 'open_lang' | 'invul' | 'koppel' | 'waar_onwaar';
  bloom_niveau: 'onthouden' | 'begrijpen' | 'toepassen' | 'analyseren' | 'evalueren' | 'creeren';
  punten: number;
  antwoorden?: Antwoord[];
}

/* ───── Constants ───── */
const toetsKleuren: Record<string, string> = {
  PW: '#c95555',
  SO: '#c4892e',
  PO: '#8b5ec0',
  MO: '#2d8a4e',
  SE: '#4a80d4',
  overig: '#8b95a5',
};

const toetsLabels: Record<string, string> = {
  PW: 'Proefwerk',
  SO: 'Schriftelijke overhoring',
  PO: 'Praktische opdracht',
  MO: 'Mondeling',
  SE: 'Schoolexamen',
  overig: 'Overig',
};

const klasKleuren = ['#2d8a4e', '#4a80d4', '#8b5ec0', '#c95555', '#c4892e', '#2ba0b0', '#b04e7a', '#6060c0'];

const bloomColors: Record<string, string> = {
  onthouden: '#94a3b8',
  begrijpen: '#60a5fa',
  toepassen: '#34d399',
  analyseren: '#fbbf24',
  evalueren: '#f97316',
  creeren: '#ef4444',
};

const bloomLabels: Record<string, string> = {
  onthouden: 'Onthouden',
  begrijpen: 'Begrijpen',
  toepassen: 'Toepassen',
  analyseren: 'Analyseren',
  evalueren: 'Evalueren',
  creeren: 'Creëren',
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

/* ───── Page Content ───── */
function ToetsenMakerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toetsId = searchParams.get('id');

  const [toets, setToets] = useState<Toets | null>(null);
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [vragen, setVragen] = useState<Vraag[]>([]);
  const [expandedVraagId, setExpandedVraagId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // AI States
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiForm, setAiForm] = useState({
    onderwerp: '',
    aantalVragen: 5,
    vraagTypes: {
      meerkeuze: true,
      open_kort: true,
      open_lang: true,
      invul: true,
      koppel: false,
      waar_onwaar: false,
    },
    bloomVerdeling: 'mix',
    extraInstructies: '',
  });
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [selectedGenerated, setSelectedGenerated] = useState<Set<number>>(new Set());

  // Print state
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  useEffect(() => {
    if (!toetsId) return;
    fetchData();
  }, [toetsId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [toetsenRes, klassenRes, vragenRes] = await Promise.all([
        fetch(`/api/toetsen?id=${toetsId}`),
        fetch('/api/klassen'),
        fetch(`/api/toets-vragen?toets_id=${toetsId}`),
      ]);

      const toetsenData = await toetsenRes.json();
      setToets(toetsenData[0] || null);
      const klassenData = await klassenRes.json();
      setKlassen(klassenData || []);
      const vragenData = await vragenRes.json();
      setVragen(vragenData || []);
    } catch (e) {
      console.error('Error loading toets:', e);
    } finally {
      setLoading(false);
    }
  }

  const klas = klassen.find((k) => k.id === toets?.klas_id);
  const klasKleur = klas ? klasKleuren[klassen.indexOf(klas) % klasKleuren.length] : '#999';

  /* ───── Calculate Stats ───── */
  const stats = useMemo(() => {
    const totalPoints = vragen.reduce((sum, v) => sum + v.punten, 0);
    const totalTime = vragen.reduce((sum, v) => sum + (estimatedMinutesPerType[v.vraag_type] || 1), 0);
    const bloomDist: Record<string, { count: number; points: number; percentage: number }> = {};
    const typeDist: Record<string, number> = {};

    Object.keys(bloomLabels).forEach((level) => {
      bloomDist[level] = { count: 0, points: 0, percentage: 0 };
    });

    vragen.forEach((v) => {
      bloomDist[v.bloom_niveau].count += 1;
      bloomDist[v.bloom_niveau].points += v.punten;
      typeDist[v.vraag_type] = (typeDist[v.vraag_type] || 0) + 1;
    });

    Object.keys(bloomDist).forEach((level) => {
      bloomDist[level].percentage = totalPoints > 0 ? Math.round((bloomDist[level].points / totalPoints) * 100) : 0;
    });

    return { totalPoints, totalTime, bloomDist, typeDist };
  }, [vragen]);

  /* ───── Save Question ───── */
  async function saveVraag(vraag: Vraag) {
    try {
      setSaving(true);
      if (vraag.id) {
        // Update
        await fetch('/api/toets-vragen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vraag),
        });
      } else {
        // Create new with volgorde
        const newVraag = {
          ...vraag,
          volgorde: vragen.length,
        };
        const res = await fetch('/api/toets-vragen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newVraag),
        });
        const created = await res.json();
        vraag.id = created.id;
      }
      // Refresh vragen
      const res = await fetch(`/api/toets-vragen?toets_id=${toetsId}`);
      setVragen(await res.json());
    } finally {
      setSaving(false);
    }
  }

  async function deleteVraag(vraagId: number | undefined) {
    if (!vraagId) return;
    try {
      setSaving(true);
      await fetch(`/api/toets-vragen?id=${vraagId}`, { method: 'DELETE' });
      setVragen(vragen.filter((v) => v.id !== vraagId));
      setExpandedVraagId(null);
    } finally {
      setSaving(false);
    }
  }

  async function moveVraag(index: number, direction: 'up' | 'down') {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === vragen.length - 1)) return;
    const newVragen = [...vragen];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newVragen[index], newVragen[targetIndex]] = [newVragen[targetIndex], newVragen[index]];
    setVragen(newVragen);
    // Update all volgorde values
    await Promise.all(
      newVragen.map((v, i) =>
        fetch('/api/toets-vragen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...v, volgorde: i }),
        })
      )
    );
  }

  /* ───── AI Generation ───── */
  async function generateAIQuestions() {
    if (!aiForm.onderwerp.trim()) {
      setAiError('Vul een onderwerp in');
      return;
    }

    try {
      setAiError('');
      setAiLoading(true);

      const enabledTypes = Object.entries(aiForm.vraagTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type]) => type);

      if (enabledTypes.length === 0) {
        setAiError('Selecteer minstens één vraagtype');
        return;
      }

      const res = await fetch('/api/toets-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vak: klas?.vak || '',
          onderwerp: aiForm.onderwerp,
          niveau: klas?.jaarlaag || '',
          aantalVragen: aiForm.aantalVragen,
          vraagTypes: enabledTypes,
          bloomVerdeling: aiForm.bloomVerdeling,
          extraInstructies: aiForm.extraInstructies,
        }),
      });

      const data = await res.json();

      if (res.status === 400 && data.error?.includes('ANTHROPIC_API_KEY')) {
        setAiError('AI is nog niet geconfigureerd. Voeg een ANTHROPIC_API_KEY toe aan je Vercel environment variables.');
      } else if (!res.ok) {
        setAiError(data.error || 'Fout bij genereren van vragen');
      } else {
        setGeneratedQuestions(data.questions || []);
        setSelectedGenerated(new Set(Array.from({ length: (data.questions || []).length }, (_, i) => i)));
      }
    } catch (e) {
      setAiError('Fout bij verbinden met AI');
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  }

  async function addGeneratedQuestions() {
    if (selectedGenerated.size === 0 || !toetsId) return;

    try {
      setSaving(true);
      const questionsToAdd = Array.from(selectedGenerated).map((idx) => ({
        ...generatedQuestions[idx],
        toets_id: Number(toetsId),
        volgorde: vragen.length + idx,
      }));

      await fetch('/api/toets-vragen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionsToAdd),
      });

      // Refresh
      const res = await fetch(`/api/toets-vragen?toets_id=${toetsId}`);
      setVragen(await res.json());
      setGeneratedQuestions([]);
      setSelectedGenerated(new Set());
    } finally {
      setSaving(false);
    }
  }

  /* ───── Print ───── */
  function handlePrint(version: 'leerling' | 'antwoordmodel') {
    if (!toets) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${toets.naam}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; line-height: 1.6; color: #333; }
          .header { margin-bottom: 30px; border-bottom: 2px solid #1e3a5f; padding-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #1e3a5f; margin: 0; }
          .meta { font-size: 13px; color: #666; margin-top: 8px; }
          .klas-badge { display: inline-block; background: ${klasKleur}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-right: 10px; }
          .question { margin: 25px 0; page-break-inside: avoid; }
          .q-number { font-weight: 600; color: #1e3a5f; margin-bottom: 5px; }
          .q-text { margin: 8px 0; }
          .q-type { font-size: 11px; color: #999; margin: 5px 0; }
          .bloom-badge { display: inline-block; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #666; margin: 0 5px 0 0; }
          .points { display: inline-block; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #666; }
          .answer-lines { margin-top: 15px; }
          .answer-line { border-bottom: 1px solid #999; height: 20px; margin: 10px 0; }
          .antwoord { margin-top: 10px; padding: 10px; background: #f9f9f9; border-left: 3px solid ${klasKleur}; }
          .antwoord-text { font-size: 14px; color: #333; }
          .page-break { page-break-after: always; }
          .footer { font-size: 11px; color: #999; margin-top: 30px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${toets.naam}</div>
          <div class="meta">
            <span class="klas-badge">${klas?.naam || 'Onbekend'}</span>
            <span>${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
    `;

    vragen.forEach((vraag, idx) => {
      const typeLabel = vraagTypes.find((t) => t.key === vraag.vraag_type)?.label || vraag.vraag_type;
      html += `
        <div class="question">
          <div class="q-number">Vraag ${idx + 1}</div>
          <div class="q-text">${vraag.vraag_tekst}</div>
          <div class="q-type">
            <span class="bloom-badge">${bloomLabels[vraag.bloom_niveau]}</span>
            <span class="points">${vraag.punten} pt.</span>
          </div>
      `;

      if (vraag.vraag_type === 'meerkeuze') {
        html += `<div class="answer-lines">`;
        vraag.antwoorden.forEach((a, i) => {
          const letter = String.fromCharCode(65 + i);
          html += `<div class="answer-line"><strong>${letter}.</strong> ${a.antwoord_tekst}</div>`;
        });
        html += `</div>`;
      } else if (vraag.vraag_type === 'waar_onwaar') {
        html += `<div class="answer-lines"><strong>Waar</strong> / <strong>Onwaar</strong></div>`;
      } else {
        html += `<div class="answer-lines"><div class="answer-line"></div><div class="answer-line"></div></div>`;
      }

      if (version === 'antwoordmodel' && vraag.antwoord_model) {
        html += `<div class="antwoord"><strong>Antwoord:</strong><div class="antwoord-text">${vraag.antwoord_model}</div></div>`;
      }

      html += `</div>`;
    });

    html += `<div class="footer">Gegenereerd met docentenplanner</div></body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 100);
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontSize: '16px',
          color: '#666',
        }}
      >
        Toets laden...
      </div>
    );
  }

  if (!toets) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#666',
        }}
      >
        <div style={{ fontSize: '18px', marginBottom: '20px' }}>Toets niet gevonden</div>
        <button
          onClick={() => router.push('/toetsen')}
          style={{
            padding: '10px 20px',
            background: '#1e3a5f',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Terug naar toetsen
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f7f8fa' }}>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => router.push('/toetsen')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#1e3a5f',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#f0f0f0')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'none')}
          >
            ← Terug naar toetsen
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e3a5f' }}>{toets.naam}</div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              <span
                style={{
                  display: 'inline-block',
                  background: klasKleur,
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  marginRight: '10px',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                {klas?.naam}
              </span>
              <span style={{ marginRight: '20px' }}>{vragen.length} vragen</span>
              <span style={{ marginRight: '20px' }}>{stats.totalPoints} punten</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPrintMenu(!showPrintMenu)}
              style={{
                padding: '8px 16px',
                background: '#1e3a5f',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              🖨️ Print
            </button>
            {showPrintMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  zIndex: 100,
                  minWidth: '180px',
                }}
              >
                <button
                  onClick={() => {
                    handlePrint('leerling');
                    setShowPrintMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 16px',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#f9fafb')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'none')}
                >
                  Print leerlingversie
                </button>
                <button
                  onClick={() => {
                    handlePrint('antwoordmodel');
                    setShowPrintMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 16px',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#f9fafb')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'none')}
                >
                  Print antwoordmodel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel: Question List */}
        <div
          style={{
            flex: '0 0 65%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #e5e7eb',
            background: '#f7f8fa',
          }}
        >
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '20px 24px',
            }}
          >
            {vragen.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: '#999',
                  paddingTop: '40px',
              }}
              >
                <div style={{ fontSize: '14px', marginBottom: '10px' }}>Nog geen vragen</div>
                <div style={{ fontSize: '12px' }}>Klik op het + pictogram om een vraag toe te voegen</div>
              </div>
            ) : (
              vragen.map((vraag, idx) => (
                <VraagCard
                  key={vraag.id || idx}
                  vraag={vraag}
                  index={idx}
                  isExpanded={expandedVraagId === (vraag.id || idx)}
                  onToggleExpand={() =>
                    setExpandedVraagId(expandedVraagId === (vraag.id || idx) ? null : (vraag.id || idx))
                  }
                  onSave={(updated) => saveVraag(updated)}
                  onDelete={() => deleteVraag(vraag.id)}
                  onMoveUp={() => moveVraag(idx, 'up')}
                  onMoveDown={() => moveVraag(idx, 'down')}
                  totalQuestions={vragen.length}
                />
              ))
            )}

            {/* Add Question Button */}
            <button
              onClick={async () => {
                const newVraag: Vraag = {
                  toets_id: Number(toetsId),
                  vraag_tekst: '',
                  vraag_type: 'open_kort',
                  bloom_niveau: 'begrijpen',
                  punten: 1,
                  volgorde: vragen.length,
                  bron_tekst: '',
                  antwoord_model: '',
                  antwoorden: [],
                };
                setVragen([...vragen, newVraag]);
                setExpandedVraagId(vragen.length);
              }}
              style={{
                marginTop: '20px',
                width: '100%',
                padding: '30px 20px',
                border: '2px dashed #ccc',
                background: 'transparent',
                borderRadius: '14px',
                cursor: 'pointer',
                fontSize: '24px',
                color: '#999',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.borderColor = '#1e3a5f';
                (e.target as HTMLElement).style.color = '#1e3a5f';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.borderColor = '#ccc';
                (e.target as HTMLElement).style.color = '#999';
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Right Panel: Sidebar */}
        <div
          style={{
            flex: '0 0 35%',
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            borderLeft: '1px solid #e5e7eb',
            overflow: 'auto',
          }}
        >
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            {/* Overzicht */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f', margin: '0 0 12px 0', textTransform: 'uppercase' }}>Overzicht</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e3a5f' }}>{vragen.length}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>vragen</div>
                </div>
                <div
                  style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e3a5f' }}>{stats.totalPoints}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>punten</div>
                </div>
              </div>
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f' }}>~{Math.round(stats.totalTime)} min</div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>geschatte tijd</div>
              </div>
            </div>

            {/* Bloom Verdeling */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f', margin: '0 0 12px 0', textTransform: 'uppercase' }}>Bloom Verdeling</h3>

              {/* Stacked bar */}
              <div
                style={{
                  display: 'flex',
                  height: '24px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  marginBottom: '12px',
                  background: '#f0f0f0',
                }}
              >
                {Object.entries(stats.bloomDist).map(([level, data]) =>
                  data.points > 0 ? (
                    <div
                      key={level}
                      style={{
                        flex: data.points,
                        background: bloomColors[level],
                        minWidth: '2px',
                      }}
                      title={`${bloomLabels[level]}: ${data.percentage}%`}
                    />
                  ) : null
                )}
              </div>

              {/* Legend */}
              <div style={{ fontSize: '12px' }}>
                {Object.entries(stats.bloomDist).map(([level, data]) => (
                  <div
                    key={level}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        background: bloomColors[level],
                        borderRadius: '3px',
                      }}
                    />
                    <span style={{ color: '#666' }}>
                      {bloomLabels[level]}: {data.count} ({data.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Vraagtype Verdeling */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f', margin: '0 0 12px 0', textTransform: 'uppercase' }}>Vraagtype</h3>
              <div style={{ fontSize: '12px' }}>
                {Object.entries(stats.typeDist).map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#666' }}>
                    <span>{vraagTypes.find((t) => t.key === type)?.label || type}</span>
                    <span style={{ fontWeight: '600' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Panel */}
          <div style={{ padding: '24px', borderTop: '1px solid #e5e7eb', flex: 1, overflow: 'auto' }}>
            <button
              onClick={() => setShowAIPanel(!showAIPanel)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#EEF2FF',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: '#1e3a5f',
                marginBottom: '12px',
              }}
            >
              {showAIPanel ? '▼' : '▶'} AI Vraag Generator
            </button>

            {showAIPanel && (
              <div
                style={{
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}
              >
                {/* Onderwerp */}
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Onderwerp</div>
                  <input
                    type="text"
                    value={aiForm.onderwerp}
                    onChange={(e) => setAiForm({ ...aiForm, onderwerp: e.target.value })}
                    placeholder="bijv. Fotosynthese"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>

                {/* Aantal vragen */}
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Aantal vragen</div>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={aiForm.aantalVragen}
                    onChange={(e) => setAiForm({ ...aiForm, aantalVragen: parseInt(e.target.value) || 5 })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>

                {/* Vraag types */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Vraagtypen</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                    }}
                  >
                    {vraagTypes.map((type) => (
                      <label key={type.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={aiForm.vraagTypes[type.key as keyof typeof aiForm.vraagTypes]}
                          onChange={(e) =>
                            setAiForm({
                              ...aiForm,
                              vraagTypes: {
                                ...aiForm.vraagTypes,
                                [type.key]: e.target.checked,
                              },
                            })
                          }
                        />
                        {type.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Bloom verdeling */}
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Bloom verdeling</div>
                  <select
                    value={aiForm.bloomVerdeling}
                    onChange={(e) => setAiForm({ ...aiForm, bloomVerdeling: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="laag">Vooral kennis</option>
                    <option value="mix">Mix laag/hoog</option>
                    <option value="hoog">Vooral hogere orde</option>
                  </select>
                </label>

                {/* Extra instructies */}
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Extra instructies (optioneel)</div>
                  <textarea
                    value={aiForm.extraInstructies}
                    onChange={(e) => setAiForm({ ...aiForm, extraInstructies: e.target.value })}
                    placeholder="bijv. Focus op werkwoordsspelling"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      minHeight: '60px',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>

                {/* Error */}
                {aiError && (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#fee',
                      border: '1px solid #fcc',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#c33',
                      marginBottom: '12px',
                    }}
                  >
                    {aiError}
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={generateAIQuestions}
                  disabled={aiLoading}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: aiLoading ? '#ccc' : '#2B5BA0',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: aiLoading ? 'default' : 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                  }}
                >
                  {aiLoading ? '⏳ Genereren...' : '✨ Genereer vragen met AI'}
                </button>

                {/* Generated questions preview */}
                {generatedQuestions.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                      {generatedQuestions.length} gegenereerde vragen
                    </div>
                    <div style={{ maxHeight: '200px', overflow: 'auto', marginBottom: '12px' }}>
                      {generatedQuestions.map((q, idx) => (
                        <label
                          key={idx}
                          style={{
                            display: 'block',
                            padding: '8px',
                            background: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            marginBottom: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedGenerated.has(idx)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedGenerated);
                              if (e.target.checked) {
                                newSelected.add(idx);
                              } else {
                                newSelected.delete(idx);
                              }
                              setSelectedGenerated(newSelected);
                            }}
                            style={{ marginRight: '6px' }}
                          />
                          {q.vraag_tekst.substring(0, 50)}...
                        </label>
                      ))}
                    </div>

                    <button
                      onClick={addGeneratedQuestions}
                      disabled={selectedGenerated.size === 0}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: selectedGenerated.size === 0 ? '#ccc' : '#34d399',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: selectedGenerated.size === 0 ? 'default' : 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                      }}
                    >
                      Voeg {selectedGenerated.size} geselecteerde vragen toe
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Question Card Component ───── */
interface VraagCardProps {
  vraag: Vraag;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSave: (vraag: Vraag) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  totalQuestions: number;
}

function VraagCard({
  vraag,
  index,
  isExpanded,
  onToggleExpand,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
  totalQuestions,
}: VraagCardProps) {
  const [edited, setEdited] = useState(vraag);

  const typeLabel = vraagTypes.find((t) => t.key === vraag.vraag_type)?.label || vraag.vraag_type;

  if (!isExpanded) {
    return (
      <div
        onClick={onToggleExpand}
        style={{
          padding: '16px',
          background: 'white',
          borderRadius: '14px',
          marginBottom: '12px',
          cursor: 'pointer',
          border: '1px solid #e5e7eb',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
          (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
          (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e3a5f', marginBottom: '8px' }}>
              Vraag {index + 1}
            </div>
            <div style={{ fontSize: '14px', color: '#333', marginBottom: '8px', lineHeight: '1.4' }}>
              {vraag.vraag_tekst.substring(0, 60)}
              {vraag.vraag_tekst.length > 60 ? '...' : ''}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-block',
                  background: '#f0f0f0',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#666',
                }}
              >
                {typeLabel}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  background: bloomColors[vraag.bloom_niveau],
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                }}
              >
                {bloomLabels[vraag.bloom_niveau]}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  background: '#f0f0f0',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#666',
                  marginLeft: 'auto',
                }}
              >
                {vraag.punten} pt.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Expanded form
  return (
    <div
      style={{
        padding: '20px',
        background: 'white',
        borderRadius: '14px',
        marginBottom: '12px',
        border: '1px solid #d1d5db',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f' }}>Vraag {index + 1}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            style={{
              padding: '6px 10px',
              background: index === 0 ? '#f0f0f0' : '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: index === 0 ? 'default' : 'pointer',
              fontSize: '12px',
              color: index === 0 ? '#999' : '#333',
            }}
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalQuestions - 1}
            style={{
              padding: '6px 10px',
              background: index === totalQuestions - 1 ? '#f0f0f0' : '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: index === totalQuestions - 1 ? 'default' : 'pointer',
              fontSize: '12px',
              color: index === totalQuestions - 1 ? '#999' : '#333',
            }}
          >
            ↓
          </button>
          <button
            onClick={() => {
              onToggleExpand();
            }}
            style={{
              padding: '6px 10px',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#333',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Vraag tekst */}
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Vraag tekst</div>
        <textarea
          value={edited.vraag_tekst}
          onChange={(e) => setEdited({ ...edited, vraag_tekst: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            minHeight: '60px',
            boxSizing: 'border-box',
          }}
        />
      </label>

      {/* Vraag type */}
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Vraagtype</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {vraagTypes.map((type) => (
            <button
              key={type.key}
              onClick={() => setEdited({ ...edited, vraag_type: type.key as any, antwoorden: [] })}
              style={{
                padding: '8px 12px',
                background: edited.vraag_type === type.key ? '#1e3a5f' : '#f0f0f0',
                color: edited.vraag_type === type.key ? 'white' : '#333',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
              }}
            >
              {type.label}
            </button>
          ))}
        </div>
      </label>

      {/* Bloom niveau */}
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Bloom niveau</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(bloomLabels).map(([level, label]) => (
            <button
              key={level}
              onClick={() => setEdited({ ...edited, bloom_niveau: level as any })}
              style={{
                padding: '8px 12px',
                background: edited.bloom_niveau === level ? bloomColors[level] : '#f0f0f0',
                color: edited.bloom_niveau === level ? 'white' : '#333',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </label>

      {/* Punten */}
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Punten</div>
        <input
          type="number"
          step="0.5"
          min="0"
          value={edited.punten}
          onChange={(e) => setEdited({ ...edited, punten: parseFloat(e.target.value) || 0 })}
          style={{
            width: '100px',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            boxSizing: 'border-box',
          }}
        />
      </label>

      {/* Bron tekst */}
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Brontekst (optioneel)</div>
        <textarea
          value={edited.bron_tekst}
          onChange={(e) => setEdited({ ...edited, bron_tekst: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            minHeight: '40px',
            boxSizing: 'border-box',
          }}
          placeholder="Tekst waar de vraag op gebaseerd is"
        />
      </label>

      {/* Question Type-Specific Fields */}
      {edited.vraag_type === 'meerkeuze' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Antwoordopties</div>
          {edited.antwoorden.map((option, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input
                type="radio"
                name="correct"
                checked={option.is_correct}
                onChange={() => {
                  const newAntwoorden = edited.antwoorden.map((a, i) => ({ ...a, is_correct: i === idx }));
                  setEdited({ ...edited, antwoorden: newAntwoorden });
                }}
              />
              <input
                type="text"
                value={option.antwoord_tekst}
                onChange={(e) => {
                  const newAntwoorden = [...edited.antwoorden];
                  newAntwoorden[idx].antwoord_tekst = e.target.value;
                  setEdited({ ...edited, antwoorden: newAntwoorden });
                }}
                placeholder={String.fromCharCode(65 + idx)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => {
                  setEdited({
                    ...edited,
                    antwoorden: edited.antwoorden.filter((_, i) => i !== idx),
                  });
                }}
                disabled={edited.antwoorden.length <= 2}
                style={{
                  padding: '6px 10px',
                  background: edited.antwoorden.length <= 2 ? '#f0f0f0' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: edited.antwoorden.length <= 2 ? 'default' : 'pointer',
                  fontSize: '12px',
                  color: edited.antwoorden.length <= 2 ? '#999' : '#c33',
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              setEdited({
                ...edited,
                antwoorden: [
                  ...edited.antwoorden,
                  { antwoord_tekst: '', is_correct: false, volgorde: edited.antwoorden.length },
                ],
              });
            }}
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: '#f0f0f0',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#333',
            }}
          >
            + Optie toevoegen
          </button>
        </div>
      )}

      {edited.vraag_type === 'waar_onwaar' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Correct antwoord</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="waar_onwaar"
                checked={
                  edited.antwoorden.length > 0 && edited.antwoorden.some((a) => a.antwoord_tekst === 'Waar' && a.is_correct)
                }
                onChange={() => {
                  setEdited({
                    ...edited,
                    antwoorden: [
                      { antwoord_tekst: 'Waar', is_correct: true, volgorde: 0 },
                      { antwoord_tekst: 'Onwaar', is_correct: false, volgorde: 1 },
                    ],
                  });
                }}
              />
              Waar
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="waar_onwaar"
                checked={
                  edited.antwoorden.length > 0 && edited.antwoorden.some((a) => a.antwoord_tekst === 'Onwaar' && a.is_correct)
                }
                onChange={() => {
                  setEdited({
                    ...edited,
                    antwoorden: [
                      { antwoord_tekst: 'Waar', is_correct: false, volgorde: 0 },
                      { antwoord_tekst: 'Onwaar', is_correct: true, volgorde: 1 },
                    ],
                  });
                }}
              />
              Onwaar
            </label>
          </div>
        </div>
      )}

      {edited.vraag_type === 'koppel' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Koppelingen</div>
          {edited.antwoorden.map((pair, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={pair.antwoord_tekst}
                  onChange={(e) => {
                    const newAntwoorden = [...edited.antwoorden];
                    newAntwoorden[idx].antwoord_tekst = e.target.value;
                    setEdited({ ...edited, antwoorden: newAntwoorden });
                  }}
                  placeholder="Links"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={pair.koppel_tekst || ''}
                  onChange={(e) => {
                    const newAntwoorden = [...edited.antwoorden];
                    newAntwoorden[idx].koppel_tekst = e.target.value;
                    setEdited({ ...edited, antwoorden: newAntwoorden });
                  }}
                  placeholder="Rechts"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={() => {
                  setEdited({
                    ...edited,
                    antwoorden: edited.antwoorden.filter((_, i) => i !== idx),
                  });
                }}
                disabled={edited.antwoorden.length <= 2}
                style={{
                  padding: '8px 10px',
                  background: edited.antwoorden.length <= 2 ? '#f0f0f0' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: edited.antwoorden.length <= 2 ? 'default' : 'pointer',
                  fontSize: '12px',
                  color: edited.antwoorden.length <= 2 ? '#999' : '#c33',
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              setEdited({
                ...edited,
                antwoorden: [
                  ...edited.antwoorden,
                  { antwoord_tekst: '', koppel_tekst: '', is_correct: false, volgorde: edited.antwoorden.length },
                ],
              });
            }}
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: '#f0f0f0',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#333',
            }}
          >
            + Koppeling toevoegen
          </button>
        </div>
      )}

      {/* Antwoord model */}
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Antwoordmodel / rubric</div>
        <textarea
          value={edited.antwoord_model}
          onChange={(e) => setEdited({ ...edited, antwoord_model: e.target.value })}
          placeholder="Juiste antwoord of beoordelingscriteria"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            minHeight: '60px',
            boxSizing: 'border-box',
          }}
        />
      </label>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => onToggleExpand()}
          style={{
            padding: '8px 16px',
            background: '#f0f0f0',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            color: '#333',
          }}
        >
          Annuleren
        </button>
        <button
          onClick={() => onDelete()}
          style={{
            padding: '8px 16px',
            background: '#fee',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            color: '#c33',
          }}
        >
          Verwijderen
        </button>
        <button
          onClick={() => {
            onSave(edited);
            onToggleExpand();
          }}
          style={{
            padding: '8px 16px',
            background: '#34d399',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          Opslaan
        </button>
      </div>
    </div>
  );
}

/* ───── Page Wrapper ───── */
export default function ToetsenMakerPage() {
  return (
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Laden...</div>}>
      <ToetsenMakerContent />
    </Suspense>
  );
}
