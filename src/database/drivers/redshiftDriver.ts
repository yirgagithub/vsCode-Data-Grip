import { PostgresDriver } from './postgresDriver';
import { ActiveSessionInfo, ColumnInfo, ConnectionConfigWithPassword, DatabaseObjectIdentity, ExecuteQueryParams, ExplainQueryOptions, QueryPlanResult, SchemaInfo, TableInfo, TableStatsInfo, ViewInfo } from '../../types';
import { textExplainPlan } from '../../services/queryPlanService';
import { qualifiedName } from '../../utils/identifiers';

export class RedshiftDriver extends PostgresDriver {
  override readonly id = 'redshift' as const;
  override readonly displayName = 'Amazon Redshift';

  override async getObjectDefinition(connectionId: string, object: DatabaseObjectIdentity): Promise<string | undefined> {
    if (object.kind === 'view') {
      const result = await this.requirePool(connectionId).query('select definition from pg_views where schemaname = $1 and viewname = $2', [object.schema, object.name]);
      return nativeDefinition(result.rows[0]?.definition);
    }
    if (object.kind === 'function' || object.kind === 'procedure') {
      const result = await this.requirePool(connectionId).query(
        `select p.prosrc as definition from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`,
        [object.schema, object.name]
      );
      return nativeDefinition(result.rows[0]?.definition);
    }
    return undefined;
  }

  override async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select distinct name
         from (
           select schema_name as name
           from svv_all_schemas
           where database_name = current_database()
           union all
           select nspname as name
           from pg_namespace
         ) schemas
         where name <> 'information_schema' and name not like 'pg_toast%' and name not like 'pg_temp%'
         order by name`
      );
      return result.rows;
    } catch {
      const result = await pool.query(
        `select nspname as name
         from pg_namespace
         where nspname <> 'information_schema' and nspname not like 'pg_toast%' and nspname not like 'pg_temp%'
         order by nspname`
      );
      return result.rows;
    }
  }

  override async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select schema_name as schema,
                table_name as name,
                case when lower(table_type) like '%materialized%' then 'materialized_view' else 'table' end as type,
                remarks as comment
         from svv_all_tables
         where database_name = current_database() and schema_name = $1
         order by table_name`,
        [schema]
      );
      return result.rows;
    } catch {
      const result = await pool.query(
        `select schemaname as schema, tablename as name, 'table' as type
         from pg_tables
         where schemaname = $1
         order by tablename`,
        [schema]
      );
      return result.rows;
    }
  }

  override async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select schemaname as schema, viewname as name, 'view' as type
       from pg_views
       where schemaname = $1
       order by viewname`,
      [schema]
    );
    return result.rows;
  }

  override async getActiveSessions(connectionId: string): Promise<ActiveSessionInfo[]> {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select pid,
                user_name as user,
                db_name as database,
                '' as application,
                remotehost as client,
                status as state,
                query as query,
                starttime as "startedAt",
                null as "transactionStartedAt",
                null as "stateChangedAt",
                null as "waitEventType",
                null as "waitEvent",
                pid = pg_backend_pid() as "isCurrent",
                status = 'idle in transaction' as "isIdleInTransaction"
         from stv_recents
         where db_name = current_database()
         order by starttime desc nulls last, pid desc`
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
    } catch {
      return super.getActiveSessions(connectionId);
    }
  }

  override async cancelSession(connectionId: string, pid: number): Promise<void> {
    await this.requirePool(connectionId).query('select pg_cancel_backend($1)', [pid]);
  }

  override async terminateSession(connectionId: string, pid: number): Promise<void> {
    await this.cancelSession(connectionId, pid);
  }

  override async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select table_schema as schema, table_name as table, column_name as name,
              ordinal_position as ordinal, data_type as "dataType",
              is_nullable = 'YES' as nullable, column_default as "defaultValue"
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, table]
    );
    return result.rows.map((row: Record<string, unknown>) => {
      const name = String(row.name ?? row.column_name);
      const dataType = optionalString(row.dataType ?? row.datatype ?? row.data_type);
      if (!dataType) {
        throw new Error(`Redshift column metadata for ${qualifiedName(schema, table)}.${name} did not include a data type.`);
      }
      return {
        schema: String(row.schema ?? schema),
        table: String(row.table ?? table),
        name,
        ordinal: Number(row.ordinal ?? row.ordinal_position),
        dataType,
        nullable: booleanFromDb(row.nullable),
        defaultValue: optionalString(row.defaultValue ?? row.defaultvalue ?? row.column_default)
      };
    });
  }

  override async getTableStats(connectionId: string, schema: string, table: string): Promise<TableStatsInfo> {
    const pool = this.requirePool(connectionId);
    try {
      const result = await pool.query(
        `select diststyle as "distStyle",
                sortkey1 as "sortKey1",
                sortkey_num as "sortKeyNum",
                size as "sizeMb",
                tbl_rows as "rowCount",
                skew_rows as "skewRows",
                unsorted as "unsortedPct",
                stats_off as "statsOffPct",
                encoded as "encoded"
         from svv_table_info
         where "schema" = $1 and "table" = $2`,
        [schema, table]
      );
      const row = result.rows[0] ?? {};
      return {
        schema,
        table,
        databaseType: this.id,
        rowEstimate: this.numberFromDb(row.rowCount),
        columns: [],
        redshift: {
          distStyle: optionalString(row.distStyle),
          sortKey1: optionalString(row.sortKey1),
          sortKeyNum: this.numberFromDb(row.sortKeyNum),
          sizeMb: this.numberFromDb(row.sizeMb),
          rowCount: this.numberFromDb(row.rowCount),
          skewRows: this.numberFromDb(row.skewRows),
          unsortedPct: this.numberFromDb(row.unsortedPct),
          statsOffPct: this.numberFromDb(row.statsOffPct),
          encoded: optionalString(row.encoded)
        }
      };
    } catch {
      const fallback = await super.getTableStats(connectionId, schema, table);
      return { ...fallback, databaseType: this.id };
    }
  }

  override async explainQuery(params: ExecuteQueryParams, options: ExplainQueryOptions = {}): Promise<QueryPlanResult> {
    try {
      return await super.explainQuery(params, options);
    } catch (error) {
      if (options.analyze) {
        throw error;
      }
      const sql = params.sql.trim().replace(/;+\s*$/, '');
      if (!/^(select|with|insert|update|delete|merge)\b/i.test(sql)) {
        throw error;
      }
      const result = await this.requirePool(params.connectionId).query(`explain ${sql}`);
      const rawText = result.rows
        .map((row) => Object.values(row).map((value) => String(value)).join(' '))
        .join('\n');
      return textExplainPlan(rawText, false);
    }
  }

  protected override shouldRetryWithoutSsl(_config: ConnectionConfigWithPassword, _error: unknown): boolean {
    return false;
  }

  protected override toPoolConfig(config: ConnectionConfigWithPassword, max: number) {
    return {
      ...super.toPoolConfig({ ...config, sslMode: config.sslMode === 'disable' ? 'prefer' : config.sslMode }, max),
      port: config.port || 5439
    };
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = String(value).trim();
  return next || undefined;
}

function nativeDefinition(value: unknown): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : String(value);
}

function booleanFromDb(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = optionalString(value)?.toLowerCase();
  return normalized === 'true' || normalized === 't' || normalized === 'yes' || normalized === 'y' || normalized === '1';
}
