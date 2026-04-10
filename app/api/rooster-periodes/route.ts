import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: alle periodes ophalen
export async function GET() {
  const { data, error } = await supabase
    .from('rooster_periodes')
    .select('*')
    .order('start_datum', { ascending: false });

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

// POST: nieuwe periode aanmaken, of bestaande verlengen
export async function POST(req: Request) {
  const body = await req.json();

  // Verlengen: { action: 'verlengen', id: number, weken: number }
  if (body.action === 'verlengen') {
    const { id, weken } = body;
    const { data: periode } = await supabase
      .from('rooster_periodes')
      .select('*')
      .eq('id', id)
      .single();

    if (!periode) return NextResponse.json({ error: 'Periode niet gevonden' }, { status: 404 });

    const nieuwEind = new Date(periode.eind_datum + 'T12:00:00');
    nieuwEind.setDate(nieuwEind.getDate() + (weken || 1) * 7);
    const eindStr = nieuwEind.toISOString().split('T')[0];

    const { error } = await supabase
      .from('rooster_periodes')
      .update({ eind_datum: eindStr })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, eind_datum: eindStr });
  }

  // Dupliceren: { action: 'dupliceren', id: number, naam: string, start_datum: string, eind_datum: string }
  if (body.action === 'dupliceren') {
    const { id, naam, start_datum, eind_datum } = body;

    // Maak nieuwe periode
    const { data: nieuwePeriode, error: periodeError } = await supabase
      .from('rooster_periodes')
      .insert({ naam, start_datum, eind_datum, bron: 'duplicaat' })
      .select()
      .single();

    if (periodeError || !nieuwePeriode) return NextResponse.json({ error: periodeError?.message }, { status: 500 });

    // Kopieer rooster slots van bronperiode
    const { data: bronSlots } = await supabase
      .from('roosters')
      .select('klas_id, dag, uur, vak, lokaal, is_blokuur')
      .eq('periode_id', id);

    if (bronSlots && bronSlots.length > 0) {
      const nieuweSlots = bronSlots.map(s => ({ ...s, periode_id: nieuwePeriode.id }));
      await supabase.from('roosters').insert(nieuweSlots);
    }

    return NextResponse.json({ success: true, periode: nieuwePeriode });
  }

  // Verplaatsen: rooster slots van één periode naar een andere
  if (body.action === 'verplaatsen') {
    const { van_periode_id, naar_periode_id } = body;
    if (!van_periode_id || !naar_periode_id) {
      return NextResponse.json({ error: 'van_periode_id en naar_periode_id zijn verplicht' }, { status: 400 });
    }

    // Verwijder bestaande slots in doelperiode
    await supabase.from('roosters').delete().eq('periode_id', naar_periode_id);

    // Verplaats slots: update periode_id
    const { error: moveError, count } = await supabase
      .from('roosters')
      .update({ periode_id: naar_periode_id })
      .eq('periode_id', van_periode_id);

    if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 });
    return NextResponse.json({ success: true, moved: count });
  }

  // Gewone create
  const { naam, start_datum, eind_datum, bron } = body;
  const { data, error } = await supabase
    .from('rooster_periodes')
    .insert({ naam: naam || '', start_datum, eind_datum, bron: bron || 'handmatig' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT: periode bijwerken
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...updates } = body;

  const { error } = await supabase
    .from('rooster_periodes')
    .update(updates)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: periode verwijderen inclusief rooster slots
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Eerst rooster slots verwijderen (geen cascade op FK)
  const { error: slotsError } = await supabase
    .from('roosters')
    .delete()
    .eq('periode_id', Number(id));

  if (slotsError) return NextResponse.json({ error: `Slots verwijderen mislukt: ${slotsError.message}` }, { status: 500 });

  // Dan de periode zelf
  const { error } = await supabase
    .from('rooster_periodes')
    .delete()
    .eq('id', Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
