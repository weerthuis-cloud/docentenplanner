import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: alle lesveld configuraties ophalen
export async function GET() {
  const { data, error } = await supabase
    .from('lesveld_config')
    .select('*')
    .order('volgorde');

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

// POST: nieuw custom veld toevoegen
export async function POST(req: Request) {
  const body = await req.json();
  const { label, icoon } = body;

  if (!label) return NextResponse.json({ error: 'label is verplicht' }, { status: 400 });

  // Genereer een key op basis van label
  const veld_key = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);

  // Hoogste volgorde ophalen
  const { data: maxRow } = await supabase.from('lesveld_config').select('volgorde').order('volgorde', { ascending: false }).limit(1).single();
  const nextOrder = (maxRow?.volgorde ?? 6) + 1;

  const { data, error } = await supabase
    .from('lesveld_config')
    .insert({ veld_key, label, icoon: icoon || '📌', zichtbaar: true, volgorde: nextOrder, is_custom: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT: veld bijwerken (label, icoon, zichtbaar, volgorde)
export async function PUT(req: Request) {
  const body = await req.json();

  // Bulk update volgorde: { action: 'reorder', items: [{id, volgorde}] }
  if (body.action === 'reorder') {
    for (const item of body.items) {
      await supabase.from('lesveld_config').update({ volgorde: item.volgorde }).eq('id', item.id);
    }
    return NextResponse.json({ success: true });
  }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

  const { error } = await supabase
    .from('lesveld_config')
    .update(updates)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: custom veld verwijderen
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Alleen custom velden mogen verwijderd worden
  const { data: veld } = await supabase.from('lesveld_config').select('is_custom').eq('id', Number(id)).single();
  if (!veld?.is_custom) return NextResponse.json({ error: 'Standaard velden kunnen niet verwijderd worden' }, { status: 400 });

  const { error } = await supabase
    .from('lesveld_config')
    .delete()
    .eq('id', Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
