import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leerlingId = searchParams.get('leerling_id');
  const datum = searchParams.get('datum');
  const klasId = searchParams.get('klas_id');

  const db = await getDb();
  let query = `SELECT r.*, l.voornaam, l.achternaam FROM registraties r JOIN leerlingen l ON l.id = r.leerling_id WHERE 1=1`;
  const params: (string | number)[] = [];

  if (leerlingId) { query += ` AND r.leerling_id = ?`; params.push(Number(leerlingId)); }
  if (datum) { query += ` AND r.datum = ?`; params.push(datum); }
  if (klasId) { query += ` AND l.klas_id = ?`; params.push(Number(klasId)); }
  query += ` ORDER BY r.created_at DESC`;

  const result = db.exec(query, params);
  if (result.length === 0) return NextResponse.json([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registraties = result[0].values.map((row: any[]) => ({
    id: row[0], leerling_id: row[1], les_id: row[2], datum: row[3],
    type: row[4], details: row[5], created_at: row[6],
    voornaam: row[7], achternaam: row[8],
  }));

  return NextResponse.json(registraties);
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();
  db.run(
    `INSERT INTO registraties (leerling_id, les_id, datum, type, details) VALUES (?, ?, date('now'), ?, ?)`,
    [body.leerling_id, body.les_id || null, body.type, body.details || null]
  );
  saveDb();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const leerlingId = searchParams.get('leerling_id');
  const type = searchParams.get('type');
  const datum = searchParams.get('datum');

  const db = await getDb();

  if (id) {
    db.run(`DELETE FROM registraties WHERE id = ?`, [Number(id)]);
  } else if (leerlingId && type && datum) {
    db.run(`DELETE FROM registraties WHERE leerling_id = ? AND type = ? AND datum = ?`,
      [Number(leerlingId), type, datum]);
  }

  saveDb();
  return NextResponse.json({ success: true });
}
