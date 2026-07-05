import { strToU8, zipSync } from 'fflate';

export function rowsToXlsxBuffer(rows: Record<string, unknown>[], columns: string[], sheetName: string): Buffer {
  const safeColumns = columns.length ? columns : inferColumns(rows);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xmlFile(contentTypesXml()),
    '_rels/.rels': xmlFile(rootRelationshipsXml()),
    'xl/workbook.xml': xmlFile(workbookXml(sheetName)),
    'xl/_rels/workbook.xml.rels': xmlFile(workbookRelationshipsXml()),
    'xl/styles.xml': xmlFile(stylesXml()),
    'xl/worksheets/sheet1.xml': xmlFile(worksheetXml(rows, safeColumns))
  };
  return Buffer.from(zipSync(files));
}

function worksheetXml(rows: Record<string, unknown>[], columns: string[]): string {
  const header = rowXml(1, columns.map((column) => cellXml(column, true)));
  const body = rows.map((row, index) => rowXml(index + 2, columns.map((column) => cellXml(row[column], false))));
  const lastColumn = columnName(Math.max(columns.length, 1));
  const lastRow = Math.max(rows.length + 1, 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetData>
    ${header}
    ${body.join('\n    ')}
  </sheetData>
</worksheet>`;
}

function rowXml(rowIndex: number, cells: string[]): string {
  return `<row r="${rowIndex}">${cells.map((cell, index) => cell.replace('{ref}', `${columnName(index + 1)}${rowIndex}`)).join('')}</row>`;
}

function cellXml(value: unknown, header: boolean): string {
  if (value === null || value === undefined) {
    return '<c r="{ref}"/>';
  }
  if (!header && typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="{ref}"><v>${value}</v></c>`;
  }
  if (!header && typeof value === 'boolean') {
    return `<c r="{ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="{ref}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function columnName(index: number): string {
  let current = index;
  let name = '';
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function inferColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => seen.add(key));
  }
  return [...seen];
}

function xmlFile(value: string): Uint8Array {
  return strToU8(value);
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

function escapeXml(value: string): string {
  return removeInvalidXmlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function removeInvalidXmlChars(value: string): string {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, '');
}
