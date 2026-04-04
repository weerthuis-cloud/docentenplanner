import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const toetsId = searchParams.get('toets_id');
    const leerlingId = searchParams.get('leerling_id');
    const klasId = searchParams.get('klas_id');
    const db = await getDb();

    if (toetsId) {
      // Cijfers voor één toets met leerlingnamen
      const result = db.exec(
        `SELECT c.*, l.voornaam, l.achternaam FROM cijfers c
         JOIN leerlingen l ON l.id = c.leerling_id
         WHERE c.toets_id = ? ORDER BY l.achternaam, l.voornaam`, [Number(toetsId)]
      );
      if (result.length === 0) return NextResponse.json([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return NextResponse.json(result[0].values.map((row: any[]) => ({
        id: row[0], toets_id: row[1], leerling_id: row[2], score: row[3],
        opmerking: row[4], created_at: row[5], voornaam: row[6], achternaam: row[7],
      })));
    }

    if (leerlingId) {
      // Alle cijfers van één leerling
      const result = db.exec(
        `SELECT c.*, t.naam as toets_naam, t.type as toets_type, t.weging, t.datum as toets_datum
         FROM cijfers c JOIN toetsen t ON t.id = c.toets_id
         WHERE c.leerling_id = ? ORDER BY t.datum DESC`, [Number(leerlingId)]
      );
      if (result.length === 0) return NextResponse.json([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return NextResponse.json(result[0].values.map((row: any[]) => ({
        id: row[0], toets_id: row[1], leerling_id: row[2], score: row[3],
        opmerking: row[4], created_at: row[5], toets_naam: row[6], toets_type: row[7],
        weging: row[8], toets_datum: row[9],
      })));
    }

    if (klasId) {
      // Alle cijfers voor een klas (alle toetsen + alle leerlingen)
      const result = db.exec(
        `SELECT c.id, c.toets_id, c.leerling_id, c.score, c.opmerking,
                l.voornaam, l.achternaam, t.naam as toets_naam, t.type as toets_type, t.weging
         FROM cijfers c
         JOIN leerlingen l ON l.id = c.leerling_id
         JOIN toetsen t ON t.id = c.toets_id
         WHERE l.klas_id = ?
         ORDER BY l.achternaam, l.voornaam, t.datum`, [Number(klasId)]
      );
      if (result.length === 0) return NextResponse.json([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return NextResponse.json(result[0].values.map((row: any[]) => ({
        id: row[0], toets_id: row[1], leerling_id: row[2], score: row[3], opmerking: row[4],
        voornaam: row[5], achternaam: row[6], toets_naam: row[7], toets_type: row[8], weging: row[9],
      })));
    }

    return NextResponse.json([]);
  } catch (e) {
    console.error('GET /api/cijfers error:', e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();

  // Upsert: update als er al een cijfer is voor deze toets + leerling
  const existing = db.exec(
    `SELECT id FROM cijfers WHERE toets_id = ? AND leerling_id = ?`,
    [body.toets_id, body.leerling_id]
  );

  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`UPDATE cijfers SET score = ?, opmerking = ? WHERE toets_id = ? AND leerling_id = ?`,
      [body.score, body.opmerking || null, body.toets_id, body.leerling_id]);
  } else {
    db.run(`INSERT INTO cijfers (toets_id, leerling_id, score, opmerking) VALUES (?, ?, ?, ?)`,
      [body.toets_id, body.leerling_id, body.score, body.opmerking || null]);
  }

  saveDb();
  return NextResponse.json({ success: true });
}

// Batch save: meerdere cijfers tegelijk
export async function PUT(req: Request) {
  const body = await req.json();
  const db = await getDb();

  if (Array.isArray(body.cijfers)) {
    for (const c of body.cijfers) {
      const existing = db.exec(
        `SELECT id FROM cijfers WHERE toets_id = ? AND leerling_id = ?`,
        [c.toets_id, c.leerling_id]
      );
      if (existing.length > 0 && existing[0].values.length > 0) {
        db.run(`UPDATE cijfers SET score = ?, opmerking = ? WHERE toets_id = ? AND leerling_id = ?`,
          [c.score, c.opmerking || null, c.toets_id, c.leerling_id]);
      } else {
        db.run(`INSERT INTO cijfers (toets_id, leerling_id, score, opmerking) VALUES (?, ?, ?, ?)`,
          [c.toets_id, c.leerling_id, c.score, c.opmerking || null]);
      }
    }
  }

  saveDb();
  return NextResponse.json({ success: true });
}
