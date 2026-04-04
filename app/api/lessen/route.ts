import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');
  const datum = searchParams.get('datum');

  let query = supabase.from('lessen').select('*').order('datum', { ascending: false }).limit(1);
  if (klasId) query = query.eq('klas_id', Number(klasId));
  if (datum) query = query.eq('datum', datum);

  const { data, error } = await query;
  if (error) return NextResponse.json(null, { status: 500 });
  return NextResponse.json(data && data.length > 0 ? data[0] : null);
}

export async function POST(req: Request) {
  const body = await req.json();
  const datum = body.datum || new Date().toISOString().split('T')[0];

  // Check existing
  const { data: existing } = await supabase
    .from('lessen')
    .select('id')
    .eq('klas_id', body.klas_id)
    .eq('datum', datum)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase.from('lessen').update({
      startopdracht: body.startopdracht, terugkijken: body.terugkijken,
      programma: body.programma, leerdoelen: body.leerdoelen,
      huiswerk: body.huiswerk, niet_vergeten: body.niet_vergeten,
    }).eq('id', existing[0].id);
  } else {
    await supabase.from('lessen').insert({
      klas_id: body.klas_id, datum,
      startopdracht: body.startopdracht, terugkijken: body.terugkijken,
      programma: body.programma, leerdoelen: body.leerdoelen,
      huiswerk: body.huiswerk, niet_vergeten: body.niet_vergeten,
    });
  }

  return NextResponse.json({ success: true });
}
