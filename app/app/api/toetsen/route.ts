import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const klasId = searchParams.get('klas_id');
    const db = await getDb();

    let query = `SELECT * FROM toetsen`;
    const params: (string | number)[] = [];
    if (klasId) { query += ` WHERE klas_id = ?`; params.push(Number(klasId)); }
    query += ` ORDER BY datum DESC`;

    const result = db.exec(query, params);
    if (result.length === 0) return NextResponse.json([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toetsen = result[0].values.map((row: any[]) => ({
      id: row[0], klas_id: row[1], naam: row[2], type: row[3],
      datum: row[4], weging: row[5], max_score: row[6], omschrijving: row[7], created_at: row[8],
    }));
    return NextResponse.json(toetsen);
  } catch (e) {
    console.error('GET /api/toetsen error:', e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();
  db.run(
    `INSERT INTO toetsen (klas_id, naam, type, datum, weging, max_score, omschrijving) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.klas_id, body.naam, body.type || 'SO', body.datum || null, body.weging || 1.0, body.max_score || 10.0, body.omschrijving || '']
  );
  saveDb();
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const db = await getDb();
  db.run(
    `UPDATE toetsen SET naam=?, type=?, datum=?, weging=?, max_score=?, omschrijving=? WHERE id=?`,
    [body.naam, body.type, body.datum, body.weging, body.max_score, body.omschrijving, body.id]
  );
  saveDb();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = await getDb();
  db.run(`DELETE FROM cijfers WHERE toets_id = ?`, [Number(id)]);
  db.run(`DELETE FROM toetsen WHERE id = ?`, [Number(id)]);
  saveDb();
  return NextResponse.json({ success: true });
}
