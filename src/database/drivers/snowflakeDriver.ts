import { ConnectionConfigWithPassword, DbConnection, ExecuteQueryParams, ColumnInfo, SchemaInfo, TableInfo, QueryExecutionResult, TablePreviewOptions, ViewInfo, RoutineInfo } from '../../types';
import { qualifiedName, quoteIdentifier } from '../../utils/identifiers';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { BasicDatabaseDriver, emptyExecutionResult, executionResultFromRows, numberFromDb, optionalString, safeFilterClause, toQueryError } from './driverUtils';

type SnowflakeColumn = {
  getName(): string;
  getType(): string;
};

type SnowflakeStatement = {
  getColumns(): SnowflakeColumn[] | undefined;
  getNumRows(): number;
  getNumUpdatedRows(): number | undefined;
};

type SnowflakeConnection = {
  connectAsync(): Promise<SnowflakeConnection>;
  execute(options: { sqlText: string; complete?: (error: unknown, statement: SnowflakeStatement, rows?: Record<string, unknown>[]) => void }): SnowflakeStatement;
  destroy(callback: (error: unknown, connection: SnowflakeConnection) => void): void;
};

type SnowflakeRuntime = {
  createConnection(config: Record<string, unknown>): SnowflakeConnection;
};

export class SnowflakeDriver extends BasicDatabaseDriver {
  readonly id = 'snowflake' as const;
  readonly displayName = 'Snowflake';
  private readonly connections = new Map<string, SnowflakeConnection>();

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    await this.disconnect(config.id);
    const snowflake = await loadSnowflake();
    const connection = snowflake.createConnection({
      account: snowflakeAccount(config.host),
      username: config.username,
      password: config.password,
      database: optionalString(config.database),
      schema: optionalString(config.defaultSchema),
      timeout: config.connectTimeoutMs ?? 10000,
      application: 'QueryDeck',
      rowMode: 'object'
    });
    await connection.connectAsync();
    this.connections.set(config.id, connection);
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    this.connections.delete(connectionId);
    await new Promise<void>((resolve, reject) => {
      connection.destroy((error) => error ? reject(error) : resolve());
    });
  }

  override async testConnection(config: ConnectionConfigWithPassword) {
    let connection: DbConnection | undefined;
    try {
      connection = await this.connect(config);
      const result = await this.executeQuery({ connectionId: connection.id, sql: 'select current_version() as version' });
      return { ok: true, message: 'Connection successful', serverVersion: optionalString(result.rows[0]?.VERSION ?? result.rows[0]?.version) };
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
    const connection = this.requireConnection(params.connectionId);
    const results: QueryExecutionResult[] = [];
    for (const sql of statements) {
      const started = Date.now();
      try {
        const result = await executeSnowflake(connection, sqlWithLimit(sql, params.maxRows, params.offset));
        results.push(result.rows.length ? executionResultFromRows(result.rows, started, sql, result.dataTypes) : emptyExecutionResult(started, sql, result.rowCount));
      } catch (error) {
        throw toQueryError(error);
      }
    }
    return results;
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const rows = await this.query(connectionId, 'select schema_name as "name" from information_schema.schemata order by schema_name');
    return rows.map((row) => ({ name: String(row.name ?? row.NAME) }));
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "name", row_count as "rowEstimate" from information_schema.tables where table_schema = upper('${escapeSql(schema)}') and table_type = 'BASE TABLE' order by table_name`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      name: String(row.name ?? row.NAME),
      type: 'table',
      rowEstimate: numberFromDb(row.rowEstimate ?? row.ROWESTIMATE)
    }));
  }

  override async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "name" from information_schema.views where table_schema = upper('${escapeSql(schema)}') order by table_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: 'view' }));
  }

  override async getFunctions(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'FUNCTION');
  }

  override async getProcedures(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'PROCEDURE');
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "table", column_name as "name", ordinal_position as "ordinal", data_type as "dataType", is_nullable as "nullable", column_default as "defaultValue" from information_schema.columns where table_schema = upper('${escapeSql(schema)}') and table_name = upper('${escapeSql(table)}') order by ordinal_position`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      table: String(row.table ?? row.TABLE),
      name: String(row.name ?? row.NAME),
      ordinal: Number(row.ordinal ?? row.ORDINAL),
      dataType: String(row.dataType ?? row.DATATYPE),
      nullable: String(row.nullable ?? row.NULLABLE).toUpperCase() === 'YES',
      defaultValue: optionalString(row.defaultValue ?? row.DEFAULTVALUE)
    }));
  }

  async getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult> {
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const orderBy = options?.orderBy?.length
      ? `\norder by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
      : options?.orderBySql?.trim()
        ? `\norder by ${options.orderBySql.trim()}`
        : '';
    const sql = `select * from ${qualifiedName(schema, table)}${safeFilterClause(options?.where)}${orderBy}${pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : ''}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }

  private async getRoutines(connectionId: string, schema: string, kind: 'FUNCTION' | 'PROCEDURE'): Promise<RoutineInfo[]> {
    const rows = await this.query(connectionId, `select routine_schema as "schema", routine_name as "name", data_type as "returnType" from information_schema.routines where routine_schema = upper('${escapeSql(schema)}') and routine_type = '${kind}' order by routine_name`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      name: String(row.name ?? row.NAME),
      kind: kind === 'PROCEDURE' ? 'procedure' : 'function',
      returnType: optionalString(row.returnType ?? row.RETURNTYPE)
    }));
  }

  private async query(connectionId: string, sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.executeQuery({ connectionId, sql });
    return result.rows;
  }

  private requireConnection(connectionId: string): SnowflakeConnection {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection is not active. Connect first.');
    }
    return connection;
  }
}

let snowflakeRuntime: Promise<SnowflakeRuntime> | undefined;

function loadSnowflake(): Promise<SnowflakeRuntime> {
  snowflakeRuntime ??= loadSnowflakeRuntime();
  return snowflakeRuntime;
}

async function loadSnowflakeRuntime(): Promise<SnowflakeRuntime> {
  const bundled = loadBundledRuntime<SnowflakeRuntime>('snowflakeRuntime');
  if (bundled) {
    return bundled;
  }
  return import('snowflake-sdk').then((module) => {
    const candidate = module as unknown as SnowflakeRuntime | { default?: SnowflakeRuntime };
    return 'createConnection' in candidate ? candidate : candidate.default as SnowflakeRuntime;
  });
}

function executeSnowflake(connection: SnowflakeConnection, sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number; dataTypes: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (error, statement, rows = []) => {
        if (error) {
          reject(error);
          return;
        }
        const dataTypes = Object.fromEntries((statement.getColumns() ?? []).map((column) => [column.getName(), column.getType()]));
        resolve({
          rows,
          rowCount: statement.getNumUpdatedRows() ?? statement.getNumRows() ?? rows.length,
          dataTypes
        });
      }
    });
  });
}

function sqlWithLimit(sql: string, maxRows: number | undefined, offset?: number): string {
  const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
  const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
  const pageLimit = limit ? limit + 1 : undefined;
  return pageLimit && /^(select|with)\b/i.test(sql.trim())
    ? `select * from (${sql.replace(/;+\s*$/, '')}) "__dg_query" limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
    : sql;
}

function snowflakeAccount(host: string): string {
  return host.replace(/^https?:\/\//i, '').replace(/\.snowflakecomputing\.com$/i, '').replace(/\/.*$/, '');
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
