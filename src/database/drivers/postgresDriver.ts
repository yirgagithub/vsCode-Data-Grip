import { Pool, PoolClient, PoolConfig } from 'pg';
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
  SchemaInfo,
  TableInfo,
  TestConnectionResult,
  ViewInfo
} from '../../types';
import { qualifiedName } from '../../utils/identifiers';

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
    const executionId = randomUUID();
    const pool = this.requirePool(params.connectionId);
    const client = await pool.connect();
    const started = Date.now();
    this.activeExecutions.set(executionId, { connectionId: params.connectionId, processId: (client as PoolClient & { processID?: number }).processID });

    try {
      const maxRows = Number.isFinite(params.maxRows) && params.maxRows && params.maxRows > 0 ? Math.floor(params.maxRows) : undefined;
      const limitedSql = maxRows && this.canApplyClientLimit(params.sql)
        ? `select * from (${params.sql.replace(/;+\s*$/, '')}) __dg_query limit ${maxRows}`
        : params.sql;
      const result = await client.query(limitedSql);
      return {
        executionId,
        fields: result.fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        command: result.command,
        durationMs: Date.now() - started
      };
    } finally {
      this.activeExecutions.delete(executionId);
      client.release();
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

  async getTablePreview(connectionId: string, schema: string, table: string, limit: number): Promise<QueryExecutionResult> {
    return this.executeQuery({ connectionId, sql: `select * from ${qualifiedName(schema, table)}`, maxRows: limit });
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
}
