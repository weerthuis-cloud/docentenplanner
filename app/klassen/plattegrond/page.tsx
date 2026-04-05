'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: number;
  voornaam: string;
  achternaam: string;
  foto_url?: string;
  foto_data?: string;
}

interface Layout {
  id: string;
  klas_id: string;
  naam: string;
  layout_data: (number | null)[][];
  is_actief: boolean;
  created_at: string;
}

interface Klas {
  id: string;
  naam: string;
}

type LayoutData = (number | null)[][];
type EditMode = 'tables' | 'students';

function PlattegrondContent() {
  const searchParams = useSearchParams();
  const initialKlasId = searchParams.get('klas_id') || '';

  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<string>(initialKlasId);
  const [students, setStudents] = useState<Student[]>([]);

  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<Layout | null>(null);
  const [layoutName, setLayoutName] = useState('');
  const [layoutData, setLayoutData] = useState<LayoutData>([]);

  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(8);

  const [editMode, setEditMode] = useState<EditMode>('tables');
  const [draggedStudent, setDraggedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const dragSourceRef = useRef<{ row: number; col: number } | null>(null);

  // Load classes on mount
  useEffect(() => {
    const fetchKlassen = async () => {
      try {
        const res = await fetch('/api/klassen');
        if (!res.ok) throw new Error('Failed to load classes');
        const data = await res.json();
        setKlassen(data);
        if (!initialKlasId && data.length > 0) {
          setSelectedKlas(String(data[0].id));
        }
      } catch (err) {
        setError('Fout bij laden van klassen');
        console.error(err);
      }
    };
    fetchKlassen();
  }, [initialKlasId]);

  // Load students and layouts when class changes
  useEffect(() => {
    if (!selectedKlas) return;

    const fetchStudents = async () => {
      try {
        const res = await fetch(`/api/leerlingen?klas_id=${selectedKlas}`);
        if (!res.ok) throw new Error('Failed to load students');
        const data = await res.json();
        setStudents(data);
      } catch (err) {
        setError('Fout bij laden van leerlingen');
        console.error(err);
      }
    };

    const fetchLayouts = async () => {
      try {
        const res = await fetch(`/api/layout?klas_id=${selectedKlas}`);
        if (!res.ok) throw new Error('Failed to load layouts');
        const data = await res.json();
        setLayouts(data);
        // Auto-load the active layout, or first layout
        const active = data.find((l: Layout) => l.is_actief);
        if (active) {
          setSelectedLayout(active);
          setLayoutName(active.naam);
          setLayoutData(active.layout_data);
          setRows(active.layout_data.length);
          setCols(active.layout_data[0]?.length || 8);
          setEditMode('tables');
        } else if (data.length > 0) {
          const first = data[0];
          setSelectedLayout(first);
          setLayoutName(first.naam);
          setLayoutData(first.layout_data);
          setRows(first.layout_data.length);
          setCols(first.layout_data[0]?.length || 8);
          setEditMode('tables');
        } else {
          setSelectedLayout(null);
          setLayoutName('');
          initializeEmptyGrid();
        }
      } catch (err) {
        setError('Fout bij laden van opstellingen');
        console.error(err);
      }
    };

    fetchStudents();
    fetchLayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKlas]);

  const initializeEmptyGrid = useCallback(() => {
    const newGrid: LayoutData = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(null));
    setLayoutData(newGrid);
    setEditMode('tables');
  }, [rows, cols]);

  const loadLayout = (layout: Layout) => {
    setSelectedLayout(layout);
    setLayoutName(layout.naam);
    setLayoutData(layout.layout_data);
    setRows(layout.layout_data.length);
    setCols(layout.layout_data[0]?.length || 8);
    setEditMode('tables');
  };

  const createNewLayout = () => {
    setSelectedLayout(null);
    setLayoutName('Nieuwe opstelling');
    initializeEmptyGrid();
  };

  const getUnplacedStudents = useCallback(() => {
    const placedIds = new Set<number>();
    layoutData.forEach((row) => {
      row.forEach((cell) => {
        if (typeof cell === 'number' && cell !== 0) {
          placedIds.add(cell);
        }
      });
    });
    return students.filter((s) => !placedIds.has(s.id));
  }, [layoutData, students]);

  const getStudentById = useCallback(
    (id: number) => students.find((s) => s.id === id),
    [students]
  );

  const getInitials = (student: Student): string => {
    return (student.voornaam.charAt(0) + student.achternaam.charAt(0)).toUpperCase();
  };

  const toggleTable = (row: number, col: number) => {
    if (editMode !== 'tables') return;
    const newData = layoutData.map((r) => [...r]);
    const current = newData[row][col];
    newData[row][col] = current === 0 || (typeof current === 'number' && current > 0) ? null : 0;
    setLayoutData(newData);
  };

  const handleStudentDragStart = (e: React.DragEvent, student: Student) => {
    if (editMode !== 'students') { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedStudent(student);
  };

  const handleCellDragStart = (e: React.DragEvent, row: number, col: number) => {
    if (editMode !== 'students') { e.preventDefault(); return; }
    const cell = layoutData[row][col];
    if (typeof cell === 'number' && cell > 0) {
      dragSourceRef.current = { row, col };
      e.dataTransfer.effectAllowed = 'move';
    } else {
      e.preventDefault();
    }
  };

  const handleCellDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = editMode === 'students' ? 'move' : 'none';
  };

  const handleCellDrop = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    if (editMode !== 'students') return;
    const cell = layoutData[row][col];
    if (cell === null) return; // not a table

    const newData = layoutData.map((r) => [...r]);

    if (draggedStudent) {
      newData[row][col] = draggedStudent.id;
      setDraggedStudent(null);
    } else if (dragSourceRef.current) {
      const source = dragSourceRef.current;
      const studentId = newData[source.row][source.col];
      if (typeof studentId === 'number') {
        newData[source.row][source.col] = 0;
        newData[row][col] = studentId;
      }
      dragSourceRef.current = null;
    }
    setLayoutData(newData);
  };

  const saveLayout = async () => {
    if (!selectedKlas || !layoutName.trim()) {
      setError('Kies een klas en voer een naam in');
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        klas_id: selectedKlas,
        naam: layoutName,
        layout_data: layoutData,
      };
      if (selectedLayout) payload.id = selectedLayout.id;

      const res = await fetch('/api/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save layout');

      const layoutsRes = await fetch(`/api/layout?klas_id=${selectedKlas}`);
      const updatedLayouts = await layoutsRes.json();
      setLayouts(updatedLayouts);
      setError('');
      setSuccessMsg('Opstelling opgeslagen!');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setError('Fout bij opslaan van opstelling');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteLayout = async () => {
    if (!selectedLayout) return;
    if (!confirm(`Weet je zeker dat je "${selectedLayout.naam}" wilt verwijderen?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/layout?id=${selectedLayout.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete layout');
      const layoutsRes = await fetch(`/api/layout?klas_id=${selectedKlas}`);
      const updatedLayouts = await layoutsRes.json();
      setLayouts(updatedLayouts);
      setSelectedLayout(null);
      setLayoutName('');
      initializeEmptyGrid();
      setError('');
    } catch (err) {
      setError('Fout bij verwijderen');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const setActiveLayout = async () => {
    if (!selectedLayout) return;
    setLoading(true);
    try {
      const res = await fetch('/api/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klas_id: Number(selectedKlas), layout_id: selectedLayout.id }),
      });
      if (!res.ok) throw new Error('Failed to set active layout');
      const updatedLayouts = layouts.map((l) => ({ ...l, is_actief: l.id === selectedLayout.id }));
      setLayouts(updatedLayouts);
      setSelectedLayout({ ...selectedLayout, is_actief: true });
      setSuccessMsg('Opstelling is nu actief!');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setError('Fout bij activeren');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (templateName: string) => {
    const newData: LayoutData = Array(rows).fill(null).map(() => Array(cols).fill(null));

    if (templateName === 'rijen-van-2') {
      for (let r = 1; r < rows; r += 2) {
        for (let c = 1; c < cols - 1; c += 3) {
          newData[r][c] = 0;
          if (c + 1 < cols - 1) newData[r][c + 1] = 0;
        }
      }
    } else if (templateName === 'groepjes-van-4') {
      for (let r = 1; r < rows - 1; r += 3) {
        for (let c = 1; c < cols - 1; c += 3) {
          newData[r][c] = 0;
          if (c + 1 < cols) newData[r][c + 1] = 0;
          if (r + 1 < rows) {
            newData[r + 1][c] = 0;
            if (c + 1 < cols) newData[r + 1][c + 1] = 0;
          }
        }
      }
    } else if (templateName === 'u-vorm') {
      for (let c = 1; c < cols - 1; c++) newData[0][c] = 0;
      for (let c = 1; c < cols - 1; c++) newData[rows - 1][c] = 0;
      for (let r = 1; r < rows - 1; r++) newData[r][0] = 0;
      for (let r = 1; r < rows - 1; r++) newData[r][cols - 1] = 0;
    } else if (templateName === 'rijen-van-3') {
      for (let r = 1; r < rows; r += 2) {
        for (let c = 0; c < cols - 2; c += 4) {
          newData[r][c] = 0;
          newData[r][c + 1] = 0;
          newData[r][c + 2] = 0;
        }
      }
    }
    setLayoutData(newData);
  };

  const selectedKlasData = klassen.find((k) => String(k.id) === selectedKlas);
  const unplacedStudents = getUnplacedStudents();
  const CELL_SIZE = 64;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Plattegrond {selectedKlasData ? `- ${selectedKlasData.naam}` : ''}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
            Maak en beheer zitopstellingen voor je klassen
          </p>
        </div>
        <Link
          href="/klassen"
          style={{
            padding: '0.5rem 1rem', background: '#e2e8f0', color: '#475569',
            borderRadius: 8, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500,
          }}
        >
          Terug naar Klassen
        </Link>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', color: '#dc2626', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>x</button>
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#16a34a', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem' }}>
          {successMsg}
        </div>
      )}

      {/* Controls bar */}
      <div style={{ background: 'white', borderRadius: 12, padding: '1rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
          {/* Klas */}
          <div style={{ minWidth: 150 }}>
            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Klas</label>
            <select
              value={selectedKlas}
              onChange={(e) => setSelectedKlas(e.target.value)}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', width: '100%' }}
            >
              <option value="">Kies klas</option>
              {klassen.map((k) => (
                <option key={k.id} value={k.id}>{k.naam}</option>
              ))}
            </select>
          </div>

          {/* Opstelling */}
          <div style={{ minWidth: 180 }}>
            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Opstelling</label>
            <select
              value={selectedLayout?.id || ''}
              onChange={(e) => {
                const layout = layouts.find((l) => l.id === e.target.value);
                if (layout) loadLayout(layout);
              }}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', width: '100%' }}
            >
              <option value="">Kies opstelling</option>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>{l.naam}{l.is_actief ? ' (actief)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Nieuw */}
          <button
            onClick={createNewLayout}
            style={{ padding: '0.5rem 1rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            + Nieuw
          </button>

          {/* Sjabloon */}
          {(layoutName || selectedLayout) && (
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Sjabloon</label>
              <select
                onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', width: '100%' }}
              >
                <option value="">Kies sjabloon</option>
                <option value="rijen-van-2">Rijen van 2</option>
                <option value="rijen-van-3">Rijen van 3</option>
                <option value="groepjes-van-4">Groepjes van 4</option>
                <option value="u-vorm">U-vorm</option>
              </select>
            </div>
          )}

          {/* Grid size */}
          {(layoutName || selectedLayout) && (
            <>
              <div style={{ width: 70 }}>
                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Rijen</label>
                <input
                  type="number" min="3" max="12" value={rows}
                  onChange={(e) => {
                    const nr = Math.max(3, Math.min(12, parseInt(e.target.value) || 3));
                    setRows(nr);
                    setLayoutData(Array(nr).fill(null).map((_, i) => layoutData[i] ? [...layoutData[i]] : Array(cols).fill(null)));
                  }}
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, width: '100%', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ width: 70 }}>
                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Kolom</label>
                <input
                  type="number" min="3" max="12" value={cols}
                  onChange={(e) => {
                    const nc = Math.max(3, Math.min(12, parseInt(e.target.value) || 3));
                    setCols(nc);
                    setLayoutData(layoutData.map((row) => {
                      const nr = [...row];
                      while (nr.length < nc) nr.push(null);
                      return nr.slice(0, nc);
                    }));
                  }}
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, width: '100%', fontSize: '0.9rem' }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mode toggle + actions */}
      {(layoutName || selectedLayout) && (
        <div style={{ background: 'white', borderRadius: 12, padding: '0.75rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Layout name */}
            <input
              type="text" value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              placeholder="Naam opstelling"
              style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', width: 200, fontWeight: 600 }}
            />
            {/* Mode buttons */}
            <button
              onClick={() => setEditMode('tables')}
              style={{
                padding: '0.4rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                background: editMode === 'tables' ? '#4f46e5' : '#e2e8f0',
                color: editMode === 'tables' ? 'white' : '#475569',
              }}
            >
              Tafels plaatsen
            </button>
            <button
              onClick={() => setEditMode('students')}
              style={{
                padding: '0.4rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                background: editMode === 'students' ? '#4f46e5' : '#e2e8f0',
                color: editMode === 'students' ? 'white' : '#475569',
              }}
            >
              Leerlingen plaatsen
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={saveLayout} disabled={loading}
              style={{ padding: '0.4rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: loading ? 0.5 : 1 }}>
              Opslaan
            </button>
            {selectedLayout && !selectedLayout.is_actief && (
              <button onClick={setActiveLayout} disabled={loading}
                style={{ padding: '0.4rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: loading ? 0.5 : 1 }}>
                Actief maken
              </button>
            )}
            {selectedLayout?.is_actief && (
              <span style={{ padding: '0.4rem 0.75rem', background: '#dcfce7', color: '#16a34a', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600 }}>
                Actief
              </span>
            )}
            {selectedLayout && (
              <button onClick={deleteLayout} disabled={loading}
                style={{ padding: '0.4rem 1rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                Verwijderen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Editor area */}
      {(layoutName || selectedLayout) && (
        <div style={{ display: 'flex', gap: '1rem' }}>
          {/* Grid */}
          <div style={{ flex: 1, background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${rows}, ${CELL_SIZE}px)`,
                gap: '6px',
                padding: '12px',
                background: '#f1f5f9',
                borderRadius: 8,
                width: 'fit-content',
              }}
            >
              {layoutData.map((row, r) =>
                row.map((cell, c) => {
                  const isTable = cell === 0 || (typeof cell === 'number' && cell > 0);
                  const student = typeof cell === 'number' && cell > 0 ? getStudentById(cell) : null;
                  const hasFoto = student && (student.foto_url || student.foto_data);

                  return (
                    <div
                      key={`${r}-${c}`}
                      onDragStart={(e) => handleCellDragStart(e, r, c)}
                      onDragOver={handleCellDragOver}
                      onDrop={(e) => handleCellDrop(e, r, c)}
                      onClick={() => toggleTable(r, c)}
                      draggable={editMode === 'students' && typeof cell === 'number' && cell > 0}
                      style={{
                        width: CELL_SIZE, height: CELL_SIZE, borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: editMode === 'tables' ? 'pointer' : (typeof cell === 'number' && cell > 0 ? 'grab' : 'default'),
                        background: isTable ? (student ? '#334155' : '#64748b') : (editMode === 'tables' ? '#ffffff' : 'transparent'),
                        border: isTable ? 'none' : (editMode === 'tables' ? '2px dashed #cbd5e1' : '1px solid transparent'),
                        boxShadow: isTable ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                        position: 'relative', overflow: 'hidden',
                        transition: 'all 0.15s',
                      }}
                    >
                      {student && hasFoto && (
                        <img
                          src={student.foto_data || student.foto_url}
                          alt={student.voornaam}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, position: 'absolute', inset: 0 }}
                        />
                      )}
                      {student && (
                        <div style={{
                          position: 'relative', zIndex: 1, textAlign: 'center',
                          background: hasFoto ? 'rgba(0,0,0,0.5)' : 'transparent',
                          borderRadius: hasFoto ? 4 : 0, padding: '1px 4px',
                        }}>
                          <div style={{ color: 'white', fontWeight: 700, fontSize: '0.7rem', lineHeight: 1.2 }}>
                            {getInitials(student)}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: '0.6rem', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: CELL_SIZE - 8 }}>
                            {student.voornaam}
                          </div>
                        </div>
                      )}
                      {isTable && !student && editMode === 'students' && (
                        <div style={{ color: '#94a3b8', fontSize: '0.6rem' }}>leeg</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#64748b' }}>
              {editMode === 'tables'
                ? 'Klik op cellen om tafels toe te voegen of te verwijderen'
                : 'Sleep leerlingen van rechts naar een tafel'}
            </p>
          </div>

          {/* Sidebar - students */}
          {editMode === 'students' && (
            <div style={{ width: 220, flexShrink: 0, background: 'white', borderRadius: 12, padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.75rem' }}>
                Niet geplaatst ({unplacedStudents.length})
              </h3>

              {unplacedStudents.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Alle leerlingen zijn geplaatst
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {unplacedStudents.map((student) => {
                    const hasFoto = student.foto_url || student.foto_data;
                    return (
                      <div
                        key={student.id}
                        draggable
                        onDragStart={(e) => handleStudentDragStart(e, student)}
                        style={{
                          padding: '0.5rem', background: '#eef2ff', border: '1px solid #c7d2fe',
                          borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}
                      >
                        {hasFoto ? (
                          <img
                            src={student.foto_data || student.foto_url}
                            alt={student.voornaam}
                            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: '#6366f1', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                          }}>
                            {getInitials(student)}
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {student.voornaam}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {student.achternaam}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!layoutName && !selectedLayout && selectedKlas && (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '1rem' }}>
            Nog geen opstellingen voor deze klas.
          </p>
          <button
            onClick={createNewLayout}
            style={{ padding: '0.6rem 1.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}
          >
            + Nieuwe opstelling maken
          </button>
        </div>
      )}

      {!selectedKlas && (
        <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ color: '#64748b', fontSize: '1rem' }}>
            Kies eerst een klas om te beginnen
          </p>
        </div>
      )}
    </div>
  );
}

export default function PlattegrondPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Laden...</div>}>
      <PlattegrondContent />
    </Suspense>
  );
}
