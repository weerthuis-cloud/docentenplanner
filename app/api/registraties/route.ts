import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leerlingId = searchParams.get('leerling_id');
  const datum = searchParams.get('datum');
  const klasId = searchParams.get('klas_id');

  let query = supabase.from('registraties').select('*, leerlingen(voornaam, achternaam)').order('created_at', { ascending: false });
  if (leerlingId) query = query.eq('leerling_id', Number(leerlingId));
  if (datum) query = query.eq('datum', datum);
  if (klasId) query = query.eq('leerlingen.klas_id', Number(klasId));

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });

  const result = (data || []).map(r => ({
    ...r,
    voornaam: r.leerlingen?.voornaam,
    achternaam: r.leerlingen?.achternaam,
    leerlingen: undefined,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('registraties').insert({
    leerling_id: body.leerling_id, les_id: body.les_id || null,
    type: body.type, details: body.details || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const leerlingId = searchParams.get('leerling_id');
  const type = searchParams.get('type');
  const datum = searchParams.get('datum');

  if (id) {
    await supabase.from('registraties').delete().eq('id', Number(id));
  } else if (leerlingId && type && datum) {
    await supabase.from('registraties').delete()
      .eq('leerling_id', Number(leerlingId)).eq('type', type).eq('datum', datum);
  }

  return NextResponse.json({ success: true });
}
