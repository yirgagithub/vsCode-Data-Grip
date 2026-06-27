import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, DatabaseType, DbConnection } from '../types';
import { ConnectionStore } from '../persistence/connectionStore';
import { PostgresDriver } from './drivers/postgresDriver';
import { RedshiftDriver } from './drivers/redshiftDriver';
import { DatabaseDriver } from './drivers/DatabaseDriver';
import { MySQLDriver } from './drivers/mysqlDriver';
import { SQLiteDriver } from './drivers/sqliteDriver';
import { SqlServerDriver } from './drivers/sqlServerDriver';
import { OracleDriver } from './drivers/oracleDriver';
import { RedisDriver } from './drivers/redisDriver';
import { SnowflakeDriver } from './drivers/snowflakeDriver';
import { createId } from '../utils/id';
import { connectionDefaultsForType } from '../services/connectionDefaults';
import { SshTunnelManager } from '../services/sshTunnelManager';

export class ConnectionManager {
  private readonly drivers = new Map<DatabaseType, DatabaseDriver>();
  private readonly active = new Map<string, DbConnection>();
  private readonly transactionModes = new Map<string, 'auto' | 'manual'>();
  private readonly activeConnectionEmitter = new vscode.EventEmitter<string>();
  private readonly sshTunnelManager = new SshTunnelManager();
  readonly onDidChangeActiveConnections = this.activeConnectionEmitter.event;

  constructor(private readonly store: ConnectionStore) {
    this.drivers.set('postgres', new PostgresDriver());
    this.drivers.set('redshift', new RedshiftDriver());
    this.drivers.set('mysql', new MySQLDriver());
    this.drivers.set('sqlite', new SQLiteDriver());
    this.drivers.set('sqlserver', new SqlServerDriver());
    this.drivers.set('oracle', new OracleDriver());
    this.drivers.set('redis', new RedisDriver());
    this.drivers.set('snowflake', new SnowflakeDriver());
  }

  getConnections(): ConnectionConfig[] {
    return this.store.getAll();
  }

  getActiveConnections(): DbConnection[] {
    return [...this.active.values()];
  }

  isConnected(id: string): boolean {
    return this.active.has(id);
  }

  getConnection(id: string): ConnectionConfig | undefined {
    return this.store.getAll().find((connection) => connection.id === id);
  }

  getPreferredConnection(): ConnectionConfig | undefined {
    const selected = this.store.getSelectedConnectionId();
    return this.active.get(selected ?? '')?.config
      ?? (selected ? this.getConnection(selected) : undefined)
      ?? this.getActiveConnections()[0]?.config
      ?? this.getConnections()[0];
  }

  async getConnectionWithPassword(id: string): Promise<ConnectionConfigWithPassword> {
    const config = this.getConnection(id);
    if (!config) {
      throw new Error('Connection not found.');
    }
    return this.store.withPassword(config);
  }

  getDriverByConnectionId(id: string): DatabaseDriver {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error('Connection not found.');
    }
    return this.getDriver(connection.type);
  }

  getDriver(type: DatabaseType): DatabaseDriver {
    const driver = this.drivers.get(type);
    if (!driver) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return driver;
  }

  async save(config: ConnectionConfigWithPassword): Promise<void> {
    const activeConnection = this.active.get(config.id);
    await this.store.save(config);
    if (!activeConnection) {
      return;
    }

    await this.disconnect(config.id);
    await this.connect(config.id);
  }

  async setSelectedConnection(id: string | undefined): Promise<void> {
    await this.store.setSelectedConnectionId(id);
  }

  async delete(id: string): Promise<void> {
    await this.disconnect(id);
    await this.store.delete(id);
  }

  async connect(id: string): Promise<DbConnection> {
    const config = await this.getConnectionWithPassword(id);
    const driver = this.getDriver(config.type);
    try {
      const tunneled = await this.sshTunnelManager.open(config);
      await driver.connect(tunneled);
      const connection: DbConnection = { id: config.id, config, connectedAt: Date.now() };
      this.active.set(id, connection);
      await this.store.setSelectedConnectionId(id);
      this.activeConnectionEmitter.fire(id);
      return connection;
    } catch (error) {
      await this.sshTunnelManager.close(id).catch(() => undefined);
      if (this.active.has(id)) {
        this.active.delete(id);
        this.activeConnectionEmitter.fire(id);
      }
      throw error;
    }
  }

  async disconnect(id: string): Promise<void> {
    const wasConnected = this.active.has(id);
    const config = this.getConnection(id);
    if (config) {
      await this.getDriver(config.type).disconnect(id);
    }
    await this.sshTunnelManager.close(id).catch(() => undefined);
    this.active.delete(id);
    this.transactionModes.delete(id);
    if (wasConnected) {
      this.activeConnectionEmitter.fire(id);
    }
  }

  async test(id: string): Promise<string> {
    const config = await this.getConnectionWithPassword(id);
    return this.testConfig(config);
  }

  async testConfig(config: ConnectionConfigWithPassword): Promise<string> {
    const driver = this.getDriver(config.type);
    const tunneled = await this.sshTunnelManager.open(config);
    try {
      const result = await driver.testConnection(tunneled);
      if (!result.ok) {
        throw new Error(`Connection failed for ${config.username}@${config.host}:${config.port}/${config.database}: ${result.message}`);
      }
      return result.serverVersion ?? result.message;
    } finally {
      await this.sshTunnelManager.close(config.id).catch(() => undefined);
    }
  }

  getTransactionMode(id: string): 'auto' | 'manual' {
    return this.transactionModes.get(id) ?? 'auto';
  }

  setTransactionMode(id: string, mode: 'auto' | 'manual'): void {
    if (mode === 'auto') {
      this.transactionModes.delete(id);
    } else {
      this.transactionModes.set(id, mode);
    }
  }

  isTransactionOpen(id: string): boolean {
    const connection = this.getConnection(id);
    return connection ? this.getDriver(connection.type).isTransactionOpen(id) : false;
  }

  async beginTransaction(id: string): Promise<void> {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error('Connection not found.');
    }
    await this.getDriver(connection.type).beginTransaction(id);
    this.transactionModes.set(id, 'manual');
  }

  async commitTransaction(id: string): Promise<void> {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error('Connection not found.');
    }
    await this.getDriver(connection.type).commitTransaction(id);
  }

  async rollbackTransaction(id: string): Promise<void> {
    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error('Connection not found.');
    }
    await this.getDriver(connection.type).rollbackTransaction(id);
  }

  async pickConnection(): Promise<ConnectionConfig | undefined> {
    const connections = this.getConnections();
    if (connections.length === 0) {
      const create = await vscode.window.showInformationMessage('No database connections yet.', 'Add Connection');
      if (create === 'Add Connection') {
        return this.promptConnection();
      }
      return undefined;
    }

    const selectedId = this.store.getSelectedConnectionId();
    const picked = await vscode.window.showQuickPick(connections.map((connection) => ({
      label: truncateMiddle(connection.name, 48),
      description: `${this.isConnected(connection.id) ? 'online' : 'offline'} - ${connection.type}${connection.production ? ' - prod' : ''}`,
      detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
      connection
    })), { placeHolder: 'Select database connection' });
    return picked?.connection ?? connections.find((connection) => connection.id === selectedId);
  }

  async promptConnection(existing?: ConnectionConfig): Promise<ConnectionConfigWithPassword | undefined> {
    const typePick = await vscode.window.showQuickPick([
      { label: 'PostgreSQL', type: 'postgres' as const },
      { label: 'Amazon Redshift', type: 'redshift' as const },
      { label: 'MySQL', type: 'mysql' as const },
      { label: 'SQLite', type: 'sqlite' as const },
      { label: 'Microsoft SQL Server', type: 'sqlserver' as const },
      { label: 'Oracle', type: 'oracle' as const },
      { label: 'Redis', type: 'redis' as const },
      { label: 'Snowflake', type: 'snowflake' as const }
    ], { placeHolder: 'Database type' });
    if (!typePick) {
      return undefined;
    }

    const type = typePick.type;
    const defaults = connectionDefaultsForType(type);
    const name = await vscode.window.showInputBox({ prompt: 'Connection name', value: existing?.name ?? defaults.name });
    if (!name) {
      return undefined;
    }
    const host = await vscode.window.showInputBox({ prompt: type === 'snowflake' ? 'Account / host' : 'Host', value: existing?.host ?? 'localhost' });
    if (type !== 'sqlite' && !host) {
      return undefined;
    }
    const port = Number(await vscode.window.showInputBox({ prompt: 'Port', value: String(existing?.port ?? defaults.port) }));
    const database = await vscode.window.showInputBox({ prompt: 'Database', value: existing?.database ?? defaults.database });
    if (!database) {
      return undefined;
    }
    const username = await vscode.window.showInputBox({ prompt: 'Username', value: existing?.username });
    if (type !== 'sqlite' && type !== 'redis' && !username) {
      return undefined;
    }
    const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
    const ssl = await vscode.window.showQuickPick(['disable', 'prefer', 'require'], { placeHolder: 'SSL mode' });

    return {
      id: existing?.id ?? createId('conn'),
      name,
      type,
      host: host || 'localhost',
      port: type === 'sqlite' ? 0 : port,
      database,
      username: username ?? '',
      password,
      sslMode: (ssl ?? defaults.sslMode) as 'disable' | 'prefer' | 'require',
      color: existing?.color ?? defaults.color,
      defaultSchema: existing?.defaultSchema ?? 'public',
      queryTimeoutMs: vscode.workspace.getConfiguration('database').get<number>('query.timeoutMs', 300000)
    };
  }
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
