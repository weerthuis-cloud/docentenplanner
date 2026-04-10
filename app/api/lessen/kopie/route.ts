import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: kopieer of verplaats een les naar andere klas/datum/uur
// Accepteert ofwel bron_id (opgeslagen les) ofwel bron_data (inline lesvelden)
export async function POST(req: Request) {
  const body = await req.json();
  const { bron_id, bron_data, doel_klas_id, doel_datum, doel_uur, modus } = body;
  // modus: 'kopieer' | 'verplaats'

  if (!doel_klas_id || !doel_datum) {
    return NextResponse.json({ error: 'doel_klas_id en doel_datum zijn verplicht' }, { status: 400 });
  }

  // Brongegevens ophalen: ofwel uit DB, ofwel meegegeven
  let bron: Record<string, unknown>;

  if (bron_id) {
    const { data, error } = await supabase
      .from('lessen')
      .select('*')
      .eq('id', bron_id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'Bronles niet gevonden' }, { status: 404 });
    }
    bron = data;
  } else if (bron_data) {
    bron = bron_data as Record<string, unknown>;
  } else {
    return NextResponse.json({ error: 'bron_id of bron_data is verplicht' }, { status: 400 });
  }

  const doelUur = doel_uur ?? bron.uur;

  // Check of er al een les bestaat op de doellocatie
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
    startopdracht: (bron.startopdracht as string) || '',
    terugkijken: (bron.terugkijken as string) || '',
    programma: (bron.programma as string) || '',
    leerdoelen: (bron.leerdoelen as string) || '',
    huiswerk: (bron.huiswerk as string) || '',
    niet_vergeten: (bron.niet_vergeten as string) || '',
    notities: (bron.notities as string) || '',
  };
  if (bron.custom_velden) nieuweLes.custom_velden = bron.custom_velden;

  let doelId: number | undefined;
  if (existing && existing.length > 0) {
    await supabase.from('lessen').update(nieuweLes).eq('id', existing[0].id);
    doelId = existing[0].id;
  } else {
    const { data: inserted } = await supabase.from('lessen').insert(nieuweLes).select('id').single();
    doelId = inserted?.id;
  }

  // Bij verplaatsen: wis de bronles (alleen als die een id heeft)
  if (modus === 'verplaats' && bron_id) {
    await supabase.from('lessen').delete().eq('id', bron_id);
  }

  return NextResponse.json({ success: true, doel_id: doelId, modus });
}
