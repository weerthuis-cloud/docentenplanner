import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd. Voeg deze toe aan je .env.local en Vercel environment variables.' }, { status: 500 });
  }

  const body = await req.json();
  const { vak, onderwerp, niveau, aantalVragen, vraagTypes, bloomVerdeling, taal, extraInstructies } = body;

  const prompt = `Je bent een ervaren ${vak || 'Nederlands'}-docent in het voortgezet onderwijs in Nederland. Maak toetsvragen over het onderwerp "${onderwerp}".

EISEN:
- Maak precies ${aantalVragen || 5} vragen
- Niveau: ${niveau || 'havo/vwo'}
- Taal: ${taal || 'Nederlands'}
- Gewenste vraagtypen: ${(vraagTypes || ['open_kort', 'meerkeuze']).join(', ')}
- Bloom-verdeling: ${bloomVerdeling || 'mix van onthouden, begrijpen en toepassen'}
${extraInstructies ? `- Extra instructies: ${extraInstructies}` : ''}

VRAAGTYPEN uitleg:
- meerkeuze: 4 antwoordopties (A/B/C/D), precies 1 correct
- open_kort: kort antwoord (1-3 zinnen)
- open_lang: uitgebreid antwoord (alinea/essay)
- invul: zin met een ontbrekend woord/zinsdeel
- koppel: verbind links met rechts (minimaal 4 paren)
- waar_onwaar: stelling die waar of onwaar is

Geef het antwoord ALLEEN als JSON array. Elk element heeft:
{
  "vraag_tekst": "De vraag",
  "vraag_type": "meerkeuze|open_kort|open_lang|invul|koppel|waar_onwaar",
  "bloom_niveau": "onthouden|begrijpen|toepassen|analyseren|evalueren|creeren",
  "punten": number,
  "antwoord_model": "Het correcte antwoord / uitleg voor de docent",
  "antwoorden": [
    {"antwoord_tekst": "Optie A", "is_correct": false},
    {"antwoord_tekst": "Optie B", "is_correct": true}
  ]
}

Voor meerkeuze: 4 antwoorden met precies 1 correct.
Voor waar_onwaar: 2 antwoorden ("Waar" en "Onwaar") met 1 correct.
Voor koppel: antwoorden als paren met koppel_tekst.
Voor open/invul: laat antwoorden leeg ([]).

Geef ALLEEN de JSON array, geen uitleg ervoor of erna.`;

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
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Anthropic API fout: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON uit het antwoord
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI gaf geen geldig JSON antwoord', raw: text }, { status: 500 });
    }

    const vragen = JSON.parse(jsonMatch[0]);
    return NextResponse.json(vragen);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Onbekende fout' }, { status: 500 });
  }
}
