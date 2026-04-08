import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface JaarplannerRow {
  week: number;
  les: number;
  planning: string;
  toetsen: string;
}

/**
 * Parse HTML table (from mammoth) to extract jaarplanner data
 */
function parseHtmlTable(html: string): JaarplannerRow[] {
  const rows: JaarplannerRow[] = [];

  // Find all table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  let isFirstRow = true;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    if (isFirstRow) {
      isFirstRow = false; // Skip header row
      continue;
    }

    const rowHtml = rowMatch[1];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      let cellContent = cellMatch[1];
      // Remove HTML tags and decode entities
      cellContent = cellContent.replace(/<[^>]*>/g, '');
      cellContent = cellContent
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim();
      cells.push(cellContent);
    }

    // Expected: [week, les1_planning, les1_toetsen, les2_planning, les2_toetsen]
    if (cells.length >= 2) {
      const week = parseInt(cells[0], 10);
      if (!isNaN(week)) {
        // Les 1
        if (cells.length >= 3) {
          rows.push({
            week,
            les: 1,
            planning: cells[1] || '',
            toetsen: cells[2] || '',
          });
        }
        // Les 2
        if (cells.length >= 5) {
          rows.push({
            week,
            les: 2,
            planning: cells[3] || '',
            toetsen: cells[4] || '',
          });
        } else if (cells.length === 4) {
          // Sometimes only 4 cells: week, les1_planning, les2_planning, notes/combined
          rows.push({
            week,
            les: 1,
            planning: cells[1] || '',
            toetsen: cells[3] || '',
          });
          rows.push({
            week,
            les: 2,
            planning: cells[2] || '',
            toetsen: '',
          });
        }
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
