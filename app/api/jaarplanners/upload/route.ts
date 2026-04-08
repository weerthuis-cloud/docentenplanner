import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface JaarplannerRow {
  week: number;
  les: number;
  planning: string;
  toetsen: string;
}

/**
 * Strip HTML tags and decode entities from cell content.
 * Adds spaces for block elements (p, br, div) so text doesn't merge.
 */
function cleanCell(html: string): string {
  return html
    .replace(/<\/?(p|br|div|li|ul|ol)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse HTML tables (from mammoth) to extract jaarplanner data.
 * The docx has two tables: first is general info, second is the jaarplanner.
 * The jaarplanner table has columns: wk, les, planning, toetsen/opmerkingen
 * with rowspan grouping multiple rows per week.
 */
function parseHtmlTable(html: string): JaarplannerRow[] {
  const rows: JaarplannerRow[] = [];

  // Find ALL tables in the document
  const tableRegex = /<table>([\s\S]*?)<\/table>/gi;
  const tables: string[] = [];
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    tables.push(tableMatch[1]);
  }

  // Use the largest table (the main jaarplanner), skip small info tables
  let mainTable = '';
  for (const t of tables) {
    if (t.length > mainTable.length) mainTable = t;
  }

  if (!mainTable) return rows;

  // Extract all rows from the main table
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  let isHeader = true;
  let currentWeek = 0;

  while ((rowMatch = rowRegex.exec(mainTable)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract cells (td or th), preserving rowspan info
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cleanCell(cellMatch[1]));
    }

    // Skip header row (contains "wk", "les", "planning", etc.)
    if (isHeader) {
      const joined = cells.join(' ').toLowerCase();
      if (joined.includes('wk') || joined.includes('les') || joined.includes('planning')) {
        isHeader = false;
        continue;
      }
      // If first row doesn't look like a header, don't skip
      isHeader = false;
    }

    // Skip empty rows
    if (cells.length === 0 || cells.every(c => c === '')) continue;

    // Detect row type based on number of cells:
    // 4 cells = new week row: [week_info, les_nr, planning, toetsen]
    // 3 cells = continuation row (rowspan): [les_nr, planning, toetsen]
    if (cells.length >= 4) {
      // First cell contains week number (possibly with dates like "35 24 aug 29 aug")
      const weekText = cells[0].split(/\s+/)[0] || '';
      const weekNum = parseInt(weekText, 10);
      if (!isNaN(weekNum) && weekNum > 0 && weekNum <= 53) {
        currentWeek = weekNum;
      }

      const lesNr = parseInt(cells[1], 10);
      const planning = cells[2] || '';
      const toetsen = cells[3] || '';

      if (!isNaN(lesNr) && lesNr > 0 && currentWeek > 0) {
        rows.push({ week: currentWeek, les: lesNr, planning, toetsen });
      } else if (currentWeek > 0 && (planning || toetsen)) {
        // No les number but has content, treat as les 1
        rows.push({ week: currentWeek, les: 1, planning, toetsen });
      }
    } else if (cells.length === 3 && currentWeek > 0) {
      // Continuation row within a week (rowspan on week cell)
      const lesNr = parseInt(cells[0], 10);
      const planning = cells[1] || '';
      const toetsen = cells[2] || '';

      if (!isNaN(lesNr) && lesNr > 0) {
        rows.push({ week: currentWeek, les: lesNr, planning, toetsen });
      }
    } else if (cells.length === 2 && currentWeek > 0) {
      // Minimal row: [planning, toetsen] or [les, planning]
      const lesNr = parseInt(cells[0], 10);
      if (!isNaN(lesNr) && lesNr > 0) {
        rows.push({ week: currentWeek, les: lesNr, planning: cells[1] || '', toetsen: '' });
      }
    }
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const vak = formData.get('vak') as string;
    const jaarlaag = formData.get('jaarlaag') as string;
    const naam = formData.get('naam') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!vak || !jaarlaag) {
      return NextResponse.json({ error: 'vak and jaarlaag are required' }, { status: 400 });
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Try to extract using mammoth (if available), otherwise try basic approach
    let htmlContent = '';

    try {
      // Dynamically import mammoth only when needed
      const mammoth = await import('mammoth');
      const result = await mammoth.convertToHtml({ arrayBuffer });
      htmlContent = result.value;
    } catch (err) {
      // If mammoth fails or not available, try to parse as ZIP (docx is a ZIP)
      try {
        const JSZip = await import('jszip');
        const zip = new JSZip.default();
        await zip.loadAsync(buffer);

        // Extract document.xml from docx
        const documentXml = await zip.file('word/document.xml')?.async('text');
        if (!documentXml) {
          throw new Error('Could not extract document.xml from docx');
        }

        // Basic XML to HTML conversion for tables
        const tableRegex = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
        let tableMatch;

        while ((tableMatch = tableRegex.exec(documentXml)) !== null) {
          const tableXml = tableMatch[1];
          const rowRegex = /<w:tr>([\s\S]*?)<\/w:tr>/g;
          let rowMatch;
          let tableHtml = '<table>';

          while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
            const rowXml = rowMatch[1];
            tableHtml += '<tr>';

            const cellRegex = /<w:tc>([\s\S]*?)<\/w:tc>/g;
            let cellMatch;

            while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
              const cellXml = cellMatch[1];
              const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
              let textMatch;
              let cellText = '';

              while ((textMatch = textRegex.exec(cellXml)) !== null) {
                cellText += textMatch[1];
              }

              tableHtml += `<td>${cellText}</td>`;
            }

            tableHtml += '</tr>';
          }

          tableHtml += '</table>';
          htmlContent += tableHtml;
        }
      } catch (zipErr) {
        return NextResponse.json(
          { error: 'Could not parse docx file. Please ensure it is a valid Word document with a table.' },
          { status: 400 }
        );
      }
    }

    // Parse the HTML table to extract jaarplanner data
    const data = parseHtmlTable(htmlContent);

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'No table data found in the document. Please ensure the docx has a properly formatted table with weeks, lessons, planning, and notes.' },
        { status: 400 }
      );
    }

    // Save to Supabase
    const { data: insertedData, error: insertError } = await supabase
      .from('jaarplanners')
      .insert({
        vak,
        jaarlaag,
        schooljaar: '2025-2026',
        data,
        naam: naam || `${vak} - ${jaarlaag}`,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: insertedData?.id,
      rowsImported: data.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error during upload' },
      { status: 500 }
    );
  }
}
