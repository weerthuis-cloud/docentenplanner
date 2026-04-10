import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: items + instellingen ophalen
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wat = searchParams.get('wat');

  if (wat === 'instellingen') {
    const { data } = await supabase.from('overzicht_instellingen').select('*');
    return NextResponse.json(data || []);
  }

  // Items ophalen
  const { data, error } = await supabase
    .from('overzicht_items')
    .select('*')
    .order('volgorde')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

// POST: nieuw item aanmaken
export async function POST(req: Request) {
  const body = await req.json();

  // Instelling toggler
  if (body.action === 'toggle_blok') {
    const { blok, zichtbaar } = body;
    const { error } = await supabase
      .from('overzicht_instellingen')
      .update({ zichtbaar })
      .eq('blok', blok);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { type, titel, inhoud, datum, kleur } = body;
  if (!type) return NextResponse.json({ error: 'type is verplicht' }, { status: 400 });

  const { data, error } = await supabase
    .from('overzicht_items')
    .insert({ type, titel: titel || '', inhoud: inhoud || '', datum: datum || null, kleur: kleur || '#2d8a4e' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT: item bijwerken
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

  const { error } = await supabase
    .from('overzicht_items')
    .update(updates)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: item verwijderen
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('overzicht_items')
    .delete()
    .eq('id', Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
