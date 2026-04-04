import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const toetsId = searchParams.get('toets_id');
  const leerlingId = searchParams.get('leerling_id');
  const klasId = searchParams.get('klas_id');

  if (toetsId) {
    const { data, error } = await supabase
      .from('cijfers')
      .select('*, leerlingen(voornaam, achternaam)')
      .eq('toets_id', Number(toetsId))
      .order('leerlingen(achternaam)');

    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json((data || []).map(c => ({
      ...c, voornaam: c.leerlingen?.voornaam, achternaam: c.leerlingen?.achternaam, leerlingen: undefined,
    })));
  }

  if (leerlingId) {
    const { data, error } = await supabase
      .from('cijfers')
      .select('*, toetsen(naam, type, weging, datum)')
      .eq('leerling_id', Number(leerlingId));

    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json((data || []).map(c => ({
      ...c, toets_naam: c.toetsen?.naam, toets_type: c.toetsen?.type,
      weging: c.toetsen?.weging, toets_datum: c.toetsen?.datum, toetsen: undefined,
    })));
  }

  if (klasId) {
    const { data, error } = await supabase
      .from('cijfers')
      .select('*, leerlingen!inner(voornaam, achternaam, klas_id), toetsen(naam, type, weging)')
      .eq('leerlingen.klas_id', Number(klasId));

    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json((data || []).map(c => ({
      ...c,
      voornaam: c.leerlingen?.voornaam, achternaam: c.leerlingen?.achternaam,
      toets_naam: c.toetsen?.naam, toets_type: c.toetsen?.type, weging: c.toetsen?.weging,
      leerlingen: undefined, toetsen: undefined,
    })));
  }

  return NextResponse.json([]);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('cijfers').upsert({
    toets_id: body.toets_id, leerling_id: body.leerling_id,
    score: body.score, opmerking: body.opmerking || null,
  }, { onConflict: 'toets_id,leerling_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (Array.isArray(body.cijfers)) {
    const records = body.cijfers.map((c: { toets_id: number; leerling_id: number; score: number; opmerking?: string }) => ({
      toets_id: c.toets_id, leerling_id: c.leerling_id,
      score: c.score, opmerking: c.opmerking || null,
    }));
    const { error } = await supabase.from('cijfers').upsert(records, { onConflict: 'toets_id,leerling_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
