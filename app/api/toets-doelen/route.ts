import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const toetsId = searchParams.get('toets_id');
  if (!toetsId) return NextResponse.json([], { status: 400 });

  const { data, error } = await supabase
    .from('toets_doelen')
    .select('*')
    .eq('toets_id', Number(toetsId))
    .order('volgorde', { ascending: true });

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();

  // Bulk insert
  if (Array.isArray(body)) {
    const { data, error } = await supabase.from('toets_doelen').insert(
      body.map((d: any) => ({
        toets_id: d.toets_id,
        naam: d.naam || '',
        omschrijving: d.omschrijving || '',
        weten_punten: d.weten_punten || 0,
        doen_punten: d.doen_punten || 0,
        snappen_punten: d.snappen_punten || 0,
        volgorde: d.volgorde || 0,
      }))
    ).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Single insert
  const { data, error } = await supabase.from('toets_doelen').insert({
    toets_id: body.toets_id,
    naam: body.naam || '',
    omschrijving: body.omschrijving || '',
    weten_punten: body.weten_punten || 0,
    doen_punten: body.doen_punten || 0,
    snappen_punten: body.snappen_punten || 0,
    volgorde: body.volgorde || 0,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json();

  // Bulk update
  if (Array.isArray(body)) {
    for (const d of body) {
      await supabase.from('toets_doelen').update({
        naam: d.naam,
        omschrijving: d.omschrijving,
        weten_punten: d.weten_punten,
        doen_punten: d.doen_punten,
        snappen_punten: d.snappen_punten,
        volgorde: d.volgorde,
      }).eq('id', d.id);
    }
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase.from('toets_doelen').update({
    naam: body.naam,
    omschrijving: body.omschrijving,
    weten_punten: body.weten_punten,
    doen_punten: body.doen_punten,
    snappen_punten: body.snappen_punten,
    volgorde: body.volgorde,
  }).eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('toets_doelen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
