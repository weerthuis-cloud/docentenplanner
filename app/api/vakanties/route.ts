import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('vakanties')
    .select('*')
    .order('start_datum');

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();

  if (Array.isArray(body)) {
    const { error } = await supabase.from('vakanties').insert(
      body.map((v: Record<string, unknown>) => ({
        naam: v.naam,
        start_datum: v.start_datum,
        eind_datum: v.eind_datum,
        schooljaar: v.schooljaar || '2025-2026',
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase.from('vakanties').insert({
    naam: body.naam,
    start_datum: body.start_datum,
    eind_datum: body.eind_datum,
    schooljaar: body.schooljaar || '2025-2026',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('vakanties').update({
    naam: body.naam,
    start_datum: body.start_datum,
    eind_datum: body.eind_datum,
    schooljaar: body.schooljaar,
  }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('vakanties').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
