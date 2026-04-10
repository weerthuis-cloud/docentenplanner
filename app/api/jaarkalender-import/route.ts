import { NextResponse } from 'next/server';

// POST: parse een jaarplanner Excel en retourneer vakanties/toetsweken/studiedagen
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 });

    // Dynamisch xlsx importeren
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Zoek patronen in de Excel
    // Typische structuur: kolom 0 = dag/week/maand, kolom 1 = dagnummer, kolom 2 = beschrijving
    const items: Array<{ naam: string; start_datum: string; eind_datum: string; type: string }> = [];

    // Helper: parse datum uit context (maand + dagnummer)
    let currentMonth = -1;
    let currentYear = 2025;
    const maandNamen: Record<string, number> = {
      'januari': 0, 'februari': 1, 'maart': 2, 'april': 3, 'mei': 4, 'juni': 5,
      'juli': 6, 'augustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'december': 11,
    };

    // Eerste pass: zoek het schooljaar
    for (const row of rows) {
      const text = String(row[0] || '').toLowerCase() + ' ' + String(row[2] || '').toLowerCase();
      const match = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
      if (match) {
        currentYear = parseInt(match[1]);
        break;
      }
    }

    // Track vakantie-periodes
    interface PeriodeTracker { naam: string; type: string; dates: string[] }
    const activePeriodes: PeriodeTracker[] = [];

    // Scan alle rijen
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const col0 = String(row[0] || '').trim().toLowerCase();
      const col1 = row[1];
      const col2 = String(row[2] || '').trim();

      // Detecteer maandwissel
      for (const [naam, num] of Object.entries(maandNamen)) {
        if (col0.includes(naam) || col2.toLowerCase().includes(naam)) {
          currentMonth = num;
          // Januari of later in het schooljaar = volgend jaar
          if (num <= 7 && currentYear < 2026) {
            // Controleer of we al voorbij augustus zijn geweest
            currentYear = currentYear + 1;
          }
          break;
        }
      }
      if (currentMonth < 0) continue; // Nog geen maand gevonden

      // Check of col2 een relevant event bevat
      const beschrijving = col2.toLowerCase();
      const isVakantie = beschrijving.includes('vakantie') || beschrijving.includes('vrij') || beschrijving.includes('recess');
      const isToetsweek = beschrijving.includes('toets') || beschrijving.includes('tentamen') || beschrijving.includes('examen');
      const isStudiedag = beschrijving.includes('studiedag') || beschrijving.includes('organisatiedag') || beschrijving.includes('lesvrij');

      if (!isVakantie && !isToetsweek && !isStudiedag) continue;

      // Bepaal type
      const type = isToetsweek ? 'toetsweek' : isStudiedag ? 'studiedag' : 'vakantie';

      // Probeer datum te bepalen
      const dagNr = typeof col1 === 'number' ? col1 : parseInt(String(col1));
      if (!isNaN(dagNr) && dagNr >= 1 && dagNr <= 31) {
        const datum = new Date(currentYear, currentMonth, dagNr);
        const datumStr = datum.toISOString().split('T')[0];

        // Zoek of er al een actieve periode is met dezelfde naam-patroon
        const naamClean = col2.replace(/\s+/g, ' ').trim();
        let found = false;
        for (const p of activePeriodes) {
          if (p.type === type && (
            p.naam.toLowerCase().includes(naamClean.toLowerCase().split(' ')[0]) ||
            naamClean.toLowerCase().includes(p.naam.toLowerCase().split(' ')[0])
          )) {
            p.dates.push(datumStr);
            found = true;
            break;
          }
        }
        if (!found) {
          activePeriodes.push({ naam: naamClean, type, dates: [datumStr] });
        }
      }
    }

    // Converteer periodes naar items met start/eind
    for (const p of activePeriodes) {
      if (p.dates.length === 0) continue;
      p.dates.sort();
      items.push({
        naam: p.naam.charAt(0).toUpperCase() + p.naam.slice(1),
        start_datum: p.dates[0],
        eind_datum: p.dates[p.dates.length - 1],
        type: p.type,
      });
    }

    // Als we niets gevonden hebben met de structured approach, probeer een simpelere scan
    if (items.length === 0) {
      // Fallback: zoek rijen met bekende keywords en probeer datums eruit te halen
      for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].map(c => String(c || '')).join(' ').toLowerCase();
        let type = '';
        if (rowText.includes('vakantie')) type = 'vakantie';
        else if (rowText.includes('toets')) type = 'toetsweek';
        else if (rowText.includes('studiedag') || rowText.includes('organisatiedag')) type = 'studiedag';
        if (!type) continue;

        // Zoek datums in de rij
        const dateMatch = rowText.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)/);
        if (dateMatch) {
          const naam = rows[i].map(c => String(c || '').trim()).filter(Boolean)[0] || type;
          items.push({ naam, start_datum: '', eind_datum: '', type });
        }
      }
    }

    // Sorteer op startdatum
    items.sort((a, b) => a.start_datum.localeCompare(b.start_datum));

    return NextResponse.json({ items, rows_scanned: rows.length });
  } catch (err) {
    console.error('Jaarkalender import error:', err);
    return NextResponse.json({ error: 'Fout bij verwerken bestand: ' + String(err) }, { status: 500 });
  }
}
