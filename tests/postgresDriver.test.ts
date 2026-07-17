import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnInfo, ConnectionConfigWithPassword } from '../src/types';

const pgMock = vi.hoisted(() => ({
  failSsl: false,
  failDefinition: false,
  queries: [] as Array<{ sql: unknown; params: unknown[] }>,
  pools: [] as Array<{
    config: { ssl?: unknown; types?: { getTypeParser: (oid: number, format?: string) => (value: string) => unknown } };
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('pg', () => {
  const getTypeParser = vi.fn((oid: number, format?: string) => (value: string) => `parsed:${oid}:${format ?? 'text'}:${value}`);
  class Pool {
    query = vi.fn(async (sql: unknown, ...params: unknown[]) => {
      pgMock.queries.push({ sql, params });
      if (pgMock.failSsl && this.config.ssl) {
        throw new Error('The server does not support SSL connections');
      }
      if (pgMock.failDefinition && /pg_get_|pg_views|pg_proc|show table/i.test(String(sql))) {
        throw { message: 'catalog failed', code: 'XX001', password: 'secret' };
      }
      return respond(sql);
    });

    async connect() {
      return {
        query: this.query,
        release: vi.fn(async () => undefined)
      };
    }

    end = vi.fn(async () => undefined);

    constructor(public readonly config: { ssl?: unknown; types?: { getTypeParser: (oid: number, format?: string) => (value: string) => unknown } }) {
      pgMock.pools.push(this);
    }
  }

  return { Pool, types: { getTypeParser } };
});

import { PostgresDriver } from '../src/database/drivers/postgresDriver';
import { findSqlObjectReference } from '../src/services/sqlObjectReference';
import { resolveDatabaseObject } from '../src/services/databaseObjectMetadata';
import { RedshiftDriver } from '../src/database/drivers/redshiftDriver';

describe('PostgresDriver SSL mode', () => {
  beforeEach(() => {
    pgMock.failSsl = false;
    pgMock.failDefinition = false;
    pgMock.queries.length = 0;
    pgMock.pools.length = 0;
  });

  it('fetches temporal values as native text and delegates other types', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config());

    const registry = pgMock.pools[0].config.types!;
    for (const oid of [1082, 1083, 1114, 1184, 1186, 1266]) {
      expect(registry.getTypeParser(oid)('native temporal text')).toBe('native temporal text');
    }
    expect(registry.getTypeParser(23, 'binary')('42')).toBe('parsed:23:binary:42');
  });

  it('falls back to non-SSL when sslMode prefer hits a server without SSL support', async () => {
    pgMock.failSsl = true;
    const driver = new PostgresDriver();

    const connection = await driver.connect(config({ sslMode: 'prefer' }));

    expect(connection.id).toBe('local');
    expect(pgMock.pools).toHaveLength(2);
    expect(pgMock.pools[0].config.ssl).toEqual({ rejectUnauthorized: false });
    expect(pgMock.pools[0].end).toHaveBeenCalledTimes(1);
    expect(pgMock.pools[1].config.ssl).toBe(false);
  });

  it('does not downgrade SSL when sslMode require hits a server without SSL support', async () => {
    pgMock.failSsl = true;
    const driver = new PostgresDriver();

    await expect(driver.connect(config({ sslMode: 'require' }))).rejects.toThrow('does not support SSL');

    expect(pgMock.pools).toHaveLength(1);
    expect(pgMock.pools[0].config.ssl).toEqual({ rejectUnauthorized: false });
    expect(pgMock.pools[0].end).toHaveBeenCalledTimes(1);
  });
});

describe('PostgresDriver DDL generation', () => {
  it('returns native catalog definitions verbatim with bound object identity', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config());

    const definition = await driver.getObjectDefinition('local', { kind: 'view', schema: 'odd schema', name: 'active_users' });

    expect(definition).toBe('CREATE VIEW "odd schema"."active_users" AS\n SELECT * FROM users;\n');
    const query = pgMock.queries.find((entry) => String(entry.sql).includes('pg_get_viewdef'));
    expect(query?.params).toEqual([['odd schema', 'active_users']]);
  });

  it('uses native routine and trigger definition functions', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config());
    await expect(driver.getObjectDefinition('local', { kind: 'function', schema: 'public', name: 'f', signature: 'public.f(integer)' })).resolves.toBe('CREATE FUNCTION f(integer)\n');
    await expect(driver.getObjectDefinition('local', { kind: 'procedure', schema: 'public', name: 'p', signature: 'public.p(integer)' })).resolves.toBe('CREATE FUNCTION f(integer)\n');
    await expect(driver.getObjectDefinition('local', { kind: 'trigger', schema: 'public', name: 'users_trg' })).resolves.toBe('CREATE TRIGGER users_trg\n');
    expect(pgMock.queries.some((entry) => String(entry.sql).includes('pg_get_functiondef'))).toBe(true);
    expect(pgMock.queries.some((entry) => String(entry.sql).includes('pg_get_triggerdef'))).toBe(true);
  });

  it('enumerates stable routine identities and argument metadata', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config());
    await driver.getFunctions('local', 'public');
    const sql = String(pgMock.queries.at(-1)?.sql);
    expect(sql).toContain('pg_get_function_identity_arguments');
    expect(sql).toContain('signature');
    expect(sql).toContain('arguments');
  });

  it('resolves parsed overloaded calls through real driver routine metadata', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config());
    const functions = await driver.getFunctions('local', 'public');
    const sql = 'select lookup(1, 2)';
    const reference = findSqlObjectReference(sql, sql.indexOf('lookup') + 1)!;
    const metadata = { connectionId: 'local', schemaName: 'public', source: 'live', schemas: [], tables: [], views: [], functions, procedures: [], triggers: [], columns: {}, indexes: {}, keys: {}, foreignKeys: {}, status: 'ready' } as const;
    const result = await resolveDatabaseObject(reference, config(), {
      getCachedForConnection: async () => metadata,
      loadSchema: async () => metadata,
      getCachedColumns: async () => undefined,
      getColumns: async () => [], getPrimaryKeys: async () => [], getForeignKeys: async () => []
    });
    expect(result).toEqual(expect.objectContaining({ signature: 'public.lookup(integer, integer)' }));
  });

  it('covers Redshift supported and unsupported definition capabilities with sanitized errors', async () => {
    pgMock.failSsl = false;
    const driver = new RedshiftDriver();
    await driver.connect(config({ type: 'redshift', port: 5439 }));
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'public', name: 'v' })).resolves.toBe('CREATE VIEW v AS SELECT 1\n');
    await expect(driver.getObjectDefinition('local', { kind: 'function', schema: 'public', name: 'f' })).resolves.toBeUndefined();
    await expect(driver.getObjectDefinition('local', { kind: 'procedure', schema: 'public', name: 'p' })).resolves.toBeUndefined();
    await expect(driver.getObjectDefinition('local', { kind: 'table', schema: 'odd schema', name: 'sales"table' }))
      .resolves.toBe('CREATE TABLE "odd schema"."sales""table" (id integer);');
    expect(pgMock.queries.some((entry) => String(entry.sql) === 'show table "odd schema"."sales""table"')).toBe(true);
    await expect(driver.getObjectDefinition('local', { kind: 'trigger', schema: 'public', name: 'trg' })).resolves.toBeUndefined();
    pgMock.failDefinition = true;
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'public', name: 'v' })).rejects.toEqual({ message: 'catalog failed', code: 'XX001', detail: undefined, hint: undefined, position: undefined, where: undefined });
    pgMock.failDefinition = false;
  });

  it('sanitizes native catalog errors', async () => {
    pgMock.failDefinition = true;
    const driver = new PostgresDriver();
    await driver.connect(config());
    await expect(driver.getObjectDefinition('local', { kind: 'view', schema: 'public', name: 'v' }))
      .rejects.toEqual({ message: 'catalog failed', code: 'XX001', detail: undefined, hint: undefined, position: undefined, where: undefined });
    pgMock.failDefinition = false;
  });
  it('quotes column identifiers with the shared identifier rules', async () => {
    class DdlDriver extends PostgresDriver {
      override async getColumns(): Promise<ColumnInfo[]> {
        return [
          { schema: 'public', table: 'users', name: 'select', ordinal: 1, dataType: 'text', nullable: false },
          { schema: 'public', table: 'users', name: 'has"quote', ordinal: 2, dataType: 'integer', nullable: true }
        ];
      }
    }

    const ddl = await new DdlDriver().getTableDDL('local', 'public', 'users');

    expect(ddl).toContain('"select" text not null');
    expect(ddl).toContain('"has""quote" integer');
  });

  it('wraps paged selects with limit plus one and offset for fetch-more paging', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config({ sslMode: 'prefer' }));

    await driver.executeStatements(
      { connectionId: 'local', sql: 'select * from users', maxRows: 10, offset: 20 },
      ['select * from users']
    );

    expect(String(pgMock.queries.at(-1)?.sql)).toContain('limit 11 offset 20');
  });

  it('does not wrap writable CTE deletes with the client row limit', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config({ sslMode: 'prefer' }));
    const sql = `with stale_users as (
      select id from users where last_seen_at < now() - interval '1 year'
    )
    delete from users
    using stale_users
    where users.id = stale_users.id
    returning users.id`;

    await driver.executeStatements(
      { connectionId: 'local', sql, maxRows: 10, offset: 20 },
      [sql]
    );

    expect(pgMock.queries.at(-1)?.sql).toBe(sql);
  });
});

describe('PostgresDriver routine metadata', () => {
  beforeEach(() => {
    pgMock.failSsl = false;
    pgMock.queries.length = 0;
    pgMock.pools.length = 0;
  });

  it('queries routines and triggers from pg catalogs', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config({ sslMode: 'prefer' }));

    await driver.getFunctions('local', 'public');
    await driver.getProcedures('local', 'public');
    await driver.getTriggers('local', 'public');

    const queries = pgMock.queries.map((entry) => String(entry.sql));
    expect(queries.some((sql) => sql.includes('pg_proc') && sql.includes("prokind = 'f'"))).toBe(true);
    expect(queries.some((sql) => sql.includes('pg_proc') && sql.includes("prokind = 'p'"))).toBe(true);
    expect(queries.some((sql) => sql.includes('pg_trigger') && sql.includes('not t.tgisinternal'))).toBe(true);
  });
});

describe('PostgresDriver session monitor', () => {
  beforeEach(() => {
    pgMock.failSsl = false;
    pgMock.queries.length = 0;
    pgMock.pools.length = 0;
  });

  it('lists sessions and issues cancel or terminate commands', async () => {
    const driver = new PostgresDriver();
    await driver.connect(config({ sslMode: 'prefer' }));

    await driver.getActiveSessions('local');
    await driver.cancelSession('local', 123);
    await driver.terminateSession('local', 456);

    const queries = pgMock.queries.map((entry) => ({ sql: String(entry.sql), params: entry.params }));
    expect(queries.some((entry) => entry.sql.includes('pg_stat_activity'))).toBe(true);
    expect(queries.some((entry) => entry.sql.includes('pg_cancel_backend') && entry.params[0]?.[0] === 123)).toBe(true);
    expect(queries.some((entry) => entry.sql.includes('pg_terminate_backend') && entry.params[0]?.[0] === 456)).toBe(true);
  });
});

describe('RedshiftDriver metadata', () => {
  it('fetches temporal values through the per-pool parser registry', async () => {
    const driver = new RedshiftDriver();
    await driver.connect(config({ type: 'redshift', port: 5439 }));

    const registry = pgMock.pools[0].config.types!;
    expect(registry.getTypeParser(1184)('2026-07-17 15:30:00+02')).toBe('2026-07-17 15:30:00+02');
    expect(registry.getTypeParser(23)('42')).toBe('parsed:23:text:42');
  });

  beforeEach(() => {
    pgMock.failSsl = false;
    pgMock.queries.length = 0;
    pgMock.pools.length = 0;
  });

  it('uses Redshift catalog views for schema discovery and hides temporary schemas', async () => {
    const driver = new RedshiftDriver();
    await driver.connect(config({ type: 'redshift', port: 5439, sslMode: 'require' }));

    await driver.getSchemas('local');

    const sql = String(pgMock.queries.at(-1)?.sql);
    expect(sql).toContain('svv_all_schemas');
    expect(sql).toContain('pg_namespace');
    expect(sql).toContain("name not like 'pg_temp%'");
  });

  it('normalizes lower-case Redshift column metadata before generating DDL', async () => {
    const driver = new RedshiftDriver();
    await driver.connect(config({ type: 'redshift', port: 5439, sslMode: 'require' }));

    const ddl = await driver.getTableDDL('local', 'public', 'adjust_kpi_fact');

    expect(ddl).toContain('"date_dim_key" integer not null');
    expect(ddl).toContain('"event_revenue" numeric(18,2)');
    expect(ddl).not.toContain('undefined');
  });
});

function respond(sql: unknown) {
  const text = String(sql);
  if (text.includes("prokind = 'f'")) return { rows: [
    { schema: 'public', name: 'lookup', kind: 'function', signature: 'public.lookup(integer)', arguments: ['integer'] },
    { schema: 'public', name: 'lookup', kind: 'function', signature: 'public.lookup(integer, integer)', arguments: ['integer', 'integer'] }
  ], fields: [], rowCount: 2 };
  if (text.includes('pg_get_viewdef')) return { rows: [{ definition: ' SELECT * FROM users;\n' }], fields: [], rowCount: 1 };
  if (text.includes('pg_get_functiondef')) return { rows: [{ definition: 'CREATE FUNCTION f(integer)\n' }], fields: [], rowCount: 1 };
  if (text.includes('pg_get_triggerdef')) return { rows: [{ definition: 'CREATE TRIGGER users_trg\n' }], fields: [], rowCount: 1 };
  if (text.includes('pg_views')) return { rows: [{ definition: 'CREATE VIEW v AS SELECT 1\n' }], fields: [], rowCount: 1 };
  if (text.includes('pg_proc')) return { rows: [{ definition: 'return 1;\n' }], fields: [], rowCount: 1 };
  if (/^show table /i.test(text)) return { rows: [{ ddl: 'CREATE TABLE "odd schema"."sales""table" (id integer);' }], fields: [], rowCount: 1 };
  if (text.includes('information_schema.columns')) {
    return {
      rows: [
        {
          schema: 'public',
          table: 'adjust_kpi_fact',
          name: 'date_dim_key',
          ordinal: 1,
          datatype: 'integer',
          nullable: false,
          defaultvalue: null
        },
        {
          schema: 'public',
          table: 'adjust_kpi_fact',
          name: 'event_revenue',
          ordinal: 2,
          datatype: 'numeric(18,2)',
          nullable: true,
          defaultvalue: null
        }
      ],
      fields: [],
      rowCount: 2
    };
  }
  return { rows: [{ version: 'PostgreSQL 16' }], fields: [], rowCount: 1 };
}

function config(overrides: Partial<ConnectionConfigWithPassword> = {}): ConnectionConfigWithPassword {
  return {
    id: 'local',
    name: 'Local Postgres',
    type: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    database: 'aph',
    username: 'postgres',
    password: 'postgres',
    sslMode: overrides.sslMode ?? 'disable',
    color: 'green',
    ...overrides
  };
}
