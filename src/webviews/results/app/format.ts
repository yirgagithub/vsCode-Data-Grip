import { quoteIdentifier } from '../../../utils/identifiers';

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function rowsToTsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  return [columns.join('\t'), ...rows.map((row) => columns.map((column) => formatValue(row[column])).join('\t'))].join('\n');
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csv(formatValue(row[column]))).join(','))].join('\n');
}

export function rowsToMarkdown(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  const header = `| ${columns.map(escapeMarkdownCell).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => escapeMarkdownCell(formatValue(row[column]))).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

export function rowsToInsertSql(rows: Record<string, unknown>[], schema: string, table: string): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  return `insert into ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')})\nvalues\n${rows.map((row) => `  (${columns.map((column) => sqlLiteral(row[column])).join(', ')})`).join(',\n')};`;
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
