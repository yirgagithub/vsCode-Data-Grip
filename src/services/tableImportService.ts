import { ColumnInfo, DatabaseType } from '../types';

export type TableImportSourceKind = 'csv' | 'json';

export interface TableImportColumnMapping {
  target: string;
  targetType?: string;
  source: string | null;
  auto: boolean;
}

export interface TableImportPreview {
  kind: TableImportSourceKind;
  fileName: string;
  rowCount: number;
  sourceColumns: string[];
  targetColumns: Array<{
    name: string;
    dataType?: string;
    nullable?: boolean;
    defaultValue?: string;
  }>;
  mapping: TableImportColumnMapping[];
  sampleRows: Array<Record<string, unknown>>;
  warnings: string[];
}

export interface TableImportData {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export function buildTableImportPreview(
  _databaseType: DatabaseType,
  _schema: string,
  _table: string,
  tableColumns: ColumnInfo[],
  fileName: string,
  text: string
): TableImportPreview {
  const kind = fileName.toLowerCase().endsWith('.json') ? 'json' : 'csv';
  const source = kind === 'json' ? parseJsonSource(text) : parseCsvSource(text);
  if (!source.rows.length) {
    throw new Error('No import rows were found.');
  }
  const mapping = inferMapping(source.columns, tableColumns);
  if (!mapping.some((item) => item.source)) {
    throw new Error('Could not map any source fields to table columns.');
  }

  return {
    kind,
    fileName,
    rowCount: source.rows.length,
    sourceColumns: source.columns,
    targetColumns: tableColumns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      defaultValue: column.defaultValue
    })),
    mapping,
    sampleRows: source.rows.slice(0, 50),
    warnings: [
      ...source.warnings,
      ...mappingWarnings(source.columns, tableColumns, mapping)
    ]
  };
}

export function buildTableImportData(
  fileName: string,
  text: string,
  mapping: Array<Pick<TableImportColumnMapping, 'source' | 'target'>>
): TableImportData {
  const kind = fileName.toLowerCase().endsWith('.json') ? 'json' : 'csv';
  const source = kind === 'json' ? parseJsonSource(text) : parseCsvSource(text);
  const activeMapping = mapping.filter((item): item is { source: string; target: string } => Boolean(item.source?.trim()) && Boolean(item.target.trim()));
  if (!activeMapping.length) {
    throw new Error('Map at least one source column before importing.');
  }

  const sourceColumns = new Set(source.columns);
  for (const item of activeMapping) {
    if (!sourceColumns.has(item.source)) {
      throw new Error(`Source column "${item.source}" was not found in the import file.`);
    }
  }

  const targetColumns = unique(activeMapping.map((item) => item.target));
  if (targetColumns.length !== activeMapping.length) {
    throw new Error('Each target column can only be mapped once.');
  }

  const rows = source.rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const item of activeMapping) {
      next[item.target] = row[item.source];
    }
    return next;
  }).filter((row) => Object.keys(row).length > 0);
  if (!rows.length) {
    throw new Error('No import rows were found.');
  }

  return { columns: targetColumns, rows };
}

export function buildTableImportStatements(
  databaseType: DatabaseType,
  schema: string,
  table: string,
  data: TableImportData,
  batchSize = 100
): string[] {
  if (!data.columns.length) {
    throw new Error('Map at least one source column before importing.');
  }
  if (!data.rows.length) {
    throw new Error('No import rows were found.');
  }
  const safeBatchSize = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 100;
  return chunk(data.rows, safeBatchSize).map((batch) => buildInsertBatch(databaseType, schema, table, data.columns, batch));
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

function inferMapping(sourceColumns: string[], targetColumns: ColumnInfo[]): TableImportColumnMapping[] {
  const sourceLookup = new Map(sourceColumns.map((column) => [normalizeName(column), column]));
  const usedSources = new Set<string>();
  const mapping: TableImportColumnMapping[] = [];

  for (const target of targetColumns) {
    const exact = sourceLookup.get(normalizeName(target.name));
    if (exact && !usedSources.has(exact)) {
      mapping.push({ target: target.name, targetType: target.dataType, source: exact, auto: true });
      usedSources.add(exact);
      continue;
    }
    mapping.push({ target: target.name, targetType: target.dataType, source: null, auto: true });
  }

  if (usedSources.size === 0) {
    for (const [index, item] of mapping.entries()) {
      const source = sourceColumns[index];
      if (source) {
        item.source = source;
        usedSources.add(source);
      }
    }
  }

  return mapping;
}

function mappingWarnings(sourceColumns: string[], targetColumns: ColumnInfo[], mapping: TableImportColumnMapping[]): string[] {
  const activeMapping = mapping.filter((item) => item.source);
  const unmatchedSource = sourceColumns.filter((source) => !activeMapping.some((item) => item.source === source));
  const unmappedRequiredTargets = targetColumns
    .filter((target) => !target.nullable && !target.defaultValue && !activeMapping.some((item) => item.target === target.name))
    .map((target) => target.name);
  const unusedTargets = targetColumns
    .filter((target) => !activeMapping.some((item) => item.target === target.name))
    .map((target) => target.name)
    .filter((target) => !unmappedRequiredTargets.includes(target));
  const warnings: string[] = [];
  if (unmatchedSource.length) {
    warnings.push(`Skipped source columns: ${unmatchedSource.join(', ')}.`);
  }
  if (unmappedRequiredTargets.length) {
    warnings.push(`Required target columns left unmapped: ${unmappedRequiredTargets.join(', ')}.`);
  }
  if (unusedTargets.length) {
    warnings.push(`Target columns left unmapped: ${unusedTargets.join(', ')}.`);
  }
  return warnings;
}

function buildInsertBatch(databaseType: DatabaseType, schema: string, table: string, columns: string[], rows: Array<Record<string, unknown>>): string {
  return `insert into ${qualifiedSqlName(databaseType, schema, table)} (${columns.map((column) => quoteSqlIdentifier(databaseType, column)).join(', ')})\nvalues\n${rows.map((row) => `  (${columns.map((column) => sqlLiteral(databaseType, row[column])).join(', ')})`).join(',\n')};`;
}

function qualifiedSqlName(databaseType: DatabaseType, schema: string, table: string): string {
  return `${quoteSqlIdentifier(databaseType, schema)}.${quoteSqlIdentifier(databaseType, table)}`;
}

function quoteSqlIdentifier(databaseType: DatabaseType, identifier: string): string {
  if (databaseType === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function sqlLiteral(_databaseType: DatabaseType, value: unknown): string {
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

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
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
