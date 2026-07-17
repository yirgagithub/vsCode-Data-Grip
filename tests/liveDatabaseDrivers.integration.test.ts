import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { MySQLDriver } from '../src/database/drivers/mysqlDriver';
import { OracleDriver } from '../src/database/drivers/oracleDriver';
import { PostgresDriver } from '../src/database/drivers/postgresDriver';
import { RedisDriver } from '../src/database/drivers/redisDriver';
import { SQLiteDriver } from '../src/database/drivers/sqliteDriver';
import { SqlServerDriver } from '../src/database/drivers/sqlServerDriver';
import type { DatabaseDriver } from '../src/database/drivers/DatabaseDriver';
import type { ConnectionConfigWithPassword, DatabaseType } from '../src/types';

const liveDatabaseEngines = ['postgres', 'mysql', 'redis', 'sqlserver', 'oracle', 'sqlite'] as const;
type LiveDatabaseEngine = typeof liveDatabaseEngines[number];

const liveTestsRequested = process.env.LIVE_DATABASE_TESTS === 'true' || process.env.npm_lifecycle_event === 'test:live';
const requestedEngine = process.env.LIVE_DATABASE_ENGINE?.trim() as LiveDatabaseEngine | 'all' | undefined;

if (liveTestsRequested && requestedEngine && requestedEngine !== 'all' && !liveDatabaseEngines.includes(requestedEngine as LiveDatabaseEngine)) {
  throw new Error(`Unknown LIVE_DATABASE_ENGINE "${requestedEngine}". Expected one of: ${liveDatabaseEngines.join(', ')}, all.`);
}

const run = liveTestsRequested ? describe : describe.skip;

run('live database drivers', () => {
  engineTest('postgres', 'executes and introspects PostgreSQL through the real driver', async () => {
    const driver = new PostgresDriver();
    const config = connection('postgres', {
      database: env('LIVE_POSTGRES_DATABASE', 'vscode_data_grip'),
      password: env('LIVE_POSTGRES_PASSWORD', 'postgres'),
      port: numberEnv('LIVE_POSTGRES_PORT', 5432),
      username: env('LIVE_POSTGRES_USER', 'postgres'),
      defaultSchema: 'public'
    });
    const table = 'vscode_data_grip_live_postgres';

    await waitForReady(driver, config, 'PostgreSQL');
    try {
      await driver.executeStatements(params(config), [
        `drop table if exists public.${table}`,
        `create table public.${table} (id integer primary key, name text not null)`,
        `insert into public.${table} (id, name) values (1, 'Ada')`
      ]);

      const result = await driver.executeQuery({ connectionId: config.id, sql: `select name from public.${table} where id = 1` });
      expectValue(result.rows, 'name', 'Ada');
      expectTemporalStrings((await driver.executeQuery({
        connectionId: config.id,
        sql: "select date '2025-11-09' as date_value, time '14:23:45.123456' as time_value, timestamp '2025-11-09 14:23:45.123456' as timestamp_value, timestamptz '2025-11-09 14:23:45.123456+05:30' as timestamp_tz_value"
      })).rows, { date_value: '2025-11-09', time_value: '14:23:45.123456' });
      expectName(await driver.getSchemas(config.id), 'public');
      expectName(await driver.getTables(config.id, 'public'), table);
      expectColumnNames(await driver.getColumns(config.id, 'public', table), ['id', 'name']);
      expectValue((await driver.getTablePreview(config.id, 'public', table, 10)).rows, 'name', 'Ada');
    } finally {
      await driver.disconnect(config.id);
    }
  });

  engineTest('mysql', 'executes and introspects MySQL through the real driver', async () => {
    const driver = new MySQLDriver();
    const config = connection('mysql', {
      database: env('LIVE_MYSQL_DATABASE', 'vscode_data_grip'),
      password: env('LIVE_MYSQL_PASSWORD', 'mysql'),
      port: numberEnv('LIVE_MYSQL_PORT', 3306),
      username: env('LIVE_MYSQL_USER', 'root'),
      defaultSchema: env('LIVE_MYSQL_DATABASE', 'vscode_data_grip')
    });
    const table = 'vscode_data_grip_live_mysql';

    await waitForReady(driver, config, 'MySQL');
    try {
      await driver.executeStatements(params(config), [
        `drop table if exists \`${table}\``,
        `create table \`${table}\` (id integer primary key, name varchar(64) not null)`,
        `insert into \`${table}\` (id, name) values (1, 'Ada')`
      ]);

      const result = await driver.executeQuery({ connectionId: config.id, sql: `select name from \`${table}\` where id = 1` });
      expectValue(result.rows, 'name', 'Ada');
      expectTemporalStrings((await driver.executeQuery({
        connectionId: config.id,
        sql: "select cast('2025-11-09' as date) as date_value, cast('14:23:45.123456' as time(6)) as time_value, cast('2025-11-09 14:23:45.123456' as datetime(6)) as timestamp_value"
      })).rows, { date_value: '2025-11-09', time_value: '14:23:45.123456' });
      expectName(await driver.getSchemas(config.id), config.database);
      expectName(await driver.getTables(config.id, config.database), table);
      expectColumnNames(await driver.getColumns(config.id, config.database, table), ['id', 'name']);
      expectValue((await driver.getTablePreview(config.id, config.database, table, 10)).rows, 'name', 'Ada');
    } finally {
      await driver.disconnect(config.id);
    }
  });

  engineTest('redis', 'executes Redis commands and previews live keys through the real driver', async () => {
    const driver = new RedisDriver();
    const config = connection('redis', {
      database: env('LIVE_REDIS_DATABASE', '0'),
      password: process.env.LIVE_REDIS_PASSWORD,
      port: numberEnv('LIVE_REDIS_PORT', 6379),
      username: env('LIVE_REDIS_USER', ''),
      defaultSchema: 'db0'
    });

    await waitForReady(driver, config, 'Redis');
    try {
      await driver.executeStatements(params(config), [
        'FLUSHDB',
        'SET vdg:live:string Ada',
        'SET vdg:live:temporal 2025-11-09T14:23:45.123456+05:30',
        'HSET vdg:live:hash name Ada'
      ]);

      const result = await driver.executeQuery({ connectionId: config.id, sql: 'GET vdg:live:string' });
      expectValue(result.rows, 'value', 'Ada');
      expectTemporalStrings((await driver.executeQuery({ connectionId: config.id, sql: 'GET vdg:live:temporal' })).rows, {
        value: '2025-11-09T14:23:45.123456+05:30'
      });
      expectName(await driver.getSchemas(config.id), `db${config.database}`);
      expectName(await driver.getTables(config.id, `db${config.database}`), 'strings');
      expectColumnNames(await driver.getColumns(config.id, `db${config.database}`, 'strings'), ['key', 'type', 'ttl', 'size', 'value']);
      const preview = await driver.getTablePreview(config.id, `db${config.database}`, 'strings', 10, { where: 'vdg:live:*' });
      expectValue(preview.rows, 'key', 'vdg:live:string');
      expectValue(preview.rows, 'value', 'Ada');
    } finally {
      await driver.disconnect(config.id);
    }
  });

  engineTest('sqlserver', 'executes and introspects SQL Server through the real driver', async () => {
    const driver = new SqlServerDriver();
    const config = connection('sqlserver', {
      database: env('LIVE_SQLSERVER_DATABASE', 'master'),
      password: env('LIVE_SQLSERVER_PASSWORD', 'YourStrong!Passw0rd'),
      port: numberEnv('LIVE_SQLSERVER_PORT', 1433),
      username: env('LIVE_SQLSERVER_USER', 'sa'),
      defaultSchema: 'dbo'
    });
    const table = 'vscode_data_grip_live_sqlserver';

    await waitForReady(driver, config, 'SQL Server');
    try {
      await driver.executeStatements(params(config), [
        `if object_id('dbo.${table}', 'U') is not null drop table dbo.${table}`,
        `create table dbo.${table} (id int primary key, name nvarchar(64) not null)`,
        `insert into dbo.${table} (id, name) values (1, 'Ada')`
      ]);

      const result = await driver.executeQuery({ connectionId: config.id, sql: `select name from dbo.${table} where id = 1` });
      expectValue(result.rows, 'name', 'Ada');
      expectTemporalStrings((await driver.executeQuery({
        connectionId: config.id,
        sql: "select cast('2025-11-09' as date) as date_value, cast('14:23:45.123456' as time(6)) as time_value, cast('2025-11-09 14:23:45.123456' as datetime2(6)) as timestamp_value, cast('2025-11-09T14:23:45.123456+05:30' as datetimeoffset(6)) as timestamp_tz_value"
      })).rows, {
        date_value: '2025-11-09',
        timestamp_tz_value: '2025-11-09T08:53:45.123Z'
      });
      expectName(await driver.getSchemas(config.id), 'dbo');
      expectName(await driver.getTables(config.id, 'dbo'), table);
      expectColumnNames(await driver.getColumns(config.id, 'dbo', table), ['id', 'name']);
      expectValue((await driver.getTablePreview(config.id, 'dbo', table, 10)).rows, 'name', 'Ada');
    } finally {
      await driver.disconnect(config.id);
    }
  }, 360_000);

  engineTest('oracle', 'executes and introspects Oracle through the real driver', async () => {
    const driver = new OracleDriver();
    const config = connection('oracle', {
      database: env('LIVE_ORACLE_DATABASE', 'FREEPDB1'),
      password: env('LIVE_ORACLE_PASSWORD', 'oracle'),
      port: numberEnv('LIVE_ORACLE_PORT', 1521),
      username: env('LIVE_ORACLE_USER', 'app'),
      defaultSchema: env('LIVE_ORACLE_USER', 'app').toUpperCase()
    });
    const table = 'VDG_LIVE_ORACLE';

    await waitForReady(driver, config, 'Oracle', 420_000);
    try {
      await driver.executeStatements(params(config), [
        `begin
           execute immediate 'drop table ${table} purge';
         exception
           when others then
             if sqlcode != -942 then
               raise;
             end if;
         end;`,
        `create table ${table} (ID number primary key, NAME varchar2(64) not null)`,
        `insert into ${table} (ID, NAME) values (1, 'Ada')`
      ]);

      const result = await driver.executeQuery({ connectionId: config.id, sql: `select NAME as "name" from ${table} where ID = 1` });
      expectValue(result.rows, 'name', 'Ada');
      const temporalResults = await driver.executeStatements(params(config), [
        "alter session set time_zone = 'UTC'",
        "select to_date('2025-11-09', 'YYYY-MM-DD') as date_value, to_timestamp('2025-11-09 14:23:45.123456', 'YYYY-MM-DD HH24:MI:SS.FF6') as timestamp_value, to_timestamp_tz('2025-11-09 14:23:45.123456 +05:30', 'YYYY-MM-DD HH24:MI:SS.FF6 TZH:TZM') as timestamp_tz_value, cast(to_timestamp('2025-11-09 14:23:45.123456', 'YYYY-MM-DD HH24:MI:SS.FF6') as timestamp with local time zone) as timestamp_ltz_value from dual"
      ]);
      expectTemporalStrings(temporalResults.at(-1)?.rows ?? [], {
        date_value: '2025-11-09T00:00:00.000Z',
        timestamp_value: '2025-11-09T14:23:45.123Z',
        timestamp_tz_value: '2025-11-09T08:53:45.123Z',
        timestamp_ltz_value: '2025-11-09T14:23:45.123Z'
      });
      expectName(await driver.getSchemas(config.id), config.defaultSchema ?? config.username);
      expectName(await driver.getTables(config.id, config.defaultSchema ?? config.username), table);
      expectColumnNames(await driver.getColumns(config.id, config.defaultSchema ?? config.username, table), ['ID', 'NAME']);
      expectValue((await driver.getTablePreview(config.id, config.defaultSchema ?? config.username, table, 10)).rows, 'NAME', 'Ada');
    } finally {
      await driver.disconnect(config.id);
    }
  }, 480_000);

  engineTest('sqlite', 'executes and introspects SQLite through the real driver', async () => {
    const driver = new SQLiteDriver();
    const database = join(tmpdir(), `querydeck-live-${randomUUID()}.sqlite`);
    const config = connection('sqlite', {
      database,
      host: '',
      port: 0,
      username: '',
      password: undefined,
      defaultSchema: 'main'
    });
    const table = 'vscode_data_grip_live_sqlite';

    await waitForReady(driver, config, 'SQLite');
    try {
      await driver.executeStatements(params(config), [
        `drop table if exists ${table}`,
        `create table ${table} (id integer primary key, name text not null)`,
        `create trigger ${table}_trigger after insert on ${table} begin update ${table} set name = name where id = new.id; end`,
        `insert into ${table} (id, name) values (1, 'Ada')`
      ]);

      const result = await driver.executeQuery({ connectionId: config.id, sql: `select name from ${table} where id = 1` });
      expectValue(result.rows, 'name', 'Ada');
      expectTemporalStrings((await driver.executeQuery({
        connectionId: config.id,
        sql: "select '2025-11-09' as date_value, '14:23:45.123456' as time_value, '2025-11-09 14:23:45.123456' as timestamp_value, '2025-11-09T14:23:45.123456+05:30' as timestamp_tz_value"
      })).rows, {
        date_value: '2025-11-09',
        timestamp_tz_value: '2025-11-09T14:23:45.123456+05:30'
      });
      expectName(await driver.getSchemas(config.id), 'main');
      expectName(await driver.getTables(config.id, 'main'), table);
      expectColumnNames(await driver.getColumns(config.id, 'main', table), ['id', 'name']);
      expectValue((await driver.getTablePreview(config.id, 'main', table, 10)).rows, 'name', 'Ada');
      expectName(await driver.getTriggers(config.id, 'main'), `${table}_trigger`);
      await expect(driver.getObjectDefinition(config.id, { kind: 'table', schema: 'main', name: table }))
        .resolves.toBe(`CREATE TABLE ${table} (id integer primary key, name text not null)`);
      await expect(driver.getObjectDefinition(config.id, { kind: 'trigger', schema: 'main', name: `${table}_trigger` }))
        .resolves.toBe(`CREATE TRIGGER ${table}_trigger after insert on ${table} begin update ${table} set name = name where id = new.id; end`);
    } finally {
      await driver.disconnect(config.id);
      if (existsSync(database)) {
        unlinkSync(database);
      }
    }
  });
});

function engineTest(engine: LiveDatabaseEngine, name: string, fn: () => Promise<void>, timeout = 300_000): void {
  const enabled = !requestedEngine || requestedEngine === 'all' || requestedEngine === engine;
  (enabled ? it : it.skip)(name, fn, timeout);
}

async function waitForReady(driver: DatabaseDriver, config: ConnectionConfigWithPassword, label: string, timeoutMs = 300_000): Promise<void> {
  await eventually(`${label} container`, async () => {
    const probeConfig = { ...config, id: `${config.id}-probe` };
    try {
      const result = await driver.testConnection(probeConfig);
      if (!result.ok) {
        throw new Error(result.message);
      }
    } finally {
      await driver.disconnect(probeConfig.id).catch(() => undefined);
    }
  }, timeoutMs);
  await driver.connect(config);
}

async function eventually(label: string, action: () => Promise<void>, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      await action();
      return;
    } catch (error) {
      lastError = error;
      await sleep(3_000);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} was not ready after ${Math.round(timeoutMs / 1000)}s: ${message}`);
}

function connection(type: DatabaseType, overrides: Partial<ConnectionConfigWithPassword>): ConnectionConfigWithPassword {
  return {
    id: `live-${type}`,
    name: `Live ${type}`,
    type,
    host: env(`LIVE_${type.toUpperCase()}_HOST`, '127.0.0.1'),
    port: 0,
    database: '',
    username: '',
    sslMode: 'disable',
    color: 'green',
    connectTimeoutMs: numberEnv('LIVE_DATABASE_CONNECT_TIMEOUT_MS', 5_000),
    queryTimeoutMs: numberEnv('LIVE_DATABASE_QUERY_TIMEOUT_MS', 30_000),
    ...overrides
  };
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, received "${value}".`);
  }
  return parsed;
}

function params(config: ConnectionConfigWithPassword): { connectionId: string; sql: string } {
  return { connectionId: config.id, sql: '' };
}

function expectName(items: Array<{ name: string }>, expected: string): void {
  expect(items.map((item) => item.name.toLowerCase())).toContain(expected.toLowerCase());
}

function expectColumnNames(items: Array<{ name: string }>, expected: string[]): void {
  const names = items.map((item) => item.name.toLowerCase());
  for (const name of expected) {
    expect(names).toContain(name.toLowerCase());
  }
}

function expectValue(rows: Record<string, unknown>[], column: string, expected: unknown): void {
  expect(rows.map((row) => valueAt(row, column))).toContain(expected);
}

function expectTemporalStrings(rows: Record<string, unknown>[], expected: Record<string, string>): void {
  expect(rows).toHaveLength(1);
  expect(Object.values(rows[0]).length).toBeGreaterThan(0);
  for (const value of Object.values(rows[0])) {
    expect(typeof value).toBe('string');
  }
  for (const [column, value] of Object.entries(expected)) {
    expect(valueAt(rows[0], column)).toBe(value);
  }
}

function valueAt(row: Record<string, unknown>, column: string): unknown {
  return row[column] ?? row[column.toLowerCase()] ?? row[column.toUpperCase()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
