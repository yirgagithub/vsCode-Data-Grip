import type { Pool, PoolConnection, PoolOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { DatabaseDriver } from './DatabaseDriver';
import {
  ActiveSessionInfo,
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExplainQueryOptions,
  ExecuteQueryParams,
  ForeignKeyInfo,
  IndexInfo,
  KeyInfo,
  QueryError,
  QueryPlanResult,
  QueryExecutionResult,
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
import { qualifiedName, quoteIdentifier } from '../../utils/identifiers';
import { textExplainPlan } from '../../services/queryPlanService';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { createTableSql } from '../../services/sqlDialect';

interface ActiveExecution {
  connectionId: string;
  threadId?: number;
}

export class MySQLDriver implements DatabaseDriver {
  readonly id: 'mysql' = 'mysql';
  readonly displayName: string = 'MySQL';
  private readonly pools = new Map<string, Pool>();
  private readonly configs = new Map<string, ConnectionConfigWithPassword>();
  private readonly activeExecutions = new Map<string, ActiveExecution>();
  private readonly transactionConnections = new Map<string, PoolConnection>();

  async testConnection(config: ConnectionConfigWithPassword): Promise<TestConnectionResult> {
    let pool: Pool | undefined;
    try {
      pool = await this.createVerifiedPool(config, 1);
      const [rows] = await pool.query('select version() as version');
      const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
      return { ok: true, message: 'Connection successful', serverVersion: optionalString(row.version) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (pool) {
        await this.endPool(pool);
      }
    }
  }

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    await this.disconnect(config.id);
    const pool = await this.createVerifiedPool(config, 8);
    this.pools.set(config.id, pool);
    this.configs.set(config.id, config);
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.rollbackTransaction(connectionId).catch(() => undefined);
    const pool = this.pools.get(connectionId);
    if (pool) {
      this.pools.delete(connectionId);
      await pool.end();
    }
  }

  async beginTransaction(connectionId: string): Promise<void> {
    if (this.transactionConnections.has(connectionId)) {
      return;
    }
    const pool = this.requirePool(connectionId);
    const connection = await pool.getConnection();
    try {
      await connection.query('start transaction');
      this.transactionConnections.set(connectionId, connection);
    } catch (error) {
      connection.release();
      throw error;
    }
  }

  async commitTransaction(connectionId: string): Promise<void> {
    const connection = this.transactionConnections.get(connectionId);
    if (!connection) {
      return;
    }
    try {
      await connection.query('commit');
    } finally {
      this.transactionConnections.delete(connectionId);
      connection.release();
    }
  }

  async rollbackTransaction(connectionId: string): Promise<void> {
    const connection = this.transactionConnections.get(connectionId);
    if (!connection) {
      return;
    }
    try {
      await connection.query('rollback');
    } finally {
      this.transactionConnections.delete(connectionId);
      connection.release();
    }
  }

  isTransactionOpen(connectionId: string): boolean {
    return this.transactionConnections.has(connectionId);
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    const pool = this.requirePool(params.connectionId);
    const transactionConnection = this.transactionConnections.get(params.connectionId);
    const connection = transactionConnection ?? await pool.getConnection();
    const results: QueryExecutionResult[] = [];
    const hasExplicitTransaction = !transactionConnection && statements.some((sql) => /\bbegin\b/i.test(sql));
    const pinnedTransaction = !!transactionConnection;

    try {
      for (const [index, sql] of statements.entries()) {
        const executionId = randomUUID();
        const started = Date.now();
        params.onProgress?.({
          statementIndex: index,
          statementCount: statements.length,
          sql,
          status: 'started',
          executionId,
          startedAt: started
        });
        this.activeExecutions.set(executionId, { connectionId: params.connectionId, threadId: this.threadId(connection) });
        try {
          const [rows, fields] = await connection.query(this.sqlWithClientLimit(sql, params.maxRows, params.offset));
          const executionResult = this.toExecutionResult(rows, fields, executionId, started, sql);
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: 'completed',
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            rowCount: executionResult.rowCount,
            command: executionResult.command
          });
          results.push(executionResult);
        } catch (error) {
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: 'failed',
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        } finally {
          this.activeExecutions.delete(executionId);
        }
      }
      return results;
    } catch (error) {
      if (hasExplicitTransaction) {
        try {
          await connection.query('rollback');
        } catch {
          // Preserve the original query error.
        }
      }
      throw error;
    } finally {
      if (!pinnedTransaction) {
        connection.release();
      }
    }
  }

  async validateQuery(params: ExecuteQueryParams): Promise<QueryValidationResult> {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, '');
    if (!sql || !this.canExplain(sql)) {
      return { ok: true };
    }
    try {
      await pool.query(`explain ${sql}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.toQueryError(error) };
    }
  }

  async explainQuery(params: ExecuteQueryParams, options: ExplainQueryOptions = {}): Promise<QueryPlanResult> {
    const pool = this.requirePool(params.connectionId);
    const sql = params.sql.trim().replace(/;+\s*$/, '');
    if (!sql || !this.canExplain(sql)) {
      throw new Error('Only SELECT, WITH, INSERT, UPDATE, DELETE, and MERGE statements can be explained.');
    }
    const explainSql = options.analyze ? `explain analyze ${sql}` : `explain format=json ${sql}`;
    const [rows] = await pool.query(explainSql);
    return textExplainPlan(JSON.stringify(rows, null, 2), options.analyze === true);
  }

  async cancelQuery(executionId: string): Promise<void> {
    const active = this.activeExecutions.get(executionId);
    if (!active?.threadId) {
      return;
    }
    const pool = this.requirePool(active.connectionId);
    await pool.query(`kill query ${active.threadId}`);
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select schema_name as name
       from information_schema.schemata
       where schema_name not in ('information_schema', 'mysql', 'performance_schema', 'sys')
       order by schema_name`
    );
    return rows as SchemaInfo[];
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select table_schema as \`schema\`,
              table_name as name,
              'table' as type,
              table_rows as "rowEstimate",
              table_comment as comment
       from information_schema.tables
       where table_schema = ? and table_type = 'BASE TABLE'
       order by table_name`,
      [schema]
    );
    return rows as TableInfo[];
  }

  async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select table_schema as \`schema\`, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = ?
       order by table_name`,
      [schema]
    );
    return rows as ViewInfo[];
  }

  async getFunctions(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'FUNCTION');
  }

  async getProcedures(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'PROCEDURE');
  }

  async getTriggers(connectionId: string, schema: string): Promise<TriggerInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select trigger_schema as \`schema\`,
              event_object_table as "table",
              trigger_name as name,
              action_timing as timing,
              event_manipulation as event,
              action_orientation as orientation,
              action_statement as definition
       from information_schema.triggers
       where trigger_schema = ?
       order by event_object_table, trigger_name`,
      [schema]
    );
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      schema: String(row.schema),
      table: String(row.table),
      name: String(row.name),
      timing: optionalString(row.timing)?.toLowerCase(),
      orientation: optionalString(row.orientation)?.toLowerCase(),
      enabled: 'YES',
      events: optionalString(row.event) ? [optionalString(row.event)!] : undefined
    }));
  }

  async getActiveSessions(connectionId: string): Promise<ActiveSessionInfo[]> {
    const pool = this.requirePool(connectionId);
    const connection = await pool.getConnection();
    let currentThreadId: number | undefined;
    let rows: RowDataPacket[] = [];
    try {
      const [currentRows] = await connection.query<RowDataPacket[]>(`select connection_id() as id`);
      currentThreadId = numberFromDb((currentRows as Array<Record<string, unknown>>)[0]?.id);
      const [processRows] = await connection.query<RowDataPacket[]>(`show full processlist`);
      rows = processRows;
    } finally {
      connection.release();
    }
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      pid: Number(row.Id ?? row.id ?? row.ID),
      user: optionalString(row.User ?? row.user),
      database: optionalString(row.db ?? row.Database ?? row.database),
      application: optionalString(row.Command ?? row.command),
      client: optionalString(row.Host ?? row.host),
      state: optionalString(row.State ?? row.state),
      query: optionalString(row.Info ?? row.info),
      isCurrent: Number(row.Id ?? row.id ?? row.ID) === currentThreadId
    }));
  }

  async cancelSession(connectionId: string, pid: number): Promise<void> {
    await this.requirePool(connectionId).query(`kill query ${Math.trunc(pid)}`);
  }

  async terminateSession(connectionId: string, pid: number): Promise<void> {
    await this.requirePool(connectionId).query(`kill ${Math.trunc(pid)}`);
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select table_schema as \`schema\`,
              table_name as \`table\`,
              column_name as name,
              ordinal_position as ordinal,
              column_type as "dataType",
              is_nullable = 'YES' as nullable,
              column_default as "defaultValue",
              column_comment as comment
       from information_schema.columns
       where table_schema = ? and table_name = ?
       order by ordinal_position`,
      [schema, table]
    );
    return rows as ColumnInfo[];
  }

  async getIndexes(connectionId: string, schema: string, table: string): Promise<IndexInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select index_name as name,
              non_unique as "nonUnique",
              seq_in_index as "seqInIndex",
              column_name as "columnName",
              index_type as "indexType"
       from information_schema.statistics
       where table_schema = ? and table_name = ?
       order by index_name, seq_in_index`,
      [schema, table]
    );
    const grouped = new Map<string, IndexInfo & { nonUnique?: number }>();
    for (const row of rows as Array<Record<string, unknown>>) {
      const name = String(row.name);
      const entry = grouped.get(name) ?? { name, columns: [], unique: true };
      if (typeof row.nonUnique === 'number') {
        entry.unique = row.nonUnique === 0;
      }
      if (row.columnName) {
        entry.columns.push(String(row.columnName));
      }
      if (!entry.definition && row.indexType) {
        entry.definition = String(row.indexType);
      }
      grouped.set(name, entry);
    }
    return [...grouped.values()].map(({ nonUnique: _nonUnique, ...index }) => index);
  }

  async getPrimaryKeys(connectionId: string, schema: string, table: string): Promise<KeyInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select constraint_name as name, column_name as "columnName", ordinal_position as ordinal
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and constraint_name = 'PRIMARY'
       order by ordinal_position`,
      [schema, table]
    );
    return groupKeyRows(rows as Array<Record<string, unknown>>);
  }

  async getForeignKeys(connectionId: string, schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select constraint_name as name,
              column_name as "columnName",
              ordinal_position as ordinal,
              referenced_table_schema as "foreignSchema",
              referenced_table_name as "foreignTable",
              referenced_column_name as "foreignColumn"
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and referenced_table_name is not null
       order by constraint_name, ordinal_position`,
      [schema, table]
    );
    return groupForeignKeyRows(rows as Array<Record<string, unknown>>);
  }

  async getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult> {
    const where = options?.where?.trim();
    if (where && /;|--|\/\*/.test(where)) {
      throw new Error('WHERE must be a single SQL expression without comments or semicolons.');
    }
    const orderBySql = options?.orderBySql?.trim();
    if (orderBySql && /;|--|\/\*/.test(orderBySql)) {
      throw new Error('ORDER BY must be a single SQL expression without comments or semicolons.');
    }
    const orderBy = orderBySql
      ? `\norder by ${orderBySql}`
      : options?.orderBy?.length
      ? `\norder by ${options.orderBy.map((item) => `${quoteIdentifier(item.column, '`')} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
      : '';
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const paging = pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : '';
    const sql = `select * from ${qualifiedName(schema, table, '`')}${where ? `\nwhere ${where}` : ''}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }

  async getTableDDL(connectionId: string, schema: string, table: string): Promise<string> {
    const columns = await this.getColumns(connectionId, schema, table);
    return createTableSql(this.id, schema, table, columns);
  }

  async getTableStats(connectionId: string, schema: string, table: string): Promise<TableStatsInfo> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select table_rows as "rowEstimate",
              data_length as "dataLength",
              index_length as "indexLength",
              update_time as "updatedAt"
       from information_schema.tables
       where table_schema = ? and table_name = ?`,
      [schema, table]
    );
    const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
    return {
      schema,
      table,
      databaseType: this.id,
      rowEstimate: numberFromDb(row.rowEstimate),
      columns: []
    };
  }

  private requirePool(connectionId: string): Pool {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error('Connection is not active. Connect first.');
    }
    return pool;
  }

  private toPoolConfig(config: ConnectionConfigWithPassword, max: number): PoolOptions {
    const ssl = config.sslMode === 'disable' ? undefined : { rejectUnauthorized: false };
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionLimit: max,
      waitForConnections: true,
      connectTimeout: config.connectTimeoutMs ?? 10000,
      ssl
    };
  }

  private shouldRetryWithoutSsl(config: ConnectionConfigWithPassword, error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return config.sslMode === 'prefer' && /ssl|secure connection|handshake/i.test(message);
  }

  private async createVerifiedPool(config: ConnectionConfigWithPassword, max: number): Promise<Pool> {
    const mysql = await loadMysql();
    const pool = mysql.createPool(this.toPoolConfig(config, max));
    try {
      await pool.query('select 1');
      return pool;
    } catch (error) {
      await this.endPool(pool);
      if (!this.shouldRetryWithoutSsl(config, error)) {
        throw error;
      }

      const fallbackPool = mysql.createPool(this.toPoolConfig({ ...config, sslMode: 'disable' }, max));
      try {
        await fallbackPool.query('select 1');
        return fallbackPool;
      } catch (fallbackError) {
        await this.endPool(fallbackPool);
        throw fallbackError;
      }
    }
  }

  private async endPool(pool: Pool): Promise<void> {
    try {
      await pool.end();
    } catch {
      // Preserve the original connection error.
    }
  }

  private sqlWithClientLimit(sql: string, maxRows: number | undefined, offset?: number): string {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
    const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
    const pageLimit = limit ? limit + 1 : undefined;
    return pageLimit && this.canApplyClientLimit(sql)
      ? `select * from (${sql.replace(/;+\s*$/, '')}) __dg_query limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
      : sql;
  }

  private canApplyClientLimit(sql: string): boolean {
    const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
    return normalized.startsWith('select') || normalized.startsWith('with');
  }

  private toExecutionResult(rows: unknown, fields: unknown, executionId: string, started: number, sql: string): QueryExecutionResult {
    const recordRows = Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
    const rowCount = Array.isArray(rows)
      ? recordRows.length
      : typeof (rows as ResultSetHeader | undefined)?.affectedRows === 'number'
        ? Number((rows as ResultSetHeader).affectedRows)
        : 0;
    return {
      executionId,
      fields: Array.isArray(fields)
        ? (fields as Array<{ name: string; columnType?: number }>).map((field) => ({ name: field.name, dataTypeId: field.columnType }))
        : [],
      rows: recordRows,
      rowCount,
      command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
      durationMs: Date.now() - started
    };
  }

  private async getRoutines(connectionId: string, schema: string, type: 'FUNCTION' | 'PROCEDURE'): Promise<RoutineInfo[]> {
    const [rows] = await this.requirePool(connectionId).query<RowDataPacket[]>(
      `select routine_schema as \`schema\`,
              routine_name as name,
              routine_type as kind,
              dtd_identifier as "returnType",
              security_type as language,
              routine_comment as comment
       from information_schema.routines
       where routine_schema = ? and routine_type = ?
       order by routine_name`,
      [schema, type]
    );
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      schema: String(row.schema),
      name: String(row.name),
      kind: optionalString(row.kind)?.toLowerCase() === 'procedure' ? 'procedure' : 'function',
      returnType: optionalString(row.returnType),
      language: optionalString(row.language),
      comment: optionalString(row.comment)
    }));
  }

  private canExplain(sql: string): boolean {
    const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
    return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
  }

  private threadId(connection: PoolConnection): number | undefined {
    return numberFromDb((connection as PoolConnection & { threadId?: number }).threadId);
  }

  private toQueryError(error: unknown): QueryError {
    const mysqlError = error as Partial<QueryError> & { message?: string };
    return {
      message: mysqlError.message ?? String(error),
      code: mysqlError.code,
      detail: mysqlError.detail,
      hint: mysqlError.hint,
      position: mysqlError.position,
      where: mysqlError.where
    };
  }
}

type MySqlRuntime = {
  createPool(config: PoolOptions): Pool;
};

let mysqlRuntime: Promise<MySqlRuntime> | undefined;

function loadMysql(): Promise<MySqlRuntime> {
  mysqlRuntime ??= loadMysqlRuntime();
  return mysqlRuntime;
}

async function loadMysqlRuntime(): Promise<MySqlRuntime> {
  const bundled = loadBundledRuntime<MySqlRuntime>('mysqlRuntime');
  if (bundled) {
    return bundled;
  }
  return import('mysql2/promise').then((module) => {
    const candidate = module as unknown as MySqlRuntime | { default?: MySqlRuntime };
    return 'createPool' in candidate ? candidate : candidate.default as MySqlRuntime;
  });
}

function groupKeyRows(rows: Array<Record<string, unknown>>): KeyInfo[] {
  const grouped = new Map<string, KeyInfo>();
  for (const row of rows) {
    const name = String(row.name);
    const entry = grouped.get(name) ?? { name, columns: [] };
    const column = row.columnName ?? row.column_name;
    if (column) {
      entry.columns.push(String(column));
    }
    grouped.set(name, entry);
  }
  return [...grouped.values()];
}

function groupForeignKeyRows(rows: Array<Record<string, unknown>>): ForeignKeyInfo[] {
  const grouped = new Map<string, ForeignKeyInfo>();
  for (const row of rows) {
    const name = String(row.name);
    const entry = grouped.get(name) ?? {
      name,
      columns: [],
      foreignSchema: String(row.foreignSchema ?? row.referenced_table_schema ?? ''),
      foreignTable: String(row.foreignTable ?? row.referenced_table_name ?? ''),
      foreignColumns: []
    };
    const column = row.columnName ?? row.column_name;
    const foreignColumn = row.foreignColumn ?? row.referenced_column_name;
    if (column) {
      entry.columns.push(String(column));
    }
    if (foreignColumn) {
      entry.foreignColumns.push(String(foreignColumn));
    }
    grouped.set(name, entry);
  }
  return [...grouped.values()];
}

function numberFromDb(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = String(value).trim();
  return next || undefined;
}
