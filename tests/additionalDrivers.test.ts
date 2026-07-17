import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConnectionConfigWithPassword } from '../src/types';

const mssqlMock = vi.hoisted(() => ({
  queries: [] as string[],
  failDefinition: false,
  valueHandler: new Map<unknown, (value: unknown) => unknown>()
}));

vi.mock('mssql', () => {
  const temporalTypes = {
    Date: Symbol('Date'),
    Time: Symbol('Time'),
    DateTime: Symbol('DateTime'),
    DateTime2: Symbol('DateTime2'),
    SmallDateTime: Symbol('SmallDateTime'),
    DateTimeOffset: Symbol('DateTimeOffset')
  };
  class ConnectionPool {
    constructor(public readonly config: Record<string, unknown>) {}
    connect = vi.fn(async () => this);
    close = vi.fn(async () => undefined);
    request = () => ({
      query: vi.fn(async (sql: string) => {
        mssqlMock.queries.push(sql);
        if (mssqlMock.failDefinition && sql.includes('OBJECT_DEFINITION')) throw { message: 'catalog failed', code: 'MSSQL', password: 'secret' };
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
        if (sql.includes('OBJECT_DEFINITION')) {
          return { recordset: [{ definition: 'CREATE VIEW [dbo].[active_users] AS\nSELECT 1\n' }], rowsAffected: [0] };
        }
        if (sql.includes('information_schema.tables')) {
          return { recordset: [{ schema: 'dbo', name: 'users', type: 'table' }], rowsAffected: [0] };
        }
        return { recordset: [{ ok: 1 }], rowsAffected: [1] };
      })
    });
  }
  const runtime = { ConnectionPool, valueHandler: mssqlMock.valueHandler, ...temporalTypes };
  return { ...runtime, default: runtime };
});

const oracleMock = vi.hoisted(() => ({
  queries: [] as string[],
  executeOptions: [] as Array<Record<string, unknown> | undefined>,
  failDefinition: false
}));

vi.mock('oracledb', () => {
  const connection = {
    execute: vi.fn(async (sql: string, _binds?: unknown[], options?: Record<string, unknown>) => {
      oracleMock.queries.push(sql);
      oracleMock.executeOptions.push(options);
      if (oracleMock.failDefinition && (sql.includes('all_source') || sql.includes('dbms_metadata'))) throw { message: 'catalog failed', code: 'ORA-00942', password: 'secret' };
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
      if (sql.includes('all_source')) {
        return { rows: [{ TEXT: 'PROCEDURE P AS\n' }, { TEXT: 'BEGIN\n' }, { TEXT: `${'x'.repeat(5000)}\n` }, { TEXT: 'END;\n' }], metaData: [] };
      }
      if (sql.includes('dbms_metadata.get_ddl')) {
        return { rows: [{ definition: 'CREATE VIEW "HR"."V" AS SELECT 1\n' }], metaData: [] };
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
    STRING: 'STRING',
    DB_TYPE_DATE: 'DB_TYPE_DATE',
    DB_TYPE_TIMESTAMP: 'DB_TYPE_TIMESTAMP',
    DB_TYPE_TIMESTAMP_TZ: 'DB_TYPE_TIMESTAMP_TZ',
    DB_TYPE_TIMESTAMP_LTZ: 'DB_TYPE_TIMESTAMP_LTZ',
    DB_TYPE_NUMBER: 'DB_TYPE_NUMBER',
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
  queries: [] as string[],
  executeOptions: [] as Array<Record<string, unknown>>,
  failDefinition: false
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
      snowflakeMock.executeOptions.push(options);
      if (snowflakeMock.failDefinition && options.sqlText.includes('GET_DDL')) {
        options.complete?.({ message: 'catalog failed', code: 'SF001', password: 'secret' }, statement);
        return statement;
      }
      if (options.sqlText.includes('information_schema.columns')) {
        options.complete?.(undefined, statement, [
          { schema: 'PUBLIC', table: 'USERS', name: 'ID', ordinal: 1, dataType: 'NUMBER', nullable: 'NO', defaultValue: null }
        ]);
      } else if (options.sqlText.includes('current_version')) {
        options.complete?.(undefined, statement, [{ VERSION: '8.0' }]);
      } else if (options.sqlText.includes('GET_DDL')) {
        options.complete?.(undefined, statement, [{ definition: 'CREATE OR REPLACE VIEW "PUBLIC"."V" AS SELECT 1\n' }]);
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
    mssqlMock.failDefinition = false;
    mssqlMock.valueHandler.clear();
    oracleMock.queries.length = 0;
    oracleMock.executeOptions.length = 0;
    oracleMock.failDefinition = false;
    redisMock.commands.length = 0;
    snowflakeMock.queries.length = 0;
    snowflakeMock.executeOptions.length = 0;
    snowflakeMock.failDefinition = false;
  });

  it('executes and introspects SQLite databases', async () => {
    const driver = new SQLiteDriver();
    await driver.connect(config({ type: 'sqlite', database: ':memory:', username: '', port: 0 }));

    await driver.executeStatements({ connectionId: 'local', sql: '' }, [
      'create table users (id integer primary key, name text not null)',
      'create view active_users as select * from users',
      'create trigger users_trg after insert on users begin update users set name = name; end',
      "insert into users (name) values ('Ada')"
    ]);
    const result = await driver.executeQuery({ connectionId: 'local', sql: 'select * from users' });
    const columns = await driver.getColumns('local', 'main', 'users');
    const ddl = await driver.getTableDDL('local', 'main', 'users');

    expect(result.rows).toEqual([{ id: 1, name: 'Ada' }]);
    expect(columns.map((column) => column.name)).toEqual(['id', 'name']);
    expect(ddl.toLowerCase()).toContain('create table users');
    await expect(driver.getTriggers('local', 'main')).resolves.toEqual([
      { schema: 'main', table: 'users', name: 'users_trg' }
    ]);
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'main', name: 'active_users' })).resolves.toBe('CREATE VIEW active_users as select * from users');
    await expect(driver.getObjectDefinition('local', { kind: 'trigger', schema: 'main', name: 'users_trg' })).resolves.toContain('CREATE TRIGGER users_trg');
    await expect(driver.getObjectDefinition('local', { kind: 'function', schema: 'main', name: 'f' })).resolves.toBeUndefined();
    await expect(driver.getObjectDefinition('local', { kind: 'procedure', schema: 'main', name: 'p' })).resolves.toBeUndefined();
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'missing schema', name: 'v' })).rejects.toEqual(expect.objectContaining({ message: expect.any(String), code: 'SQLITE_ERROR' }));
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
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'dbo', name: 'active_users' })).resolves.toBe('CREATE VIEW [dbo].[active_users] AS\nSELECT 1\n');
    for (const kind of ['function', 'procedure', 'trigger'] as const) {
      await expect(driver.getObjectDefinition('local', { kind, schema: 'dbo', name: 'thing' })).resolves.toBe('CREATE VIEW [dbo].[active_users] AS\nSELECT 1\n');
    }
    await driver.getObjectDefinition('local', { kind: 'view', schema: 'odd.schema', name: 'na]me' });
    expect(mssqlMock.queries.at(-1)).toContain("OBJECT_ID(N'[odd.schema].[na]]me]')");
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
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'HR', name: 'V' })).resolves.toBe('CREATE VIEW "HR"."V" AS SELECT 1\n');
    await expect(driver.getObjectDefinition('local', { kind: 'table', schema: 'HR', name: 'T' })).resolves.toBe('CREATE VIEW "HR"."V" AS SELECT 1\n');
    await expect(driver.getObjectDefinition('local', { kind: 'function', schema: 'HR', name: 'F' })).resolves.toBe(`PROCEDURE P AS\nBEGIN\n${'x'.repeat(5000)}\nEND;\n`);
    await expect(driver.getObjectDefinition('local', { kind: 'procedure', schema: 'HR', name: 'P' })).resolves.toBe(`PROCEDURE P AS\nBEGIN\n${'x'.repeat(5000)}\nEND;\n`);
    await expect(driver.getObjectDefinition('local', { kind: 'trigger', schema: 'HR', name: 'TRG' })).resolves.toBe(`PROCEDURE P AS\nBEGIN\n${'x'.repeat(5000)}\nEND;\n`);
    expect(oracleMock.queries.at(-1)).toContain('order by line');
  });

  it('registers SQL Server temporal handlers without changing numeric results', async () => {
    const mssql = await import('mssql');
    const foreignTemporalHandler = (value: unknown) => value;
    const nonTemporalType = Symbol('Int');
    const nonTemporalHandler = (value: unknown) => value;
    mssqlMock.valueHandler.set(mssql.Date, foreignTemporalHandler);
    mssqlMock.valueHandler.set(nonTemporalType, nonTemporalHandler);
    const driver = new SqlServerDriver();
    await driver.connect(config({ type: 'sqlserver', port: 1433, database: 'master' }));

    for (const type of [mssql.Date, mssql.Time, mssql.DateTime, mssql.DateTime2, mssql.SmallDateTime, mssql.DateTimeOffset]) {
      expect(mssqlMock.valueHandler.has(type)).toBe(true);
    }
    expect(mssqlMock.valueHandler.get(mssql.Date)).not.toBe(foreignTemporalHandler);
    expect(mssqlMock.valueHandler.get(nonTemporalType)).toBe(nonTemporalHandler);
    const handlers = new Map(mssqlMock.valueHandler);
    await driver.connect(config({ type: 'sqlserver', port: 1433, database: 'master' }));
    for (const [type, handler] of handlers) {
      expect(mssqlMock.valueHandler.get(type)).toBe(handler);
    }
    const result = await driver.executeQuery({ connectionId: 'local', sql: 'select 1 as ok' });
    expect(result.rows).toEqual([{ ok: 1 }]);
  });

  it('fetches Oracle temporal result columns as strings without changing other types', async () => {
    const driver = new OracleDriver();
    await driver.connect(config({ type: 'oracle', port: 1521, database: 'ORCLPDB1' }));
    const result = await driver.executeQuery({ connectionId: 'local', sql: 'select * from temporal_values' });

    const options = oracleMock.executeOptions.at(-1);
    const fetchTypeHandler = options?.fetchTypeHandler as ((metadata: { dbType: string }) => { type: string } | undefined) | undefined;

    expect(fetchTypeHandler).toBeTypeOf('function');
    for (const dbType of ['DB_TYPE_DATE', 'DB_TYPE_TIMESTAMP', 'DB_TYPE_TIMESTAMP_TZ', 'DB_TYPE_TIMESTAMP_LTZ']) {
      expect(fetchTypeHandler?.({ dbType })).toEqual({ type: 'STRING' });
    }
    expect(fetchTypeHandler?.({ dbType: 'DB_TYPE_NUMBER' })).toBeUndefined();
    expect(result.rows).toEqual([{ OK: 1 }]);
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
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'PUBLIC', name: 'V' })).resolves.toBe('CREATE OR REPLACE VIEW "PUBLIC"."V" AS SELECT 1\n');
    for (const kind of ['table', 'function', 'procedure'] as const) {
      await expect(driver.getObjectDefinition('local', { kind, schema: 'PUBLIC', name: 'THING' })).resolves.toBe('CREATE OR REPLACE VIEW "PUBLIC"."V" AS SELECT 1\n');
    }
    await expect(driver.getObjectDefinition('local', { kind: 'trigger', schema: 'PUBLIC', name: 'T' })).resolves.toBeUndefined();
  });

  it('fetches Snowflake date values as strings', async () => {
    const driver = new SnowflakeDriver();
    await driver.connect(config({ type: 'snowflake', host: 'acme.snowflakecomputing.com', port: 443, database: 'DB' }));
    const result = await driver.executeQuery({ connectionId: 'local', sql: 'select * from temporal_values' });

    expect(snowflakeMock.executeOptions.at(-1)?.fetchAsString).toEqual(['Date']);
    expect(result.rows).toEqual([{ VERSION: '8.0' }]);
  });

  it('sanitizes direct catalog failures', async () => {
    const sqlServer = new SqlServerDriver();
    await sqlServer.connect(config({ type: 'sqlserver', port: 1433, database: 'master' }));
    mssqlMock.failDefinition = true;
    await expect(sqlServer.getObjectDefinition('local', { kind: 'view', schema: 'dbo', name: 'v' })).rejects.toEqual(expect.objectContaining({ message: 'catalog failed', code: 'MSSQL' }));

    const oracle = new OracleDriver();
    await oracle.connect(config({ type: 'oracle', port: 1521, database: 'ORCLPDB1' }));
    oracleMock.failDefinition = true;
    await expect(oracle.getObjectDefinition('local', { kind: 'view', schema: 'HR', name: 'V' })).rejects.toEqual(expect.objectContaining({ message: 'catalog failed', code: 'ORA-00942' }));

    const snowflake = new SnowflakeDriver();
    await snowflake.connect(config({ type: 'snowflake', host: 'acme.snowflakecomputing.com', port: 443, database: 'DB' }));
    snowflakeMock.failDefinition = true;
    await expect(snowflake.getObjectDefinition('local', { kind: 'view', schema: 'PUBLIC', name: 'V' })).rejects.toEqual(expect.objectContaining({ message: 'catalog failed', code: 'SF001' }));
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
