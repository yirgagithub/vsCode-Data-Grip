import { ConnectionConfigWithPassword, DbConnection, ExecuteQueryParams, ColumnInfo, DatabaseObjectIdentity, SchemaInfo, TableInfo, QueryExecutionResult, TablePreviewOptions, ViewInfo, RoutineInfo } from '../../types';
import { qualifiedName, quoteIdentifier } from '../../utils/identifiers';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { BasicDatabaseDriver, emptyExecutionResult, executionResultFromRows, optionalString, safeFilterClause, toQueryError } from './driverUtils';

type OracleConnection = {
  execute(sql: string, binds?: unknown[], options?: Record<string, unknown>): Promise<{ rows?: Record<string, unknown>[]; rowsAffected?: number; metaData?: Array<{ name: string; dbTypeName?: string }> }>;
  close(): Promise<void>;
};

type OracleRuntime = {
  OUT_FORMAT_OBJECT: number;
  DB_TYPE_DATE: unknown;
  DB_TYPE_TIMESTAMP: unknown;
  DB_TYPE_TIMESTAMP_TZ: unknown;
  DB_TYPE_TIMESTAMP_LTZ: unknown;
  createPool(config: Record<string, unknown>): Promise<{ getConnection(): Promise<OracleConnection>; close(drainTime?: number): Promise<void> }>;
};

export class OracleDriver extends BasicDatabaseDriver {
  readonly id = 'oracle' as const;
  readonly displayName = 'Oracle';
  private readonly pools = new Map<string, Awaited<ReturnType<OracleRuntime['createPool']>>>();

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    await this.disconnect(config.id);
    const oracle = await loadOracle();
    const pool = await oracle.createPool({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
      poolMin: 0,
      poolMax: 8,
      connectTimeout: Math.ceil((config.connectTimeoutMs ?? 10000) / 1000)
    });
    this.pools.set(config.id, pool);
    const connection = await pool.getConnection();
    try {
      await connection.execute('select 1 from dual');
    } finally {
      await connection.close();
    }
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      return;
    }
    this.pools.delete(connectionId);
    await pool.close(0);
  }

  override async testConnection(config: ConnectionConfigWithPassword) {
    let connection: DbConnection | undefined;
    try {
      connection = await this.connect(config);
      const result = await this.executeQuery({ connectionId: connection.id, sql: 'select banner as version from v$version where rownum = 1' });
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
    const oracle = await loadOracle();
    const connection = await this.requirePool(params.connectionId).getConnection();
    const results: QueryExecutionResult[] = [];
    const temporalTypes = new Set([
      oracle.DB_TYPE_DATE,
      oracle.DB_TYPE_TIMESTAMP,
      oracle.DB_TYPE_TIMESTAMP_TZ,
      oracle.DB_TYPE_TIMESTAMP_LTZ
    ]);
    try {
      for (const sql of statements) {
        const started = Date.now();
        try {
          const result = await connection.execute(sql, [], {
            outFormat: oracle.OUT_FORMAT_OBJECT,
            autoCommit: true,
            fetchTypeHandler: (metadata: { dbType: unknown }) => temporalTypes.has(metadata.dbType) ? { converter: formatOracleTemporalValue } : undefined
          });
          const rows = (result.rows ?? []) as Record<string, unknown>[];
          const dataTypes = Object.fromEntries((result.metaData ?? []).map((field) => [field.name, field.dbTypeName ?? '']));
          results.push(rows.length ? executionResultFromRows(rows, started, sql, dataTypes) : emptyExecutionResult(started, sql, result.rowsAffected ?? 0));
        } catch (error) {
          throw toQueryError(error);
        }
      }
      return results;
    } finally {
      await connection.close();
    }
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const rows = await this.query(connectionId, `select username as "name" from all_users order by username`);
    return rows.map((row) => ({ name: String(row.name ?? row.NAME) }));
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const rows = await this.query(connectionId, `select owner as "schema", table_name as "name", 'table' as "type", num_rows as "rowEstimate" from all_tables where owner = upper('${escapeSql(schema)}') order by table_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: 'table', rowEstimate: Number(row.rowEstimate ?? row.ROWESTIMATE) || undefined }));
  }

  override async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const rows = await this.query(connectionId, `select owner as "schema", view_name as "name", 'view' as "type" from all_views where owner = upper('${escapeSql(schema)}') order by view_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: 'view' }));
  }

  override async getFunctions(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'FUNCTION');
  }

  override async getProcedures(connectionId: string, schema: string): Promise<RoutineInfo[]> {
    return this.getRoutines(connectionId, schema, 'PROCEDURE');
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.query(connectionId, `select owner as "schema", table_name as "table", column_name as "name", column_id as "ordinal", data_type as "dataType", nullable as "nullable", data_default as "defaultValue" from all_tab_columns where owner = upper('${escapeSql(schema)}') and table_name = upper('${escapeSql(table)}') order by column_id`);
    return rows.map((row) => ({
      schema: String(row.schema ?? row.SCHEMA),
      table: String(row.table ?? row.TABLE),
      name: String(row.name ?? row.NAME),
      ordinal: Number(row.ordinal ?? row.ORDINAL),
      dataType: String(row.dataType ?? row.DATATYPE),
      nullable: String(row.nullable ?? row.NULLABLE).toUpperCase() === 'Y',
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
    const paging = pageLimit ? `\noffset ${offset} rows fetch next ${pageLimit} rows only` : '';
    const sql = `select * from ${qualifiedName(schema, table)}${safeFilterClause(options?.where)}${orderBy}${paging}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }

  override async getObjectDefinition(connectionId: string, object: DatabaseObjectIdentity): Promise<string | undefined> {
    const type = object.kind === 'procedure' ? 'PROCEDURE' : object.kind.toUpperCase();
    const oracle = await loadOracle();
    const connection = await this.requirePool(connectionId).getConnection();
    try {
      const result = object.kind === 'function' || object.kind === 'procedure' || object.kind === 'trigger'
        ? await connection.execute(
          `select text as "text" from all_source where owner = upper(:owner) and name = upper(:name) and type = :type order by line`,
          [object.schema, object.name, type], { outFormat: oracle.OUT_FORMAT_OBJECT }
        )
        : await connection.execute(
          `select dbms_metadata.get_ddl(:type, upper(:name), upper(:owner)) as "definition" from dual`,
          [type, object.name, object.schema], { outFormat: oracle.OUT_FORMAT_OBJECT }
        );
      if (object.kind === 'function' || object.kind === 'procedure' || object.kind === 'trigger') {
        const text = (result.rows ?? []).map((row) => String(row.text ?? row.TEXT ?? '')).join('');
        return nativeDefinition(text);
      }
      const row = result.rows?.[0];
      return nativeDefinition(row?.definition ?? row?.DEFINITION);
    } catch (error) {
      throw toQueryError(error);
    } finally {
      await connection.close();
    }
  }

  private async getRoutines(connectionId: string, schema: string, kind: 'FUNCTION' | 'PROCEDURE'): Promise<RoutineInfo[]> {
    const rows = await this.query(connectionId, `select owner as "schema", object_name as "name" from all_objects where owner = upper('${escapeSql(schema)}') and object_type = '${kind}' order by object_name`);
    return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), kind: kind === 'PROCEDURE' ? 'procedure' : 'function' }));
  }

  private async query(connectionId: string, sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.executeQuery({ connectionId, sql });
    return result.rows;
  }

  private requirePool(connectionId: string): Awaited<ReturnType<OracleRuntime['createPool']>> {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error('Connection is not active. Connect first.');
    }
    return pool;
  }
}

function formatOracleTemporalValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (!(value instanceof Date)) {
    return value;
  }
  const pad = (part: number, width = 2) => String(part).padStart(width, '0');
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
    + `T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}.${pad(value.getUTCMilliseconds(), 3)}Z`;
}

async function loadOracle(): Promise<OracleRuntime> {
  const bundled = loadBundledRuntime<OracleRuntime>('oracleRuntime');
  if (bundled) {
    return bundled;
  }
  return import('oracledb').then((module) => {
    const candidate = module as unknown as OracleRuntime | { default?: OracleRuntime };
    return 'createPool' in candidate ? candidate : candidate.default as OracleRuntime;
  });
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function nativeDefinition(value: unknown): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : String(value);
}
