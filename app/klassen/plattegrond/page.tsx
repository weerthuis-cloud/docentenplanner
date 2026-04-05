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

const GROUP_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'];

interface GroepjesSet {
  id: number;
  naam: string;
  groepjes_data: number[][];
}

function PlattegrondContent() {
  const searchParams = useSearchParams();
  const initialKlasId = searchParams.get('klas_id') || '';
  const groepjesId = searchParams.get('groepjes_id') || '';

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

  // Groepjes overlay
  const [groepjesSets, setGroepjesSets] = useState<GroepjesSet[]>([]);
  const [activeGroepjes, setActiveGroepjes] = useState<GroepjesSet | null>(null);
  const [dragGroup, setDragGroup] = useState<number | null>(null);

  // Build student-to-group color map
  const studentGroupColor = useCallback((): Map<number, string> => {
    const map = new Map<number, string>();
    if (!activeGroepjes) return map;
    activeGroepjes.groepjes_data.forEach((group, gi) => {
      group.forEach((studentId) => {
        map.set(studentId, GROUP_COLORS[gi % GROUP_COLORS.length]);
      });
    });
    return map;
  }, [activeGroepjes]);

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

    const fetchGroepjes = async () => {
      try {
        const res = await fetch(`/api/groepjes?klas_id=${selectedKlas}`);
        const data = await res.json();
        setGroepjesSets(data);
        // Auto-select groepjes if ID in URL
        if (groepjesId) {
          const match = data.find((g: GroepjesSet) => String(g.id) === groepjesId);
          if (match) setActiveGroepjes(match);
        }
      } catch { /* ignore */ }
    };

    fetchStudents();
    fetchLayouts();
    fetchGroepjes();
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

  // Place groepjes on existing tables: fills empty tables with students grouped together
  const placeGroepjesOnGrid = () => {
    if (!activeGroepjes) return;
    const groups = activeGroepjes.groepjes_data;
    const newData = layoutData.map((r) => [...r]);

    // First clear all students from grid (keep tables as 0)
    for (let r = 0; r < newData.length; r++) {
      for (let c = 0; c < newData[r].length; c++) {
        if (typeof newData[r][c] === 'number' && newData[r][c]! > 0) {
          newData[r][c] = 0; // reset to empty table
        }
      }
    }

    // Collect all empty table positions (value === 0)
    const emptyTables: { row: number; col: number }[] = [];
    for (let r = 0; r < newData.length; r++) {
      for (let c = 0; c < newData[r].length; c++) {
        if (newData[r][c] === 0) {
          emptyTables.push({ row: r, col: c });
        }
      }
    }

    // Place students group by group onto empty tables
    let tableIndex = 0;
    groups.forEach((group) => {
      group.forEach((studentId) => {
        if (tableIndex < emptyTables.length) {
          const pos = emptyTables[tableIndex];
          newData[pos.row][pos.col] = studentId;
          tableIndex++;
        }
      });
    });

    setLayoutData(newData);
    setEditMode('students');
  };

  // Drag entire group
  const handleGroupDragStart = (e: React.DragEvent, groupIndex: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragGroup(groupIndex);
  };

  const handleGroupDrop = (e: React.DragEvent, targetRow: number, targetCol: number) => {
    e.preventDefault();
    if (dragGroup === null || !activeGroepjes) return;

    const group = activeGroepjes.groepjes_data[dragGroup];
    if (!group) return;

    // Find current positions of this group's students
    const currentPositions: { row: number; col: number; studentId: number }[] = [];
    layoutData.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (typeof cell === 'number' && cell > 0 && group.includes(cell)) {
          currentPositions.push({ row: r, col: c, studentId: cell });
        }
      });
    });

    if (currentPositions.length === 0) { setDragGroup(null); return; }

    // Calculate offset from the top-left of the group
    const minR = Math.min(...currentPositions.map((p) => p.row));
    const minC = Math.min(...currentPositions.map((p) => p.col));
    const offsetR = targetRow - minR;
    const offsetC = targetCol - minC;

    // Check if new positions are valid
    const newPositions = currentPositions.map((p) => ({
      ...p,
      newRow: p.row + offsetR,
      newCol: p.col + offsetC,
    }));

    const allValid = newPositions.every((p) =>
      p.newRow >= 0 && p.newRow < rows && p.newCol >= 0 && p.newCol < cols
    );

    if (!allValid) { setDragGroup(null); return; }

    // Check target cells are either empty(null), empty table(0), or occupied by same group
    const groupIds = new Set(group);
    const allFree = newPositions.every((p) => {
      const targetCell = layoutData[p.newRow][p.newCol];
      return targetCell === null || targetCell === 0 || (typeof targetCell === 'number' && groupIds.has(targetCell));
    });

    if (!allFree) { setDragGroup(null); return; }

    // Move the group
    const newData = layoutData.map((r) => [...r]);
    // Clear old positions
    currentPositions.forEach((p) => {
      newData[p.row][p.col] = 0; // leave as empty table
    });
    // Place at new positions
    newPositions.forEach((p) => {
      newData[p.newRow][p.newCol] = p.studentId;
    });

    setLayoutData(newData);
    setDragGroup(null);
  };

  // Check if any tables are placed on the grid
  const hasTables = layoutData.some((row) =>
    row.some((cell) => cell === 0 || (typeof cell === 'number' && cell > 0))
  );

  const selectedKlasData = klassen.find((k) => String(k.id) === selectedKlas);
  const unplacedStudents = getUnplacedStudents();
  const CELL_SIZE = 80;

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
          href={selectedKlas ? `/klassen?klas_id=${selectedKlas}` : '/klassen'}
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
              value={selectedLayout ? String(selectedLayout.id) : ''}
              onChange={(e) => {
                const layout = layouts.find((l) => String(l.id) === e.target.value);
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

          {/* Groepjes overlay - only when tables exist */}
          {(layoutName || selectedLayout) && groepjesSets.length > 0 && hasTables && (
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Groepjes</label>
              <select
                value={activeGroepjes ? String(activeGroepjes.id) : ''}
                onChange={(e) => {
                  if (!e.target.value) { setActiveGroepjes(null); return; }
                  const g = groepjesSets.find((s) => String(s.id) === e.target.value);
                  setActiveGroepjes(g || null);
                }}
                style={{ padding: '0.5rem', border: activeGroepjes ? '2px solid #f59e0b' : '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', width: '100%' }}
              >
                <option value="">Geen overlay</option>
                {groepjesSets.map((g) => (
                  <option key={g.id} value={g.id}>{g.naam} ({g.groepjes_data.length} gr.)</option>
                ))}
              </select>
              {activeGroepjes && (
                <button
                  onClick={placeGroepjesOnGrid}
                  style={{ marginTop: 4, padding: '0.4rem 0.6rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', width: '100%' }}
                >
                  Op grid plaatsen
                </button>
              )}
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

      {/* Layout name + actions */}
      {(layoutName || selectedLayout) && (
        <div style={{ background: 'white', borderRadius: 12, padding: '1rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Naam:</label>
            <input
              type="text" value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              placeholder="Geef deze opstelling een naam"
              style={{ padding: '0.5rem 0.75rem', border: '2px solid #c7d2fe', borderRadius: 8, fontSize: '1rem', flex: 1, fontWeight: 600, color: '#1e293b' }}
            />
            <button onClick={saveLayout} disabled={loading}
              style={{ padding: '0.5rem 1.2rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              Opslaan
            </button>
            {selectedLayout && !selectedLayout.is_actief && (
              <button onClick={setActiveLayout} disabled={loading}
                style={{ padding: '0.5rem 1.2rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                Actief maken
              </button>
            )}
            {selectedLayout?.is_actief && (
              <span style={{ padding: '0.5rem 0.75rem', background: '#dcfce7', color: '#16a34a', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600 }}>
                Actief
              </span>
            )}
            {selectedLayout && (
              <button onClick={deleteLayout} disabled={loading}
                style={{ padding: '0.5rem 1.2rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                Verwijderen
              </button>
            )}
          </div>
          {/* Step indicators + mode toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginRight: '0.5rem' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700,
                background: editMode === 'tables' ? '#4f46e5' : (hasTables ? '#22c55e' : '#e2e8f0'),
                color: editMode === 'tables' ? 'white' : (hasTables ? 'white' : '#94a3b8'),
              }}>1</div>
              <div style={{ width: 20, height: 2, background: hasTables ? '#22c55e' : '#d1d5db' }} />
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700,
                background: editMode === 'students' ? '#4f46e5' : (hasTables ? '#e2e8f0' : '#f1f5f9'),
                color: editMode === 'students' ? 'white' : (hasTables ? '#475569' : '#cbd5e1'),
              }}>2</div>
            </div>
            <button
              onClick={() => setEditMode('tables')}
              style={{
                padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                background: editMode === 'tables' ? '#4f46e5' : '#e2e8f0',
                color: editMode === 'tables' ? 'white' : '#475569',
              }}
            >
              Stap 1: Tafels plaatsen
            </button>
            <button
              onClick={() => { if (hasTables) setEditMode('students'); }}
              title={!hasTables ? 'Plaats eerst tafels op het grid' : ''}
              style={{
                padding: '0.5rem 1.2rem', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.9rem',
                cursor: hasTables ? 'pointer' : 'not-allowed',
                background: editMode === 'students' ? '#4f46e5' : (hasTables ? '#e2e8f0' : '#f1f5f9'),
                color: editMode === 'students' ? 'white' : (hasTables ? '#475569' : '#cbd5e1'),
                opacity: hasTables ? 1 : 0.6,
              }}
            >
              Stap 2: Leerlingen plaatsen
            </button>
            {!hasTables && editMode === 'tables' && (
              <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontStyle: 'italic' }}>
                Klik op cellen om tafels neer te zetten
              </span>
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
                  const colorMap = studentGroupColor();
                  const groupColor = student ? colorMap.get(student.id) : undefined;

                  // Find which group this student belongs to
                  const studentGroupIndex = activeGroepjes && student
                    ? activeGroepjes.groepjes_data.findIndex((g) => g.includes(student.id))
                    : -1;

                  return (
                    <div
                      key={`${r}-${c}`}
                      onDragStart={(e) => {
                        if (activeGroepjes && studentGroupIndex >= 0) {
                          handleGroupDragStart(e, studentGroupIndex);
                        } else {
                          handleCellDragStart(e, r, c);
                        }
                      }}
                      onDragOver={handleCellDragOver}
                      onDrop={(e) => {
                        if (dragGroup !== null) {
                          handleGroupDrop(e, r, c);
                        } else {
                          handleCellDrop(e, r, c);
                        }
                      }}
                      onClick={() => toggleTable(r, c)}
                      draggable={editMode === 'students' && typeof cell === 'number' && cell > 0}
                      style={{
                        width: CELL_SIZE, height: CELL_SIZE, borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: editMode === 'tables' ? 'pointer' : (typeof cell === 'number' && cell > 0 ? 'grab' : 'default'),
                        background: isTable
                          ? (groupColor ? groupColor : (student ? '#334155' : (editMode === 'students' ? '#c8d6e5' : '#64748b')))
                          : (editMode === 'tables' ? '#ffffff' : 'transparent'),
                        border: isTable
                          ? (groupColor ? `3px solid ${groupColor}` : (student ? 'none' : (editMode === 'students' ? '2px dashed #94a3b8' : 'none')))
                          : (editMode === 'tables' ? '2px dashed #cbd5e1' : '1px solid transparent'),
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
                      {student && hasFoto && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1,
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                          borderRadius: '0 0 6px 6px', padding: '12px 4px 3px',
                          textAlign: 'center',
                        }}>
                          <div style={{ color: 'white', fontWeight: 600, fontSize: '0.75rem', lineHeight: 1.2, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {student.voornaam}
                          </div>
                        </div>
                      )}
                      {student && !hasFoto && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: 'white', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3 }}>
                            {student.voornaam}
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: '0.7rem', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: CELL_SIZE - 12 }}>
                            {student.achternaam}
                          </div>
                        </div>
                      )}
                      {/* Group badge */}
                      {studentGroupIndex >= 0 && (
                        <div style={{
                          position: 'absolute', top: 2, right: 2, zIndex: 2,
                          width: 18, height: 18, borderRadius: '50%',
                          background: GROUP_COLORS[studentGroupIndex % GROUP_COLORS.length],
                          color: 'white', fontSize: '0.65rem', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}>
                          {studentGroupIndex + 1}
                        </div>
                      )}
                      {isTable && !student && (
                        <div style={{ color: editMode === 'students' ? '#64748b' : '#cbd5e1', fontSize: '0.65rem', textAlign: 'center', fontWeight: editMode === 'students' ? 600 : 400 }}>
                          {editMode === 'students' ? 'leeg' : ''}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#64748b' }}>
              {editMode === 'tables'
                ? (hasTables
                    ? 'Klik op cellen om tafels toe te voegen of te verwijderen. Klaar? Ga naar stap 2.'
                    : 'Klik op cellen om tafels neer te zetten')
                : 'Sleep leerlingen van rechts naar een tafel. Lege tafels zijn lichtgrijs.'}
            </p>

            {/* Groepjes legenda */}
            {activeGroepjes && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '0.4rem' }}>
                  Groepjes: {activeGroepjes.naam}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {activeGroepjes.groepjes_data.map((group, gi) => (
                    <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: GROUP_COLORS[gi % GROUP_COLORS.length] }} />
                      <span style={{ fontSize: '0.8rem', color: '#475569' }}>Groep {gi + 1} ({group.length})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
