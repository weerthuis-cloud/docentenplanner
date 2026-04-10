import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('werklijst')
    .select('*')
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { titel, categorie, kleur, sub, datum } = body;
  if (!titel) return NextResponse.json({ error: 'titel is verplicht' }, { status: 400 });

  // Bepaal volgorde: zet bovenaan in categorie
  const { data: maxRow } = await supabase
    .from('werklijst')
    .select('volgorde')
    .eq('categorie', categorie || 'taak')
    .order('volgorde', { ascending: false })
    .limit(1);
  const nextVolgorde = (maxRow && maxRow.length > 0 ? maxRow[0].volgorde : 0) + 1;

  const { data, error } = await supabase
    .from('werklijst')
    .insert({ titel, categorie: categorie || 'taak', kleur: kleur || '#94a3b8', sub: sub || '', datum: datum || null, volgorde: nextVolgorde })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

  const { data, error } = await supabase
    .from('werklijst')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

  const { error } = await supabase.from('werklijst').delete().eq('id', Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
