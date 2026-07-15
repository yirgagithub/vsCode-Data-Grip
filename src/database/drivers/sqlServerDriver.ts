import { ConnectionConfigWithPassword, DbConnection, ExecuteQueryParams, ColumnInfo, DatabaseObjectIdentity, SchemaInfo, TableInfo, QueryExecutionResult, TablePreviewOptions, ViewInfo, RoutineInfo } from '../../types';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { BasicDatabaseDriver, emptyExecutionResult, executionResultFromRows, optionalString, safeFilterClause, toQueryError } from './driverUtils';
import { qualifiedSqlName, quoteSqlIdentifier } from '../../services/sqlDialect';

type MssqlQueryResult = {
  recordset?: Record<string, unknown>[];
  rowsAffected?: number[];
};

type MssqlPool = {
  connect(): Promise<MssqlPool>;
  close(): Promise<void>;
  request(): {
    query(sql: string): Promise<MssqlQueryResult>;
  };
};

type MssqlRuntime = {
  ConnectionPool: new (config: Record<string, unknown>) => MssqlPool;
};

export class SqlServerDriver extends BasicDatabaseDriver {
  readonly id = 'sqlserver' as const;
  readonly displayName = 'Microsoft SQL Server';
  private readonly pools = new Map<string, MssqlPool>();

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    await this.disconnect(config.id);
    const mssql = await loadMssql();
    const pool = new mssql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeout: config.connectTimeoutMs ?? 10000,
      requestTimeout: config.queryTimeoutMs ?? 300000,
      options: {
        encrypt: config.sslMode !== 'disable',
        trustServerCertificate: config.sslMode !== 'require'
      }
    });
    await pool.connect();
    this.pools.set(config.id, pool);
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      return;
    }
    this.pools.delete(connectionId);
    await pool.close();
  }

  override async testConnection(config: ConnectionConfigWithPassword) {
    let connection: DbConnection | undefined;
    try {
      connection = await this.connect(config);
      const result = await this.executeQuery({ connectionId: connection.id, sql: 'select @@version as version' });
      return { ok: true, message: 'Connection successful', serverVersion: optionalString(result.rows[0]?.version) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (connection) {
        await this.disconnect(connection.id).catch(() => undefined);
      }
    }
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    const pool = this.requirePool(params.connectionId);
    const results: QueryExecutionResult[] = [];
    for (const sql of statements) {
      const started = Date.now();
      try {
        const result = await pool.request().query(sql);
        const rows = result.recordset ?? [];
        results.push(rows.length ? executionResultFromRows(rows, started, sql) : emptyExecutionResult(started, sql, result.rowsAffected?.[0] ?? 0));
      } catch (error) {
        throw toQueryError(error);
      }
    }
    return results;
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const result = await this.query(connectionId, `select name from sys.schemas where name not in ('sys', 'INFORMATION_SCHEMA') order by name`);
    return result.map((row) => ({ name: String(row.name) }));
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const result = await this.query(connectionId, `select table_schema as [schema], table_name as name, 'table' as type from information_schema.tables where table_schema = '${escapeSql(schema)}' and table_type = 'BASE TABLE' order by table_name`);
    return result.map((row) => ({ schema: String(row.schema), name: String(row.name), type: 'table' }));
  }

  override async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const result = await this.query(connectionId, `select table_schema as [schema], table_name as name, 'view' as type from information_schema.views where table_schema = '${escapeSql(schema)}' order by table_name`);
    return result.map((row) => ({ schema: String(row.schema), name: String(row.name), type: 'view' }));
  }

  override async getFunctions(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'FUNCTION');
  }

  override async getProcedures(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'PROCEDURE');
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.query(connectionId, `select table_schema as [schema], table_name as [table], column_name as name, ordinal_position as ordinal, data_type as dataType, is_nullable as nullable, column_default as defaultValue from information_schema.columns where table_schema = '${escapeSql(schema)}' and table_name = '${escapeSql(table)}' order by ordinal_position`);
    return rows.map((row) => ({
      schema: String(row.schema),
      table: String(row.table),
      name: String(row.name),
      ordinal: Number(row.ordinal),
      dataType: String(row.dataType),
      nullable: String(row.nullable).toUpperCase() === 'YES',
      defaultValue: optionalString(row.defaultValue)
    }));
  }

  async getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult> {
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const orderBy = options?.orderBy?.length
      ? ` order by ${options.orderBy.map((item) => `${quoteSqlIdentifier(this.id, item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
      : options?.orderBySql?.trim()
        ? ` order by ${options.orderBySql.trim()}`
        : offset
          ? ' order by (select null)'
          : '';
    const sql = `select ${pageLimit && !offset ? `top (${pageLimit}) ` : ''}* from ${qualifiedSqlName(this.id, schema, table)}${safeFilterClause(options?.where)}${orderBy}${pageLimit && offset ? ` offset ${offset} rows fetch next ${pageLimit} rows only` : ''}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }

  override async getObjectDefinition(connectionId: string, object: DatabaseObjectIdentity): Promise<string | undefined> {
    if (object.kind === 'table') return this.getTableDDL(connectionId, object.schema, object.name);
    try {
      const qualified = qualifiedSqlName(this.id, object.schema, object.name).replace(/'/g, "''");
      const rows = await this.query(connectionId, `select OBJECT_DEFINITION(OBJECT_ID(N'${qualified}')) as definition`);
      return nativeDefinition(rows[0]?.definition);
    } catch (error) {
      throw toQueryError(error);
    }
  }

  private async getRoutines(connectionId: string, schema: string, type: 'FUNCTION' | 'PROCEDURE'): Promise<RoutineInfo[]> {
    const rows = await this.query(connectionId, `select routine_schema as [schema], routine_name as name, routine_type as kind, data_type as returnType from information_schema.routines where routine_schema = '${escapeSql(schema)}' and routine_type = '${type}' order by routine_name`);
    return rows.map((row) => ({
      schema: String(row.schema),
      name: String(row.name),
      kind: type === 'PROCEDURE' ? 'procedure' : 'function',
      returnType: optionalString(row.returnType)
    }));
  }

  private async query(connectionId: string, sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.requirePool(connectionId).request().query(sql);
    return result.recordset ?? [];
  }

  private requirePool(connectionId: string): MssqlPool {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error('Connection is not active. Connect first.');
    }
    return pool;
  }
}

async function loadMssql(): Promise<MssqlRuntime> {
  const bundled = loadBundledRuntime<MssqlRuntime>('mssqlRuntime');
  if (bundled) {
    return bundled;
  }
  return import('mssql').then((module) => {
    const candidate = module as unknown as MssqlRuntime | { default?: MssqlRuntime };
    return 'ConnectionPool' in candidate ? candidate : candidate.default as MssqlRuntime;
  });
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function nativeDefinition(value: unknown): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : String(value);
}
