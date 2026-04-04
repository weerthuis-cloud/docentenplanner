import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('klassen')
    .select('*, leerlingen(count)')
    .order('naam');

  if (error) return NextResponse.json([], { status: 500 });

  const result = (data || []).map(k => ({
    ...k,
    aantal_leerlingen: k.leerlingen?.[0]?.count || 0,
    leerlingen: undefined,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('klassen').insert({
    naam: body.naam, vak: body.vak || 'Nederlands',
    lokaal: body.lokaal || '', jaarlaag: body.jaarlaag || '',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('leerlingen').delete().eq('klas_id', Number(id));
  await supabase.from('klassen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
