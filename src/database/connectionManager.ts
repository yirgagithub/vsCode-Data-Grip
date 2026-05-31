import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, DatabaseType, DbConnection } from '../types';
import { ConnectionStore } from '../persistence/connectionStore';
import { PostgresDriver } from './drivers/postgresDriver';
import { RedshiftDriver } from './drivers/redshiftDriver';
import { DatabaseDriver } from './drivers/DatabaseDriver';
import { createId } from '../utils/id';
import { connectionDefaultsForType } from '../services/connectionDefaults';

export class ConnectionManager {
  private readonly drivers = new Map<DatabaseType, DatabaseDriver>();
  private readonly active = new Map<string, DbConnection>();
  private readonly activeConnectionEmitter = new vscode.EventEmitter<string>();
  readonly onDidChangeActiveConnections = this.activeConnectionEmitter.event;

  constructor(private readonly store: ConnectionStore) {
    this.drivers.set('postgres', new PostgresDriver());
    this.drivers.set('redshift', new RedshiftDriver());
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

    if (activeConnection.config.type !== config.type) {
      await this.getDriver(activeConnection.config.type).disconnect(config.id);
    }

    try {
      const nextConfig = await this.getConnectionWithPassword(config.id);
      const connection = await this.getDriver(nextConfig.type).connect(nextConfig);
      this.active.set(config.id, connection);
      await this.store.setSelectedConnectionId(config.id);
      this.activeConnectionEmitter.fire(config.id);
    } catch (error) {
      this.active.delete(config.id);
      this.activeConnectionEmitter.fire(config.id);
      throw error;
    }
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
    try {
      const connection = await this.getDriver(config.type).connect(config);
      this.active.set(id, connection);
      await this.store.setSelectedConnectionId(id);
      this.activeConnectionEmitter.fire(id);
      return connection;
    } catch (error) {
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
    this.active.delete(id);
    if (wasConnected) {
      this.activeConnectionEmitter.fire(id);
    }
  }

  async test(id: string): Promise<string> {
    const config = await this.getConnectionWithPassword(id);
    return this.testConfig(config);
  }

  async testConfig(config: ConnectionConfigWithPassword): Promise<string> {
    const result = await this.getDriver(config.type).testConnection(config);
    if (!result.ok) {
      throw new Error(`Connection failed for ${config.username}@${config.host}:${config.port}/${config.database}: ${result.message}`);
    }
    return result.serverVersion ?? result.message;
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
      description: `${this.isConnected(connection.id) ? 'online' : 'offline'} - ${connection.type}`,
      detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
      connection
    })), { placeHolder: 'Select database connection' });
    return picked?.connection ?? connections.find((connection) => connection.id === selectedId);
  }

  async promptConnection(existing?: ConnectionConfig): Promise<ConnectionConfigWithPassword | undefined> {
    const typePick = await vscode.window.showQuickPick([
      { label: 'PostgreSQL', type: 'postgres' as const },
      { label: 'Amazon Redshift', type: 'redshift' as const }
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
    const host = await vscode.window.showInputBox({ prompt: 'Host', value: existing?.host ?? 'localhost' });
    if (!host) {
      return undefined;
    }
    const port = Number(await vscode.window.showInputBox({ prompt: 'Port', value: String(existing?.port ?? defaults.port) }));
    const database = await vscode.window.showInputBox({ prompt: 'Database', value: existing?.database ?? defaults.database });
    if (!database) {
      return undefined;
    }
    const username = await vscode.window.showInputBox({ prompt: 'Username', value: existing?.username });
    if (!username) {
      return undefined;
    }
    const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
    const ssl = await vscode.window.showQuickPick(['disable', 'prefer', 'require'], { placeHolder: 'SSL mode' });

    return {
      id: existing?.id ?? createId('conn'),
      name,
      type,
      host,
      port,
      database,
      username,
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
