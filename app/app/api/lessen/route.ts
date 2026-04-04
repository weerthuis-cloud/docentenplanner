import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');
  const datum = searchParams.get('datum');

  const db = await getDb();
  let query = `SELECT * FROM lessen WHERE 1=1`;
  const params: (string | number)[] = [];

  if (klasId) { query += ` AND klas_id = ?`; params.push(Number(klasId)); }
  if (datum) { query += ` AND datum = ?`; params.push(datum); }
  query += ` ORDER BY datum DESC LIMIT 1`;

  const result = db.exec(query, params);
  if (result.length === 0) return NextResponse.json(null);

  const row = result[0].values[0];
  return NextResponse.json({
    id: row[0], klas_id: row[1], datum: row[2],
    startopdracht: row[3], terugkijken: row[4], programma: row[5],
    leerdoelen: row[6], huiswerk: row[7], niet_vergeten: row[8],
    notities: row[9], created_at: row[10],
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();

  // Upsert: update als les voor deze klas+datum al bestaat
  const existing = db.exec(
    `SELECT id FROM lessen WHERE klas_id = ? AND datum = ?`,
    [body.klas_id, body.datum || new Date().toISOString().split('T')[0]]
  );

  if (existing.length > 0 && existing[0].values.length > 0) {
    const id = existing[0].values[0][0];
    db.run(`UPDATE lessen SET startopdracht=?, terugkijken=?, programma=?, leerdoelen=?, huiswerk=?, niet_vergeten=? WHERE id=?`,
      [body.startopdracht, body.terugkijken, body.programma, body.leerdoelen, body.huiswerk, body.niet_vergeten, id]);
  } else {
    db.run(`INSERT INTO lessen (klas_id, datum, startopdracht, terugkijken, programma, leerdoelen, huiswerk, niet_vergeten) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.klas_id, body.datum || new Date().toISOString().split('T')[0], body.startopdracht, body.terugkijken, body.programma, body.leerdoelen, body.huiswerk, body.niet_vergeten]);
  }

  saveDb();
  return NextResponse.json({ success: true });
}
