import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');
  const datum = searchParams.get('datum');
  const weekStart = searchParams.get('week_start');
  const weekEnd = searchParams.get('week_end');
  const single = searchParams.get('single'); // backwards compat: return single lesson

  let query = supabase.from('lessen').select('*').order('datum').order('uur');
  if (klasId) query = query.eq('klas_id', Number(klasId));

  // Week range query for planner
  if (weekStart && weekEnd) {
    query = query.gte('datum', weekStart).lte('datum', weekEnd);
    const { data, error } = await query;
    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json(data || []);
  }

  // Single date query
  if (datum) {
    query = query.eq('datum', datum);
    if (single === 'true') {
      query = query.limit(1);
      const { data, error } = await query;
      if (error) return NextResponse.json(null, { status: 500 });
      return NextResponse.json(data && data.length > 0 ? data[0] : null);
    }
    const { data, error } = await query;
    if (error) return NextResponse.json([], { status: 500 });
    return NextResponse.json(data || []);
  }

  // Default: return latest single (backwards compat for dashboard)
  query = query.order('datum', { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) return NextResponse.json(null, { status: 500 });
  return NextResponse.json(data && data.length > 0 ? data[0] : null);
}

export async function POST(req: Request) {
  const body = await req.json();
  const datum = body.datum || new Date().toISOString().split('T')[0];

  // Check existing by klas_id + datum + uur (if uur provided)
  let existingQuery = supabase
    .from('lessen')
    .select('id')
    .eq('klas_id', body.klas_id)
    .eq('datum', datum);

  if (body.uur !== undefined && body.uur !== null) {
    existingQuery = existingQuery.eq('uur', body.uur);
  }
  existingQuery = existingQuery.limit(1);

  const { data: existing } = await existingQuery;

  const lesData: Record<string, unknown> = {
    klas_id: body.klas_id, datum, uur: body.uur ?? null,
    startopdracht: body.startopdracht, terugkijken: body.terugkijken,
    programma: body.programma, leerdoelen: body.leerdoelen,
    huiswerk: body.huiswerk, niet_vergeten: body.niet_vergeten,
    notities: body.notities,
  };
  if (body.custom_velden !== undefined) lesData.custom_velden = body.custom_velden;

  if (existing && existing.length > 0) {
    const { error } = await supabase.from('lessen').update(lesData).eq('id', existing[0].id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: existing[0].id });
  } else {
    const { data, error } = await supabase.from('lessen').insert(lesData).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data?.id });
  }
}

export async function PUT(req: Request) {
  const body = await req.json();
  const updateData: Record<string, unknown> = {
    startopdracht: body.startopdracht, terugkijken: body.terugkijken,
    programma: body.programma, leerdoelen: body.leerdoelen,
    huiswerk: body.huiswerk, niet_vergeten: body.niet_vergeten,
    notities: body.notities, uur: body.uur,
  };
  if (body.custom_velden !== undefined) updateData.custom_velden = body.custom_velden;
  const { error } = await supabase.from('lessen').update(updateData).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('lessen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
