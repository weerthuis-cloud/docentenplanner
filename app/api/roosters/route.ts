import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');

  let query = supabase.from('roosters').select('*').order('dag').order('uur');
  if (klasId) query = query.eq('klas_id', Number(klasId));

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();

  // Bulk upsert: array of rooster slots
  if (Array.isArray(body)) {
    for (const slot of body) {
      const { data: existing } = await supabase
        .from('roosters')
        .select('id')
        .eq('klas_id', slot.klas_id)
        .eq('dag', slot.dag)
        .eq('uur', slot.uur)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from('roosters').update({
          vak: slot.vak, lokaal: slot.lokaal, is_blokuur: slot.is_blokuur ?? false,
        }).eq('id', existing[0].id);
      } else {
        await supabase.from('roosters').insert({
          klas_id: slot.klas_id, dag: slot.dag, uur: slot.uur,
          vak: slot.vak, lokaal: slot.lokaal, is_blokuur: slot.is_blokuur ?? false,
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  // Single upsert
  const { data: existing } = await supabase
    .from('roosters')
    .select('id')
    .eq('klas_id', body.klas_id)
    .eq('dag', body.dag)
    .eq('uur', body.uur)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase.from('roosters').update({
      vak: body.vak, lokaal: body.lokaal, is_blokuur: body.is_blokuur ?? false,
    }).eq('id', existing[0].id);
  } else {
    await supabase.from('roosters').insert({
      klas_id: body.klas_id, dag: body.dag, uur: body.uur,
      vak: body.vak, lokaal: body.lokaal, is_blokuur: body.is_blokuur ?? false,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const klasId = searchParams.get('klas_id');

  if (id) {
    await supabase.from('roosters').delete().eq('id', Number(id));
  } else if (klasId) {
    await supabase.from('roosters').delete().eq('klas_id', Number(klasId));
  }
  return NextResponse.json({ success: true });
}
