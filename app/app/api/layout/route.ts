import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const klasId = searchParams.get('klas_id');
  if (!klasId) return NextResponse.json(null);

  const db = await getDb();
  const result = db.exec(`SELECT * FROM plattegrond_layouts WHERE klas_id = ?`, [Number(klasId)]);

  if (result.length === 0 || result[0].values.length === 0) return NextResponse.json(null);

  const row = result[0].values[0];
  return NextResponse.json({
    id: row[0], klas_id: row[1], layout_type: row[2],
    rijen: row[3], kolommen: row[4],
    layout_data: JSON.parse(row[5] as string),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const db = await getDb();

  const existing = db.exec(`SELECT id FROM plattegrond_layouts WHERE klas_id = ?`, [body.klas_id]);

  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`UPDATE plattegrond_layouts SET layout_data = ?, layout_type = ? WHERE klas_id = ?`,
      [JSON.stringify(body.layout_data), body.layout_type || 'paren', body.klas_id]);
  } else {
    db.run(`INSERT INTO plattegrond_layouts (klas_id, layout_data, layout_type) VALUES (?, ?, ?)`,
      [body.klas_id, JSON.stringify(body.layout_data), body.layout_type || 'paren']);
  }

  saveDb();
  return NextResponse.json({ success: true });
}
