import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/*
  Zermelo Import API

  Stap 1: POST { action: 'auth', school, code }
    → Haalt access_token op

  Stap 2: POST { action: 'fetch', school, token, week_start }
    → Haalt rooster op, geeft preview met groepen

  Stap 3: POST { action: 'fetch_students', school, token, groepen: string[] }
    → Haalt leerlingen op per groep

  Stap 4: POST { action: 'import_full', school, token, slots, groepen_data, periode_naam, start_datum, eind_datum }
    → Importeert alles: maakt klassen aan, importeert leerlingen, maakt roosterperiode + slots
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

  // ─── STAP 1: Authenticatie ───
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

  // ─── STAP 2: Rooster ophalen ───
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

  // ─── STAP 3: Leerlingen per groep ophalen ───
  if (body.action === 'fetch_students') {
    const { school, token, groepen } = body;
    if (!school || !token || !groepen) {
      return NextResponse.json({ error: 'School, token en groepen zijn verplicht' }, { status: 400 });
    }

    try {
      // Zermelo API: studentsInDepartments of appointmentParticipations
      // Probeer eerst via /students met group filter
      const result: Record<string, Array<{ firstName: string; lastName: string; code: string }>> = {};

      for (const groep of groepen as string[]) {
        try {
          // Methode 1: /appointments met specifieke groep om deelnemers te vinden
          // Methode 2: /studentsindepartments
          // Methode 3: /groupindepartments dan /students

          // Probeer via liveschedule of students endpoint
          const students = await zermeloGet(school, token, 'students', {
            schoolInSchoolYear: `~current`,
            group: groep,
            fields: 'code,firstName,prefix,lastName',
          });

          if (students && students.length > 0) {
            result[groep] = students.map((s: Record<string, string>) => ({
              firstName: s.firstName || '',
              lastName: [s.prefix, s.lastName].filter(Boolean).join(' ') || '',
              code: s.code || '',
            }));
          } else {
            // Fallback: probeer via departmentOfBranch
            result[groep] = [];
          }
        } catch {
          // Endpoint niet beschikbaar voor deze groep
          result[groep] = [];
        }
      }

      return NextResponse.json({ success: true, students: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return NextResponse.json({ error: `Fout bij ophalen leerlingen: ${message}` }, { status: 500 });
    }
  }

  // ─── STAP 4: Volledige import (rooster + klassen + leerlingen) ───
  if (body.action === 'import_full') {
    const { slots, students, periode_naam, start_datum, eind_datum } = body;
    if (!slots || !start_datum || !eind_datum) {
      return NextResponse.json({ error: 'Slots, start_datum en eind_datum zijn verplicht' }, { status: 400 });
    }

    // 1. Verzamel unieke groepen uit slots
    const groepInfo = new Map<string, { vak: string; lokaal: string }>();
    for (const slot of slots) {
      const groep = slot.groep;
      if (groep && !groepInfo.has(groep)) {
        groepInfo.set(groep, { vak: slot.vak || '', lokaal: slot.lokaal || '' });
      }
    }

    // 2. Check welke klassen al bestaan
    const { data: bestaandeKlassen } = await supabase.from('klassen').select('id, naam, vak, lokaal');
    const klasMap = new Map((bestaandeKlassen || []).map(k => [k.naam.toLowerCase(), k]));

    // 3. Maak nieuwe klassen aan voor onbekende groepen
    const nieuweKlassen: Array<{ naam: string; vak: string; lokaal: string; jaarlaag: string; schooljaar: string }> = [];
    for (const [groep, info] of groepInfo) {
      if (!klasMap.has(groep.toLowerCase())) {
        // Probeer jaarlaag af te leiden uit groepnaam (bijv. "h5e" → "5", "a3a" → "3", "m3c" → "3")
        const jaarlaagMatch = groep.match(/(\d)/);
        const jaarlaag = jaarlaagMatch ? jaarlaagMatch[1] : '';
        nieuweKlassen.push({
          naam: groep,
          vak: info.vak,
          lokaal: info.lokaal,
          jaarlaag,
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

      // Update klasMap met nieuw aangemaakte klassen
      if (inserted) {
        for (const k of inserted) {
          klasMap.set(k.naam.toLowerCase(), k);
        }
      }
    }

    // 4. Importeer leerlingen per groep (als students data meegegeven)
    let leerlingenImported = 0;
    if (students && typeof students === 'object') {
      for (const [groep, leerlingList] of Object.entries(students)) {
        const klas = klasMap.get(groep.toLowerCase());
        if (!klas || !Array.isArray(leerlingList) || leerlingList.length === 0) continue;

        // Check bestaande leerlingen in deze klas
        const { data: bestaandeLeerlingen } = await supabase
          .from('leerlingen')
          .select('voornaam, achternaam')
          .eq('klas_id', klas.id);

        const bestaandeNamen = new Set(
          (bestaandeLeerlingen || []).map(l => `${l.voornaam}|${l.achternaam}`.toLowerCase())
        );

        const nieuweLeerlingen = (leerlingList as Array<{ firstName: string; lastName: string }>)
          .filter(s => !bestaandeNamen.has(`${s.firstName}|${s.lastName}`.toLowerCase()))
          .map(s => ({
            klas_id: klas.id,
            voornaam: s.firstName || '',
            achternaam: s.lastName || '',
          }));

        if (nieuweLeerlingen.length > 0) {
          const { error: llError } = await supabase.from('leerlingen').insert(nieuweLeerlingen);
          if (!llError) leerlingenImported += nieuweLeerlingen.length;
        }
      }
    }

    // 5. Maak roosterperiode aan
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

    // 6. Importeer rooster slots
    const roosterSlots = [];
    const onbekend: string[] = [];

    for (const slot of slots) {
      const klas = klasMap.get(slot.groep?.toLowerCase());
      if (klas) {
        roosterSlots.push({
          klas_id: klas.id,
          dag: slot.dag,
          uur: slot.uur,
          vak: slot.vak || '',
          lokaal: slot.lokaal || '',
          is_blokuur: false,
          periode_id: periode.id,
        });
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
      klassen_aangemaakt: nieuweKlassen.length,
      leerlingen_imported: leerlingenImported,
      rooster_imported: roosterSlots.length,
      onbekend: [...new Set(onbekend)],
    });
  }

  // ─── Legacy: eenvoudige import (zonder klassen/leerlingen) ───
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
