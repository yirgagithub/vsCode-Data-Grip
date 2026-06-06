import { PostgresDriver } from './postgresDriver';
import { ColumnInfo, ConnectionConfigWithPassword, SchemaInfo, TableInfo, ViewInfo } from '../../types';

export class RedshiftDriver extends PostgresDriver {
  override readonly id = 'redshift' as const;
  override readonly displayName = 'Amazon Redshift';

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
    return result.rows;
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
