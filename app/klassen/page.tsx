'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface Klas {
  id: number; naam: string; vak: string; lokaal: string; jaarlaag: string; schooljaar: string; aantal_leerlingen: number;
}

interface Leerling {
  id: number; klas_id: number; voornaam: string; achternaam: string;
  email?: string; mentor?: string; ondersteuningsprofiel?: string[];
  foto_url?: string; foto_data?: string;
  boek_titel: string; boek_kleur: string;
}

interface GroepjesSet {
  id: number; klas_id: number; naam: string; groepjes_data: number[][]; created_at: string;
}

type KlasTab = 'leerlingen' | 'plattegrond' | 'groepjes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPdfJs(): Promise<any> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.pdfjsLib) { resolve(w.pdfjsLib); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = w.pdfjsLib;
      if (!lib) { reject(new Error('pdfjsLib not loaded')); return; }
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

const ONDERSTEUNING_OPTIES = [
  'Dyslexie', 'Dyscalculie', 'ADHD', 'ADD', 'ASS',
  'Extra tijd', 'Time-out kaart', 'Vooraan zitten',
  'Hoogbegaafd', 'NT2', 'Rugzakje',
  'Aangepaste toets', 'Visuele ondersteuning', 'Prikkelarm',
];

const GROUP_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'];

export default function KlassenPage() {
  const [klassen, setKlassen] = useState<Klas[]>([]);
  const [selectedKlas, setSelectedKlas] = useState<number | null>(null);
  const [leerlingen, setLeerlingen] = useState<Leerling[]>([]);
  const [groepjesSets, setGroepjesSets] = useState<GroepjesSet[]>([]);
  const [activeTab, setActiveTab] = useState<KlasTab>('leerlingen');

  // Klas CRUD
  const [showNewKlas, setShowNewKlas] = useState(false);
  const [newKlas, setNewKlas] = useState({ naam: '', vak: 'Nederlands', lokaal: '', jaarlaag: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Leerling CRUD
  const [showNewLeerling, setShowNewLeerling] = useState(false);
  const [newLeerling, setNewLeerling] = useState({ voornaam: '', achternaam: '', email: '', mentor: '' });
  const [editLeerling, setEditLeerling] = useState<Leerling | null>(null);
  const [showOndersteuning, setShowOndersteuning] = useState<number | null>(null);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'excel' | 'pdf' | null>(null);
  const [importPreview, setImportPreview] = useState<{ voornaam: string; achternaam: string; email?: string; mentor?: string; foto_data?: string }[]>([]);
  const [importDuplicates, setImportDuplicates] = useState<{ existing: Leerling; imported: { voornaam: string; achternaam: string; email?: string; mentor?: string; foto_data?: string } }[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchKlassen(); }, []);
  useEffect(() => {
    if (selectedKlas) {
      fetchLeerlingen(selectedKlas);
      fetchGroepjes(selectedKlas);
    }
  }, [selectedKlas]);

  async function fetchKlassen() {
    const res = await fetch('/api/klassen');
    const data = await res.json().catch(() => []);
    setKlassen(data);
    if (data.length > 0 && !selectedKlas) setSelectedKlas(data[0].id);
  }

  async function fetchLeerlingen(klasId: number) {
    const res = await fetch(`/api/leerlingen?klas_id=${klasId}`);
    const data = await res.json().catch(() => []);
    setLeerlingen(data);
  }

  async function fetchGroepjes(klasId: number) {
    const res = await fetch(`/api/groepjes?klas_id=${klasId}`);
    const data = await res.json().catch(() => []);
    setGroepjesSets(data);
  }

  // === KLAS CRUD ===
  async function createKlas() {
    if (!newKlas.naam.trim()) return;
    await fetch('/api/klassen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newKlas) });
    setNewKlas({ naam: '', vak: 'Nederlands', lokaal: '', jaarlaag: '' });
    setShowNewKlas(false);
    fetchKlassen();
  }

  async function deleteKlas(id: number) {
    const klas = klassen.find(k => k.id === id);
    if (!klas) return;
    if (deleteConfirmText !== klas.naam) {
      setError(`Typ "${klas.naam}" om te bevestigen`);
      return;
    }
    await fetch(`/api/klassen?id=${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    setDeleteConfirmText('');
    setSelectedKlas(null);
    setLeerlingen([]);
    fetchKlassen();
    setSuccess('Klas verwijderd');
    setTimeout(() => setSuccess(''), 2000);
  }

  // === LEERLING CRUD ===
  async function createLeerling() {
    if (!newLeerling.voornaam.trim() || !newLeerling.achternaam.trim() || !selectedKlas) return;
    await fetch('/api/leerlingen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newLeerling, klas_id: selectedKlas }),
    });
    setNewLeerling({ voornaam: '', achternaam: '', email: '', mentor: '' });
    setShowNewLeerling(false);
    fetchLeerlingen(selectedKlas);
    fetchKlassen();
  }

  async function updateLeerling() {
    if (!editLeerling) return;
    await fetch('/api/leerlingen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editLeerling),
    });
    setEditLeerling(null);
    if (selectedKlas) fetchLeerlingen(selectedKlas);
  }

  const [deleteLeerlingConfirm, setDeleteLeerlingConfirm] = useState<number | null>(null);

  async function deleteLeerling(id: number) {
    await fetch(`/api/leerlingen?id=${id}`, { method: 'DELETE' });
    setDeleteLeerlingConfirm(null);
    if (selectedKlas) fetchLeerlingen(selectedKlas);
    fetchKlassen();
  }

  async function toggleOndersteuning(leerlingId: number, tag: string) {
    const ll = leerlingen.find(l => l.id === leerlingId);
    if (!ll) return;
    const current = ll.ondersteuningsprofiel || [];
    const updated = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag];
    await fetch('/api/leerlingen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leerlingId, ondersteuningsprofiel: updated }),
    });
    if (selectedKlas) fetchLeerlingen(selectedKlas);
  }

  // === IMPORT: EXCEL (supports .xlsx, .csv, .tsv) ===
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function loadSheetJS(): Promise<any> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.XLSX) { resolve(w.XLSX); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = () => { resolve(w.XLSX); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function downloadExcelTemplate() {
    const header = 'Roepnaam\tTussenvoegsel\tAchternaam\tEmail\tMentor';
    const ex1 = 'Jan\tvan\tJansen\tjan@school.nl\tMevr. De Vries';
    const ex2 = 'Fatima\t\tEl Amrani\tfatima@school.nl\tDhr. Bakker';
    const tsv = header + '\n' + ex1 + '\n' + ex2 + '\n';
    const blob = new Blob(['\ufeff' + tsv], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leerlingen_template.xls'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportMsg('Bestand wordt verwerkt...');

    try {
      const XLSX = await loadSheetJS();
      const data = new Uint8Array(await file.arrayBuffer());
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

      // Find the header row (contains "Roepnaam" or "Achternaam" or "voornaam")
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((c: unknown) => String(c || '').toLowerCase());
        if (row.some((c: string) => c.includes('roepnaam') || c.includes('voornaam') || c.includes('achternaam'))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        setImportMsg('Geen herkenbare header gevonden (verwacht: Roepnaam/Voornaam, Achternaam)');
        setImportLoading(false);
        return;
      }

      const cols = rows[headerIdx].map((c: unknown) => String(c || '').toLowerCase().trim());

      // Magister format: Roepnaam, Tussenvoegsel, Achternaam, Klas, Email, Persoonlijke mentor 1
      const vnIdx = cols.findIndex((c: string) => c.includes('roepnaam') || c.includes('voornaam'));
      const tvIdx = cols.findIndex((c: string) => c.includes('tussenvoegsel'));
      const anIdx = cols.findIndex((c: string) => c.includes('achternaam'));
      const emIdx = cols.findIndex((c: string) => c.includes('email') || c.includes('e-mail'));
      const meIdx = cols.findIndex((c: string) => c.includes('mentor'));
      const klasIdx = cols.findIndex((c: string) => c === 'klas');

      if (vnIdx === -1 || anIdx === -1) {
        setImportMsg('Kolommen "Roepnaam"/"Voornaam" en "Achternaam" niet gevonden.');
        setImportLoading(false);
        return;
      }

      let detectedKlas = '';
      const parsed = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const voornaam = String(row[vnIdx] || '').trim();
        const achternaamRaw = String(row[anIdx] || '').trim();
        if (!voornaam || !achternaamRaw) continue;
        if (voornaam.toLowerCase() === 'totaal') continue; // Skip Magister totaal row

        // Combine tussenvoegsel + achternaam
        const tv = tvIdx >= 0 ? String(row[tvIdx] || '').trim() : '';
        const achternaam = tv ? `${tv} ${achternaamRaw}` : achternaamRaw;

        if (klasIdx >= 0 && !detectedKlas) detectedKlas = String(row[klasIdx] || '').trim();

        parsed.push({
          voornaam,
          achternaam,
          email: emIdx >= 0 ? String(row[emIdx] || '').trim() : '',
          mentor: meIdx >= 0 ? String(row[meIdx] || '').trim() : '',
        });
      }

      if (parsed.length === 0) {
        setImportMsg('Geen leerlingen gevonden in het bestand');
        setImportLoading(false);
        return;
      }

      // Check duplicates
      const dupes: typeof importDuplicates = [];
      const newOnes: typeof importPreview = [];
      for (const imp of parsed) {
        const match = leerlingen.find(l =>
          l.voornaam.toLowerCase() === imp.voornaam.toLowerCase() &&
          l.achternaam.toLowerCase() === imp.achternaam.toLowerCase()
        );
        if (match) {
          dupes.push({ existing: match, imported: imp });
        } else {
          newOnes.push(imp);
        }
      }

      setImportPreview(newOnes);
      setImportDuplicates(dupes);
      setImportMsg(`${parsed.length} leerlingen gevonden${detectedKlas ? ` (klas: ${detectedKlas})` : ''}: ${newOnes.length} nieuw, ${dupes.length} al bestaand`);
    } catch (err) {
      console.error('Excel parse error:', err);
      setImportMsg('Fout bij verwerken bestand. Controleer het formaat.');
    }
    setImportLoading(false);
    e.target.value = '';
  }

  // === IMPORT: PDF (Magister fotoboek) - client-side parsing ===
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportMsg('Fotoboek wordt verwerkt...');

    try {
      // Load pdf.js from CDN
      const pdfjsLib = await loadPdfJs();

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type PdfItem = { str: string; transform: number[]; width: number };
      const OPS = pdfjsLib.OPS;

      let klasNaam = '';
      // Names with their x,y position for spatial matching
      const namesWithPos: { voornaam: string; achternaam: string; x: number; y: number }[] = [];
      // Photos with their x,y position
      const photosWithPos: { x: number; y: number; dataUrl: string }[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items: PdfItem[] = content.items as PdfItem[];

        // Extract klas name from text
        const fullText = items.map(it => it.str).join('');
        const klasMatch = fullText.match(/Klas\/\s*groep:\s*([A-Za-z0-9]+?)(?:Lesperiode|$)/i);
        if (klasMatch && !klasNaam) klasNaam = klasMatch[1];

        // Group items by y-coordinate (same visual row)
        const rows: Record<number, PdfItem[]> = {};
        for (const item of items) {
          const y = Math.round(item.transform[5] / 3) * 3;
          if (!rows[y]) rows[y] = [];
          rows[y].push(item);
        }

        // Sort rows top-to-bottom (high y = top of page)
        const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
        let pendingSingle = '';

        for (const y of sortedYs) {
          const rowItems = rows[y];
          rowItems.sort((a, b) => a.transform[4] - b.transform[4]);

          // Build name segments: wide spaces (>15px) separate different students
          const segments: { text: string; x: number }[] = [];
          let current = '';
          let currentX = rowItems[0]?.transform[4] || 0;
          for (const item of rowItems) {
            if (item.str.trim() === '' && item.width > 15) {
              if (current.trim()) segments.push({ text: current.trim(), x: currentX });
              current = '';
              currentX = item.transform[4] + item.width;
            } else {
              if (!current) currentX = item.transform[4];
              current += item.str;
            }
          }
          if (current.trim()) segments.push({ text: current.trim(), x: currentX });

          // Filter name segments: remove headers/footers, keep only letter-based text
          const nameSegs: { text: string; x: number }[] = [];
          for (const seg of segments) {
            if (/^Fotolijst$|Lesperiode|Gebruiker|groep:|^Klas\//i.test(seg.text)) continue;
            if (/\d/.test(seg.text)) continue;
            if (/^P\.\s/i.test(seg.text)) continue;
            if (!/^[\p{L}\s\-'\.]+$/u.test(seg.text)) continue;
            nameSegs.push(seg);
          }
          // Parse: multi-word segments are "Voornaam Achternaam", single words get paired
          for (const seg of nameSegs) {
            const parts = seg.text.split(/\s+/);
            if (parts.length >= 2) {
              if (pendingSingle) { pendingSingle = ''; }
              namesWithPos.push({ voornaam: parts[0], achternaam: parts.slice(1).join(' '), x: seg.x, y });
            } else if (parts[0].length > 1) {
              if (pendingSingle) {
                namesWithPos.push({ voornaam: pendingSingle, achternaam: parts[0], x: seg.x, y });
                pendingSingle = '';
              } else {
                pendingSingle = parts[0];
              }
            }
          }
        }

        // === Extract photos with positions using operator list ===
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ops = await (page as any).getOperatorList();
        const mStack: number[][] = [];
        let cm = [1, 0, 0, 1, 0, 0];

        for (let j = 0; j < ops.fnArray.length; j++) {
          const fn = ops.fnArray[j];
          const args = ops.argsArray[j];

          if (fn === OPS.save) {
            mStack.push([...cm]);
          } else if (fn === OPS.restore) {
            cm = mStack.pop() || [1, 0, 0, 1, 0, 0];
          } else if (fn === OPS.transform) {
            const [ta, tb, tc, td, te, tf] = args;
            cm = [
              cm[0]*ta + cm[2]*tb, cm[1]*ta + cm[3]*tb,
              cm[0]*tc + cm[2]*td, cm[1]*tc + cm[3]*td,
              cm[0]*te + cm[2]*tf + cm[4], cm[1]*te + cm[3]*tf + cm[5],
            ];
          } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
            const imgW = Math.abs(cm[0]);
            const imgH = Math.abs(cm[3]);
            // Filter for student passport photos (square, 80-400px)
            if (imgW >= 80 && imgW <= 400 && imgH >= 80 && imgH <= 400 && Math.abs(imgW - imgH) < 50) {
              const imgX = cm[4];
              const imgY = cm[5];
              const imgName = args[0];
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgObj: any = await new Promise((resolve) => {
                  page.objs.get(imgName, resolve);
                });
                // Render small image to canvas for base64
                const canvas = document.createElement('canvas');
                canvas.width = imgObj.width;
                canvas.height = imgObj.height;
                const ctx = canvas.getContext('2d')!;
                const imageData = ctx.createImageData(imgObj.width, imgObj.height);
                imageData.data.set(imgObj.data);
                ctx.putImageData(imageData, 0, 0);
                photosWithPos.push({ x: imgX, y: imgY, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
              } catch { /* skip if image data unavailable */ }
            }
          }
        }
      }

      if (namesWithPos.length === 0) {
        setImportMsg('Geen namen gevonden. Controleer of het een Magister fotolijst is.');
        setImportLoading(false);
        return;
      }

      // Match each name to the closest photo ABOVE it (photo y > name y, similar x)
      setImportMsg(`${namesWithPos.length} namen gevonden, foto's worden gekoppeld...`);
      const namesWithPhotos = namesWithPos.map(name => {
        let bestPhoto: string | undefined;
        let bestDist = Infinity;
        for (const photo of photosWithPos) {
          // Photo should be above the name (higher y in PDF coords) and close in x
          const dx = Math.abs(photo.x - name.x);
          const dy = photo.y - name.y; // positive = photo is above name
          if (dy > 0 && dx < 150) {
            const dist = dx + dy;
            if (dist < bestDist) {
              bestDist = dist;
              bestPhoto = photo.dataUrl;
            }
          }
        }
        return { voornaam: name.voornaam, achternaam: name.achternaam, foto_data: bestPhoto };
      });

      // Check duplicates
      const dupes: typeof importDuplicates = [];
      const newOnes: typeof importPreview = [];
      for (const imp of namesWithPhotos) {
        const match = leerlingen.find(l =>
          l.voornaam.toLowerCase() === imp.voornaam.toLowerCase() &&
          l.achternaam.toLowerCase() === imp.achternaam.toLowerCase()
        );
        if (match) {
          dupes.push({ existing: match, imported: imp });
        } else {
          newOnes.push(imp);
        }
      }

      setImportPreview(newOnes);
      setImportDuplicates(dupes);
      const photoCount = photos.filter(p => p).length;
      setImportMsg(`${names.length} leerlingen uit PDF${photoCount > 0 ? ` met ${photoCount} foto's` : ''}: ${newOnes.length} nieuw, ${dupes.length} al bestaand${klasNaam ? ` (klas: ${klasNaam})` : ''}`);
    } catch (err) {
      console.error('PDF parse error:', err);
      setImportMsg('Fout bij verwerken PDF. Controleer of het een geldig PDF-bestand is.');
    }
    setImportLoading(false);
    e.target.value = '';
  }

  async function executeImport(includeUpdates: boolean) {
    if (!selectedKlas) return;
    setImportLoading(true);

    // Insert new students
    if (importPreview.length > 0) {
      const rows = importPreview.map(s => ({ ...s, klas_id: selectedKlas }));
      await fetch('/api/leerlingen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
    }

    // Update duplicates if requested
    if (includeUpdates && importDuplicates.length > 0) {
      const updates = importDuplicates.map(d => {
        const update: Record<string, unknown> = { id: d.existing.id };
        if (d.imported.email) update.email = d.imported.email;
        if (d.imported.mentor) update.mentor = d.imported.mentor;
        if (d.imported.foto_data) update.foto_data = d.imported.foto_data;
        return update;
      });
      await fetch('/api/leerlingen', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    }

    setImportPreview([]);
    setImportDuplicates([]);
    setShowImport(false);
    setImportMode(null);
    setImportMsg('');
    fetchLeerlingen(selectedKlas);
    fetchKlassen();
    setSuccess(`Import voltooid! ${importPreview.length} leerlingen toegevoegd${includeUpdates ? `, ${importDuplicates.length} bijgewerkt` : ''}`);
    setTimeout(() => setSuccess(''), 3000);
    setImportLoading(false);
  }

  async function deleteGroepjesSet(id: number) {
    if (!confirm('Groepjes verwijderen?')) return;
    await fetch(`/api/groepjes?id=${id}`, { method: 'DELETE' });
    if (selectedKlas) fetchGroepjes(selectedKlas);
  }

  const selectedKlasData = klassen.find(k => k.id === selectedKlas);

  // Styles
  const card: React.CSSProperties = { background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
  const btnP: React.CSSProperties = { background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' };
  const btnS: React.CSSProperties = { background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.9rem' };
  const btnD: React.CSSProperties = { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' };
  const inp: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.9rem', width: '100%' };

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>Klassen</h1>

      {/* Messages */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', color: '#dc2626', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}<button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#16a34a', borderRadius: 8, marginBottom: '1rem', fontSize: '0.9rem' }}>
          {success}
        </div>
      )}

      {/* Klas selector */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {klassen.map(k => (
          <button key={k.id} onClick={() => { setSelectedKlas(k.id); setActiveTab('leerlingen'); }}
            style={{
              padding: '0.6rem 1.2rem', borderRadius: 10,
              border: selectedKlas === k.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
              background: selectedKlas === k.id ? '#eff6ff' : 'white',
              color: selectedKlas === k.id ? '#1d4ed8' : '#475569',
              cursor: 'pointer', fontWeight: selectedKlas === k.id ? 700 : 500, fontSize: '0.95rem',
            }}>
            {k.naam} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({k.aantal_leerlingen})</span>
          </button>
        ))}
        <button onClick={() => setShowNewKlas(true)} style={btnP}>+ Nieuwe klas</button>
      </div>

      {/* New klas form */}
      {showNewKlas && (
        <div style={{ ...card, marginBottom: '1.5rem', border: '2px solid #3b82f6' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600 }}>Nieuwe klas toevoegen</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Naam *</label><input style={inp} placeholder="bijv. M3B" value={newKlas.naam} onChange={e => setNewKlas({ ...newKlas, naam: e.target.value })} /></div>
            <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Vak</label><input style={inp} value={newKlas.vak} onChange={e => setNewKlas({ ...newKlas, vak: e.target.value })} /></div>
            <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Lokaal</label><input style={inp} placeholder="bijv. 214" value={newKlas.lokaal} onChange={e => setNewKlas({ ...newKlas, lokaal: e.target.value })} /></div>
            <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Jaarlaag</label><input style={inp} placeholder="bijv. 3 mavo" value={newKlas.jaarlaag} onChange={e => setNewKlas({ ...newKlas, jaarlaag: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={createKlas} style={btnP}>Opslaan</button>
            <button onClick={() => setShowNewKlas(false)} style={btnS}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Selected klas */}
      {selectedKlasData && (
        <div style={card}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>{selectedKlasData.naam}</h2>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                {selectedKlasData.vak} · {selectedKlasData.jaarlaag} · Lokaal {selectedKlasData.lokaal} · {selectedKlasData.aantal_leerlingen} leerlingen
              </p>
            </div>
            <button onClick={() => { setDeleteConfirm(selectedKlasData.id); setDeleteConfirmText(''); }}
              style={{ ...btnD, fontSize: '0.8rem' }}>Klas verwijderen</button>
          </div>

          {/* Delete confirmation dialog */}
          {deleteConfirm === selectedKlasData.id && (
            <div style={{ padding: '1rem', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 10, marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#dc2626', fontSize: '0.9rem' }}>
                Weet je het zeker? Alle leerlingen, opstellingen en groepjes worden verwijderd.
              </p>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#7f1d1d' }}>
                Typ <strong>&quot;{selectedKlasData.naam}&quot;</strong> om te bevestigen:
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={{ ...inp, width: 200, borderColor: '#fca5a5' }} value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') deleteKlas(selectedKlasData.id); }}
                  placeholder={selectedKlasData.naam} autoFocus />
                <button onClick={() => deleteKlas(selectedKlasData.id)}
                  disabled={deleteConfirmText !== selectedKlasData.naam}
                  style={{ ...btnD, opacity: deleteConfirmText === selectedKlasData.naam ? 1 : 0.4, padding: '0.5rem 1rem' }}>
                  Definitief verwijderen
                </button>
                <button onClick={() => setDeleteConfirm(null)} style={btnS}>Annuleren</button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
            {([
              { key: 'leerlingen' as KlasTab, label: `Leerlingen (${leerlingen.length})` },
              { key: 'plattegrond' as KlasTab, label: 'Plattegrond' },
              { key: 'groepjes' as KlasTab, label: `Groepjes${groepjesSets.length ? ` (${groepjesSets.length})` : ''}` },
            ]).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '0.6rem 1.2rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                  background: activeTab === tab.key ? 'white' : 'transparent',
                  color: activeTab === tab.key ? '#3b82f6' : '#64748b',
                  borderBottom: activeTab === tab.key ? '3px solid #3b82f6' : '3px solid transparent',
                  borderRadius: '8px 8px 0 0',
                  marginBottom: '-2px',
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* === TAB: LEERLINGEN === */}
          {activeTab === 'leerlingen' && (
            <>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button onClick={() => { setShowNewLeerling(true); setShowImport(false); }} style={btnP}>+ Leerling toevoegen</button>
                <button onClick={() => { setShowImport(!showImport); setShowNewLeerling(false); setImportMode(null); setImportPreview([]); setImportDuplicates([]); setImportMsg(''); }}
                  style={{ ...btnS, background: showImport ? '#dbeafe' : '#e2e8f0' }}>
                  Importeren
                </button>
              </div>

              {/* Import section */}
              {showImport && (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1.2rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Leerlingen importeren</h3>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                    <button onClick={() => { setImportMode('excel'); setImportPreview([]); setImportDuplicates([]); setImportMsg(''); }}
                      style={{ padding: '1rem 1.5rem', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
                        border: importMode === 'excel' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                        background: importMode === 'excel' ? '#eff6ff' : 'white',
                        color: importMode === 'excel' ? '#1d4ed8' : '#475569', textAlign: 'center',
                      }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>📊</div>
                      <div>Excel / CSV</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400, marginTop: '0.2rem' }}>
                        Email, mentor, etc.
                      </div>
                    </button>
                    <button onClick={() => { setImportMode('pdf'); setImportPreview([]); setImportDuplicates([]); setImportMsg(''); }}
                      style={{ padding: '1rem 1.5rem', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
                        border: importMode === 'pdf' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                        background: importMode === 'pdf' ? '#eff6ff' : 'white',
                        color: importMode === 'pdf' ? '#1d4ed8' : '#475569', textAlign: 'center',
                      }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>📸</div>
                      <div>Magister PDF</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400, marginTop: '0.2rem' }}>
                        Namen + foto&apos;s
                      </div>
                    </button>
                  </div>

                  {/* Excel import */}
                  {importMode === 'excel' && (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                        Upload het <strong>Magister leerlingenexport</strong> (.xlsx) of een CSV met kolommen: <strong>Roepnaam</strong>, <strong>Tussenvoegsel</strong>, <strong>Achternaam</strong>, en optioneel <strong>Email</strong> en <strong>Mentor</strong>.
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <button onClick={downloadExcelTemplate} style={{ ...btnS, fontSize: '0.85rem' }}>
                          Sjabloon downloaden
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} style={{ ...btnP, fontSize: '0.85rem' }}>
                          Bestand kiezen
                        </button>
                        <input ref={fileInputRef} type="file" accept=".csv,.tsv,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={handleExcelUpload} />
                      </div>
                    </div>
                  )}

                  {/* PDF import */}
                  {importMode === 'pdf' && (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                        Upload de <strong>Fotolijst PDF</strong> uit Magister. Namen en foto&apos;s worden automatisch herkend.
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <button onClick={() => pdfInputRef.current?.click()} disabled={importLoading}
                          style={{ ...btnP, fontSize: '0.85rem', opacity: importLoading ? 0.5 : 1 }}>
                          {importLoading ? 'Verwerken...' : 'PDF kiezen'}
                        </button>
                        <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
                      </div>
                    </div>
                  )}

                  {/* Import message */}
                  {importMsg && (
                    <div style={{ padding: '0.5rem 0.75rem', background: '#dbeafe', color: '#1e40af', borderRadius: 8, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      {importMsg}
                    </div>
                  )}

                  {/* Preview new students */}
                  {importPreview.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem', color: '#16a34a' }}>
                        Nieuw ({importPreview.length}):
                      </h4>
                      <div style={{ maxHeight: 200, overflow: 'auto', fontSize: '0.85rem', color: '#475569' }}>
                        {importPreview.map((s, i) => (
                          <div key={i} style={{ padding: '0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {s.foto_data ? (
                              <img src={s.foto_data} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#94a3b8' }}>
                                {s.voornaam[0]}{s.achternaam[0]}
                              </div>
                            )}
                            <span>{s.voornaam} {s.achternaam}{s.email ? ` · ${s.email}` : ''}{s.mentor ? ` · mentor: ${s.mentor}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Duplicate students */}
                  {importDuplicates.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem', color: '#f59e0b' }}>
                        Al bestaand ({importDuplicates.length}):
                      </h4>
                      <div style={{ maxHeight: 150, overflow: 'auto', fontSize: '0.85rem', color: '#475569' }}>
                        {importDuplicates.map((d, i) => (
                          <div key={i} style={{ padding: '0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {d.imported.foto_data ? (
                              <img src={d.imported.foto_data} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#94a3b8' }}>
                                {d.existing.voornaam[0]}{d.existing.achternaam[0]}
                              </div>
                            )}
                            <span>{d.existing.voornaam} {d.existing.achternaam}
                            {d.imported.email ? ` → email: ${d.imported.email}` : ''}
                            {d.imported.mentor ? ` → mentor: ${d.imported.mentor}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Import action buttons */}
                  {(importPreview.length > 0 || importDuplicates.length > 0) && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => executeImport(false)} disabled={importLoading && importPreview.length === 0}
                        style={{ ...btnP, fontSize: '0.85rem', opacity: importPreview.length === 0 ? 0.4 : 1 }}>
                        {importPreview.length} nieuwe toevoegen
                      </button>
                      {importDuplicates.length > 0 && importDuplicates.some(d => d.imported.email || d.imported.mentor || d.imported.foto_data) && (
                        <button onClick={() => executeImport(true)} disabled={importLoading}
                          style={{ ...btnP, fontSize: '0.85rem', background: '#f59e0b' }}>
                          Toevoegen + {importDuplicates.length} bijwerken
                        </button>
                      )}
                      <button onClick={() => { setImportPreview([]); setImportDuplicates([]); setImportMsg(''); }} style={{ ...btnS, fontSize: '0.85rem' }}>
                        Annuleren
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* New leerling form */}
              {showNewLeerling && (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1.2rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Nieuwe leerling</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                    <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Voornaam *</label><input style={inp} value={newLeerling.voornaam} onChange={e => setNewLeerling({ ...newLeerling, voornaam: e.target.value })} /></div>
                    <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Achternaam *</label><input style={inp} value={newLeerling.achternaam} onChange={e => setNewLeerling({ ...newLeerling, achternaam: e.target.value })} /></div>
                    <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Email</label><input style={inp} placeholder="optioneel" value={newLeerling.email} onChange={e => setNewLeerling({ ...newLeerling, email: e.target.value })} /></div>
                    <div><label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Mentor</label><input style={inp} placeholder="optioneel" value={newLeerling.mentor} onChange={e => setNewLeerling({ ...newLeerling, mentor: e.target.value })} /></div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={createLeerling} style={btnP}>Toevoegen</button>
                      <button onClick={() => setShowNewLeerling(false)} style={btnS}>×</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Leerlingen table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Naam</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Mentor</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Aandachtspunten</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leerlingen.map((l, idx) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#94a3b8', fontSize: '0.85rem' }}>{idx + 1}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {editLeerling?.id === l.id ? (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <input style={{ ...inp, width: 110 }} value={editLeerling.voornaam} onChange={e => setEditLeerling({ ...editLeerling, voornaam: e.target.value })} />
                              <input style={{ ...inp, width: 140 }} value={editLeerling.achternaam} onChange={e => setEditLeerling({ ...editLeerling, achternaam: e.target.value })} />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {(l.foto_url || l.foto_data) ? (
                                <img src={l.foto_data || l.foto_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                                  {l.voornaam.charAt(0)}{l.achternaam.charAt(0)}
                                </div>
                              )}
                              <span style={{ fontWeight: 500, color: '#1e293b' }}>{l.voornaam} {l.achternaam}</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                          {editLeerling?.id === l.id ? (
                            <input style={{ ...inp, width: 160 }} value={editLeerling.email || ''} onChange={e => setEditLeerling({ ...editLeerling, email: e.target.value })} />
                          ) : (
                            l.email || <span style={{ color: '#cbd5e1' }}>–</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                          {editLeerling?.id === l.id ? (
                            <input style={{ ...inp, width: 120 }} value={editLeerling.mentor || ''} onChange={e => setEditLeerling({ ...editLeerling, mentor: e.target.value })} />
                          ) : (
                            l.mentor || <span style={{ color: '#cbd5e1' }}>–</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {(l.ondersteuningsprofiel || []).map(tag => (
                              <span key={tag} style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: 6, fontWeight: 600 }}>
                                {tag}
                              </span>
                            ))}
                            <button onClick={() => setShowOndersteuning(showOndersteuning === l.id ? null : l.id)}
                              style={{ background: 'none', border: '1px dashed #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', padding: '0.1rem 0.3rem' }}>
                              {(l.ondersteuningsprofiel || []).length > 0 ? '...' : '+'}
                            </button>
                          </div>
                          {/* Ondersteuning popup */}
                          {showOndersteuning === l.id && (
                            <div style={{ position: 'absolute', zIndex: 50, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: '0.3rem', maxWidth: 320 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
                                Aandachtspunten - {l.voornaam}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {ONDERSTEUNING_OPTIES.map(opt => {
                                  const active = (l.ondersteuningsprofiel || []).includes(opt);
                                  return (
                                    <button key={opt} onClick={() => toggleOndersteuning(l.id, opt)}
                                      style={{
                                        padding: '0.25rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                        border: active ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                                        background: active ? '#fef3c7' : 'white',
                                        color: active ? '#92400e' : '#64748b',
                                      }}>
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                              <button onClick={() => setShowOndersteuning(null)} style={{ ...btnS, fontSize: '0.75rem', marginTop: '0.5rem', padding: '0.3rem 0.6rem' }}>Sluiten</button>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                          {editLeerling?.id === l.id ? (
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              <button onClick={updateLeerling} style={{ ...btnP, fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>Opslaan</button>
                              <button onClick={() => setEditLeerling(null)} style={{ ...btnS, fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>×</button>
                            </div>
                          ) : deleteLeerlingConfirm === l.id ? (
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{l.voornaam} verwijderen?</span>
                              <button onClick={() => deleteLeerling(l.id)} style={{ ...btnD, fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: '#dc2626', color: 'white' }}>Ja</button>
                              <button onClick={() => setDeleteLeerlingConfirm(null)} style={{ ...btnS, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>Nee</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              <button onClick={() => setEditLeerling({ ...l })} style={{ ...btnS, fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>Bewerken</button>
                              <button onClick={() => setDeleteLeerlingConfirm(l.id)} style={{ ...btnD, fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>×</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {leerlingen.length === 0 && (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.95rem' }}>
                  Nog geen leerlingen. Voeg er een toe of importeer ze via Excel of Magister PDF.
                </p>
              )}
            </>
          )}

          {/* === TAB: PLATTEGROND === */}
          {activeTab === 'plattegrond' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '1rem' }}>
                Beheer de zitopstelling voor {selectedKlasData.naam}
              </p>
              <Link href={`/klassen/plattegrond?klas_id=${selectedKlasData.id}`}
                style={{ ...btnP, textDecoration: 'none', display: 'inline-block', padding: '0.75rem 2rem', fontSize: '1rem' }}>
                Open Plattegrond
              </Link>
            </div>
          )}

          {/* === TAB: GROEPJES === */}
          {activeTab === 'groepjes' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <Link href={`/klassen/groepjes?klas_id=${selectedKlasData.id}`}
                  style={{ ...btnP, textDecoration: 'none', fontSize: '0.85rem' }}>
                  + Nieuwe groepjes maken
                </Link>
              </div>
              {groepjesSets.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.95rem' }}>
                  Nog geen groepjes. Maak je eerste set aan.
                </p>
              ) : (
                groepjesSets.map((set) => (
                  <div key={set.id} style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{set.naam}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                          ({set.groepjes_data.length} groepen, {set.groepjes_data.flat().length} leerlingen)
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Link href={`/klassen/plattegrond?klas_id=${selectedKlasData.id}&groepjes_id=${set.id}`}
                          style={{ ...btnS, textDecoration: 'none', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
                          Op plattegrond
                        </Link>
                        <button onClick={() => deleteGroepjesSet(set.id)} style={{ ...btnD, fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>×</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {set.groepjes_data.map((group, gi) => (
                        <div key={gi} style={{ background: 'white', borderRadius: 8, padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', minWidth: 120 }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: GROUP_COLORS[gi % GROUP_COLORS.length], marginBottom: '0.3rem' }}>Groep {gi + 1}</div>
                          <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                            {group.map((id) => { const ll = leerlingen.find((l) => l.id === id); return ll ? <div key={id}>{ll.voornaam} {ll.achternaam}</div> : null; })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
