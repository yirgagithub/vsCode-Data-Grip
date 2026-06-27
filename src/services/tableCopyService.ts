import { ColumnInfo, DatabaseType } from '../types';
import { createTableSql, insertBatchSql, qualifiedSqlName } from './sqlDialect';

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
  targetLabel?: string,
  targetDatabaseType: DatabaseType = 'postgres'
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
  const ddl = createTableSql(targetDatabaseType, targetSchema, targetTable, columns);
  const inserts = chunk(rows, 100).map((batch) => insertBatchSql(targetDatabaseType, targetSchema, targetTable, columnNames, batch));

  return {
    sourceRowCount: rows.length,
    targetSchema,
    targetTable,
    sql: [
      `-- Source table: ${qualifiedSqlName(targetDatabaseType, sourceSchema, sourceTable)}`,
      `-- Target table: ${qualifiedSqlName(targetDatabaseType, targetSchema, targetTable)}`,
      ...warnings.map((warning) => `-- ${warning}`),
      '',
      ddl,
      '',
      ...inserts
    ].join('\n'),
    warnings
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
