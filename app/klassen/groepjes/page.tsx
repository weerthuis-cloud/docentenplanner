'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: number;
  voornaam: string;
  achternaam: string;
  foto_url?: string;
  foto_data?: string;
}

interface Klas {
  id: number;
  naam: string;
}

interface GroepjesSet {
  id: number;
  klas_id: number;
  naam: string;
  groepjes_data: number[][];
  created_at: string;
}

type Step = 1 | 2 | 3;
type IndelingsType = 'groepen' | 'per_groep';

function GroepjesContent() {
  const searchParams = useSearchParams();
  const initialKlasId = searchParams.get('klas_id') || '';

  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<string>(initialKlasId);
  const [students, setStudents] = useState<Student[]>([]);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [indelingsType, setIndelingsType] = useState<IndelingsType>('groepen');
  const [aantalGroepen, setAantalGroepen] = useState(4);
  const [aantalPerGroep, setAantalPerGroep] = useState(4);
  const [groepjes, setGroepjes] = useState<number[][]>([]);
  const [groepjesNaam, setGroepjesNaam] = useState('Groepjes');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Saved sets
  const [savedSets, setSavedSets] = useState<GroepjesSet[]>([]);

  // Drag state for reordering
  const [dragStudent, setDragStudent] = useState<{ studentId: number; fromGroup: number } | null>(null);

  // Load classes
  useEffect(() => {
    const fetchKlassen = async () => {
      try {
        const res = await fetch('/api/klassen');
        const data = await res.json();
        setKlassen(data);
        if (!initialKlasId && data.length > 0) setSelectedKlas(String(data[0].id));
      } catch { setError('Fout bij laden klassen'); }
    };
    fetchKlassen();
  }, [initialKlasId]);

  // Load students + saved sets when class changes
  useEffect(() => {
    if (!selectedKlas) return;
    const fetchStudents = async () => {
      try {
        const res = await fetch(`/api/leerlingen?klas_id=${selectedKlas}`);
        const data = await res.json();
        setStudents(data);
        // Select all by default
        setSelectedStudents(new Set(data.map((s: Student) => s.id)));
      } catch { setError('Fout bij laden leerlingen'); }
    };
    const fetchSaved = async () => {
      try {
        const res = await fetch(`/api/groepjes?klas_id=${selectedKlas}`);
        const data = await res.json();
        setSavedSets(data);
      } catch { /* ignore */ }
    };
    fetchStudents();
    fetchSaved();
    setStep(1);
    setGroepjes([]);
  }, [selectedKlas]);

  const selectedKlasData = klassen.find((k) => String(k.id) === selectedKlas);

  const getStudent = useCallback(
    (id: number) => students.find((s) => s.id === id),
    [students]
  );

  const getInitials = (s: Student) =>
    (s.voornaam.charAt(0) + s.achternaam.charAt(0)).toUpperCase();

  // Toggle student selection
  const toggleStudent = (id: number) => {
    const next = new Set(selectedStudents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudents(next);
  };

  const selectAll = () => setSelectedStudents(new Set(students.map((s) => s.id)));
  const selectNone = () => setSelectedStudents(new Set());

  // Make groups
  const maakGroepjes = () => {
    const selected = students.filter((s) => selectedStudents.has(s.id));
    // Shuffle
    const shuffled = [...selected].sort(() => Math.random() - 0.5);

    let numGroups: number;
    if (indelingsType === 'groepen') {
      numGroups = Math.max(1, aantalGroepen);
    } else {
      numGroups = Math.max(1, Math.ceil(shuffled.length / Math.max(1, aantalPerGroep)));
    }

    const groups: number[][] = Array.from({ length: numGroups }, () => []);
    shuffled.forEach((s, i) => {
      groups[i % numGroups].push(s.id);
    });

    setGroepjes(groups);
    setStep(3);
  };

  // Shuffle groups
  const husselGroepjes = () => {
    const allIds = groepjes.flat();
    const shuffled = [...allIds].sort(() => Math.random() - 0.5);
    const numGroups = groepjes.length;
    const newGroups: number[][] = Array.from({ length: numGroups }, () => []);
    shuffled.forEach((id, i) => {
      newGroups[i % numGroups].push(id);
    });
    setGroepjes(newGroups);
  };

  // Drag & drop between groups
  const handleDragStart = (studentId: number, fromGroup: number) => {
    setDragStudent({ studentId, fromGroup });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (toGroup: number) => {
    if (!dragStudent) return;
    if (dragStudent.fromGroup === toGroup) return;

    const newGroups = groepjes.map((g) => [...g]);
    // Remove from source
    newGroups[dragStudent.fromGroup] = newGroups[dragStudent.fromGroup].filter(
      (id) => id !== dragStudent.studentId
    );
    // Add to target
    newGroups[toGroup].push(dragStudent.studentId);
    setGroepjes(newGroups);
    setDragStudent(null);
  };

  // Save
  const saveGroepjes = async () => {
    if (!selectedKlas) return;
    setLoading(true);
    try {
      const res = await fetch('/api/groepjes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          klas_id: selectedKlas,
          naam: groepjesNaam,
          groepjes_data: groepjes,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      // Refresh saved
      const savedRes = await fetch(`/api/groepjes?klas_id=${selectedKlas}`);
      setSavedSets(await savedRes.json());
      setSuccessMsg('Groepjes opgeslagen!');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch {
      setError('Fout bij opslaan');
    } finally {
      setLoading(false);
    }
  };

  // Load saved set
  const loadSavedSet = (set: GroepjesSet) => {
    setGroepjes(set.groepjes_data);
    setGroepjesNaam(set.naam);
    setStep(3);
  };

  // Delete saved set
  const deleteSavedSet = async (id: number) => {
    if (!confirm('Weet je zeker dat je deze groepjes wilt verwijderen?')) return;
    await fetch(`/api/groepjes?id=${id}`, { method: 'DELETE' });
    const savedRes = await fetch(`/api/groepjes?klas_id=${selectedKlas}`);
    setSavedSets(await savedRes.json());
  };

  // Styles
  const stepDone = { width: 32, height: 32, borderRadius: '50%', background: '#f97316', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' };
  const stepActive = { ...stepDone, background: '#3b82f6' };
  const stepPending = { ...stepDone, background: '#e2e8f0', color: '#94a3b8' };
  const lineActive = { flex: 1, height: 3, background: '#3b82f6' };
  const linePending = { flex: 1, height: 3, background: '#e2e8f0' };

  // StudentCard component
  const StudentCard = ({ student, checked, onToggle }: { student: Student; checked: boolean; onToggle: () => void }) => {
    const hasFoto = student.foto_url || student.foto_data;
    return (
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
          padding: '0.4rem 0.6rem', borderRadius: 8, transition: 'all 0.15s',
          background: checked ? '#eff6ff' : 'white',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 4, border: checked ? 'none' : '2px solid #cbd5e1',
          background: checked ? '#3b82f6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
        }}>
          {checked && '✓'}
        </div>
        {hasFoto ? (
          <img src={student.foto_data || student.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#94a3b8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
            {getInitials(student)}
          </div>
        )}
        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {student.voornaam} {student.achternaam}
        </span>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)' }}>
      {/* Header bar */}
      <div style={{ background: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#f97316' }}>
            Maak groepjes
          </h1>
          <span style={{ color: '#94a3b8', fontSize: '1rem' }}>|</span>
          <span style={{ color: '#64748b', fontSize: '1rem' }}>
            Klas: {selectedKlasData?.naam || '...'}
          </span>
          {/* Klas selector */}
          <select
            value={selectedKlas}
            onChange={(e) => setSelectedKlas(e.target.value)}
            style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', marginLeft: '0.5rem' }}
          >
            {klassen.map((k) => (
              <option key={k.id} value={k.id}>{k.naam}</option>
            ))}
          </select>
        </div>
        <Link href="/klassen" style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#64748b', fontSize: '1.2rem', fontWeight: 700 }}>
          ×
        </Link>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 900, margin: '0 auto' }}>
        <div style={step >= 2 ? stepDone : stepActive}>
          {step >= 2 ? '✓' : '1'}
        </div>
        <div style={{ fontSize: '0.8rem', color: step >= 1 ? '#1e293b' : '#94a3b8', fontWeight: 500, marginRight: '0.5rem' }}>
          Selecteer leerlingen
        </div>
        <div style={step >= 2 ? lineActive : linePending} />
        <div style={step >= 3 ? stepDone : step === 2 ? stepActive : stepPending}>
          {step >= 3 ? '✓' : '2'}
        </div>
        <div style={{ fontSize: '0.8rem', color: step >= 2 ? '#1e293b' : '#94a3b8', fontWeight: 500, marginRight: '0.5rem' }}>
          Indeling
        </div>
        <div style={step >= 3 ? lineActive : linePending} />
        <div style={step === 3 ? stepActive : stepPending}>3</div>
        <div style={{ fontSize: '0.8rem', color: step >= 3 ? '#1e293b' : '#94a3b8', fontWeight: 500 }}>
          Groepjes
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ maxWidth: 900, margin: '0 auto 1rem', padding: '0.75rem 1rem', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: '0.9rem' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}
      {successMsg && (
        <div style={{ maxWidth: 900, margin: '0 auto 1rem', padding: '0.75rem 1rem', background: '#dcfce7', color: '#16a34a', borderRadius: 8, fontSize: '0.9rem' }}>
          {successMsg}
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 2rem 2rem' }}>
        {/* Step 1: Select students */}
        {step === 1 && (
          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
              Welke leerlingen moeten in deze les in groepjes verdeeld worden?
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                {selectedStudents.size} van {students.length} geselecteerd
              </span>
              <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                Alles selecteren
              </button>
              <button onClick={selectNone} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                Niets selecteren
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.25rem' }}>
              {students.map((s) => (
                <StudentCard
                  key={s.id}
                  student={s}
                  checked={selectedStudents.has(s.id)}
                  onToggle={() => toggleStudent(s.id)}
                />
              ))}
            </div>

            {/* Saved sets */}
            {savedSets.length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 600, color: '#64748b' }}>Opgeslagen groepjes</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {savedSets.map((set) => (
                    <div key={set.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <button
                        onClick={() => loadSavedSet(set)}
                        style={{ padding: '0.4rem 0.8rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#1d4ed8', fontWeight: 500 }}
                      >
                        {set.naam} ({set.groepjes_data.length} groepen)
                      </button>
                      <button
                        onClick={() => deleteSavedSet(set.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0.2rem' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Indeling */}
        {step === 2 && (
          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
              Indeling
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
              U heeft {selectedStudents.size} leerlingen geselecteerd. Wilt u een indeling maken op basis van een aantal groepen of een aantal leerlingen per groep?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="radio" name="indeling" checked={indelingsType === 'groepen'}
                  onChange={() => setIndelingsType('groepen')}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '0.95rem', color: '#1e293b', minWidth: 180 }}>Aantal groepen:</span>
                <input
                  type="number" min="1" max="20" value={aantalGroepen}
                  onChange={(e) => setAantalGroepen(Math.max(1, parseInt(e.target.value) || 1))}
                  onFocus={() => setIndelingsType('groepen')}
                  style={{ width: 60, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', textAlign: 'center' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="radio" name="indeling" checked={indelingsType === 'per_groep'}
                  onChange={() => setIndelingsType('per_groep')}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '0.95rem', color: '#1e293b', minWidth: 180 }}>Aantal leerlingen per groep:</span>
                <input
                  type="number" min="1" max="20" value={aantalPerGroep}
                  onChange={(e) => setAantalPerGroep(Math.max(1, parseInt(e.target.value) || 1))}
                  onFocus={() => setIndelingsType('per_groep')}
                  style={{ width: 60, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', textAlign: 'center' }}
                />
              </label>
            </div>
          </div>
        )}

        {/* Step 3: Groepjes result */}
        {step === 3 && (
          <>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#3b82f6', fontSize: '1rem' }}>ℹ</span>
              <span style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                Indien gewenst kunt u door middel van het slepen van leerlingen de groepjes nog aanpassen.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(groepjes.length, 4)}, 1fr)`, gap: '1rem' }}>
              {groepjes.map((group, gi) => (
                <div
                  key={gi}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(gi)}
                  style={{
                    background: 'white', borderRadius: 12, padding: '1rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
                    minHeight: 120,
                  }}
                >
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                    Groep {gi + 1}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {group.map((studentId) => {
                      const student = getStudent(studentId);
                      if (!student) return null;
                      const hasFoto = student.foto_url || student.foto_data;
                      return (
                        <div
                          key={studentId}
                          draggable
                          onDragStart={() => handleDragStart(studentId, gi)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.35rem 0.5rem', borderRadius: 8, cursor: 'grab',
                            transition: 'background 0.15s',
                          }}
                        >
                          <span style={{ color: '#cbd5e1', cursor: 'grab', fontSize: '0.9rem', userSelect: 'none' }}>⠿</span>
                          {hasFoto ? (
                            <img src={student.foto_data || student.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#94a3b8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                              {getInitials(student)}
                            </div>
                          )}
                          <span style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 500 }}>
                            {student.voornaam} {student.achternaam}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e2e8f0',
        padding: '0.75rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          {step > 1 && (
            <button
              onClick={() => setStep((step - 1) as Step)}
              style={{
                padding: '0.5rem 1.2rem', background: 'white', color: '#3b82f6',
                border: '2px solid #3b82f6', borderRadius: 8, fontWeight: 600,
                cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              ← Vorige
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {step === 3 && (
            <>
              <input
                type="text" value={groepjesNaam}
                onChange={(e) => setGroepjesNaam(e.target.value)}
                placeholder="Naam groepjes"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', width: 180 }}
              />
              <button
                onClick={husselGroepjes}
                style={{
                  padding: '0.5rem 1.2rem', background: 'white', color: '#3b82f6',
                  border: '2px solid #3b82f6', borderRadius: 8, fontWeight: 600,
                  cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}
              >
                ⤨ Groepjes husselen
              </button>
              <button
                onClick={saveGroepjes}
                disabled={loading}
                style={{
                  padding: '0.5rem 1.5rem', background: '#3b82f6', color: 'white',
                  border: 'none', borderRadius: 8, fontWeight: 600,
                  cursor: 'pointer', fontSize: '0.9rem', opacity: loading ? 0.5 : 1,
                }}
              >
                Opslaan
              </button>
            </>
          )}
          {step === 1 && (
            <button
              onClick={() => {
                if (selectedStudents.size < 2) { setError('Selecteer minimaal 2 leerlingen'); return; }
                setStep(2);
              }}
              style={{
                padding: '0.5rem 1.5rem', background: '#3b82f6', color: 'white',
                border: 'none', borderRadius: 8, fontWeight: 600,
                cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              Volgende →
            </button>
          )}
          {step === 2 && (
            <button
              onClick={maakGroepjes}
              style={{
                padding: '0.5rem 1.5rem', background: '#3b82f6', color: 'white',
                border: 'none', borderRadius: 8, fontWeight: 600,
                cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              Groepjes maken →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GroepjesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Laden...</div>}>
      <GroepjesContent />
    </Suspense>
  );
}
