import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/*
  Zermelo Import API

  Stap 1: POST { action: 'auth', school: 'schoolnaam', code: 'koppelcode' }
    → Haalt access_token op via Zermelo API

  Stap 2: POST { action: 'fetch', school: 'schoolnaam', token: 'access_token', week_start: '2026-01-05' }
    → Haalt rooster op voor de opgegeven week en geeft preview terug

  Stap 3: POST { action: 'import', slots: [...], periode_naam: '...', start_datum: '...', eind_datum: '...' }
    → Slaat het rooster op als nieuwe periode
*/

// Zermelo tijdslots → uur-nummer mapping
// Standaard Nederlandse schooltijden (aanpasbaar)
const TIJDSLOT_MAPPING: Record<number, number> = {
  // startuur (epoch minuten na middernacht) → uur nummer
  // Dit is een fallback; we berekenen het liever uit de data
};

function epochToHour(startTimeSlot: number): { dag: number; uur: number } {
  // Zermelo gebruikt Unix timestamps (seconds since epoch)
  const d = new Date(startTimeSlot * 1000);
  const dag = d.getDay(); // 0=zo, 1=ma, ...
  const hour = d.getHours();
  const minutes = d.getMinutes();

  // Map naar uur-nummer op basis van starttijd
  // Standaard Nederlands rooster: uur 1 = 8:30, uur 2 = 9:20, etc.
  let uur = 1;
  const timeMin = hour * 60 + minutes;
  if (timeMin < 510) uur = 1;       // voor 8:30
  else if (timeMin < 560) uur = 1;  // 8:30 - 9:19
  else if (timeMin < 610) uur = 2;  // 9:20 - 10:09
  else if (timeMin < 660) uur = 3;  // 10:10 - 10:59
  else if (timeMin < 720) uur = 4;  // 11:00 - 11:59
  else if (timeMin < 780) uur = 5;  // 12:00 - 12:59
  else if (timeMin < 840) uur = 6;  // 13:00 - 13:59
  else if (timeMin < 900) uur = 7;  // 14:00 - 14:59
  else if (timeMin < 960) uur = 8;  // 15:00 - 15:59
  else uur = 9;                      // 16:00+

  return { dag, uur };
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
        const text = await res.text();
        return NextResponse.json({ error: `Zermelo authenticatie mislukt: ${res.status}. Controleer schoolnaam en koppelcode.`, details: text }, { status: 401 });
      }

      const data = await res.json();
      const token = data.access_token;
      if (!token) {
        return NextResponse.json({ error: 'Geen access_token ontvangen van Zermelo' }, { status: 401 });
      }

      return NextResponse.json({ success: true, token });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return NextResponse.json({ error: `Verbinding met Zermelo mislukt: ${message}` }, { status: 500 });
    }
  }

  // ─── STAP 2: Rooster ophalen ───
  if (body.action === 'fetch') {
    const { school, token, week_start } = body;
    if (!school || !token) {
      return NextResponse.json({ error: 'School en token zijn verplicht' }, { status: 400 });
    }

    try {
      // Bereken week range in unix timestamps
      const startDate = new Date(week_start + 'T00:00:00');
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 5); // Ma t/m Vr
      const startTs = Math.floor(startDate.getTime() / 1000);
      const endTs = Math.floor(endDate.getTime() / 1000);

      // Haal gebruiker op
      const userRes = await fetch(
        `https://${school}.zportal.nl/api/v3/users/~me?access_token=${token}`
      );
      if (!userRes.ok) {
        return NextResponse.json({ error: 'Kan gebruiker niet ophalen. Token verlopen?' }, { status: 401 });
      }
      const userData = await userRes.json();
      const userCode = userData?.response?.data?.[0]?.code;

      // Haal appointments (lessen) op
      const apptRes = await fetch(
        `https://${school}.zportal.nl/api/v3/appointments?user=${userCode || '~me'}&start=${startTs}&end=${endTs}&valid=true&access_token=${token}`
      );
      if (!apptRes.ok) {
        return NextResponse.json({ error: 'Kan rooster niet ophalen van Zermelo' }, { status: 500 });
      }
      const apptData = await apptRes.json();
      const appointments = apptData?.response?.data || [];

      // Vertaal naar rooster slots
      type PreviewSlot = {
        dag: number;
        uur: number;
        vak: string;
        lokaal: string;
        groep: string;
        start_time: string;
        end_time: string;
      };

      const slots: PreviewSlot[] = [];
      const seen = new Set<string>();

      for (const appt of appointments) {
        if (appt.cancelled || appt.type !== 'lesson') continue;

        const { dag, uur } = epochToHour(appt.start);
        if (dag < 1 || dag > 5) continue; // Alleen weekdagen

        const key = `${dag}-${uur}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const vak = appt.subjects?.[0] || '';
        const lokaal = appt.locations?.[0] || '';
        const groep = appt.groups?.[0] || '';
        const startTime = new Date(appt.start * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(appt.end * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

        slots.push({ dag, uur, vak, lokaal, groep, start_time: startTime, end_time: endTime });
      }

      slots.sort((a, b) => a.dag - b.dag || a.uur - b.uur);

      return NextResponse.json({
        success: true,
        user: userCode,
        week_start,
        slots,
        raw_count: appointments.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return NextResponse.json({ error: `Fout bij ophalen rooster: ${message}` }, { status: 500 });
    }
  }

  // ─── STAP 3: Import naar database ───
  if (body.action === 'import') {
    const { slots, periode_naam, start_datum, eind_datum } = body;
    if (!slots || !Array.isArray(slots) || !start_datum || !eind_datum) {
      return NextResponse.json({ error: 'Slots, start_datum en eind_datum zijn verplicht' }, { status: 400 });
    }

    // Maak periode aan
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

    // Importeer slots — koppel aan bestaande klassen op basis van groepnaam
    const { data: klassen } = await supabase.from('klassen').select('id, naam, vak, lokaal');
    const klasMap = new Map((klassen || []).map(k => [k.naam.toLowerCase(), k]));

    const roosterSlots = [];
    const onbekend: string[] = [];

    for (const slot of slots) {
      // Probeer klas te matchen op groepnaam
      const klas = klasMap.get(slot.groep?.toLowerCase()) ||
                   klasMap.get(slot.vak?.toLowerCase());

      if (klas) {
        roosterSlots.push({
          klas_id: klas.id,
          dag: slot.dag,
          uur: slot.uur,
          vak: slot.vak || klas.vak,
          lokaal: slot.lokaal || klas.lokaal,
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
      imported: roosterSlots.length,
      onbekend: [...new Set(onbekend)],
    });
  }

  return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 });
}
