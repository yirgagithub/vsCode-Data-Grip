import type { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { randomUUID } from 'crypto';
import { DatabaseDriver } from './DatabaseDriver';
import {
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExplainQueryOptions,
  ExecuteQueryParams,
  ForeignKeyInfo,
  IndexInfo,
  KeyInfo,
  QueryPlanResult,
  QueryExecutionResult,
  QueryError,
  QueryValidationResult,
  ActiveSessionInfo,
  RoutineInfo,
  SchemaInfo,
  TablePreviewOptions,
  TableStatsInfo,
  TableInfo,
  TestConnectionResult,
  TriggerInfo,
  ViewInfo
} from '../../types';
import { qualifiedName, quoteIdentifier } from '../../utils/identifiers';
import { normalizeExplainJsonPlan } from '../../services/queryPlanService';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { createTableSql } from '../../services/sqlDialect';

interface ActiveExecution {
  connectionId: string;
  processId?: number;
}

export class PostgresDriver implements DatabaseDriver {
  readonly id: 'postgres' | 'redshift' = 'postgres';
  readonly displayName: string = 'PostgreSQL';
  protected readonly pools = new Map<string, Pool>();
  protected readonly configs = new Map<string, ConnectionConfigWithPassword>();
  protected readonly activeExecutions = new Map<string, ActiveExecution>();
  protected readonly transactionClients = new Map<string, PoolClient>();

  async testConnection(config: ConnectionConfigWithPassword): Promise<TestConnectionResult> {
    let pool: Pool | undefined;
    try {
      pool = await this.createVerifiedPool(config, 1);
      const result = await pool.query('select version() as version');
      return { ok: true, message: 'Connection successful', serverVersion: result.rows[0]?.version };
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
    if (this.transactionClients.has(connectionId)) {
      return;
    }
    const pool = this.requirePool(connectionId);
    const client = await pool.connect();
    try {
      await client.query('begin');
      this.transactionClients.set(connectionId, client);
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async commitTransaction(connectionId: string): Promise<void> {
    const client = this.transactionClients.get(connectionId);
    if (!client) {
      return;
    }
    try {
      await client.query('commit');
    } finally {
      this.transactionClients.delete(connectionId);
      client.release();
    }
  }

  async rollbackTransaction(connectionId: string): Promise<void> {
    const client = this.transactionClients.get(connectionId);
    if (!client) {
      return;
    }
    try {
      await client.query('rollback');
    } finally {
      this.transactionClients.delete(connectionId);
      client.release();
    }
  }

  isTransactionOpen(connectionId: string): boolean {
    return this.transactionClients.has(connectionId);
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    const pool = this.requirePool(params.connectionId);
    const transactionClient = this.transactionClients.get(params.connectionId);
    const client = transactionClient ?? await pool.connect();
    const results: QueryExecutionResult[] = [];
    const hasExplicitTransaction = !transactionClient && statements.some((sql) => /\bbegin\b/i.test(sql));
    const pinnedTransaction = !!transactionClient;

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
        this.activeExecutions.set(executionId, { connectionId: params.connectionId, processId: (client as PoolClient & { processID?: number }).processID });
        try {
          const result = await client.query(this.sqlWithClientLimit(sql, params.maxRows, params.offset));
          const queryResults = Array.isArray(result) ? result : [result];
          const executionResults = queryResults.map((item) => this.toExecutionResult(item, executionId, started));
          params.onProgress?.({
            statementIndex: index,
            statementCount: statements.length,
            sql,
            status: 'completed',
            executionId,
            startedAt: started,
            durationMs: Date.now() - started,
            rowCount: executionResults.reduce((total, item) => total + item.rowCount, 0),
            command: executionResults.at(-1)?.command
          });
          for (const item of executionResults) {
            results.push(item);
          }
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
          await client.query('rollback');
        } catch {
          // The original query error is more useful than rollback cleanup failure.
        }
      }
      throw error;
    } finally {
      if (!pinnedTransaction) {
        client.release();
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
    const explainOptions = options.analyze ? 'analyze, format json' : 'format json';
    const result = await pool.query(`explain (${explainOptions}) ${sql}`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    const value = row?.['QUERY PLAN'] ?? row?.['query_plan'] ?? Object.values(row ?? {})[0];
    return normalizeExplainJsonPlan(value, options.analyze === true);
  }

  async cancelQuery(executionId: string): Promise<void> {
    const active = this.activeExecutions.get(executionId);
    if (!active?.processId) {
      return;
    }
    const pool = this.requirePool(active.connectionId);
    await pool.query('select pg_cancel_backend($1)', [active.processId]);
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select schema_name as name
       from information_schema.schemata
       where schema_name not like 'pg_%' and schema_name <> 'information_schema'
       order by schema_name`
    );
    return result.rows;
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema, c.relname as name,
              case when c.relkind = 'm' then 'materialized_view' else 'table' end as type,
              c.reltuples::bigint as "rowEstimate",
              obj_description(c.oid) as comment
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p', 'm')
       order by c.relname`,
      [schema]
    );
    return result.rows;
  }

  async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select table_schema as schema, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = $1
       order by table_name`,
      [schema]
    );
    return result.rows;
  }

  async getFunctions(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema,
              p.proname as name,
              'function' as kind,
              pg_get_function_result(p.oid) as "returnType",
              l.lanname as language,
              obj_description(p.oid, 'pg_proc') as comment
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_language l on l.oid = p.prolang
       where n.nspname = $1 and p.prokind = 'f'
       order by p.proname`,
      [schema]
    );
    return result.rows;
  }

  async getProcedures(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema,
              p.proname as name,
              'procedure' as kind,
              pg_get_function_result(p.oid) as "returnType",
              l.lanname as language,
              obj_description(p.oid, 'pg_proc') as comment
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_language l on l.oid = p.prolang
       where n.nspname = $1 and p.prokind = 'p'
       order by p.proname`,
      [schema]
    );
    return result.rows;
  }

  async getTriggers(connectionId: string, schema: string): Promise<TriggerInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select n.nspname as schema,
              c.relname as table,
              t.tgname as name,
              t.tgenabled as enabled,
              pg_get_triggerdef(t.oid) as definition
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and not t.tgisinternal
       order by c.relname, t.tgname`,
      [schema]
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      schema: String(row.schema),
      table: String(row.table),
      name: String(row.name),
      enabled: optionalString(row.enabled),
      orientation: optionalString(row.definition)?.includes('FOR EACH ROW') ? 'row' : 'statement',
      timing: optionalString(row.definition)?.includes('BEFORE')
        ? 'before'
        : optionalString(row.definition)?.includes('AFTER')
          ? 'after'
          : optionalString(row.definition)?.includes('INSTEAD OF')
            ? 'instead of'
            : undefined,
      events: triggerEvents(optionalString(row.definition))
    }));
  }

  async getActiveSessions(connectionId: string): Promise<ActiveSessionInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select pid,
              usename as user,
              datname as database,
              application_name as application,
              client_addr::text as client,
              state,
              query,
              backend_start as "startedAt",
              xact_start as "transactionStartedAt",
              state_change as "stateChangedAt",
              wait_event_type as "waitEventType",
              wait_event as "waitEvent",
              pid = pg_backend_pid() as "isCurrent",
              state = 'idle in transaction' as "isIdleInTransaction"
       from pg_stat_activity
       where datname = current_database()
       order by backend_start desc nulls last, pid desc`
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      pid: Number(row.pid),
      user: optionalString(row.user),
      database: optionalString(row.database),
      application: optionalString(row.application),
      client: optionalString(row.client),
      state: optionalString(row.state),
      query: optionalString(row.query),
      startedAt: optionalString(row.startedAt),
      transactionStartedAt: optionalString(row.transactionStartedAt),
      stateChangedAt: optionalString(row.stateChangedAt),
      waitEventType: optionalString(row.waitEventType),
      waitEvent: optionalString(row.waitEvent),
      isCurrent: Boolean(row.isCurrent),
      isIdleInTransaction: Boolean(row.isIdleInTransaction)
    }));
  }

  async cancelSession(connectionId: string, pid: number): Promise<void> {
    await this.requirePool(connectionId).query('select pg_cancel_backend($1)', [pid]);
  }

  async terminateSession(connectionId: string, pid: number): Promise<void> {
    await this.requirePool(connectionId).query('select pg_terminate_backend($1)', [pid]);
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select c.table_schema as schema, c.table_name as table, c.column_name as name,
              c.ordinal_position as ordinal, c.data_type as "dataType",
              c.is_nullable = 'YES' as nullable, c.column_default as "defaultValue",
              col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass::oid, c.ordinal_position) as comment
       from information_schema.columns c
       where c.table_schema = $1 and c.table_name = $2
       order by c.ordinal_position`,
      [schema, table]
    );
    return result.rows;
  }

  async getIndexes(connectionId: string, schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select indexname as name, indexdef as definition
       from pg_indexes
       where schemaname = $1 and tablename = $2
       order by indexname`,
      [schema, table]
    );
    return result.rows.map((row) => ({
      name: row.name,
      definition: row.definition,
      columns: this.columnsFromIndexDefinition(row.definition),
      unique: /\bunique\b/i.test(row.definition)
    }));
  }

  async getPrimaryKeys(connectionId: string, schema: string, table: string): Promise<KeyInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select tc.constraint_name as name, array_agg(kcu.column_name order by kcu.ordinal_position) as columns
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name`,
      [schema, table]
    );
    return result.rows;
  }

  async getForeignKeys(connectionId: string, schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select tc.constraint_name as name,
              array_agg(kcu.column_name order by kcu.ordinal_position) as columns,
              ccu.table_schema as "foreignSchema",
              ccu.table_name as "foreignTable",
              array_agg(ccu.column_name order by kcu.ordinal_position) as "foreignColumns"
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name, ccu.table_schema, ccu.table_name`,
      [schema, table]
    );
    return result.rows;
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
      ? `\norder by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
      : '';
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const paging = pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : '';
    const sql = `select * from ${qualifiedName(schema, table)}${where ? `\nwhere ${where}` : ''}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }

  async getTableDDL(connectionId: string, schema: string, table: string): Promise<string> {
    const columns = await this.getColumns(connectionId, schema, table);
    return createTableSql(this.id, schema, table, columns);
  }

  async getTableStats(connectionId: string, schema: string, table: string): Promise<TableStatsInfo> {
    const pool = this.requirePool(connectionId);
    const tableResult = await pool.query(
      `select s.seq_scan as "seqScan",
              s.idx_scan as "idxScan",
              s.n_live_tup as "liveRows",
              s.n_dead_tup as "deadRows",
              s.last_vacuum as "lastVacuum",
              s.last_autovacuum as "lastAutoVacuum",
              s.last_analyze as "lastAnalyze",
              s.last_autoanalyze as "lastAutoAnalyze",
              c.reltuples as "rowEstimate"
       from pg_stat_user_tables s
       left join pg_class c on c.oid = s.relid
       where s.schemaname = $1 and s.relname = $2`,
      [schema, table]
    );
    const columnResult = await pool.query(
      `select attname as name,
              null_frac as "nullFraction",
              n_distinct as "nDistinct",
              correlation
       from pg_stats
       where schemaname = $1 and tablename = $2
       order by attname`,
      [schema, table]
    );
    const row = tableResult.rows[0] ?? {};
    return {
      schema,
      table,
      databaseType: this.id,
      rowEstimate: this.numberFromDb(row.rowEstimate),
      seqScan: this.numberFromDb(row.seqScan),
      idxScan: this.numberFromDb(row.idxScan),
      liveRows: this.numberFromDb(row.liveRows),
      deadRows: this.numberFromDb(row.deadRows),
      lastVacuum: this.dateFromDb(row.lastVacuum),
      lastAutoVacuum: this.dateFromDb(row.lastAutoVacuum),
      lastAnalyze: this.dateFromDb(row.lastAnalyze),
      lastAutoAnalyze: this.dateFromDb(row.lastAutoAnalyze),
      columns: columnResult.rows.map((column) => ({
        name: String(column.name),
        nullFraction: this.numberFromDb(column.nullFraction),
        nDistinct: this.numberFromDb(column.nDistinct),
        correlation: this.numberFromDb(column.correlation)
      }))
    };
  }

  protected requirePool(connectionId: string): Pool {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error('Connection is not active. Connect first.');
    }
    return pool;
  }

  protected toPoolConfig(config: ConnectionConfigWithPassword, max: number): PoolConfig {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max,
      connectionTimeoutMillis: config.connectTimeoutMs ?? 10000,
      query_timeout: config.queryTimeoutMs,
      ssl: config.sslMode === 'disable' ? false : { rejectUnauthorized: false }
    };
  }

  protected shouldRetryWithoutSsl(config: ConnectionConfigWithPassword, error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return config.sslMode === 'prefer' && /server does not support ssl connections/i.test(message);
  }

  private async createVerifiedPool(config: ConnectionConfigWithPassword, max: number): Promise<Pool> {
    const { Pool } = await loadPg();
    const pool = new Pool(this.toPoolConfig(config, max));
    try {
      await pool.query('select 1');
      return pool;
    } catch (error) {
      await this.endPool(pool);
      if (!this.shouldRetryWithoutSsl(config, error)) {
        throw error;
      }

      const fallbackPool = new Pool(this.toPoolConfig({ ...config, sslMode: 'disable' }, max));
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
      // The original connection error is more useful than cleanup failure.
    }
  }

  private columnsFromIndexDefinition(definition: string): string[] {
    const match = definition.match(/\((.*)\)/);
    return match ? match[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')) : [];
  }

  protected numberFromDb(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const next = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(next) ? next : undefined;
  }

  protected dateFromDb(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }
    return value instanceof Date ? value.toISOString() : String(value);
  }

  private canApplyClientLimit(sql: string): boolean {
    const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
    return normalized.startsWith('select') || normalized.startsWith('with');
  }

  private sqlWithClientLimit(sql: string, maxRows: number | undefined, offset?: number): string {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
    const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
    const pageLimit = limit ? limit + 1 : undefined;
    return pageLimit && this.canApplyClientLimit(sql)
      ? `select * from (${sql.replace(/;+\s*$/, '')}) __dg_query limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
      : sql;
  }

  private toExecutionResult(result: QueryResult | undefined, executionId: string, started: number): QueryExecutionResult {
    const fields = result?.fields ?? [];
    const rows = result?.rows ?? [];
    return {
      executionId,
      fields: fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
      rows,
      rowCount: result?.rowCount ?? rows.length,
      command: result?.command,
      durationMs: Date.now() - started
    };
  }

  private canExplain(sql: string): boolean {
    const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
    return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
  }

  private toQueryError(error: unknown): QueryError {
    const pgError = error as Partial<QueryError> & { message?: string };
    return {
      message: pgError.message ?? String(error),
      code: pgError.code,
      detail: pgError.detail,
      hint: pgError.hint,
      position: pgError.position,
      where: pgError.where
    };
  }
}

type PgRuntime = {
  Pool: new (config: PoolConfig) => Pool;
};

let pgRuntime: Promise<PgRuntime> | undefined;

function loadPg(): Promise<PgRuntime> {
  pgRuntime ??= loadPgRuntime();
  return pgRuntime;
}

async function loadPgRuntime(): Promise<PgRuntime> {
  const bundled = loadBundledRuntime<PgRuntime>('pgRuntime');
  if (bundled) {
    return bundled;
  }
  return import('pg').then((module) => {
    const candidate = module as unknown as PgRuntime | { default?: PgRuntime };
    return 'Pool' in candidate ? candidate : candidate.default as PgRuntime;
  });
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = String(value).trim();
  return next || undefined;
}

function triggerEvents(definition?: string): string[] | undefined {
  if (!definition) {
    return undefined;
  }
  const events = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].filter((event) => definition.includes(event));
  return events.length ? events : undefined;
}
