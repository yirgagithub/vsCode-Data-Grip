import { describe, expect, it } from 'vitest';
import {
  addColumnSql,
  createPlaceholderViewSql,
  createSchemaSql,
  createTableSql,
  deleteTemplateSql,
  dropObjectSql,
  dropTableIfExistsSql,
  dropViewIfExistsSql,
  insertBatchSql,
  insertTemplateSql,
  NewObjectKind,
  newObjectSql,
  renameObjectSql,
  selectAllTableSql,
  selectTableSql,
  updateTemplateSql
} from '../src/services/sqlDialect';
import { ColumnInfo, DatabaseType } from '../src/types';

const supportedEngines: DatabaseType[] = ['postgres', 'redshift', 'mysql', 'sqlite', 'sqlserver', 'oracle', 'redis', 'snowflake'];
const sqlEngines = supportedEngines.filter((engine) => engine !== 'redis');
const newObjectKinds: NewObjectKind[] = ['table', 'view', 'materialized_view', 'column', 'index', 'unique_key', 'foreign_key', 'check', 'schema', 'sequence'];

const tableRefs: Record<Exclude<DatabaseType, 'redis'>, string> = {
  postgres: '"app"."users"',
  redshift: '"app"."users"',
  mysql: '`app`.`users`',
  sqlite: '"app"."users"',
  sqlserver: '[app].[users]',
  oracle: '"app"."users"',
  snowflake: '"app"."users"'
};

const columnTypes: Record<Exclude<DatabaseType, 'redis'>, string> = {
  postgres: 'text',
  redshift: 'varchar(255)',
  mysql: 'varchar(255)',
  sqlite: 'text',
  sqlserver: 'nvarchar(max)',
  oracle: 'varchar2(255)',
  snowflake: 'varchar'
};

describe('sql dialect helpers', () => {
  it('generates Redshift DDL without PostgreSQL-only identity syntax', () => {
    const sql = newObjectSql('redshift', 'table', 'public');

    expect(sql).toContain('"id" bigint identity(1,1) primary key');
    expect(sql).toContain('"created_at" timestamp not null default current_timestamp');
    expect(sql).not.toContain('bigserial');
  });

  it('generates database-specific SELECT limits', () => {
    expect(selectTableSql('sqlserver', 'dbo', 'users', 25)).toBe('select top (25) *\nfrom [dbo].[users];\n');
    expect(selectTableSql('oracle', 'APP', 'USERS', 25)).toBe('select *\nfrom "APP"."USERS"\nfetch first 25 rows only;\n');
    expect(selectTableSql('mysql', 'app', 'users', 25)).toBe('select *\nfrom `app`.`users`\nlimit 25;\n');
  });

  it('rejects SQL generation for Redis connections', () => {
    expect(() => selectTableSql('redis', '0', 'key')).toThrow('Redis');
  });

  it('fails fast when generated DDL would have an unknown column type', () => {
    expect(() => createTableSql('redshift', 'public', 'events', [
      { schema: 'public', table: 'events', name: 'event_time', ordinal: 1, dataType: '', nullable: false }
    ])).toThrow('Missing data type');
  });

  it.each(sqlEngines)('generates explicit SQL for every table operation on %s', (engine) => {
    const type = engine as Exclude<DatabaseType, 'redis'>;
    const columns = tableColumns(type);
    const statements = [
      createTableSql(type, 'app', 'users', columns),
      selectTableSql(type, 'app', 'users', 25),
      selectAllTableSql(type, 'app', 'users'),
      insertBatchSql(type, 'app', 'users', ['id', 'name', 'active'], [{ id: 1, name: 'Ada', active: true }]),
      insertTemplateSql(type, 'app', 'users', columns),
      updateTemplateSql(type, 'app', 'users'),
      deleteTemplateSql(type, 'app', 'users'),
      addColumnSql(type, 'app', 'users'),
      renameObjectSql(type, { kind: 'table', schema: 'app', name: 'users' }),
      renameObjectSql(type, { kind: 'view', schema: 'app', name: 'users_view' }),
      renameObjectSql(type, { kind: 'schema', schema: 'app', name: 'app' }),
      renameObjectSql(type, { kind: 'column', schema: 'app', name: 'users', column: 'name' }),
      dropObjectSql(type, { kind: 'table', schema: 'app', name: 'users' }),
      dropObjectSql(type, { kind: 'view', schema: 'app', name: 'users_view' }),
      dropObjectSql(type, { kind: 'schema', schema: 'app', name: 'app' }),
      dropObjectSql(type, { kind: 'column', schema: 'app', name: 'users', column: 'name' }),
      createSchemaSql(type, 'app', { ifNotExists: true }),
      dropTableIfExistsSql(type, 'app', 'users'),
      dropViewIfExistsSql(type, 'app', 'users_view'),
      createPlaceholderViewSql(type, 'app', 'users_view')
    ];

    for (const statement of statements) {
      expectExplicitSql(statement);
    }
    expect(statements.join('\n')).toContain(tableRefs[type]);

    const insertBatch = insertBatchSql(type, 'app', 'users', ['active'], [{ active: true }]);
    expect(insertBatch).toContain(type === 'sqlserver' || type === 'oracle' ? '(1)' : '(true)');
  });

  it.each(sqlEngines)('generates explicit new-object DDL templates on %s', (engine) => {
    const type = engine as Exclude<DatabaseType, 'redis'>;

    for (const kind of newObjectKinds) {
      expectExplicitSql(newObjectSql(type, kind, 'app', { schema: 'app', name: 'users' }));
    }
  });

  it.each(sqlEngines)('fails fast instead of emitting unknown column types on %s', (engine) => {
    expect(() => createTableSql(engine, 'app', 'users', [
      { schema: 'app', table: 'users', name: 'mystery', ordinal: 1, dataType: '', nullable: false }
    ])).toThrow('Missing data type');
  });

  it('rejects Redis for every SQL-generation helper', () => {
    const columns = tableColumns('postgres');
    const calls = [
      () => createTableSql('redis', 'db0', 'keys', columns),
      () => selectTableSql('redis', 'db0', 'keys'),
      () => selectAllTableSql('redis', 'db0', 'keys'),
      () => insertBatchSql('redis', 'db0', 'keys', ['key'], [{ key: 'user:1' }]),
      () => insertTemplateSql('redis', 'db0', 'keys', columns),
      () => updateTemplateSql('redis', 'db0', 'keys'),
      () => deleteTemplateSql('redis', 'db0', 'keys'),
      () => addColumnSql('redis', 'db0', 'keys'),
      () => newObjectSql('redis', 'table', 'db0'),
      () => renameObjectSql('redis', { kind: 'table', schema: 'db0', name: 'keys' }),
      () => dropObjectSql('redis', { kind: 'table', schema: 'db0', name: 'keys' }),
      () => createSchemaSql('redis', 'db0'),
      () => dropTableIfExistsSql('redis', 'db0', 'keys'),
      () => dropViewIfExistsSql('redis', 'db0', 'keys_view'),
      () => createPlaceholderViewSql('redis', 'db0', 'keys_view')
    ];

    for (const call of calls) {
      expect(call).toThrow('Redis');
    }
  });
});

function tableColumns(engine: Exclude<DatabaseType, 'redis'>): ColumnInfo[] {
  return [
    { schema: 'app', table: 'users', name: 'id', ordinal: 1, dataType: engine === 'oracle' ? 'number' : 'integer', nullable: false },
    { schema: 'app', table: 'users', name: 'name', ordinal: 2, dataType: columnTypes[engine], nullable: false },
    { schema: 'app', table: 'users', name: 'active', ordinal: 3, dataType: engine === 'sqlserver' ? 'bit' : 'boolean', nullable: true }
  ];
}

function expectExplicitSql(statement: string): void {
  expect(statement.trim()).not.toBe('');
  expect(statement).not.toMatch(/\bundefined\b/i);
  expect(statement).not.toMatch(/\bNaN\b/i);
  expect(statement).not.toContain('[object Object]');
}
