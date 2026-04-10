import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: kopieer of verplaats een les naar andere klas/datum/uur
export async function POST(req: Request) {
  const body = await req.json();
  const { bron_id, doel_klas_id, doel_datum, doel_uur, modus } = body;
  // modus: 'kopieer' | 'verplaats'

  if (!bron_id || !doel_klas_id || !doel_datum) {
    return NextResponse.json({ error: 'bron_id, doel_klas_id en doel_datum zijn verplicht' }, { status: 400 });
  }

  // Haal de bronles op
  const { data: bron, error: bronErr } = await supabase
    .from('lessen')
    .select('*')
    .eq('id', bron_id)
    .single();

  if (bronErr || !bron) {
    return NextResponse.json({ error: 'Bronles niet gevonden' }, { status: 404 });
  }

  // Maak kopie aan op doellocatie (upsert: check bestaand)
  const doelUur = doel_uur ?? bron.uur;
  let existingQuery = supabase
    .from('lessen')
    .select('id')
    .eq('klas_id', doel_klas_id)
    .eq('datum', doel_datum);
  if (doelUur !== undefined && doelUur !== null) {
    existingQuery = existingQuery.eq('uur', doelUur);
  }
  existingQuery = existingQuery.limit(1);
  const { data: existing } = await existingQuery;

  const nieuweLes: Record<string, unknown> = {
    klas_id: doel_klas_id,
    datum: doel_datum,
    uur: doelUur,
    startopdracht: bron.startopdracht || '',
    terugkijken: bron.terugkijken || '',
    programma: bron.programma || '',
    leerdoelen: bron.leerdoelen || '',
    huiswerk: bron.huiswerk || '',
    niet_vergeten: bron.niet_vergeten || '',
    notities: bron.notities || '',
  };
  if (bron.custom_velden) nieuweLes.custom_velden = bron.custom_velden;

  let doelId: number;
  if (existing && existing.length > 0) {
    // Overschrijf bestaande les
    await supabase.from('lessen').update(nieuweLes).eq('id', existing[0].id);
    doelId = existing[0].id;
  } else {
    const { data: inserted } = await supabase.from('lessen').insert(nieuweLes).select('id').single();
    doelId = inserted?.id;
  }

  // Bij verplaatsen: wis de bronles
  if (modus === 'verplaats') {
    await supabase.from('lessen').delete().eq('id', bron_id);
  }

  return NextResponse.json({ success: true, doel_id: doelId, modus });
}
