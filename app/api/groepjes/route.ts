import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const klas_id = url.searchParams.get('klas_id');

  if (!klas_id) {
    return NextResponse.json({ error: 'klas_id required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('groepjes_sets')
    .select('*')
    .eq('klas_id', klas_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, klas_id, naam, groepjes_data } = body;

  if (!klas_id || !groepjes_data) {
    return NextResponse.json({ error: 'klas_id and groepjes_data required' }, { status: 400 });
  }

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('groepjes_sets')
      .update({ naam, groepjes_data })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Create new
  const { data, error } = await supabase
    .from('groepjes_sets')
    .insert({ klas_id, naam: naam || 'Groepjes', groepjes_data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('groepjes_sets')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
