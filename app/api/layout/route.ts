import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');
  if (!klasId) return NextResponse.json(null);

  const { data, error } = await supabase
    .from('plattegrond_layouts')
    .select('*')
    .eq('klas_id', Number(klasId))
    .limit(1);

  if (error || !data || data.length === 0) return NextResponse.json(null);
  return NextResponse.json(data[0]);
}

export async function POST(req: Request) {
  const body = await req.json();

  const { data: existing } = await supabase
    .from('plattegrond_layouts')
    .select('id')
    .eq('klas_id', body.klas_id)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase.from('plattegrond_layouts').update({
      layout_data: body.layout_data, layout_type: body.layout_type || 'paren',
    }).eq('klas_id', body.klas_id);
  } else {
    await supabase.from('plattegrond_layouts').insert({
      klas_id: body.klas_id, layout_data: body.layout_data,
      layout_type: body.layout_type || 'paren',
    });
  }

  return NextResponse.json({ success: true });
}
