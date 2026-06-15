import { ColumnInfo } from '../types';
import { qualifiedName, quoteIdentifier } from '../utils/identifiers';

export type TableImportSourceKind = 'csv' | 'json';

export interface TableImportPreview {
  kind: TableImportSourceKind;
  rowCount: number;
  columns: string[];
  mapping: Array<{ source: string; target: string }>;
  warnings: string[];
  sql: string;
}

export function buildTableImportPreview(
  schema: string,
  table: string,
  tableColumns: ColumnInfo[],
  fileName: string,
  text: string
): TableImportPreview {
  const kind = fileName.toLowerCase().endsWith('.json') ? 'json' : 'csv';
  const source = kind === 'json' ? parseJsonSource(text) : parseCsvSource(text);
  const targetColumns = tableColumns.map((column) => column.name);
  const mapping = inferMapping(source.columns, targetColumns);
  if (!mapping.length) {
    throw new Error('Could not map any source fields to table columns.');
  }
  const mappedTargets = unique(mapping.map((item) => item.target));
  const rows = source.rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const item of mapping) {
      next[item.target] = row[item.source];
    }
    return next;
  }).filter((row) => Object.keys(row).length > 0);
  if (!rows.length) {
    throw new Error('No import rows were found.');
  }

  const batches = chunk(rows, 100).map((batch) => buildInsertBatch(schema, table, mappedTargets, batch));
  const warnings = [
    ...source.warnings,
    ...mappingWarnings(source.columns, targetColumns, mapping)
  ];

  return {
    kind,
    rowCount: rows.length,
    columns: source.columns,
    mapping,
    warnings,
    sql: batches.join('\n')
  };
}

interface ParsedSource {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  warnings: string[];
}

function parseJsonSource(text: string): ParsedSource {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('JSON import expects an array of objects.');
  }
  const rows = parsed.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('JSON import expects an array of objects.');
    }
    return item as Record<string, unknown>;
  });
  const columns = unique(rows.flatMap((row) => Object.keys(row)));
  return { columns, rows, warnings: [] };
}

function parseCsvSource(text: string): ParsedSource {
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error('CSV file is empty.');
  }
  const [header, ...dataRows] = rows;
  const columns = header.map((value, index) => value || `column_${index + 1}`);
  return {
    columns,
    rows: dataRows.map((row) => Object.fromEntries(columns.map((column, index) => [column, parseScalar(row[index] ?? '')]))),
    warnings: []
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  const pushValue = (): void => {
    currentRow.push(currentValue);
    currentValue = '';
  };

  const pushRow = (): void => {
    if (currentRow.length || currentValue.length) {
      if (currentValue.length || inQuotes) {
        pushValue();
      }
      rows.push(currentRow);
      currentRow = [];
    }
    currentValue = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      pushValue();
      continue;
    }
    if (char === '\n') {
      pushValue();
      pushRow();
      continue;
    }
    if (char === '\r') {
      continue;
    }
    currentValue += char;
  }
  if (currentValue.length || currentRow.length) {
    pushValue();
    rows.push(currentRow);
  }
  return rows.filter((row) => row.some((value) => value.length > 0));
}

function inferMapping(sourceColumns: string[], targetColumns: string[]): Array<{ source: string; target: string }> {
  const targetLookup = new Map(targetColumns.map((column) => [column.toLowerCase(), column]));
  const usedTargets = new Set<string>();
  const mapping: Array<{ source: string; target: string }> = [];

  for (const source of sourceColumns) {
    const exact = targetLookup.get(source.toLowerCase());
    if (exact && !usedTargets.has(exact)) {
      mapping.push({ source, target: exact });
      usedTargets.add(exact);
    }
  }

  if (mapping.length && mapping.length < sourceColumns.length) {
    for (const source of sourceColumns) {
      if (mapping.some((item) => item.source === source)) {
        continue;
      }
      const fallback = targetColumns.find((column) => !usedTargets.has(column));
      if (!fallback) {
        break;
      }
      mapping.push({ source, target: fallback });
      usedTargets.add(fallback);
    }
  } else if (!mapping.length) {
    sourceColumns.forEach((source, index) => {
      const target = targetColumns[index];
      if (target) {
        mapping.push({ source, target });
        usedTargets.add(target);
      }
    });
  }

  return mapping;
}

function mappingWarnings(sourceColumns: string[], targetColumns: string[], mapping: Array<{ source: string; target: string }>): string[] {
  const unmatchedSource = sourceColumns.filter((source) => !mapping.some((item) => item.source === source));
  const unusedTargets = targetColumns.filter((target) => !mapping.some((item) => item.target === target));
  const warnings: string[] = [];
  if (unmatchedSource.length) {
    warnings.push(`Skipped source columns: ${unmatchedSource.join(', ')}.`);
  }
  if (unusedTargets.length) {
    warnings.push(`Target columns left unmapped: ${unusedTargets.join(', ')}.`);
  }
  return warnings;
}

function buildInsertBatch(schema: string, table: string, columns: string[], rows: Array<Record<string, unknown>>): string {
  return `insert into ${qualifiedName(schema, table)} (${columns.map(quoteIdentifier).join(', ')})\nvalues\n${rows.map((row) => `  (${columns.map((column) => formatLiteral(row[column])).join(', ')})`).join(',\n')};`;
}

function formatLiteral(value: unknown): string {
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

function parseScalar(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (/^null$/i.test(trimmed)) {
    return null;
  }
  if (/^true$/i.test(trimmed)) {
    return true;
  }
  if (/^false$/i.test(trimmed)) {
    return false;
  }
  if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    const next = Number(trimmed);
    return Number.isFinite(next) ? next : trimmed;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
