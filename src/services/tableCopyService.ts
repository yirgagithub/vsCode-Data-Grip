import { ColumnInfo } from '../types';
import { qualifiedName, quoteIdentifier } from '../utils/identifiers';

export interface TableCopyPreview {
  sourceRowCount: number;
  targetSchema: string;
  targetTable: string;
  sql: string;
  warnings: string[];
}

export function buildTableCopyPreview(
  sourceSchema: string,
  sourceTable: string,
  targetSchema: string,
  targetTable: string,
  columns: ColumnInfo[],
  rows: Record<string, unknown>[],
  sourceLabel?: string,
  targetLabel?: string
): TableCopyPreview {
  if (!columns.length) {
    throw new Error('No table columns were found to copy.');
  }

  const columnNames = columns.map((column) => column.name);
  const warnings = [
    sourceLabel ? `Source connection: ${sourceLabel}` : undefined,
    targetLabel ? `Target connection: ${targetLabel}` : undefined,
    rows.length === 0 ? 'No data rows were found; only the table structure will be copied.' : undefined,
    rows.length > 5000 ? `Copy preview includes ${rows.length.toLocaleString()} rows.` : undefined
  ].filter(Boolean) as string[];
  const ddl = buildCreateTableSql(targetSchema, targetTable, columns);
  const inserts = chunk(rows, 100).map((batch) => buildInsertBatch(targetSchema, targetTable, columnNames, batch));

  return {
    sourceRowCount: rows.length,
    targetSchema,
    targetTable,
    sql: [
      `-- Source table: ${qualifiedName(sourceSchema, sourceTable)}`,
      `-- Target table: ${qualifiedName(targetSchema, targetTable)}`,
      ...warnings.map((warning) => `-- ${warning}`),
      '',
      ddl,
      '',
      ...inserts
    ].join('\n'),
    warnings
  };
}

function buildCreateTableSql(schema: string, table: string, columns: ColumnInfo[]): string {
  const lines = columns.map((column) => {
    const nullable = column.nullable ? '' : ' not null';
    const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : '';
    return `  ${quoteIdentifier(column.name)} ${column.dataType}${defaultValue}${nullable}`;
  });
  return `create table ${qualifiedName(schema, table)} (\n${lines.join(',\n')}\n);`;
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

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
