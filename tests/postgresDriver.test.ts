import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionConfigWithPassword } from '../src/types';

const pgMock = vi.hoisted(() => ({
  failSsl: false,
  queries: [] as Array<{ sql: unknown; params: unknown[] }>,
  pools: [] as Array<{
    config: { ssl?: unknown };
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('pg', () => {
  class Pool {
    query = vi.fn(async (sql: unknown, ...params: unknown[]) => {
      pgMock.queries.push({ sql, params });
      if (pgMock.failSsl && this.config.ssl) {
        throw new Error('The server does not support SSL connections');
      }
      return { rows: [{ version: 'PostgreSQL 16' }], fields: [], rowCount: 1 };
    });

    end = vi.fn(async () => undefined);

    constructor(public readonly config: { ssl?: unknown }) {
      pgMock.pools.push(this);
    }
  }

  return { Pool };
});

import { PostgresDriver } from '../src/database/drivers/postgresDriver';
import { RedshiftDriver } from '../src/database/drivers/redshiftDriver';

describe('PostgresDriver SSL mode', () => {
  beforeEach(() => {
    pgMock.failSsl = false;
    pgMock.queries.length = 0;
    pgMock.pools.length = 0;
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

describe('RedshiftDriver metadata', () => {
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
});

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
