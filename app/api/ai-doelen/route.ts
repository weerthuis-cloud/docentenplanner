import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      doelen: [
        'ANTHROPIC_API_KEY niet geconfigureerd. Voeg deze toe aan .env.local en Vercel.'
      ]
    }, { status: 200 }); // Return 200 so frontend shows the message
  }

  const body = await req.json();
  const { steekwoorden, theorie_context, track, jaarlaag, leerlijn_context, bestaande_doelen } = body;

  const prompt = `Je bent een ervaren formuleercoach voor docenten in het Nederlandse voortgezet onderwijs. Je helpt docenten om hun steekwoorden om te zetten in concrete, meetbare toetsdoelen.

CONTEXT:
- Niveau: ${track || 'HAVO'} ${jaarlaag || ''}
- Vak: Nederlands

STEEKWOORDEN VAN DE DOCENT:
${steekwoorden}

${theorie_context ? `BEHANDELDE THEORIE / OEFENINGEN:\n${theorie_context}\n` : ''}

${leerlijn_context ? `DOORLOPENDE LEERLIJN ${track} ${jaarlaag} (ter referentie):\n${leerlijn_context}\n` : ''}

${bestaande_doelen && bestaande_doelen.length > 0 ? `REEDS GEKOZEN DOELEN (niet herhalen):\n${bestaande_doelen.map((d: string) => `- ${d}`).join('\n')}\n` : ''}

OPDRACHT:
Genereer 3-5 concrete, meetbare toetsdoelen op basis van de steekwoorden. Gebruik de WDS-taxonomie:
- Weten (herkennen, benoemen, opsommen, reproduceren)
- Doen (beschrijven, samenvatten, toepassen, uitleggen)
- Snappen (onderbouwen, beoordelen, analyseren, ontwikkelen)

REGELS:
- Begin elk doel met "De leerling kan..." of "De leerling..."
- Gebruik actieve werkwoorden uit de WDS-niveaus
- Maak doelen specifiek en toetsbaar (niet te vaag)
- Baseer je op de leerlijn als die beschikbaar is
- Geef een mix van WDS-niveaus passend bij ${jaarlaag || 'het niveau'}
- Herhaal geen doelen die al gekozen zijn

Geef je antwoord ALLEEN als JSON array van strings. Geen uitleg, geen nummering, geen markdown. Alleen:
["doel 1", "doel 2", "doel 3"]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return NextResponse.json({ doelen: ['AI-service tijdelijk niet beschikbaar. Probeer het later opnieuw.'] });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ doelen: ['AI gaf geen bruikbaar antwoord. Probeer met andere steekwoorden.'], raw: text });
    }

    const doelen = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ doelen });
  } catch (err: any) {
    console.error('AI doelen error:', err);
    return NextResponse.json({ doelen: ['Er ging iets mis. Controleer je verbinding en probeer opnieuw.'] });
  }
}
