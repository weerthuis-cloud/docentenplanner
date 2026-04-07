import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');

  let query = supabase.from('leerlingen').select('*').order('achternaam').order('voornaam');
  if (klasId) query = query.eq('klas_id', Number(klasId));

  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const body = await req.json();

  // Bulk import: array of students
  if (Array.isArray(body)) {
    const rows = body.map((s: Record<string, unknown>) => ({
      klas_id: s.klas_id,
      voornaam: s.voornaam || '',
      achternaam: s.achternaam || '',
      email: s.email || null,
      mentor: s.mentor || null,
      ondersteuningsprofiel: s.ondersteuningsprofiel || [],
      foto_url: s.foto_url || null,
      foto_data: s.foto_data || null,
      boek_titel: s.boek_titel || '',
      boek_auteur: s.boek_auteur || '',
      boek_kleur: s.boek_kleur || '#2E4057',
    }));
    const { error } = await supabase.from('leerlingen').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, count: rows.length });
  }

  // Single student
  const { error } = await supabase.from('leerlingen').insert({
    klas_id: body.klas_id,
    voornaam: body.voornaam,
    achternaam: body.achternaam,
    email: body.email || null,
    mentor: body.mentor || null,
    ondersteuningsprofiel: body.ondersteuningsprofiel || [],
    boek_titel: body.boek_titel || '',
    boek_kleur: body.boek_kleur || '#2E4057',
    foto_url: body.foto_url || null,
    foto_data: body.foto_data || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();

  // Bulk update (for merging imports)
  if (Array.isArray(body)) {
    const results = [];
    for (const s of body) {
      const updateData: Record<string, unknown> = {};
      if (s.voornaam !== undefined) updateData.voornaam = s.voornaam;
      if (s.achternaam !== undefined) updateData.achternaam = s.achternaam;
      if (s.email !== undefined) updateData.email = s.email;
      if (s.mentor !== undefined) updateData.mentor = s.mentor;
      if (s.ondersteuningsprofiel !== undefined) updateData.ondersteuningsprofiel = s.ondersteuningsprofiel;
      if (s.foto_url !== undefined) updateData.foto_url = s.foto_url;
      if (s.foto_data !== undefined) updateData.foto_data = s.foto_data;
      if (s.boek_titel !== undefined) updateData.boek_titel = s.boek_titel;
      if (s.boek_auteur !== undefined) updateData.boek_auteur = s.boek_auteur;
      if (s.boek_kleur !== undefined) updateData.boek_kleur = s.boek_kleur;
      const { error } = await supabase.from('leerlingen').update(updateData).eq('id', s.id);
      results.push({ id: s.id, error: error?.message || null });
    }
    return NextResponse.json({ success: true, results });
  }

  // Single update
  const { error } = await supabase.from('leerlingen').update({
    voornaam: body.voornaam,
    achternaam: body.achternaam,
    email: body.email,
    mentor: body.mentor,
    ondersteuningsprofiel: body.ondersteuningsprofiel,
    boek_titel: body.boek_titel || '',
    boek_kleur: body.boek_kleur || '#2E4057',
    foto_url: body.foto_url,
    foto_data: body.foto_data,
  }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('leerlingen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
