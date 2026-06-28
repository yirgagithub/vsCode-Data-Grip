import { afterEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  showInformationMessage: vi.fn()
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vscodeMocks.showInformationMessage
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }
}));

import { ConnectionManager } from '../src/database/connectionManager';
import { ConnectionConfig, ConnectionConfigWithPassword } from '../src/types';

describe('ConnectionManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the registered connection creator for the no-connection Add Connection fallback', async () => {
    const created = connection();
    const creator = vi.fn(async () => created);
    const manager = new ConnectionManager(store([]) as never);
    manager.setConnectionCreator(creator);
    vscodeMocks.showInformationMessage.mockResolvedValueOnce('Add Connection');

    await expect(manager.pickConnection()).resolves.toBe(created);

    expect(vscodeMocks.showInformationMessage).toHaveBeenCalledWith('No database connections yet.', 'Add Connection');
    expect(creator).toHaveBeenCalledTimes(1);
  });

  it('does not create a connection when the no-connection prompt is dismissed', async () => {
    const creator = vi.fn(async () => connection());
    const manager = new ConnectionManager(store([]) as never);
    manager.setConnectionCreator(creator);
    vscodeMocks.showInformationMessage.mockResolvedValueOnce(undefined);

    await expect(manager.pickConnection()).resolves.toBeUndefined();

    expect(creator).not.toHaveBeenCalled();
  });
});

function connection(): ConnectionConfig {
  return {
    id: 'postgres-local',
    name: 'PostgreSQL',
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    username: 'postgres',
    sslMode: 'disable',
    color: 'green'
  };
}

function store(connections: ConnectionConfig[]) {
  return {
    getAll: vi.fn(() => connections),
    save: vi.fn(async (_config: ConnectionConfigWithPassword) => undefined),
    withPassword: vi.fn(async (config: ConnectionConfig) => ({ ...config, password: 'secret' })),
    setSelectedConnectionId: vi.fn(async (_id: string | undefined) => undefined),
    getSelectedConnectionId: vi.fn(() => undefined),
    delete: vi.fn(async (_id: string) => undefined)
  };
}

