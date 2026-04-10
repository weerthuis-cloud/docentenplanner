import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: verschuif alle lessen voor een klas 1 les vooruit vanaf een bepaald punt
// Alle lessen + toetsen schuiven mee naar het volgende roosterslot
export async function POST(req: Request) {
  const body = await req.json();
  const { klas_id, datum, uur, periode_id } = body;

  if (!klas_id || !datum) {
    return NextResponse.json({ error: 'klas_id en datum zijn verplicht' }, { status: 400 });
  }

  // 1. Haal alle roosterslots op voor deze klas (patroon per week)
  let roosterQuery = supabase.from('roosters').select('*').eq('klas_id', klas_id);
  if (periode_id) roosterQuery = roosterQuery.eq('periode_id', periode_id);
  const { data: roosterSlots } = await roosterQuery;
  if (!roosterSlots || roosterSlots.length === 0) {
    return NextResponse.json({ error: 'Geen roosterslots gevonden' }, { status: 404 });
  }

  // Sorteer roosterslots per week: (dag, uur)
  const weekPattern = roosterSlots
    .sort((a: { dag: number; uur: number }, b: { dag: number; uur: number }) => a.dag !== b.dag ? a.dag - b.dag : a.uur - b.uur)
    .map((s: { dag: number; uur: number }) => ({ dag: s.dag, uur: s.uur }));

  // 2. Genereer een chronologische lijst van alle toekomstige slots
  //    Vanaf de startdatum tot 6 maanden vooruit
  const startDate = new Date(datum + 'T12:00:00');
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 6);

  // Helper: get Monday of a week
  function getMonday(d: Date): Date {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    return dt;
  }

  // Helper: format date
  function fmt(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  // Build all slots from startDate's Monday onwards
  const allSlots: Array<{ datum: string; uur: number; dag: number }> = [];
  let monday = getMonday(new Date(startDate));

  while (monday <= endDate) {
    for (const pat of weekPattern) {
      const slotDate = new Date(monday);
      slotDate.setDate(slotDate.getDate() + (pat.dag - 1)); // dag 1=ma, 2=di, etc.
      const slotDatum = fmt(slotDate);
      if (slotDatum >= datum) {
        // Als het de startdatum is, filter op uur >= startuur
        if (slotDatum === datum && uur && pat.uur < uur) continue;
        allSlots.push({ datum: slotDatum, uur: pat.uur, dag: pat.dag });
      }
    }
    // Volgende week
    monday.setDate(monday.getDate() + 7);
  }

  // Sorteer chronologisch
  allSlots.sort((a, b) => a.datum !== b.datum ? a.datum.localeCompare(b.datum) : a.uur - b.uur);

  if (allSlots.length < 2) {
    return NextResponse.json({ error: 'Niet genoeg slots om te verschuiven' }, { status: 400 });
  }

  // 3. Haal alle lessen op voor deze klas vanaf het startpunt
  const { data: lessen } = await supabase
    .from('lessen')
    .select('*')
    .eq('klas_id', klas_id)
    .gte('datum', datum)
    .order('datum')
    .order('uur');

  // Filter: alleen lessen die op een roosterslot zitten en >= startpunt
  const relevantLessen = (lessen || []).filter(l => {
    if (l.datum === datum && uur && l.uur < uur) return false;
    return allSlots.some(s => s.datum === l.datum && s.uur === l.uur);
  });

  // 4. Haal alle toetsen op voor deze klas vanaf het startpunt
  const { data: toetsen } = await supabase
    .from('toetsen')
    .select('*')
    .eq('klas_id', klas_id)
    .gte('datum', datum)
    .order('datum');

  const relevantToetsen = (toetsen || []).filter(t => t.datum >= datum);

  // 5. Verschuif: van achter naar voren, elke les gaat naar het volgende slot
  //    Bouw een mapping: huidig slot -> volgend slot
  const slotMap = new Map<string, { datum: string; uur: number }>();
  for (let i = 0; i < allSlots.length - 1; i++) {
    slotMap.set(`${allSlots[i].datum}-${allSlots[i].uur}`, allSlots[i + 1]);
  }

  // Sorteer lessen van achter naar voren (om geen data te overschrijven)
  relevantLessen.sort((a, b) => {
    if (a.datum !== b.datum) return b.datum.localeCompare(a.datum);
    return b.uur - a.uur;
  });

  let verschoven = 0;
  for (const les of relevantLessen) {
    const key = `${les.datum}-${les.uur}`;
    const next = slotMap.get(key);
    if (!next) continue; // Laatste slot, kan niet verder

    // Update les naar nieuwe positie
    await supabase.from('lessen').update({ datum: next.datum, uur: next.uur }).eq('id', les.id);
    verschoven++;
  }

  // 6. Verschuif toetsen: elke toets op een datum gaat naar de volgende lesdag
  //    Bouw een mapping van toetsdatums naar volgende lesdatums
  const uniqueDatums = [...new Set(allSlots.map(s => s.datum))].sort();
  const datumMap = new Map<string, string>();
  for (let i = 0; i < uniqueDatums.length - 1; i++) {
    datumMap.set(uniqueDatums[i], uniqueDatums[i + 1]);
  }

  let toetsenVerschoven = 0;
  for (const toets of relevantToetsen) {
    const nextDatum = datumMap.get(toets.datum);
    if (!nextDatum) continue;
    await supabase.from('toetsen').update({ datum: nextDatum }).eq('id', toets.id);
    toetsenVerschoven++;
  }

  return NextResponse.json({
    success: true,
    lessen_verschoven: verschoven,
    toetsen_verschoven: toetsenVerschoven
  });
}
