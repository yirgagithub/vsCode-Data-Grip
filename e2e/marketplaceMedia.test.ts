import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'vs-code-database-client.vscode-data-grip';
const CAPTURE_DIR = process.env.MARKETPLACE_MEDIA_CAPTURE_DIR;

type DatabaseType = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle' | 'redis';

interface ConnectionConfigWithPassword {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  sslMode: 'disable' | 'prefer' | 'require';
  color: 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';
  defaultSchema?: string;
  connectTimeoutMs?: number;
  queryTimeoutMs?: number;
}

suite('QueryDeck marketplace media capture', () => {
  test('captures real connected database profiles for Marketplace media', async function () {
    if (!CAPTURE_DIR) {
      this.skip();
    }

    this.timeout(480_000);
    mkdirSync(CAPTURE_DIR!, { recursive: true });

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);
    await extension.activate();

    const connectedIds = await eventually('marketplace media connections', async () => {
      return vscode.commands.executeCommand<string[]>(
        'database.internal.seedAndConnectForMarketplaceMedia',
        marketplaceConnections()
      );
    }, 420_000);

    assert.ok(
      Array.isArray(connectedIds),
      `database.internal.seedAndConnectForMarketplaceMedia must return an array, received ${String(connectedIds)}`
    );
    assert.deepStrictEqual(new Set(connectedIds), new Set(marketplaceConnections().map((connection) => connection.id)));

    await vscode.commands.executeCommand('workbench.view.extension.database');
    await vscode.commands.executeCommand('database.focusExplorer');
    await sleep(3_000);

    captureDisplay(join(CAPTURE_DIR!, 'querydeck-live-connections.png'));
  });
});

function marketplaceConnections(): ConnectionConfigWithPassword[] {
  return [
    connection('postgres', {
      id: 'marketplace-postgres',
      name: 'Local PostgreSQL',
      database: env('LIVE_POSTGRES_DATABASE', 'vscode_data_grip'),
      password: env('LIVE_POSTGRES_PASSWORD', 'postgres'),
      port: numberEnv('LIVE_POSTGRES_PORT', 5432),
      username: env('LIVE_POSTGRES_USER', 'postgres'),
      defaultSchema: 'public',
      color: 'green'
    }),
    connection('mysql', {
      id: 'marketplace-mysql',
      name: 'Local MySQL',
      database: env('LIVE_MYSQL_DATABASE', 'vscode_data_grip'),
      password: env('LIVE_MYSQL_PASSWORD', 'mysql'),
      port: numberEnv('LIVE_MYSQL_PORT', 3306),
      username: env('LIVE_MYSQL_USER', 'root'),
      defaultSchema: env('LIVE_MYSQL_DATABASE', 'vscode_data_grip'),
      color: 'blue'
    }),
    connection('sqlserver', {
      id: 'marketplace-sqlserver',
      name: 'Local SQL Server',
      database: env('LIVE_SQLSERVER_DATABASE', 'master'),
      password: env('LIVE_SQLSERVER_PASSWORD', 'YourStrong!Passw0rd'),
      port: numberEnv('LIVE_SQLSERVER_PORT', 1433),
      username: env('LIVE_SQLSERVER_USER', 'sa'),
      defaultSchema: 'dbo',
      color: 'purple'
    }),
    connection('oracle', {
      id: 'marketplace-oracle',
      name: 'Local Oracle',
      database: env('LIVE_ORACLE_DATABASE', 'FREEPDB1'),
      password: env('LIVE_ORACLE_PASSWORD', 'oracle'),
      port: numberEnv('LIVE_ORACLE_PORT', 1521),
      username: env('LIVE_ORACLE_USER', 'app'),
      defaultSchema: env('LIVE_ORACLE_USER', 'app').toUpperCase(),
      color: 'red'
    }),
    connection('redis', {
      id: 'marketplace-redis',
      name: 'Local Redis',
      database: env('LIVE_REDIS_DATABASE', '0'),
      password: process.env.LIVE_REDIS_PASSWORD,
      port: numberEnv('LIVE_REDIS_PORT', 6379),
      username: env('LIVE_REDIS_USER', ''),
      defaultSchema: 'db0',
      color: 'yellow'
    }),
    connection('sqlite', {
      id: 'marketplace-sqlite',
      name: 'Local SQLite',
      database: ':memory:',
      host: '',
      port: 0,
      username: '',
      password: undefined,
      defaultSchema: 'main',
      color: 'gray'
    })
  ];
}

function connection(type: DatabaseType, overrides: Partial<ConnectionConfigWithPassword>): ConnectionConfigWithPassword {
  return {
    id: `marketplace-${type}`,
    name: `Local ${type}`,
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

async function eventually<T>(label: string, action: () => Promise<T>, timeoutMs: number): Promise<T> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      await sleep(3_000);
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} was not ready after ${Math.round(timeoutMs / 1000)}s: ${message}`);
}

function captureDisplay(path: string): void {
  if (process.platform !== 'linux') {
    throw new Error('Marketplace media capture currently requires Linux/Xvfb.');
  }
  execFileSync('import', ['-window', 'root', path], { stdio: 'inherit' });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
