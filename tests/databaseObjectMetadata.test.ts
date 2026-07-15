import { describe, expect, it, vi } from 'vitest';
import { resolveDatabaseObject } from '../src/services/databaseObjectMetadata';
import type { ConnectionConfig, SchemaCacheEntry } from '../src/types';

const connection: ConnectionConfig = {
  id: 'db', name: 'DB', type: 'postgres', host: 'localhost', port: 5432,
  database: 'app', username: 'postgres', sslMode: 'prefer', color: 'green', defaultSchema: 'public'
};

describe('resolveDatabaseObject', () => {
  it('resolves default-schema tables and obtains columns and keys', async () => {
    const context = schemaContext(entry({ tables: [{ schema: 'public', name: 'users', type: 'table' }] }));
    const result = await resolveDatabaseObject(reference(['users'], 'relation'), connection, context as never);

    expect(result).toEqual(expect.objectContaining({
      kind: 'table', schema: 'public', name: 'users',
      columns: [expect.objectContaining({ name: 'id' })],
      primaryKeys: [{ name: 'users_pkey', columns: ['id'] }],
      foreignKeys: [expect.objectContaining({ foreignTable: 'teams' })]
    }));
    expect(context.loadSchema).toHaveBeenCalledWith(connection, 'public');
  });

  it('resolves qualified views with database case folding', async () => {
    const context = schemaContext(entry({
      schemaName: 'Sales', views: [{ schema: 'Sales', name: 'MonthlyTotals', type: 'view' }]
    }));
    const oracle = { ...connection, type: 'oracle' as const, defaultSchema: 'OTHER' };

    const result = await resolveDatabaseObject(reference(['sales', 'monthlytotals'], 'relation'), oracle, context as never);

    expect(result).toEqual(expect.objectContaining({ kind: 'view', schema: 'Sales', name: 'MonthlyTotals' }));
    expect(context.loadSchema).toHaveBeenCalledWith(oracle, 'sales');
  });

  it('matches routine overloads by argument count and rejects ambiguous overloads', async () => {
    const context = schemaContext(entry({ functions: [
      { schema: 'public', name: 'lookup', kind: 'function', signature: 'lookup(integer)', arguments: ['integer'], returnType: 'text' },
      { schema: 'public', name: 'lookup', kind: 'function', signature: 'lookup(integer, text)', arguments: ['integer', 'text'], returnType: 'text' }
    ] }));

    const resolved = await resolveDatabaseObject({ ...reference(['lookup'], 'routine'), argumentCount: 2 }, connection, context as never);
    const ambiguous = await resolveDatabaseObject(reference(['lookup'], 'routine'), connection, context as never);

    expect(resolved).toEqual(expect.objectContaining({ kind: 'function', signature: 'lookup(integer, text)' }));
    expect(ambiguous).toBeUndefined();
  });

  it('counts only top-level signature arguments when structured arguments are unavailable', async () => {
    const context = schemaContext(entry({ functions: [
      { schema: 'public', name: 'price', kind: 'function', signature: 'price(numeric(10,2))', returnType: 'numeric' }
    ] }));

    const result = await resolveDatabaseObject({ ...reference(['price'], 'routine'), argumentCount: 1 }, connection, context as never);

    expect(result).toEqual(expect.objectContaining({ kind: 'function', signature: 'price(numeric(10,2))' }));
  });

  it('prefers one exact name over case-folded variants', async () => {
    const context = schemaContext(entry({ tables: [
      { schema: 'public', name: 'users', type: 'table' },
      { schema: 'public', name: 'Users', type: 'table' }
    ] }));

    const result = await resolveDatabaseObject(reference(['Users'], 'relation'), connection, context as never);

    expect(result).toEqual(expect.objectContaining({ kind: 'table', name: 'Users' }));
  });

  it('resolves procedures and triggers only in their matching contexts', async () => {
    const context = schemaContext(entry({
      procedures: [{ schema: 'public', name: 'rebuild', kind: 'procedure', signature: 'rebuild()' }],
      triggers: [{ schema: 'public', table: 'users', name: 'audit_users', timing: 'BEFORE', events: ['UPDATE'] }]
    }));

    expect(await resolveDatabaseObject({ ...reference(['rebuild'], 'routine'), argumentCount: 0 }, connection, context as never))
      .toEqual(expect.objectContaining({ kind: 'procedure', name: 'rebuild' }));
    expect(await resolveDatabaseObject(reference(['audit_users'], 'trigger'), connection, context as never))
      .toEqual(expect.objectContaining({ kind: 'trigger', table: 'users' }));
    expect(await resolveDatabaseObject(reference(['audit_users'], 'relation'), connection, context as never)).toBeUndefined();
  });

  it('uses disconnected cached metadata without forcing a live load', async () => {
    const cached = entry({ tables: [{ schema: 'public', name: 'users', type: 'table' }] });
    const context = schemaContext(cached);
    context.getCachedForConnection.mockResolvedValue(cached);
    context.loadSchema.mockRejectedValue(new Error('must not load'));

    const result = await resolveDatabaseObject(reference(['users'], 'relation'), connection, context as never);

    expect(result).toEqual(expect.objectContaining({ kind: 'table', name: 'users' }));
    expect(context.loadSchema).not.toHaveBeenCalled();
  });

  it('returns undefined for aliases, built-ins, Redis, and missing objects', async () => {
    const context = schemaContext(entry());
    expect(await resolveDatabaseObject(reference(['u'], 'relation'), connection, context as never)).toBeUndefined();
    expect(await resolveDatabaseObject(reference(['count'], 'routine'), connection, context as never)).toBeUndefined();
    expect(await resolveDatabaseObject(reference(['users'], 'relation'), { ...connection, type: 'redis' }, context as never)).toBeUndefined();
  });
});

function reference(parts: string[], context: 'relation' | 'routine' | 'trigger') {
  return { range: { start: 0, end: parts.join('.').length }, parts, context };
}

function entry(overrides: Partial<SchemaCacheEntry> = {}): SchemaCacheEntry {
  return {
    connectionId: 'db', schemaName: 'public', source: 'memory', schemas: [], tables: [], views: [],
    functions: [], procedures: [], triggers: [], columns: {}, indexes: {}, keys: {}, foreignKeys: {}, status: 'ready', ...overrides
  };
}

function schemaContext(metadata: SchemaCacheEntry) {
  return {
    getCachedForConnection: vi.fn(async () => undefined as SchemaCacheEntry | undefined),
    loadSchema: vi.fn(async () => metadata),
    getColumns: vi.fn(async () => [{ schema: metadata.schemaName, table: 'users', name: 'id', ordinal: 1, dataType: 'integer', nullable: false }]),
    getCachedColumns: vi.fn(async () => metadata.columns[`${metadata.schemaName}.users`]),
    getPrimaryKeys: vi.fn(async () => [{ name: 'users_pkey', columns: ['id'] }]),
    getForeignKeys: vi.fn(async () => [{ name: 'users_team_fk', columns: ['team_id'], foreignSchema: 'public', foreignTable: 'teams', foreignColumns: ['id'] }])
  };
}
