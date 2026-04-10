import { NextResponse } from 'next/server';

// POST: parse een jaarplanner Excel en retourneer vakanties/toetsweken/studiedagen
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 });

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // ─── Stap 1: Bepaal schooljaar ───
    let startYear = 2025;
    for (const row of rows) {
      const text = String(row[0] || '') + ' ' + String(row[2] || '');
      const m = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
      if (m) { startYear = parseInt(m[1]); break; }
    }

    // ─── Stap 2: Track maand + jaar ───
    const maandNamen: Record<string, number> = {
      'januari': 0, 'februari': 1, 'maart': 2, 'april': 3, 'mei': 4, 'juni': 5,
      'juli': 6, 'augustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'december': 11,
    };

    let currentMonth = 7; // start bij augustus
    let currentYear = startYear;

    function updateMonth(text: string) {
      const t = text.toLowerCase().trim();
      for (const [naam, num] of Object.entries(maandNamen)) {
        // Match standalone month or month in "maart|april" or "april " format
        if (t === naam || t === naam + ' ' || t.startsWith(naam + ' ') || t.endsWith(naam) || t.includes(naam + '|') || t.includes('|' + naam)) {
          const prevMonth = currentMonth;
          currentMonth = num;
          // Year transition: if month wraps around (went from high to low)
          if (num < prevMonth && prevMonth >= 8) {
            currentYear = startYear + 1;
          }
          return true;
        }
      }
      return false;
    }

    function makeDatum(dagNr: number): string {
      // Direct string formatting to avoid timezone issues
      const m = String(currentMonth + 1).padStart(2, '0');
      const d = String(dagNr).padStart(2, '0');
      return `${currentYear}-${m}-${d}`;
    }

    // ─── Stap 3: Verzamel items ───
    interface CalItem { naam: string; start_datum: string; eind_datum: string; type: string }
    const items: CalItem[] = [];
    const toetsperiodes: Record<string, string[]> = {};
    let activeVakantie: { naam: string; dates: string[] } | null = null;

    const feestdagen = ['bevrijdingsdag', 'hemelvaartsdag', 'koningsdag', '1e kerstdag', '2e kerstdag',
      'nieuwjaarsdag', '2e pinksterdag'];

    function flushVakantie() {
      if (activeVakantie && activeVakantie.dates.length > 0) {
        activeVakantie.dates.sort();
        items.push({
          naam: activeVakantie.naam,
          start_datum: activeVakantie.dates[0],
          eind_datum: activeVakantie.dates[activeVakantie.dates.length - 1],
          type: 'vakantie',
        });
      }
      activeVakantie = null;
    }

    const vakantieNamen = ['herfstvakantie', 'kerstvakantie', 'voorjaarsvakantie', 'meivakantie', 'zomervakantie'];
    let lastDagNr = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const col0raw = String(row[0] || '').trim();
      const col0 = col0raw.toLowerCase();
      const col1 = row[1];
      const col2raw = String(row[2] || '').trim();
      const col2 = col2raw.toLowerCase();

      // ── Detecteer maandwissel ──
      // Standalone maand-rij (alleen col0 gevuld met maandnaam)
      if (col0 && !col2raw && !col1) {
        updateMonth(col0);
      }
      // Week-rij: col2 bevat soms maandinformatie ("april", "maart|april", "juni|juli")
      if (col0.startsWith('week ') && col2) {
        // Extract maand uit col2 (neem de LAATSTE maand als er meerdere zijn)
        const parts = col2.split(/[|,]/);
        const lastPart = parts[parts.length - 1].replace(/\s*-\s*periode\s+\d+/i, '').trim();
        updateMonth(lastPart);
      }

      // ── Detecteer vakantie-weken ──
      if (col0.startsWith('week ') || (!col0 && !col1 && col2)) {
        const gevonden = vakantieNamen.find(v => col2.includes(v));
        if (gevonden) {
          if (activeVakantie && activeVakantie.naam.toLowerCase() === gevonden) {
            // Zelfde vakantie loopt door, volgende week
          } else {
            flushVakantie();
            activeVakantie = { naam: gevonden.charAt(0).toUpperCase() + gevonden.slice(1), dates: [] };
          }

          // Speciale check voor "ZOMERVAKANTIE 4 JULI T/M 16 AUGUSTUS"
          const zomerText = col2raw.toUpperCase();
          const fullMatch = zomerText.match(/(\d+)\s+(JANUARI|FEBRUARI|MAART|APRIL|MEI|JUNI|JULI|AUGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DECEMBER)\s+T\/M\s+(\d+)\s+(JANUARI|FEBRUARI|MAART|APRIL|MEI|JUNI|JULI|AUGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DECEMBER)/);
          if (fullMatch) {
            const maandMap: Record<string, number> = { JANUARI: 0, FEBRUARI: 1, MAART: 2, APRIL: 3, MEI: 4, JUNI: 5, JULI: 6, AUGUSTUS: 7, SEPTEMBER: 8, OKTOBER: 9, NOVEMBER: 10, DECEMBER: 11 };
            const sd = new Date(startYear + 1, maandMap[fullMatch[2]], parseInt(fullMatch[1]));
            const ed = new Date(startYear + 1, maandMap[fullMatch[4]], parseInt(fullMatch[3]));
            items.push({
              naam: 'Zomervakantie',
              start_datum: sd.toISOString().split('T')[0],
              eind_datum: ed.toISOString().split('T')[0],
              type: 'vakantie',
            });
            activeVakantie = null;
          }
          continue;
        } else if (col0.startsWith('week ')) {
          // Week-rij zonder vakantie: sluit actieve vakantie af
          flushVakantie();
        }
      }

      // ── Dag-rij check ──
      const dagNr = typeof col1 === 'number' ? col1 : parseInt(String(col1));
      const isDagRij = !isNaN(dagNr) && dagNr >= 1 && dagNr <= 31 &&
        (col0.startsWith('ma') || col0.startsWith('di') || col0.startsWith('wo') ||
         col0.startsWith('do') || col0.startsWith('vr') || col0.startsWith('za') || col0.startsWith('zo'));

      if (!isDagRij) continue;

      // Auto-detect maandwissel ALLEEN tijdens vakantie: als dagnr drastisch daalt (bv 26→1)
      if (activeVakantie && lastDagNr > 0 && dagNr < lastDagNr - 15) {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      }
      lastDagNr = dagNr;

      // Als we in een actieve vakantie zitten, voeg de datum toe
      if (activeVakantie) {
        activeVakantie.dates.push(makeDatum(dagNr));
      }

      // ── Toetsperiode A/B/C/D ──
      const toetsMatch = col2.match(/^toetsperiode\s+([a-d])/i);
      if (toetsMatch) {
        const letter = toetsMatch[1].toUpperCase();
        const key = `Toetsperiode ${letter}`;
        if (!toetsperiodes[key]) toetsperiodes[key] = [];
        toetsperiodes[key].push(makeDatum(dagNr));
        continue;
      }

      // ── Organisatiedag ──
      if (col2.startsWith('organisatiedag')) {
        items.push({
          naam: col2raw.replace(/\s+/g, ' ').trim(),
          start_datum: makeDatum(dagNr),
          eind_datum: makeDatum(dagNr),
          type: 'studiedag',
        });
        continue;
      }

      // ── Feestdagen (losse vrije dagen) ──
      const isFeestdag = feestdagen.some(f => col2.includes(f));
      if (isFeestdag && !activeVakantie) {
        items.push({
          naam: col2raw.replace(/\s+/g, ' ').trim(),
          start_datum: makeDatum(dagNr),
          eind_datum: makeDatum(dagNr),
          type: 'vakantie',
        });
        continue;
      }

      // ── "Vrije dag" met "school gesloten" ──
      const col3 = String(row[3] || '').toLowerCase();
      if ((col2 === 'vrije dag' || col2 === 'lesvrije dag') && col3.includes('school gesloten')) {
        if (!activeVakantie) {
          items.push({
            naam: col2raw,
            start_datum: makeDatum(dagNr),
            eind_datum: makeDatum(dagNr),
            type: 'vakantie',
          });
        }
      }
    }

    // Sluit laatste vakantie af
    flushVakantie();

    // Converteer toetsperiodes naar items
    for (const [naam, dates] of Object.entries(toetsperiodes)) {
      dates.sort();
      items.push({
        naam,
        start_datum: dates[0],
        eind_datum: dates[dates.length - 1],
        type: 'toetsweek',
      });
    }

    // Sorteer op startdatum
    items.sort((a, b) => a.start_datum.localeCompare(b.start_datum));

    return NextResponse.json({ items, rows_scanned: rows.length });
  } catch (err) {
    console.error('Jaarkalender import error:', err);
    return NextResponse.json({ error: 'Fout bij verwerken bestand: ' + String(err) }, { status: 500 });
  }
}
