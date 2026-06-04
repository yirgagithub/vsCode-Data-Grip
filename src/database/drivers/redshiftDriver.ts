import { PostgresDriver } from './postgresDriver';
import { ColumnInfo, ConnectionConfigWithPassword, SchemaInfo, TableInfo, ViewInfo } from '../../types';

export class RedshiftDriver extends PostgresDriver {
  override readonly id = 'redshift' as const;
  override readonly displayName = 'Amazon Redshift';

  override async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select schema_name as name
       from information_schema.schemata
       where schema_name <> 'information_schema'
       order by schema_name`
    );
    return result.rows;
  }

  override async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const result = await this.requirePool(connectionId).query(
      `select schemaname as schema, tablename as name, 'table' as type
       from pg_tables
       where schemaname = $1
       order by tablename`,
      [schema]
    );
    return result.rows;
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

  protected override toPoolConfig(config: ConnectionConfigWithPassword, max: number) {
    return {
      ...super.toPoolConfig({ ...config, sslMode: config.sslMode === 'disable' ? 'prefer' : config.sslMode }, max),
      port: config.port || 5439
    };
  }
}
