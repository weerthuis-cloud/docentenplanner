import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const toetsId = searchParams.get('toets_id');
  if (!toetsId) return NextResponse.json([], { status: 400 });

  // Fetch vragen met antwoorden
  const { data: vragen, error } = await supabase
    .from('toets_vragen')
    .select('*')
    .eq('toets_id', Number(toetsId))
    .order('volgorde', { ascending: true });

  if (error) return NextResponse.json([], { status: 500 });

  // Fetch antwoorden voor alle vragen
  const vraagIds = (vragen || []).map(v => v.id);
  let antwoorden: Record<number, any[]> = {};
  if (vraagIds.length > 0) {
    const { data: antw } = await supabase
      .from('toets_antwoorden')
      .select('*')
      .in('vraag_id', vraagIds)
      .order('volgorde', { ascending: true });
    (antw || []).forEach(a => {
      if (!antwoorden[a.vraag_id]) antwoorden[a.vraag_id] = [];
      antwoorden[a.vraag_id].push(a);
    });
  }

  const result = (vragen || []).map(v => ({ ...v, antwoorden: antwoorden[v.id] || [] }));
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();

  // Bulk insert (voor AI-generatie)
  if (Array.isArray(body)) {
    const results = [];
    for (const item of body) {
      const { data: vraag, error } = await supabase.from('toets_vragen').insert({
        toets_id: item.toets_id,
        vraag_tekst: item.vraag_tekst || '',
        vraag_type: item.vraag_type || 'open_kort',
        bloom_niveau: item.bloom_niveau || 'onthouden',
        punten: item.punten || 1.0,
        volgorde: item.volgorde || 0,
        bron_tekst: item.bron_tekst || '',
        antwoord_model: item.antwoord_model || '',
      }).select().single();

      if (error) continue;

      // Insert antwoorden als die er zijn
      if (item.antwoorden && Array.isArray(item.antwoorden) && vraag) {
        for (const a of item.antwoorden) {
          await supabase.from('toets_antwoorden').insert({
            vraag_id: vraag.id,
            antwoord_tekst: a.antwoord_tekst || '',
            is_correct: a.is_correct || false,
            koppel_tekst: a.koppel_tekst || '',
            volgorde: a.volgorde || 0,
          });
        }
      }
      results.push(vraag);
    }
    return NextResponse.json(results);
  }

  // Single insert
  const { data: vraag, error } = await supabase.from('toets_vragen').insert({
    toets_id: body.toets_id,
    vraag_tekst: body.vraag_tekst || '',
    vraag_type: body.vraag_type || 'open_kort',
    bloom_niveau: body.bloom_niveau || 'onthouden',
    punten: body.punten || 1.0,
    volgorde: body.volgorde || 0,
    bron_tekst: body.bron_tekst || '',
    antwoord_model: body.antwoord_model || '',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert antwoorden
  if (body.antwoorden && Array.isArray(body.antwoorden) && vraag) {
    for (const a of body.antwoorden) {
      await supabase.from('toets_antwoorden').insert({
        vraag_id: vraag.id,
        antwoord_tekst: a.antwoord_tekst || '',
        is_correct: a.is_correct || false,
        koppel_tekst: a.koppel_tekst || '',
        volgorde: a.volgorde || 0,
      });
    }
  }

  return NextResponse.json(vraag);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { error } = await supabase.from('toets_vragen').update({
    vraag_tekst: body.vraag_tekst,
    vraag_type: body.vraag_type,
    bloom_niveau: body.bloom_niveau,
    punten: body.punten,
    volgorde: body.volgorde,
    bron_tekst: body.bron_tekst,
    antwoord_model: body.antwoord_model,
  }).eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update antwoorden: verwijder oude, voeg nieuwe toe
  if (body.antwoorden && Array.isArray(body.antwoorden)) {
    await supabase.from('toets_antwoorden').delete().eq('vraag_id', body.id);
    for (const a of body.antwoorden) {
      await supabase.from('toets_antwoorden').insert({
        vraag_id: body.id,
        antwoord_tekst: a.antwoord_tekst || '',
        is_correct: a.is_correct || false,
        koppel_tekst: a.koppel_tekst || '',
        volgorde: a.volgorde || 0,
      });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Antwoorden worden automatisch verwijderd door CASCADE
  await supabase.from('toets_vragen').delete().eq('id', Number(id));
  return NextResponse.json({ success: true });
}
