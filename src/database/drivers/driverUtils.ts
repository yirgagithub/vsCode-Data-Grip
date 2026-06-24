import { randomUUID } from 'crypto';
import {
  ActiveSessionInfo,
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExecuteQueryParams,
  ForeignKeyInfo,
  IndexInfo,
  KeyInfo,
  QueryError,
  QueryExecutionResult,
  QueryPlanResult,
  QueryValidationResult,
  RoutineInfo,
  SchemaInfo,
  TableInfo,
  TablePreviewOptions,
  TableStatsInfo,
  TestConnectionResult,
  TriggerInfo,
  ViewInfo
} from '../../types';
import { createTableSql } from '../../services/sqlDialect';
import { DatabaseDriver } from './DatabaseDriver';

export abstract class BasicDatabaseDriver implements DatabaseDriver {
  abstract readonly id: DatabaseDriver['id'];
  abstract readonly displayName: string;

  async testConnection(config: ConnectionConfigWithPassword): Promise<TestConnectionResult> {
    try {
      const connection = await this.connect(config);
      await this.disconnect(connection.id);
      return { ok: true, message: 'Connection successful' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  abstract connect(config: ConnectionConfigWithPassword): Promise<DbConnection>;
  abstract disconnect(connectionId: string): Promise<void>;
  abstract executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult>;
  abstract executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]>;
  abstract getSchemas(connectionId: string): Promise<SchemaInfo[]>;
  abstract getTables(connectionId: string, schema: string): Promise<TableInfo[]>;
  abstract getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]>;
  abstract getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult>;

  async beginTransaction(connectionId: string): Promise<void> {
    await this.executeQuery({ connectionId, sql: 'begin' });
  }

  async commitTransaction(connectionId: string): Promise<void> {
    await this.executeQuery({ connectionId, sql: 'commit' });
  }

  async rollbackTransaction(connectionId: string): Promise<void> {
    await this.executeQuery({ connectionId, sql: 'rollback' });
  }

  isTransactionOpen(_connectionId: string): boolean {
    return false;
  }

  async validateQuery(_params: ExecuteQueryParams): Promise<QueryValidationResult> {
    return { ok: true };
  }

  async explainQuery(params: ExecuteQueryParams): Promise<QueryPlanResult> {
    return {
      format: 'text',
      analyze: false,
      rawText: params.sql,
      annotations: [{ severity: 'low', message: `${this.displayName} explain output is not available in this driver yet.` }]
    };
  }

  async cancelQuery(_executionId: string): Promise<void> {}

  async getViews(_connectionId: string, _schema: string): Promise<ViewInfo[]> {
    return [];
  }

  async getFunctions(_connectionId: string, _schema: string): Promise<RoutineInfo[]> {
    return [];
  }

  async getProcedures(_connectionId: string, _schema: string): Promise<RoutineInfo[]> {
    return [];
  }

  async getTriggers(_connectionId: string, _schema: string): Promise<TriggerInfo[]> {
    return [];
  }

  async getActiveSessions(_connectionId: string): Promise<ActiveSessionInfo[]> {
    return [];
  }

  async cancelSession(_connectionId: string, _pid: number): Promise<void> {}

  async terminateSession(_connectionId: string, _pid: number): Promise<void> {}

  async getIndexes(_connectionId: string, _schema: string, _table: string): Promise<IndexInfo[]> {
    return [];
  }

  async getPrimaryKeys(_connectionId: string, _schema: string, _table: string): Promise<KeyInfo[]> {
    return [];
  }

  async getForeignKeys(_connectionId: string, _schema: string, _table: string): Promise<ForeignKeyInfo[]> {
    return [];
  }

  async getTableDDL(connectionId: string, schema: string, table: string): Promise<string> {
    const columns = await this.getColumns(connectionId, schema, table);
    return createTableSql(this.id, schema, table, columns);
  }

  async getTableStats(_connectionId: string, schema: string, table: string): Promise<TableStatsInfo> {
    return { schema, table, databaseType: this.id, columns: [] };
  }

}

export function executionResultFromRows(rows: Record<string, unknown>[], started: number, sql: string, dataTypes: Record<string, string> = {}): QueryExecutionResult {
  const fields = rows[0]
    ? Object.keys(rows[0]).map((name) => ({ name, dataTypeName: dataTypes[name] }))
    : Object.keys(dataTypes).map((name) => ({ name, dataTypeName: dataTypes[name] }));
  return {
    executionId: randomUUID(),
    fields,
    rows,
    rowCount: rows.length,
    command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
    durationMs: Date.now() - started
  };
}

export function emptyExecutionResult(started: number, sql: string, rowCount = 0): QueryExecutionResult {
  return {
    executionId: randomUUID(),
    fields: [],
    rows: [],
    rowCount,
    command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
    durationMs: Date.now() - started
  };
}

export function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = String(value).trim();
  return next || undefined;
}

export function numberFromDb(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : undefined;
}

export function toQueryError(error: unknown): QueryError {
  const record = error as Partial<QueryError> & { message?: string };
  return {
    message: record.message ?? String(error),
    code: record.code,
    detail: record.detail,
    hint: record.hint,
    position: record.position,
    where: record.where
  };
}

export function clientLimit(sql: string, maxRows: number | undefined, offset?: number, quote = '"'): string {
  const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
  const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
  const pageLimit = limit ? limit + 1 : undefined;
  return pageLimit && /^(select|with)\b/i.test(sql.trim())
    ? `select * from (${sql.replace(/;+\s*$/, '')}) ${quote}__dg_query${quote} limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
    : sql;
}

export function safeFilterClause(where?: string): string {
  const trimmed = where?.trim();
  if (!trimmed) {
    return '';
  }
  if (/;|--|\/\*/.test(trimmed)) {
    throw new Error('WHERE must be a single SQL expression without comments or semicolons.');
  }
  return `\nwhere ${trimmed}`;
}
