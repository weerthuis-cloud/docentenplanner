import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - haal layouts op voor een klas
// ?klas_id=1 → alle layouts voor die klas
// ?klas_id=1&actief=true → alleen de actieve layout (voor dashboard)
// ?id=5 → specifieke layout
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');
  const actief = searchParams.get('actief');
  const id = searchParams.get('id');

  if (id) {
    const { data } = await supabase.from('plattegrond_layouts').select('*').eq('id', Number(id)).single();
    return NextResponse.json(data);
  }

  if (!klasId) return NextResponse.json(null);

  if (actief === 'true') {
    // Voor dashboard: haal actieve layout
    const { data } = await supabase
      .from('plattegrond_layouts')
      .select('*')
      .eq('klas_id', Number(klasId))
      .eq('is_actief', true)
      .limit(1);
    if (!data || data.length === 0) {
      // Fallback: eerste layout
      const { data: first } = await supabase
        .from('plattegrond_layouts')
        .select('*')
        .eq('klas_id', Number(klasId))
        .limit(1);
      return NextResponse.json(first?.[0] || null);
    }
    return NextResponse.json(data[0]);
  }

  // Alle layouts voor deze klas
  const { data } = await supabase
    .from('plattegrond_layouts')
    .select('*')
    .eq('klas_id', Number(klasId))
    .order('naam');

  return NextResponse.json(data || []);
}

// POST - maak nieuwe layout of update bestaande
export async function POST(req: Request) {
  const body = await req.json();

  if (body.id) {
    // Update bestaande
    const { data, error } = await supabase.from('plattegrond_layouts').update({
      naam: body.naam,
      layout_data: body.layout_data,
      layout_type: body.layout_type || 'vrij',
      rijen: body.rijen || 8,
      kolommen: body.kolommen || 12,
    }).eq('id', body.id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Nieuwe layout
  const { data, error } = await supabase.from('plattegrond_layouts').insert({
    klas_id: body.klas_id,
    naam: body.naam || 'Nieuwe opstelling',
    layout_data: body.layout_data || [],
    layout_type: body.layout_type || 'vrij',
    rijen: body.rijen || 8,
    kolommen: body.kolommen || 12,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT - set actieve layout
export async function PUT(req: Request) {
  const body = await req.json();
  const { klas_id, layout_id } = body;

  // Zet alle layouts van deze klas op niet-actief
  await supabase.from('plattegrond_layouts').update({ is_actief: false }).eq('klas_id', klas_id);
  // Zet de gewenste layout op actief
  await supabase.from('plattegrond_layouts').update({ is_actief: true }).eq('id', layout_id);

  return NextResponse.json({ success: true });
}

// DELETE - verwijder layout
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await supabase.from('plattegrond_layouts').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
