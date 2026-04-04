import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');

  const db = await getDb();

  let query = `SELECT * FROM leerlingen`;
  const params: (string | number)[] = [];

  if (klasId) {
    query += ` WHERE klas_id = ?`;
    params.push(Number(klasId));
  }
  query += ` ORDER BY achternaam, voornaam`;

  const result = db.exec(query, params);
  if (result.length === 0) return NextResponse.json([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leerlingen = result[0].values.map((row: any[]) => ({
    id: row[0],
    klas_id: row[1],
    voornaam: row[2],
    achternaam: row[3],
    foto_url: row[4],
    seat_row: row[5],
    seat_col: row[6],
    boek_titel: row[7],
    boek_kleur: row[8],
    created_at: row[9],
  }));

  return NextResponse.json(leerlingen);
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();
  db.run(
    `INSERT INTO leerlingen (klas_id, voornaam, achternaam, boek_titel, boek_kleur) VALUES (?, ?, ?, ?, ?)`,
    [body.klas_id, body.voornaam, body.achternaam, body.boek_titel || '', body.boek_kleur || '#2E4057']
  );
  saveDb();
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const db = await getDb();
  db.run(
    `UPDATE leerlingen SET voornaam = ?, achternaam = ?, boek_titel = ?, boek_kleur = ? WHERE id = ?`,
    [body.voornaam, body.achternaam, body.boek_titel || '', body.boek_kleur || '#2E4057', body.id]
  );
  saveDb();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = await getDb();
  db.run(`DELETE FROM leerlingen WHERE id = ?`, [Number(id)]);
  saveDb();
  return NextResponse.json({ success: true });
}
