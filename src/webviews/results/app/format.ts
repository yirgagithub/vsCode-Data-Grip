import { insertBatchSql } from '../../../services/sqlDialect';
import { DatabaseType, QueryField } from '../../../types';

type FieldFormat = Pick<QueryField, 'dataTypeId' | 'dataTypeName'>;

export function formatFieldValue(value: unknown, field?: FieldFormat): string {
  if (isDateOnlyField(field)) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
    }
  }
  return formatValue(value);
}

function isDateOnlyField(field?: FieldFormat): boolean {
  return field?.dataTypeId === 1082 || field?.dataTypeName?.trim().toLowerCase() === 'date';
}

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

export function rowsToInsertSql(rows: Record<string, unknown>[], schema: string, table: string, databaseType: DatabaseType = 'postgres'): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  return insertBatchSql(databaseType, schema, table, columns, rows);
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
