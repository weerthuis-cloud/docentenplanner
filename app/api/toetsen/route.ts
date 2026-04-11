import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const klasId = searchParams.get('klas_id');

  let query = supabase.from('toetsen').select('*').order('datum', { ascending: false });
  if (id) query = query.eq('id', Number(id));
  if (klasId) query = query.eq('klas_id', Number(klasId));

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase.from('toetsen').insert({
    klas_id: body.klas_id, naam: body.naam, type: body.type || 'SO',
    datum: body.datum || null, weging: body.weging || 1.0,
    max_score: body.max_score || 10.0, omschrijving: body.omschrijving || '',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('toetsen').update({
    naam: body.naam, type: body.type, datum: body.datum,
    weging: body.weging, max_score: body.max_score, omschrijving: body.omschrijving,
  }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('cijfers').delete().eq('toets_id', Number(id));
  await supabase.from('toetsen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
