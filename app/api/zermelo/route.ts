import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/*
  Zermelo Import API - Rooster

  Stap 1: POST { action: 'auth', school, code }
    -> Haalt access_token op

  Stap 2: POST { action: 'fetch', school, token, week_start }
    -> Haalt rooster op, geeft preview met groepen

  Stap 3: POST { action: 'import_full', slots, mapping, periode_naam, start_datum, eind_datum }
    -> Importeert rooster: maakt klassen aan (via mapping), maakt roosterperiode + slots
*/

function epochToHour(startTimeSlot: number): { dag: number; uur: number } {
  const d = new Date(startTimeSlot * 1000);
  const dag = d.getDay();
  const hour = d.getHours();
  const minutes = d.getMinutes();

  let uur = 1;
  const timeMin = hour * 60 + minutes;
  if (timeMin < 510) uur = 1;
  else if (timeMin < 560) uur = 1;
  else if (timeMin < 610) uur = 2;
  else if (timeMin < 660) uur = 3;
  else if (timeMin < 720) uur = 4;
  else if (timeMin < 780) uur = 5;
  else if (timeMin < 840) uur = 6;
  else if (timeMin < 900) uur = 7;
  else if (timeMin < 960) uur = 8;
  else uur = 9;

  return { dag, uur };
}

// Helper: Zermelo API call
async function zermeloGet(school: string, token: string, endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`https://${school}.zportal.nl/api/v3/${endpoint}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Zermelo ${endpoint}: ${res.status}`);
  const data = await res.json();
  return data?.response?.data || [];
}

export async function POST(req: Request) {
  const body = await req.json();

  // ‚îÄ‚îÄ‚îÄ STAP 1: Authenticatie ‚îÄ‚îÄ‚îÄ
  if (body.action === 'auth') {
    const { school, code } = body;
    if (!school || !code) {
      return NextResponse.json({ error: 'School en koppelcode zijn verplicht' }, { status: 400 });
    }

    try {
      const authUrl = `https://${school}.zportal.nl/api/v3/oauth/token`;
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${encodeURIComponent(code)}`,
      });

      if (!res.ok) {
        return NextResponse.json({ error: `Zermelo authenticatie mislukt (${res.status}). Controleer schoolnaam en koppelcode.` }, { status: 401 });
      }

      const data = await res.json();
      if (!data.access_token) {
        return NextResponse.json({ error: 'Geen access_token ontvangen' }, { status: 401 });
      }

      return NextResponse.json({ success: true, token: data.access_token });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return NextResponse.json({ error: `Verbinding mislukt: ${message}` }, { status: 500 });
    }
  }

  // ‚îÄ‚îÄ‚îÄ STAP 2: Rooster ophalen ‚îÄ‚îÄ‚îÄ
  if (body.action === 'fetch') {
    const { school, token, week_start } = body;
    if (!school || !token) {
      return NextResponse.json({ error: 'School en token zijn verplicht' }, { status: 400 });
    }

    try {
      const startDate = new Date(week_start + 'T00:00:00');
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 5);
      const startTs = Math.floor(startDate.getTime() / 1000);
      const endTs = Math.floor(endDate.getTime() / 1000);

      // Haal gebruiker op
      const users = await zermeloGet(school, token, 'users/~me');
      const userCode = users?.[0]?.code;

      // Haal appointments op
      const appointments = await zermeloGet(school, token, 'appointments', {
        user: userCode || '~me',
        start: startTs.toString(),
        end: endTs.toString(),
        valid: 'true',
      });

      type PreviewSlot = {
        dag: number; uur: number; vak: string; lokaal: string;
        groep: string; groepen: string[]; start_time: string; end_time: string;
      };

      const slots: PreviewSlot[] = [];
      const seen = new Set<string>();
      const alleGroepen = new Set<string>();

      for (const appt of appointments) {
        if (appt.cancelled || appt.type !== 'lesson') continue;

        const { dag, uur } = epochToHour(appt.start);
        if (dag < 1 || dag > 5) continue;

        const key = `${dag}-${uur}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const vak = appt.subjects?.[0] || '';
        const lokaal = appt.locations?.[0] || '';
        const groepen: string[] = appt.groups || [];
        const groep = groepen[0] || '';
        groepen.forEach(g => alleGroepen.add(g));

        const startTime = new Date(appt.start * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(appt.end * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

        slots.push({ dag, uur, vak, lokaal, groep, groepen, start_time: startTime, end_time: endTime });
      }

      slots.sort((a, b) => a.dag - b.dag || a.uur - b.uur);

      return NextResponse.json({
        success: true,
        user: userCode,
        week_start,
        slots,
        groepen: [...alleGroepen],
        raw_count: appointments.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return NextResponse.json({ error: `Fout bij ophalen rooster: ${message}` }, { status: 500 });
    }
  }

  // --- STAP 3: Rooster importeren (klassen + roosterslots) ---
  if (body.action === 'import_full') {
    const { slots, mapping, periode_naam, start_datum, eind_datum } = body;
    if (!slots || !start_datum || !eind_datum) {
      return NextResponse.json({ error: 'Slots, start_datum en eind_datum zijn verplicht' }, { status: 400 });
    }

    // mapping = { "groepNaam": klasId (number) | "new" | 0 (skip) }
    // Als mapping ontbreekt: fallback naar originele naam-matching
    const typedMapping = (mapping && typeof mapping === 'object') ? mapping as Record<string, string | number> : {} as Record<string, string | number>;
    const hasMapping = Object.keys(typedMapping).length > 0;

    // 1. Haal bestaande klassen op
    const { data: bestaandeKlassen } = await supabase.from('klassen').select('id, naam, vak, lokaal');
    const klasMapByName = new Map((bestaandeKlassen || []).map(k => [k.naam.toLowerCase(), k]));
    const klasMapById = new Map((bestaandeKlassen || []).map(k => [k.id, k]));

    // 2. Bouw groep ‚Üí klas_id map op basis van mapping
    // groepToKlasId: groepnaam ‚Üí klas_id (resolved, incl. nieuw aangemaakte)
    const groepToKlasId = new Map<string, number>();
    let klassenAangemaakt = 0;

    if (hasMapping) {
      // Verwerk mapping: maak nieuwe klassen aan waar nodig
      const nieuweKlassen: Array<{ naam: string; vak: string; lokaal: string; jaarlaag: string; schooljaar: string }> = [];

      for (const [groep, target] of Object.entries(typedMapping)) {
        if (target === 0 || target === '0' || String(target) === '0') {
          // Overslaan
          continue;
        }
        if (target === 'new') {
          // Nieuwe klas aanmaken
          const slotInfo = slots.find((s: Record<string, string>) => s.groep === groep);
          const jaarlaagMatch = groep.match(/(\d)/);
          nieuweKlassen.push({
            naam: groep,
            vak: slotInfo?.vak || '',
            lokaal: slotInfo?.lokaal || '',
            jaarlaag: jaarlaagMatch ? jaarlaagMatch[1] : '',
            schooljaar: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          });
        } else {
          // Bestaande klas koppelen
          const klasId = Number(target);
          if (klasId && klasMapById.has(klasId)) {
            groepToKlasId.set(groep, klasId);
          }
        }
      }

      // Maak nieuwe klassen aan
      if (nieuweKlassen.length > 0) {
        const { data: inserted, error: klasError } = await supabase
          .from('klassen')
          .insert(nieuweKlassen)
          .select('id, naam, vak, lokaal');

        if (klasError) {
          return NextResponse.json({ error: `Klassen aanmaken mislukt: ${klasError.message}` }, { status: 500 });
        }

        if (inserted) {
          for (const k of inserted) {
            groepToKlasId.set(k.naam, k.id);
            klasMapById.set(k.id, k);
          }
          klassenAangemaakt = inserted.length;
        }
      }
    } else {
      // Fallback: originele naam-matching (voor legacy/backward compat)
      const groepInfo = new Map<string, { vak: string; lokaal: string }>();
      for (const slot of slots) {
        const groep = slot.groep;
        if (groep && !groepInfo.has(groep)) {
          groepInfo.set(groep, { vak: slot.vak || '', lokaal: slot.lokaal || '' });
        }
      }

      const nieuweKlassen: Array<{ naam: string; vak: string; lokaal: string; jaarlaag: string; schooljaar: string }> = [];
      for (const [groep, info] of groepInfo) {
        const existing = klasMapByName.get(groep.toLowerCase());
        if (existing) {
          groepToKlasId.set(groep, existing.id);
        } else {
          const jaarlaagMatch = groep.match(/(\d)/);
          nieuweKlassen.push({
            naam: groep,
            vak: info.vak,
            lokaal: info.lokaal,
            jaarlaag: jaarlaagMatch ? jaarlaagMatch[1] : '',
            schooljaar: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          });
        }
      }

      if (nieuweKlassen.length > 0) {
        const { data: inserted, error: klasError } = await supabase
          .from('klassen')
          .insert(nieuweKlassen)
          .select('id, naam');

        if (klasError) {
          return NextResponse.json({ error: `Klassen aanmaken mislukt: ${klasError.message}` }, { status: 500 });
        }

        if (inserted) {
          for (const k of inserted) {
            groepToKlasId.set(k.naam, k.id);
          }
          klassenAangemaakt = inserted.length;
        }
      }
    }

    // 3. Maak roosterperiode aan
    const { data: periode, error: periodeError } = await supabase
      .from('rooster_periodes')
      .insert({
        naam: periode_naam || `Zermelo ${new Date().toLocaleDateString('nl-NL')}`,
        start_datum,
        eind_datum,
        bron: 'zermelo',
      })
      .select()
      .single();

    if (periodeError || !periode) {
      return NextResponse.json({ error: periodeError?.message || 'Periode aanmaken mislukt' }, { status: 500 });
    }

    // 5. Importeer rooster slots
    const roosterSlots = [];
    const onbekend: string[] = [];

    for (const slot of slots) {
      const klasId = groepToKlasId.get(slot.groep);
      if (klasId) {
        roosterSlots.push({
          klas_id: klasId,
          dag: slot.dag,
          uur: slot.uur,
          vak: slot.vak || '',
          lokaal: slot.lokaal || '',
          is_blokuur: false,
          periode_id: periode.id,
        });
      } else if (hasMapping) {
        // In mapping mode: slot is overgeslagen (skip), geen fout
        const mappingValue = typedMapping[slot.groep];
        if (mappingValue !== 0 && mappingValue !== '0') {
          onbekend.push(`${slot.groep} (${slot.vak})`);
        }
      } else {
        onbekend.push(`${slot.groep} (${slot.vak})`);
      }
    }

    if (roosterSlots.length > 0) {
      const { error: insertError } = await supabase.from('roosters').insert(roosterSlots);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      periode,
      klassen_aangemaakt: klassenAangemaakt,
      leerlingen_imported: 0,
      rooster_imported: roosterSlots.length,
      onbekend: [...new Set(onbekend)],
    });
  }

  // ‚îÄ‚îÄ‚îÄ Legacy: eenvoudige import (zonder klassen/leerlingen) ‚îÄ‚îÄ‚îÄ
  if (body.action === 'import') {
    const { slots, periode_naam, start_datum, eind_datum } = body;
    if (!slots || !Array.isArray(slots) || !start_datum || !eind_datum) {
      return NextResponse.json({ error: 'Slots, start_datum en eind_datum zijn verplicht' }, { status: 400 });
    }

    const { data: periode, error: periodeError } = await supabase
      .from('rooster_periodes')
      .insert({
        naam: periode_naam || `Zermelo import ${new Date().toLocaleDateString('nl-NL')}`,
        start_datum,
        eind_datum,
        bron: 'zermelo',
      })
      .select()
      .single();

    if (periodeError || !periode) {
      return NextResponse.json({ error: periodeError?.message || 'Kan periode niet aanmaken' }, { status: 500 });
    }

    const { data: klassen } = await supabase.from('klassen').select('id, naam, vak, lokaal');
    const klasMap = new Map((klassen || []).map(k => [k.naam.toLowerCase(), k]));

    const roosterSlots = [];
    const onbekend: string[] = [];

    for (const slot of slots) {
      const klas = klasMap.get(slot.groep?.toLowerCase()) || klasMap.get(slot.vak?.toLowerCase());
      if (klas) {
        roosterSlots.push({
          klas_id: klas.id, dag: slot.dag, uur: slot.uur,
          vak: slot.vak || klas.vak, lokaal: slot.lokaal || klas.lokaal,
          is_blokuur: false, periode_id: periode.id,
        });
      } else {
        onbekend.push(`${slot.groep} (${slot.vak})`);
      }
    }

    if (roosterSlots.length > 0) {
      const { error: insertError } = await supabase.from('roosters').insert(roosterSlots);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true, periode,
      imported: roosterSlots.length,
      onbekend: [...new Set(onbekend)],
    });
  }

  return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 });
}

