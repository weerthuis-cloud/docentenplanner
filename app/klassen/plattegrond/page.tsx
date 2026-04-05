'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

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

export default function PlattegrondPage() {
  const searchParams = useSearchParams();
  const initialKlasId = searchParams.get('klas_id') || '';

  // State for classes and students
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<string>(initialKlasId);
  const [students, setStudents] = useState<Student[]>([]);

  // State for layouts
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<Layout | null>(null);
  const [layoutName, setLayoutName] = useState('');
  const [layoutData, setLayoutData] = useState<LayoutData>([]);

  // State for grid configuration
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(12);

  // State for UI
  const [editMode, setEditMode] = useState<EditMode>('tables');
  const [draggedStudent, setDraggedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
          setSelectedKlas(data[0].id);
        }
      } catch (err) {
        setError('Fout bij laden van klassen');
        console.error(err);
      }
    };
    fetchKlassen();
  }, []);

  // Load students when class changes
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
        setSelectedLayout(null);
        setLayoutName('');
        initializeEmptyGrid();
      } catch (err) {
        setError('Fout bij laden van opstellingen');
        console.error(err);
      }
    };

    fetchStudents();
    fetchLayouts();
  }, [selectedKlas]);

  // Initialize empty grid
  const initializeEmptyGrid = useCallback(() => {
    const newGrid: LayoutData = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(null));
    setLayoutData(newGrid);
    setLayoutName('');
    setEditMode('tables');
  }, [rows, cols]);

  // Load a saved layout
  const loadLayout = (layout: Layout) => {
    setSelectedLayout(layout);
    setLayoutName(layout.naam);
    setLayoutData(layout.layout_data);
    setRows(layout.layout_data.length);
    setCols(layout.layout_data[0]?.length || 12);
    setEditMode('tables');
  };

  // Create new layout
  const createNewLayout = () => {
    setSelectedLayout(null);
    setLayoutName('Nieuwe opstelling');
    initializeEmptyGrid();
  };

  // Get unplaced students
  const getUnplacedStudents = useCallback(() => {
    const placedIds = new Set<number>();
    layoutData.forEach((row) => {
      row.forEach((cell) => {
        if (typeof cell === 'number') {
          placedIds.add(cell);
        }
      });
    });
    return students.filter((s) => !placedIds.has(s.id));
  }, [layoutData, students]);

  // Get student by ID
  const getStudentById = useCallback(
    (id: number) => students.find((s) => s.id === id),
    [students]
  );

  // Get initials for a student
  const getInitials = (student: Student): string => {
    const first = student.voornaam.charAt(0).toUpperCase();
    const last = student.achternaam.charAt(0).toUpperCase();
    return first + last;
  };

  // Toggle table in edit mode
  const toggleTable = (row: number, col: number) => {
    if (editMode !== 'tables') return;
    const newData = layoutData.map((r) => [...r]);
    const current = newData[row][col];
    newData[row][col] = current === 0 || typeof current === 'number' ? null : 0;
    setLayoutData(newData);
  };

  // Drag handlers
  const handleStudentDragStart = (
    e: React.DragEvent,
    student: Student
  ) => {
    if (editMode !== 'students') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedStudent(student);
  };

  const handleCellDragStart = (
    e: React.DragEvent,
    row: number,
    col: number
  ) => {
    if (editMode !== 'students') {
      e.preventDefault();
      return;
    }
    const cell = layoutData[row][col];
    if (typeof cell === 'number') {
      dragSourceRef.current = { row, col };
      e.dataTransfer.effectAllowed = 'move';
    } else {
      e.preventDefault();
    }
  };

  const handleCellDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect =
      editMode === 'students' ? 'move' : 'none';
  };

  const handleCellDrop = (
    e: React.DragEvent,
    row: number,
    col: number
  ) => {
    e.preventDefault();
    if (editMode !== 'students') return;

    const cell = layoutData[row][col];
    // Only allow dropping on tables (cells that are 0 or have a student)
    if (cell === null) return;

    const newData = layoutData.map((r) => [...r]);

    // If dragging from sidebar
    if (draggedStudent) {
      newData[row][col] = draggedStudent.id;
      setDraggedStudent(null);
    }
    // If dragging from another cell
    else if (dragSourceRef.current) {
      const source = dragSourceRef.current;
      const studentId = newData[source.row][source.col];
      if (typeof studentId === 'number') {
        newData[source.row][source.col] = 0; // Leave empty table
        newData[row][col] = studentId;
      }
      dragSourceRef.current = null;
    }

    setLayoutData(newData);
  };

  // Save layout
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

      if (selectedLayout) {
        payload.id = selectedLayout.id;
      }

      const method = 'POST';
      const res = await fetch('/api/layout', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save layout');

      // Refresh layouts
      const layoutsRes = await fetch(`/api/layout?klas_id=${selectedKlas}`);
      const updatedLayouts = await layoutsRes.json();
      setLayouts(updatedLayouts);
      setError('');
    } catch (err) {
      setError('Fout bij opslaan van opstelling');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Delete layout
  const deleteLayout = async () => {
    if (!selectedLayout) return;

    if (!confirm(`Weet je zeker dat je "${selectedLayout.naam}" wilt verwijderen?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/layout?id=${selectedLayout.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete layout');

      // Refresh layouts
      const layoutsRes = await fetch(`/api/layout?klas_id=${selectedKlas}`);
      const updatedLayouts = await layoutsRes.json();
      setLayouts(updatedLayouts);
      setSelectedLayout(null);
      setLayoutName('');
      initializeEmptyGrid();
      setError('');
    } catch (err) {
      setError('Fout bij verwijderen van opstelling');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Set layout as active
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

      // Update local state
      const updatedLayouts = layouts.map((l) => ({
        ...l,
        is_actief: l.id === selectedLayout.id,
      }));
      setLayouts(updatedLayouts);
      setSelectedLayout({ ...selectedLayout, is_actief: true });
      setError('');
    } catch (err) {
      setError('Fout bij activeren van opstelling');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Apply template presets
  const applyTemplate = (templateName: string) => {
    const newData = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(null));

    if (templateName === 'rijen-van-2') {
      // Two students per table in rows
      for (let r = 0; r < rows; r += 2) {
        for (let c = 0; c < cols; c++) {
          newData[r][c] = 0;
        }
      }
    } else if (templateName === 'groepjes-van-4') {
      // 2x2 groups of tables
      for (let r = 0; r < rows; r += 2) {
        for (let c = 0; c < cols; c += 2) {
          newData[r][c] = 0;
          if (c + 1 < cols) newData[r][c + 1] = 0;
          if (r + 1 < rows) {
            newData[r + 1][c] = 0;
            if (c + 1 < cols) newData[r + 1][c + 1] = 0;
          }
        }
      }
    } else if (templateName === 'u-vorm') {
      // U-shaped arrangement
      // Top row
      for (let c = 0; c < cols; c++) {
        newData[0][c] = 0;
      }
      // Bottom row
      for (let c = 0; c < cols; c++) {
        newData[rows - 1][c] = 0;
      }
      // Left column
      for (let r = 1; r < rows - 1; r++) {
        newData[r][0] = 0;
      }
      // Right column
      for (let r = 1; r < rows - 1; r++) {
        newData[r][cols - 1] = 0;
      }
    }

    setLayoutData(newData);
  };

  const unplacedStudents = getUnplacedStudents();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Plattegrond - Zitplanning
          </h1>
          <p className="text-gray-600">
            Maak en beheer zitopstellingen voor je klassen
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Class and Layout Selection */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Class Selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Klas
              </label>
              <div className="relative">
                <select
                  value={selectedKlas}
                  onChange={(e) => setSelectedKlas(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecteer een klas</option>
                  {klassen.map((klas) => (
                    <option key={klas.id} value={klas.id}>
                      {klas.naam}
                    </option>
                  ))}
                </select>
                <span className="absolute right-3 top-2.5 text-gray-400 pointer-events-none">▾</span>
              </div>
            </div>

            {/* Layout Selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Opstelling
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedLayout?.id || ''}
                    onChange={(e) => {
                      const layout = layouts.find((l) => l.id === e.target.value);
                      if (layout) loadLayout(layout);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Selecteer een opstelling</option>
                    {layouts.map((layout) => (
                      <option key={layout.id} value={layout.id}>
                        {layout.naam}
                        {layout.is_actief ? ' (actief)' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-3 top-2.5 text-gray-400 pointer-events-none">▾</span>
                </div>
                <button
                  onClick={createNewLayout}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition"
                >
                  + Nieuw
                </button>
              </div>
            </div>
          </div>

          {/* Layout name and controls */}
          {(layoutName || selectedLayout) && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Naam
                </label>
                <input
                  type="text"
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Voer een naam in"
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={saveLayout}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
                >
                  💾 Opslaan
                </button>

                {selectedLayout && (
                  <>
                    <button
                      onClick={setActiveLayout}
                      disabled={loading || selectedLayout.is_actief}
                      className="flex items-center gap-2 px-6 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
                    >
                      👁 {selectedLayout.is_actief
                        ? 'Actief'
                        : 'Actief maken'}
                    </button>
                    <button
                      onClick={deleteLayout}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
                    >
                      🗑 Verwijderen
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Grid Configuration and Mode Toggle */}
        {(layoutName || selectedLayout) && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {/* Grid size controls */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Rijen
                </label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={rows}
                  onChange={(e) => {
                    const newRows = Math.max(2, Math.min(20, parseInt(e.target.value) || 2));
                    setRows(newRows);
                    // Adjust layout data if needed
                    const newData = Array(newRows)
                      .fill(null)
                      .map((_, i) =>
                        layoutData[i]
                          ? [...layoutData[i]]
                          : Array(cols).fill(null)
                      );
                    setLayoutData(newData);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Kolommen
                </label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={cols}
                  onChange={(e) => {
                    const newCols = Math.max(2, Math.min(20, parseInt(e.target.value) || 2));
                    setCols(newCols);
                    // Adjust layout data if needed
                    const newData = layoutData.map((row) => {
                      const newRow = [...row];
                      while (newRow.length < newCols) newRow.push(null);
                      return newRow.slice(0, newCols);
                    });
                    setLayoutData(newData);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Template presets */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sjabloon
                </label>
                <select
                  onChange={(e) => {
                    if (e.target.value)
                      applyTemplate(e.target.value);
                    e.target.value = '';
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Kies een sjabloon</option>
                  <option value="rijen-van-2">Rijen van 2</option>
                  <option value="groepjes-van-4">Groepjes van 4</option>
                  <option value="u-vorm">U-vorm</option>
                </select>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-4">
              <button
                onClick={() => setEditMode('tables')}
                className={`flex-1 px-4 py-2 font-semibold rounded-lg transition ${
                  editMode === 'tables'
                    ? 'bg-indigo-600 text-white shadow-lg scale-105'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Tafels plaatsen
              </button>
              <button
                onClick={() => setEditMode('students')}
                className={`flex-1 px-4 py-2 font-semibold rounded-lg transition ${
                  editMode === 'students'
                    ? 'bg-indigo-600 text-white shadow-lg scale-105'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Leerlingen plaatsen
              </button>
            </div>
          </div>
        )}

        {/* Main Layout Editor */}
        {(layoutName || selectedLayout) && (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Grid Canvas */}
            <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {editMode === 'tables' ? 'Tafels plaatsen' : 'Leerlingen plaatsen'}
              </h2>

              <div className="overflow-x-auto">
                <div
                  className="inline-block"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 50px)`,
                    gridTemplateRows: `repeat(${rows}, 50px)`,
                    gap: '8px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                  }}
                >
                  {layoutData.map((row, r) =>
                    row.map((cell, c) => {
                      const isTable =
                        cell === 0 || typeof cell === 'number';
                      const student =
                        typeof cell === 'number'
                          ? getStudentById(cell)
                          : null;

                      return (
                        <div
                          key={`${r}-${c}`}
                          onDragStart={(e) =>
                            handleCellDragStart(e, r, c)
                          }
                          onDragOver={handleCellDragOver}
                          onDrop={(e) =>
                            handleCellDrop(e, r, c)
                          }
                          onClick={() => toggleTable(r, c)}
                          draggable={
                            editMode === 'students' &&
                            typeof cell === 'number'
                          }
                          className={`
                            w-12 h-12 rounded-md flex items-center justify-center text-xs font-bold
                            cursor-pointer transition
                            ${
                              isTable
                                ? 'bg-slate-700 text-white shadow-md'
                                : editMode === 'tables'
                                  ? 'border-2 border-dashed border-gray-300 bg-white hover:bg-gray-50'
                                  : 'bg-white'
                            }
                            ${
                              editMode === 'students' &&
                              typeof cell === 'number'
                                ? 'cursor-grab active:cursor-grabbing'
                                : ''
                            }
                            ${
                              draggedStudent !== null
                                ? 'ring-2 ring-blue-400'
                                : ''
                            }
                          `}
                        >
                          {student && (
                            <div className="text-center">
                              <div className="font-bold text-white">
                                {getInitials(student)}
                              </div>
                              <div className="text-xs text-gray-200 truncate max-w-full">
                                {student.voornaam}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {editMode === 'tables' && (
                <p className="mt-4 text-sm text-gray-600">
                  Klik op cellen om tafels toe te voegen of te verwijderen
                </p>
              )}

              {editMode === 'students' && (
                <p className="mt-4 text-sm text-gray-600">
                  Sleep leerlingen van links naar een tafel
                </p>
              )}
            </div>

            {/* Sidebar - Unplaced Students */}
            {editMode === 'students' && (
              <div className="lg:col-span-1 bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Niet geplaatst ({unplacedStudents.length})
                </h3>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {unplacedStudents.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                      Alle leerlingen zijn geplaatst
                    </p>
                  ) : (
                    unplacedStudents.map((student) => (
                      <div
                        key={student.id}
                        draggable
                        onDragStart={(e) =>
                          handleStudentDragStart(e, student)
                        }
                        className="p-3 bg-indigo-100 border border-indigo-300 rounded-lg cursor-grab active:cursor-grabbing hover:bg-indigo-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {getInitials(student)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {student.voornaam}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              {student.achternaam}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!layoutName && !selectedLayout && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-600 mb-4">
              Selecteer een klas en maak een nieuwe opstelling aan om te beginnen
            </p>
            {!selectedKlas && (
              <p className="text-sm text-gray-500">
                Kies eerst een klas uit de dropdown
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
