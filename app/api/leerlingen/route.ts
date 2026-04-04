import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');

  let query = supabase.from('leerlingen').select('*').order('achternaam').order('voornaam');
  if (klasId) query = query.eq('klas_id', Number(klasId));

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('leerlingen').insert({
    klas_id: body.klas_id, voornaam: body.voornaam, achternaam: body.achternaam,
    boek_titel: body.boek_titel || '', boek_kleur: body.boek_kleur || '#2E4057',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('leerlingen').update({
    voornaam: body.voornaam, achternaam: body.achternaam,
    boek_titel: body.boek_titel || '', boek_kleur: body.boek_kleur || '#2E4057',
  }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('leerlingen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
