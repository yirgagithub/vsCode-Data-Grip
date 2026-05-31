import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { randomUUID } from 'crypto';
import { DatabaseDriver } from './DatabaseDriver';
import {
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExecuteQueryParams,
  ForeignKeyInfo,
  IndexInfo,
  KeyInfo,
  QueryExecutionResult,
  QueryError,
  QueryValidationResult,
  SchemaInfo,
  TablePreviewOptions,
  TableInfo,
  TestConnectionResult,
  ViewInfo
} from '../../types';
import { qualifiedName, quoteIdentifier } from '../../utils/identifiers';

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

  async testConnection(config: ConnectionConfigWithPassword): Promise<TestConnectionResult> {
    const pool = new Pool(this.toPoolConfig(config, 1));
    try {
      const result = await pool.query('select version() as version');
      return { ok: true, message: 'Connection successful', serverVersion: result.rows[0]?.version };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      await pool.end();
    }
  }

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    await this.disconnect(config.id);
    const pool = new Pool(this.toPoolConfig(config, 8));
    await pool.query('select 1');
    this.pools.set(config.id, pool);
    this.configs.set(config.id, config);
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId);
    if (pool) {
      this.pools.delete(connectionId);
      await pool.end();
    }
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    const pool = this.requirePool(params.connectionId);
    const client = await pool.connect();
    const results: QueryExecutionResult[] = [];
    const hasExplicitTransaction = statements.some((sql) => /\bbegin\b/i.test(sql));

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
          const result = await client.query(this.sqlWithClientLimit(sql, params.maxRows));
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
      client.release();
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
    const lines = columns.map((column) => {
      const nullable = column.nullable ? '' : ' not null';
      const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : '';
      return `  "${column.name}" ${column.dataType}${defaultValue}${nullable}`;
    });
    return `create table ${qualifiedName(schema, table)} (\n${lines.join(',\n')}\n);`;
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

  private columnsFromIndexDefinition(definition: string): string[] {
    const match = definition.match(/\((.*)\)/);
    return match ? match[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')) : [];
  }

  private canApplyClientLimit(sql: string): boolean {
    const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
    return normalized.startsWith('select') || normalized.startsWith('with');
  }

  private sqlWithClientLimit(sql: string, maxRows: number | undefined): string {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
    return limit && this.canApplyClientLimit(sql)
      ? `select * from (${sql.replace(/;+\s*$/, '')}) __dg_query limit ${limit}`
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
