import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const klasId = searchParams.get('klas_id');

  let query = supabase.from('toetsen').select('*').order('datum', { ascending: false });
  if (id) query = query.eq('id', Number(id));
  if (klasId) query = query.eq('klas_id', Number(klasId));

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase.from('toetsen').insert({
    klas_id: body.klas_id, naam: body.naam, type: body.type || 'SO',
    datum: body.datum || null, weging: body.weging || 1.0,
    max_score: body.max_score || 10.0, omschrijving: body.omschrijving || '',
    cesuur_percentage: body.cesuur_percentage ?? 0.60,
    cesuur_cijfer: body.cesuur_cijfer ?? 5.5,
    wizard_stap: body.wizard_stap ?? 0,
    tijd_minuten: body.tijd_minuten || null,
    wds_weten_pct: body.wds_weten_pct || null,
    wds_doen_pct: body.wds_doen_pct || null,
    wds_snappen_pct: body.wds_snappen_pct || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const updateObj: any = {};
  if (body.naam !== undefined) updateObj.naam = body.naam;
  if (body.type !== undefined) updateObj.type = body.type;
  if (body.datum !== undefined) updateObj.datum = body.datum;
  if (body.weging !== undefined) updateObj.weging = body.weging;
  if (body.max_score !== undefined) updateObj.max_score = body.max_score;
  if (body.omschrijving !== undefined) updateObj.omschrijving = body.omschrijving;
  if (body.cesuur_percentage !== undefined) updateObj.cesuur_percentage = body.cesuur_percentage;
  if (body.cesuur_cijfer !== undefined) updateObj.cesuur_cijfer = body.cesuur_cijfer;
  if (body.wizard_stap !== undefined) updateObj.wizard_stap = body.wizard_stap;
  if (body.tijd_minuten !== undefined) updateObj.tijd_minuten = body.tijd_minuten;
  if (body.wds_weten_pct !== undefined) updateObj.wds_weten_pct = body.wds_weten_pct;
  if (body.wds_doen_pct !== undefined) updateObj.wds_doen_pct = body.wds_doen_pct;
  if (body.wds_snappen_pct !== undefined) updateObj.wds_snappen_pct = body.wds_snappen_pct;
  const { error } = await supabase.from('toetsen').update(updateObj).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('cijfers').delete().eq('toets_id', Number(id));
  await supabase.from('toetsen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
