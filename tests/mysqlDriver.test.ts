import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionConfigWithPassword } from '../src/types';

const mysqlMock = vi.hoisted(() => ({
  failSsl: false,
  queries: [] as Array<{ sql: unknown; params: unknown[] }>,
  pools: [] as Array<{
    config: { ssl?: unknown };
    query: ReturnType<typeof vi.fn>;
    getConnection: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('mysql2/promise', () => {
  class MockConnection {
    readonly threadId = 321;
    query = vi.fn(async (sql: unknown, ...params: unknown[]) => {
      mysqlMock.queries.push({ sql, params });
      return respond(sql, this.config, params);
    });
    release = vi.fn(async () => undefined);

    constructor(private readonly config: { ssl?: unknown }) {}
  }

  class Pool {
    query = vi.fn(async (sql: unknown, ...params: unknown[]) => {
      mysqlMock.queries.push({ sql, params });
      if (mysqlMock.failSsl && this.config.ssl) {
        throw new Error('SSL connection error');
      }
      return respond(sql, this.config, params);
    });

    getConnection = vi.fn(async () => new MockConnection(this.config));
    end = vi.fn(async () => undefined);

    constructor(public readonly config: { ssl?: unknown }) {
      mysqlMock.pools.push(this);
    }
  }

  return {
    default: { createPool: (config: { ssl?: unknown }) => new Pool(config) },
    createPool: (config: { ssl?: unknown }) => new Pool(config)
  };
});

import { MySQLDriver } from '../src/database/drivers/mysqlDriver';

describe('MySQLDriver', () => {
  beforeEach(() => {
    mysqlMock.failSsl = false;
    mysqlMock.queries.length = 0;
    mysqlMock.pools.length = 0;
  });

  it('falls back from prefer SSL to plain connections when needed', async () => {
    mysqlMock.failSsl = true;
    const driver = new MySQLDriver();

    await driver.connect(config({ sslMode: 'prefer' }));

    expect(mysqlMock.pools).toHaveLength(2);
    expect(mysqlMock.pools[0].config.ssl).toEqual({ rejectUnauthorized: false });
    expect(mysqlMock.pools[1].config.ssl).toBeUndefined();
  });

  it('reads schemas, tables, columns, and sessions', async () => {
    const driver = new MySQLDriver();
    await driver.connect(config());

    await driver.getSchemas('local');
    await driver.getTables('local', 'public');
    await driver.getColumns('local', 'public', 'users');
    await driver.getActiveSessions('local');
    const ddl = await driver.getTableDDL('local', 'public', 'users');

    const queries = mysqlMock.queries.map((entry) => String(entry.sql));
    expect(queries.some((sql) => sql.includes('information_schema.schemata'))).toBe(true);
    expect(queries.some((sql) => sql.includes('information_schema.tables'))).toBe(true);
    expect(queries.some((sql) => sql.includes('information_schema.columns'))).toBe(true);
    expect(queries.some((sql) => sql.includes('show full processlist'))).toBe(true);
    expect(ddl).toContain('create table `public`.`users`');
    expect(ddl).toContain('`id` int');
  });

  it('wraps pageable selects with limit plus one', async () => {
    const driver = new MySQLDriver();
    await driver.connect(config());

    await driver.executeStatements(
      { connectionId: 'local', sql: 'select * from users', maxRows: 10, offset: 20 },
      ['select * from users']
    );

    expect(String(mysqlMock.queries.at(-1)?.sql)).toContain('limit 11 offset 20');
  });
});

function respond(sql: unknown, config: { ssl?: unknown }, _params: unknown[]) {
  const text = String(sql);
  if (mysqlMock.failSsl && config.ssl) {
    throw new Error('SSL connection error');
  }
  if (text.includes('select version() as version')) {
    return [[{ version: 'MySQL 8.0' }], []];
  }
  if (text.includes('select 1')) {
    return [[{ '1': 1 }], []];
  }
  if (text.includes('select connection_id() as id')) {
    return [[{ id: 321 }], []];
  }
  if (text.includes('show full processlist')) {
    return [[{ Id: 321, User: 'app', db: 'aph', Command: 'Query', Host: '127.0.0.1', State: 'running', Info: 'select 1' }], []];
  }
  if (text.includes('information_schema.schemata')) {
    return [[{ name: 'public' }], []];
  }
  if (text.includes('information_schema.tables')) {
    return [[{ schema: 'public', name: 'users', type: 'table', rowEstimate: 12, comment: 'users' }], []];
  }
  if (text.includes('information_schema.columns')) {
    return [[
      { schema: 'public', table: 'users', name: 'id', ordinal: 1, dataType: 'int', nullable: false, defaultValue: null },
      { schema: 'public', table: 'users', name: 'name', ordinal: 2, dataType: 'varchar(255)', nullable: true, defaultValue: null }
    ], []];
  }
  if (text.includes('information_schema.views')) {
    return [[{ schema: 'public', name: 'active_users', type: 'view' }], []];
  }
  if (text.includes("routine_type = 'FUNCTION'")) {
    return [[{ schema: 'public', name: 'demo_fn', kind: 'FUNCTION' }], []];
  }
  if (text.includes("routine_type = 'PROCEDURE'")) {
    return [[{ schema: 'public', name: 'demo_proc', kind: 'PROCEDURE' }], []];
  }
  if (text.includes('information_schema.triggers')) {
    return [[{ schema: 'public', table: 'users', name: 'users_trg', timing: 'before', event: 'INSERT', orientation: 'row' }], []];
  }
  if (text.includes("constraint_name = 'PRIMARY'")) {
    return [[{ name: 'PRIMARY', columnName: 'id', ordinal: 1 }], []];
  }
  if (text.includes('referenced_table_name is not null')) {
    return [[{ name: 'users_fk', columnName: 'org_id', ordinal: 1, foreignSchema: 'public', foreignTable: 'orgs', foreignColumn: 'id' }], []];
  }
  if (text.includes('information_schema.statistics')) {
    return [[{ name: 'users_idx', nonUnique: 0, columnName: 'email', indexType: 'BTREE' }], []];
  }
  if (text.includes('limit 11 offset 20') || text.startsWith('select * from users')) {
    return [[{ id: 1, name: 'Ada' }, { id: 2, name: 'Ben' }], []];
  }
  if (text.startsWith('explain')) {
    return [[{ EXPLAIN: 'table scan' }], []];
  }
  return [[[]], []];
}

function config(overrides: Partial<ConnectionConfigWithPassword> = {}): ConnectionConfigWithPassword {
  return {
    id: 'local',
    name: 'Local MySQL',
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    database: 'aph',
    username: 'root',
    password: 'root',
    sslMode: overrides.sslMode ?? 'disable',
    color: 'blue',
    ...overrides
  };
}
