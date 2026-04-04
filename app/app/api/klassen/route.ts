import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
    const klassen = db.exec(`
      SELECT k.*, COUNT(l.id) as aantal_leerlingen
      FROM klassen k
      LEFT JOIN leerlingen l ON l.klas_id = k.id
      GROUP BY k.id
      ORDER BY k.naam
    `);

    if (klassen.length === 0) return NextResponse.json([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = klassen[0].values.map((row: any[]) => ({
      id: row[0],
      naam: row[1],
      vak: row[2],
      lokaal: row[3],
      jaarlaag: row[4],
      schooljaar: row[5],
      created_at: row[6],
      aantal_leerlingen: row[7],
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error('GET /api/klassen error:', e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();
  db.run(
    `INSERT INTO klassen (naam, vak, lokaal, jaarlaag) VALUES (?, ?, ?, ?)`,
    [body.naam, body.vak || 'Nederlands', body.lokaal || '', body.jaarlaag || '']
  );
  saveDb();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = await getDb();
  db.run(`DELETE FROM leerlingen WHERE klas_id = ?`, [Number(id)]);
  db.run(`DELETE FROM klassen WHERE id = ?`, [Number(id)]);
  saveDb();
  return NextResponse.json({ success: true });
}
