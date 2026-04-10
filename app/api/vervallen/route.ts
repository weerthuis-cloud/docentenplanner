import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: alle vervallen items ophalen (optioneel ?van=YYYY-MM-DD&tot=YYYY-MM-DD)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const van = searchParams.get('van');
  const tot = searchParams.get('tot');

  let query = supabase.from('rooster_vervallen').select('*').order('datum');
  if (van) query = query.gte('datum', van);
  if (tot) query = query.lte('datum', tot);

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

// POST: dag of les vervallen markeren
export async function POST(req: Request) {
  const body = await req.json();
  const { datum, uur, reden } = body;

  if (!datum) return NextResponse.json({ error: 'datum is verplicht' }, { status: 400 });

  const { data, error } = await supabase
    .from('rooster_vervallen')
    .insert({ datum, uur: uur ?? null, reden: reden || '' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT: reden bijwerken
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, reden } = body;

  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

  const { error } = await supabase
    .from('rooster_vervallen')
    .update({ reden: reden || '' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: vervallen markering opheffen
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('rooster_vervallen')
    .delete()
    .eq('id', Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
