import { describe, expect, it, vi } from 'vitest';
import { SchemaContextService } from '../src/services/schemaContextService';
import type { ConnectionConfig } from '../src/types';

vi.mock('vscode', () => ({
  CancellationTokenSource: class {},
  Uri: { joinPath: vi.fn() },
  workspace: { fs: {} },
  FileSystemError: class extends Error {}
}));

const connection: ConnectionConfig = {
  id: 'local', name: 'Local', type: 'postgres', host: 'localhost', port: 5432,
  database: 'app', username: 'postgres', sslMode: 'prefer', color: 'green', defaultSchema: 'public'
};

describe('SchemaContextService object metadata', () => {
  it('loads and persists routines and triggers with relation metadata', async () => {
    const driver = driverStub();
    const store = { hydrate: vi.fn(), persist: vi.fn(), deleteConnection: vi.fn(), getStorageError: vi.fn() };
    const service = new SchemaContextService(managerFor(driver) as never, store as never);

    const entry = await service.loadSchema(connection, 'public', true);

    expect(entry.functions).toEqual([{ schema: 'public', name: 'lookup', kind: 'function', signature: 'lookup(integer)', arguments: ['integer'] }]);
    expect(entry.procedures).toEqual([{ schema: 'public', name: 'rebuild', kind: 'procedure' }]);
    expect(entry.triggers).toEqual([{ schema: 'public', table: 'users', name: 'audit_users' }]);
    expect(store.persist).toHaveBeenCalledWith(connection, expect.objectContaining({
      functions: entry.functions, procedures: entry.procedures, triggers: entry.triggers
    }));
  });

  it('shares one in-flight load across routine and trigger requests', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const driver = driverStub({ getFunctions: vi.fn(async () => { await pending; return []; }) });
    const service = new SchemaContextService(managerFor(driver) as never);

    const first = service.loadSchema(connection, 'public', true);
    const second = service.loadSchema(connection, 'public', true);
    release();
    await Promise.all([first, second]);

    for (const method of ['getSchemas', 'getTables', 'getViews', 'getFunctions', 'getProcedures', 'getTriggers'] as const) {
      expect(driver[method]).toHaveBeenCalledTimes(1);
    }
  });

  it('marks routine or trigger load failures consistently without persisting a partial snapshot', async () => {
    const driver = driverStub({ getTriggers: vi.fn(async () => { throw new Error('trigger catalog unavailable'); }) });
    const store = { hydrate: vi.fn(), persist: vi.fn(), deleteConnection: vi.fn(), getStorageError: vi.fn() };
    const service = new SchemaContextService(managerFor(driver) as never, store as never);

    const entry = await service.loadSchema(connection, 'public', true);

    expect(entry.status).toBe('error');
    expect(entry.errorMessage).toBe('trigger catalog unavailable');
    expect(entry.functions).toEqual([]);
    expect(entry.procedures).toEqual([]);
    expect(entry.triggers).toEqual([]);
    expect(store.persist).not.toHaveBeenCalled();
  });
});

function managerFor(driver: ReturnType<typeof driverStub>) {
  return { isConnected: vi.fn(() => true), getDriver: vi.fn(() => driver), getConnection: vi.fn(() => connection) };
}

function driverStub(overrides: Record<string, unknown> = {}) {
  return {
    getSchemas: vi.fn(async () => [{ name: 'public' }]),
    getTables: vi.fn(async () => []),
    getViews: vi.fn(async () => []),
    getFunctions: vi.fn(async () => [{ schema: 'public', name: 'lookup', kind: 'function' as const, signature: 'lookup(integer)', arguments: ['integer'] }]),
    getProcedures: vi.fn(async () => [{ schema: 'public', name: 'rebuild', kind: 'procedure' as const }]),
    getTriggers: vi.fn(async () => [{ schema: 'public', table: 'users', name: 'audit_users' }]),
    getColumns: vi.fn(async () => []),
    ...overrides
  };
}
