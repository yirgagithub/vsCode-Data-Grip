import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConnectionConfigWithPassword } from '../src/types';

const mssqlMock = vi.hoisted(() => ({
  queries: [] as string[]
}));

vi.mock('mssql', () => {
  class ConnectionPool {
    constructor(public readonly config: Record<string, unknown>) {}
    connect = vi.fn(async () => this);
    close = vi.fn(async () => undefined);
    request = () => ({
      query: vi.fn(async (sql: string) => {
        mssqlMock.queries.push(sql);
        if (sql.includes('@@version')) {
          return { recordset: [{ version: 'Microsoft SQL Server 2022' }], rowsAffected: [0] };
        }
        if (sql.includes('information_schema.columns')) {
          return {
            recordset: [
              { schema: 'dbo', table: 'users', name: 'id', ordinal: 1, dataType: 'int', nullable: 'NO', defaultValue: null },
              { schema: 'dbo', table: 'users', name: 'name', ordinal: 2, dataType: 'nvarchar', nullable: 'YES', defaultValue: null }
            ],
            rowsAffected: [0]
          };
        }
        if (sql.includes('information_schema.tables')) {
          return { recordset: [{ schema: 'dbo', name: 'users', type: 'table' }], rowsAffected: [0] };
        }
        return { recordset: [{ ok: 1 }], rowsAffected: [1] };
      })
    });
  }
  return { ConnectionPool, default: { ConnectionPool } };
});

const oracleMock = vi.hoisted(() => ({
  queries: [] as string[]
}));

vi.mock('oracledb', () => {
  const connection = {
    execute: vi.fn(async (sql: string) => {
      oracleMock.queries.push(sql);
      if (sql.includes('v$version')) {
        return { rows: [{ VERSION: 'Oracle Database 23ai' }], metaData: [{ name: 'VERSION', dbTypeName: 'VARCHAR2' }] };
      }
      if (sql.includes('all_tab_columns')) {
        return {
          rows: [
            { SCHEMA: 'HR', TABLE: 'EMPLOYEES', NAME: 'ID', ORDINAL: 1, DATATYPE: 'NUMBER', NULLABLE: 'N', DEFAULTVALUE: null },
            { SCHEMA: 'HR', TABLE: 'EMPLOYEES', NAME: 'NAME', ORDINAL: 2, DATATYPE: 'VARCHAR2', NULLABLE: 'Y', DEFAULTVALUE: null }
          ],
          metaData: []
        };
      }
      return { rows: [{ OK: 1 }], metaData: [{ name: 'OK', dbTypeName: 'NUMBER' }] };
    }),
    close: vi.fn(async () => undefined)
  };
  const pool = {
    getConnection: vi.fn(async () => connection),
    close: vi.fn(async () => undefined)
  };
  const runtime = {
    OUT_FORMAT_OBJECT: 1,
    createPool: vi.fn(async () => pool)
  };
  return { ...runtime, default: runtime };
});

const redisMock = vi.hoisted(() => ({
  commands: [] as string[][]
}));

vi.mock('redis', () => {
  const client = {
    connect: vi.fn(async () => client),
    disconnect: vi.fn(async () => undefined),
    sendCommand: vi.fn(async (args: ReadonlyArray<string | Buffer>) => {
      const command = args.map(String);
      redisMock.commands.push(command);
      const name = command[0]?.toUpperCase();
      if (name === 'PING') {
        return 'PONG';
      }
      if (name === 'INFO') {
        return '# Server\r\nredis_version:7.2.0\r\n';
      }
      if (name === 'SCAN') {
        return ['0', ['user:1', 'hash:1']];
      }
      if (name === 'TYPE') {
        return command[1] === 'user:1' ? 'string' : 'hash';
      }
      if (name === 'TTL') {
        return 60;
      }
      if (name === 'STRLEN') {
        return 5;
      }
      if (name === 'GET') {
        return 'Ada';
      }
      return 'OK';
    })
  };
  const runtime = { createClient: vi.fn(() => client) };
  return { ...runtime, default: runtime };
});

const snowflakeMock = vi.hoisted(() => ({
  queries: [] as string[]
}));

vi.mock('snowflake-sdk', () => {
  const statement = {
    getColumns: () => [{ getName: () => 'VERSION', getType: () => 'TEXT' }],
    getNumRows: () => 1,
    getNumUpdatedRows: () => undefined
  };
  const connection = {
    connectAsync: vi.fn(async () => connection),
    destroy: vi.fn((callback: (error: unknown, connection: unknown) => void) => callback(undefined, connection)),
    execute: vi.fn((options: { sqlText: string; complete?: (error: unknown, statement: typeof statement, rows?: Record<string, unknown>[]) => void }) => {
      snowflakeMock.queries.push(options.sqlText);
      if (options.sqlText.includes('information_schema.columns')) {
        options.complete?.(undefined, statement, [
          { schema: 'PUBLIC', table: 'USERS', name: 'ID', ordinal: 1, dataType: 'NUMBER', nullable: 'NO', defaultValue: null }
        ]);
      } else if (options.sqlText.includes('current_version')) {
        options.complete?.(undefined, statement, [{ VERSION: '8.0' }]);
      } else {
        options.complete?.(undefined, statement, [{ VERSION: '8.0' }]);
      }
      return statement;
    })
  };
  const runtime = { createConnection: vi.fn(() => connection) };
  return { ...runtime, default: runtime };
});

import { SQLiteDriver } from '../src/database/drivers/sqliteDriver';
import { SqlServerDriver } from '../src/database/drivers/sqlServerDriver';
import { OracleDriver } from '../src/database/drivers/oracleDriver';
import { RedisDriver } from '../src/database/drivers/redisDriver';
import { SnowflakeDriver } from '../src/database/drivers/snowflakeDriver';

describe('additional database drivers', () => {
  beforeEach(() => {
    mssqlMock.queries.length = 0;
    oracleMock.queries.length = 0;
    redisMock.commands.length = 0;
    snowflakeMock.queries.length = 0;
  });

  it('executes and introspects SQLite databases', async () => {
    const driver = new SQLiteDriver();
    await driver.connect(config({ type: 'sqlite', database: ':memory:', username: '', port: 0 }));

    await driver.executeStatements({ connectionId: 'local', sql: '' }, [
      'create table users (id integer primary key, name text not null)',
      "insert into users (name) values ('Ada')"
    ]);
    const result = await driver.executeQuery({ connectionId: 'local', sql: 'select * from users' });
    const columns = await driver.getColumns('local', 'main', 'users');
    const ddl = await driver.getTableDDL('local', 'main', 'users');

    expect(result.rows).toEqual([{ id: 1, name: 'Ada' }]);
    expect(columns.map((column) => column.name)).toEqual(['id', 'name']);
    expect(ddl.toLowerCase()).toContain('create table users');
    await driver.disconnect('local');
  });

  it('executes SQL Server metadata paths', async () => {
    const driver = new SqlServerDriver();
    await driver.connect(config({ type: 'sqlserver', port: 1433, database: 'master' }));

    const tables = await driver.getTables('local', 'dbo');
    const ddl = await driver.getTableDDL('local', 'dbo', 'users');
    await driver.getTablePreview('local', 'dbo', 'users', 10, { orderBy: [{ column: 'name', direction: 'asc' }] });
    const previewSql = mssqlMock.queries.at(-1) ?? '';

    expect(tables[0]).toMatchObject({ schema: 'dbo', name: 'users' });
    expect(ddl).toContain('create table [dbo].[users]');
    expect(ddl).toContain('[id] int not null');
    expect(ddl).not.toContain('undefined');
    expect(previewSql).toContain('select top (11) * from [dbo].[users]');
    expect(previewSql).toContain('order by [name] asc');
    expect(previewSql).not.toContain('undefined');
  });

  it('normalizes Oracle metadata into DDL', async () => {
    const driver = new OracleDriver();
    await driver.connect(config({ type: 'oracle', port: 1521, database: 'ORCLPDB1' }));

    const ddl = await driver.getTableDDL('local', 'HR', 'EMPLOYEES');
    await driver.getTablePreview('local', 'HR', 'EMPLOYEES', 10, { orderBy: [{ column: 'ID', direction: 'desc' }] });
    const previewSql = oracleMock.queries.at(-1) ?? '';

    expect(ddl).toContain('"ID" NUMBER not null');
    expect(ddl).not.toContain('undefined');
    expect(previewSql).toContain('from "HR"."EMPLOYEES"');
    expect(previewSql).toContain('order by "ID" desc');
    expect(previewSql).toContain('offset 0 rows fetch next 11 rows only');
    expect(previewSql).not.toContain('undefined');
  });

  it('runs Redis commands and previews key-type views', async () => {
    const driver = new RedisDriver();
    await driver.connect(config({ type: 'redis', port: 6379, database: '4', username: '' }));

    const schemas = await driver.getSchemas('local');
    const info = await driver.executeQuery({ connectionId: 'local', sql: 'INFO server' });
    const preview = await driver.getTablePreview('local', 'db4', 'strings', 10);
    const ddl = await driver.getTableDDL('local', 'db4', 'strings');

    expect(schemas).toEqual([{ name: 'db4' }]);
    expect(info.rows).toContainEqual({ key: 'redis_version', value: '7.2.0' });
    expect(preview.rows).toEqual([{ key: 'user:1', type: 'string', ttl: 60, size: 5, value: 'Ada' }]);
    expect(ddl).toContain('Redis logical view: db4.strings');
    expect(ddl).not.toContain('undefined');
  });

  it('executes Snowflake queries and metadata lookups', async () => {
    const driver = new SnowflakeDriver();
    await driver.connect(config({ type: 'snowflake', host: 'acme.us-east-1.snowflakecomputing.com', port: 443, database: 'ANALYTICS', defaultSchema: 'PUBLIC' }));

    const result = await driver.executeQuery({ connectionId: 'local', sql: 'select current_version() as version' });
    const columns = await driver.getColumns('local', 'PUBLIC', 'USERS');
    const ddl = await driver.getTableDDL('local', 'PUBLIC', 'USERS');
    await driver.getTablePreview('local', 'PUBLIC', 'USERS', 10, { orderBy: [{ column: 'ID', direction: 'desc' }] });
    const previewSql = snowflakeMock.queries.at(-1) ?? '';

    expect(result.rows[0]).toEqual({ VERSION: '8.0' });
    expect(columns[0]).toMatchObject({ schema: 'PUBLIC', table: 'USERS', name: 'ID', dataType: 'NUMBER' });
    expect(ddl).toContain('create table "PUBLIC"."USERS"');
    expect(ddl).toContain('"ID" NUMBER not null');
    expect(ddl).not.toContain('undefined');
    expect(snowflakeMock.queries.at(-2)).toContain('information_schema.columns');
    expect(previewSql).toContain('from "PUBLIC"."USERS"');
    expect(previewSql).toContain('order by "ID" desc');
    expect(previewSql).toContain('limit 11');
    expect(previewSql).not.toContain('undefined');
  });
});

function config(overrides: Partial<ConnectionConfigWithPassword> = {}): ConnectionConfigWithPassword {
  return {
    id: 'local',
    name: 'Local',
    type: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    database: 'postgres',
    username: 'user',
    password: 'secret',
    sslMode: 'disable',
    color: 'green',
    ...overrides
  };
}
