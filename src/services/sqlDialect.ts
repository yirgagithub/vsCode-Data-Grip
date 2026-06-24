import { ColumnInfo, DatabaseType } from '../types';

export type SqlGeneratingDatabaseType = Exclude<DatabaseType, 'redis'>;

export type NewObjectKind =
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'column'
  | 'index'
  | 'unique_key'
  | 'foreign_key'
  | 'check'
  | 'schema'
  | 'sequence';

export interface SqlTableTarget {
  schema: string;
  name: string;
}

export interface SqlObjectTarget extends SqlTableTarget {
  kind: 'table' | 'view' | 'schema' | 'column';
  column?: string;
}

export function assertSqlGeneratingType(type: DatabaseType, feature: string): SqlGeneratingDatabaseType {
  if (type === 'redis') {
    throw new Error(`${feature} is not available for Redis connections. Use Redis commands instead.`);
  }
  return type;
}

export function quoteSqlIdentifier(type: DatabaseType, identifier: string): string {
  if (type === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
  if (type === 'sqlserver') {
    return `[${identifier.replace(/]/g, ']]')}]`;
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function qualifiedSqlName(type: DatabaseType, schema: string, name: string): string {
  return `${quoteSqlIdentifier(type, schema)}.${quoteSqlIdentifier(type, name)}`;
}

export function sqlLiteral(type: DatabaseType, value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return type === 'sqlserver' || type === 'oracle' ? (value ? '1' : '0') : (value ? 'true' : 'false');
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function createTableSql(type: DatabaseType, schema: string, table: string, columns: ColumnInfo[]): string {
  const sqlType = assertSqlGeneratingType(type, 'CREATE TABLE generation');
  const ddlColumns = columns.length
    ? columns.map((column) => columnDefinitionSql(sqlType, column))
    : [`  ${quoteSqlIdentifier(sqlType, 'id')} ${defaultIdType(sqlType)}`];
  return `create table ${qualifiedSqlName(sqlType, schema, table)} (\n${ddlColumns.join(',\n')}\n);`;
}

export function insertBatchSql(type: DatabaseType, schema: string, table: string, columns: string[], rows: Array<Record<string, unknown>>): string {
  const sqlType = assertSqlGeneratingType(type, 'INSERT generation');
  return `insert into ${qualifiedSqlName(sqlType, schema, table)} (${columns.map((column) => quoteSqlIdentifier(sqlType, column)).join(', ')})\nvalues\n${rows.map((row) => `  (${columns.map((column) => sqlLiteral(sqlType, row[column])).join(', ')})`).join(',\n')};`;
}

export function selectTableSql(type: DatabaseType, schema: string, table: string, limit = 100): string {
  const sqlType = assertSqlGeneratingType(type, 'SELECT generation');
  const tableName = qualifiedSqlName(sqlType, schema, table);
  if (sqlType === 'sqlserver') {
    return `select top (${limit}) *\nfrom ${tableName};\n`;
  }
  if (sqlType === 'oracle') {
    return `select *\nfrom ${tableName}\nfetch first ${limit} rows only;\n`;
  }
  return `select *\nfrom ${tableName}\nlimit ${limit};\n`;
}

export function selectAllTableSql(type: DatabaseType, schema: string, table: string): string {
  const sqlType = assertSqlGeneratingType(type, 'SELECT generation');
  return `select *\nfrom ${qualifiedSqlName(sqlType, schema, table)};\n`;
}

export function insertTemplateSql(type: DatabaseType, schema: string, table: string, columns: ColumnInfo[]): string {
  const sqlType = assertSqlGeneratingType(type, 'INSERT generation');
  const writable = columns.filter((column) => !column.defaultValue).map((column) => column.name);
  const tableName = qualifiedSqlName(sqlType, schema, table);
  if (!writable.length) {
    return defaultValuesInsertSql(sqlType, tableName);
  }
  return `insert into ${tableName} (${writable.map((column) => quoteSqlIdentifier(sqlType, column)).join(', ')})\nvalues (${writable.map(() => 'null').join(', ')});\n`;
}

export function updateTemplateSql(type: DatabaseType, schema: string, table: string): string {
  const sqlType = assertSqlGeneratingType(type, 'UPDATE generation');
  return `update ${qualifiedSqlName(sqlType, schema, table)}\nset ${quoteSqlIdentifier(sqlType, 'column_name')} = null\nwhere ${quoteSqlIdentifier(sqlType, 'id')} = '<id>';\n`;
}

export function deleteTemplateSql(type: DatabaseType, schema: string, table: string): string {
  const sqlType = assertSqlGeneratingType(type, 'DELETE generation');
  return `delete from ${qualifiedSqlName(sqlType, schema, table)}\nwhere ${quoteSqlIdentifier(sqlType, 'id')} = '<id>';\n`;
}

export function addColumnSql(type: DatabaseType, schema: string, table: string, column = 'new_column'): string {
  const sqlType = assertSqlGeneratingType(type, 'ADD COLUMN generation');
  const addKeyword = addColumnKeyword(sqlType);
  return `alter table ${qualifiedSqlName(sqlType, schema, table)}\n  ${addKeyword} ${quoteSqlIdentifier(sqlType, column)} ${defaultTextType(sqlType)};\n`;
}

export function newObjectSql(type: DatabaseType, kind: NewObjectKind, schema: string, table?: SqlTableTarget): string {
  const sqlType = assertSqlGeneratingType(type, `${kind} generation`);
  const target = table ?? { schema, name: 'table_name' };
  if (kind === 'table') {
    return `create table ${qualifiedSqlName(sqlType, schema, 'new_table')} (\n  ${quoteSqlIdentifier(sqlType, 'id')} ${defaultIdType(sqlType)},\n  ${quoteSqlIdentifier(sqlType, 'created_at')} ${timestampColumnSql(sqlType)}\n);\n`;
  }
  if (kind === 'view') {
    return createViewSql(sqlType, schema, 'new_view', 'source_table');
  }
  if (kind === 'materialized_view') {
    return materializedViewSql(sqlType, schema, 'new_materialized_view', 'source_table');
  }
  if (kind === 'column') {
    return addColumnSql(sqlType, target.schema, target.name);
  }
  if (kind === 'index') {
    return `create index ${quoteSqlIdentifier(sqlType, `idx_${target.name}_column`)}\non ${qualifiedSqlName(sqlType, target.schema, target.name)} (${quoteSqlIdentifier(sqlType, 'column_name')});\n`;
  }
  if (kind === 'unique_key') {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  add constraint ${quoteSqlIdentifier(sqlType, `${target.name}_column_key`)} unique (${quoteSqlIdentifier(sqlType, 'column_name')});\n`;
  }
  if (kind === 'foreign_key') {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  add constraint ${quoteSqlIdentifier(sqlType, `${target.name}_fk`)} foreign key (${quoteSqlIdentifier(sqlType, 'column_name')})\n  references ${qualifiedSqlName(sqlType, schema, 'referenced_table')} (${quoteSqlIdentifier(sqlType, 'id')});\n`;
  }
  if (kind === 'check') {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  add constraint ${quoteSqlIdentifier(sqlType, `${target.name}_check`)} check (${quoteSqlIdentifier(sqlType, 'column_name')} is not null);\n`;
  }
  if (kind === 'schema') {
    return createSchemaSql(sqlType, 'new_schema');
  }
  if (kind === 'sequence') {
    return createSequenceSql(sqlType, schema, 'new_sequence');
  }
  return '';
}

export function renameObjectSql(type: DatabaseType, target: SqlObjectTarget): string {
  const sqlType = assertSqlGeneratingType(type, 'Rename generation');
  if (target.kind === 'table') {
    if (sqlType === 'mysql') {
      return `rename table ${qualifiedSqlName(sqlType, target.schema, target.name)} to ${qualifiedSqlName(sqlType, target.schema, `${target.name}_new`)};\n`;
    }
    if (sqlType === 'sqlserver') {
      return `exec sp_rename '${target.schema}.${target.name}', '${target.name}_new';\n`;
    }
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  rename to ${quoteSqlIdentifier(sqlType, `${target.name}_new`)};\n`;
  }
  if (target.kind === 'view') {
    if (sqlType === 'mysql') {
      return `rename table ${qualifiedSqlName(sqlType, target.schema, target.name)} to ${qualifiedSqlName(sqlType, target.schema, `${target.name}_new`)};\n`;
    }
    if (sqlType === 'sqlserver') {
      return `exec sp_rename '${target.schema}.${target.name}', '${target.name}_new';\n`;
    }
    return `alter view ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  rename to ${quoteSqlIdentifier(sqlType, `${target.name}_new`)};\n`;
  }
  if (target.kind === 'schema') {
    return unsupportedSql(sqlType, 'Renaming schemas');
  }
  if (target.kind === 'column' && target.column) {
    if (sqlType === 'sqlserver') {
      return `exec sp_rename '${target.schema}.${target.name}.${target.column}', '${target.column}_new', 'COLUMN';\n`;
    }
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  rename column ${quoteSqlIdentifier(sqlType, target.column)} to ${quoteSqlIdentifier(sqlType, `${target.column}_new`)};\n`;
  }
  return unsupportedSql(sqlType, 'Rename generation');
}

export function dropObjectSql(type: DatabaseType, target: SqlObjectTarget): string {
  const sqlType = assertSqlGeneratingType(type, 'DROP generation');
  if (target.kind === 'table') {
    return `drop table ${qualifiedSqlName(sqlType, target.schema, target.name)};\n`;
  }
  if (target.kind === 'view') {
    return `drop view ${qualifiedSqlName(sqlType, target.schema, target.name)};\n`;
  }
  if (target.kind === 'schema') {
    return sqlType === 'oracle'
      ? unsupportedSql(sqlType, 'Dropping schemas')
      : `drop schema ${quoteSqlIdentifier(sqlType, target.schema)};\n`;
  }
  if (target.kind === 'column' && target.column) {
    return `alter table ${qualifiedSqlName(sqlType, target.schema, target.name)}\n  drop column ${quoteSqlIdentifier(sqlType, target.column)};\n`;
  }
  return unsupportedSql(sqlType, 'DROP generation');
}

export function createSchemaSql(type: DatabaseType, schema: string, options: { ifNotExists?: boolean } = {}): string {
  const sqlType = assertSqlGeneratingType(type, 'CREATE SCHEMA generation');
  if (sqlType === 'sqlite' || sqlType === 'oracle') {
    return unsupportedSql(sqlType, 'CREATE SCHEMA');
  }
  const guard = options.ifNotExists && supportsIfNotExists(sqlType) ? ' if not exists' : '';
  return `create schema${guard} ${quoteSqlIdentifier(sqlType, schema)};\n`;
}

export function dropTableIfExistsSql(type: DatabaseType, schema: string, table: string): string {
  const sqlType = assertSqlGeneratingType(type, 'DROP TABLE generation');
  if (sqlType === 'oracle') {
    return `drop table ${qualifiedSqlName(sqlType, schema, table)};\n`;
  }
  return `drop table if exists ${qualifiedSqlName(sqlType, schema, table)};\n`;
}

export function dropViewIfExistsSql(type: DatabaseType, schema: string, view: string): string {
  const sqlType = assertSqlGeneratingType(type, 'DROP VIEW generation');
  if (sqlType === 'oracle') {
    return `drop view ${qualifiedSqlName(sqlType, schema, view)};\n`;
  }
  return `drop view if exists ${qualifiedSqlName(sqlType, schema, view)};\n`;
}

export function createPlaceholderViewSql(type: DatabaseType, schema: string, view: string): string {
  const sqlType = assertSqlGeneratingType(type, 'CREATE VIEW generation');
  return `create view ${qualifiedSqlName(sqlType, schema, view)} as\nselect 1 as ${quoteSqlIdentifier(sqlType, 'placeholder')};\n`;
}

function columnDefinitionSql(type: SqlGeneratingDatabaseType, column: ColumnInfo): string {
  const dataType = column.dataType?.trim();
  if (!dataType) {
    throw new Error(`Missing data type for ${column.schema}.${column.table}.${column.name}.`);
  }
  const nullable = column.nullable ? '' : ' not null';
  const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : '';
  return `  ${quoteSqlIdentifier(type, column.name)} ${dataType}${defaultValue}${nullable}`;
}

function defaultTextType(type: SqlGeneratingDatabaseType): string {
  if (type === 'mysql') {
    return 'varchar(255)';
  }
  if (type === 'sqlserver') {
    return 'nvarchar(max)';
  }
  if (type === 'oracle') {
    return 'varchar2(255)';
  }
  return 'text';
}

function defaultIdType(type: SqlGeneratingDatabaseType): string {
  if (type === 'postgres') {
    return 'bigserial primary key';
  }
  if (type === 'redshift') {
    return 'bigint identity(1,1) primary key';
  }
  if (type === 'mysql') {
    return 'bigint auto_increment primary key';
  }
  if (type === 'sqlite') {
    return 'integer primary key';
  }
  if (type === 'sqlserver') {
    return 'bigint identity(1,1) primary key';
  }
  if (type === 'oracle') {
    return 'number generated by default as identity primary key';
  }
  return 'number autoincrement primary key';
}

function timestampColumnSql(type: SqlGeneratingDatabaseType): string {
  if (type === 'sqlserver') {
    return 'datetime2 not null default sysdatetime()';
  }
  if (type === 'oracle') {
    return 'timestamp default systimestamp not null';
  }
  if (type === 'mysql') {
    return 'timestamp not null default current_timestamp';
  }
  if (type === 'sqlite') {
    return "text not null default current_timestamp";
  }
  if (type === 'snowflake') {
    return 'timestamp_ntz not null default current_timestamp()';
  }
  return 'timestamp not null default current_timestamp';
}

function defaultValuesInsertSql(type: SqlGeneratingDatabaseType, tableName: string): string {
  if (type === 'mysql') {
    return `insert into ${tableName} () values ();\n`;
  }
  if (type === 'oracle') {
    return `-- No writable columns were found. Oracle does not support a portable DEFAULT VALUES template for this table.\n`;
  }
  return `insert into ${tableName}\ndefault values;\n`;
}

function addColumnKeyword(type: SqlGeneratingDatabaseType): string {
  return type === 'sqlserver' || type === 'oracle' ? 'add' : 'add column';
}

function createViewSql(type: SqlGeneratingDatabaseType, schema: string, view: string, sourceTable: string): string {
  if (type === 'sqlserver') {
    return `create or alter view ${qualifiedSqlName(type, schema, view)} as\nselect *\nfrom ${qualifiedSqlName(type, schema, sourceTable)};\n`;
  }
  if (type === 'sqlite') {
    return `create view ${qualifiedSqlName(type, schema, view)} as\nselect *\nfrom ${qualifiedSqlName(type, schema, sourceTable)};\n`;
  }
  return `create or replace view ${qualifiedSqlName(type, schema, view)} as\nselect *\nfrom ${qualifiedSqlName(type, schema, sourceTable)};\n`;
}

function materializedViewSql(type: SqlGeneratingDatabaseType, schema: string, view: string, sourceTable: string): string {
  if (type === 'mysql' || type === 'sqlite' || type === 'sqlserver') {
    return unsupportedSql(type, 'Materialized views');
  }
  return `create materialized view ${qualifiedSqlName(type, schema, view)} as\nselect *\nfrom ${qualifiedSqlName(type, schema, sourceTable)};\n`;
}

function createSequenceSql(type: SqlGeneratingDatabaseType, schema: string, sequence: string): string {
  if (type === 'mysql' || type === 'sqlite' || type === 'redshift') {
    return unsupportedSql(type, 'Sequences');
  }
  return `create sequence ${qualifiedSqlName(type, schema, sequence)}\n  start with 1\n  increment by 1;\n`;
}

function supportsIfNotExists(type: SqlGeneratingDatabaseType): boolean {
  return type !== 'oracle' && type !== 'sqlserver';
}

function unsupportedSql(type: DatabaseType, feature: string): string {
  return `-- ${feature} is not supported by the ${type} SQL generator.\n`;
}
