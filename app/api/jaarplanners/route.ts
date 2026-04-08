import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vak = searchParams.get('vak');
  const jaarlaag = searchParams.get('jaarlaag');
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabase.from('jaarplanners').select('*').eq('id', Number(id)).single();
    if (error) return NextResponse.json(null, { status: 500 });
    return NextResponse.json(data);
  }

  let query = supabase.from('jaarplanners').select('id, vak, jaarlaag, schooljaar, naam, auteur, beschrijving, created_at').order('created_at', { ascending: false });
  if (vak) query = query.eq('vak', vak);
  if (jaarlaag) query = query.eq('jaarlaag', jaarlaag);

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase.from('jaarplanners').insert({
    vak: body.vak,
    jaarlaag: body.jaarlaag,
    schooljaar: body.schooljaar || '2025-2026',
    data: body.data || [],
    naam: body.naam || '',
    auteur: body.auteur || '',
    beschrijving: body.beschrijving || '',
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data?.id });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('jaarplanners').update({
    vak: body.vak,
    jaarlaag: body.jaarlaag,
    schooljaar: body.schooljaar,
    data: body.data,
    naam: body.naam,
    auteur: body.auteur,
    beschrijving: body.beschrijving,
  }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('jaarplanners').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
