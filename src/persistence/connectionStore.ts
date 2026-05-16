import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword } from '../types';

const CONNECTIONS_KEY = 'database.connections';
const SELECTED_CONNECTION_KEY = 'database.selectedConnectionId';

export class ConnectionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): ConnectionConfig[] {
    return this.context.globalState.get<ConnectionConfig[]>(CONNECTIONS_KEY, []);
  }

  async save(config: ConnectionConfigWithPassword): Promise<void> {
    const { password, ...metadata } = config;
    const connections = this.getAll().filter((item) => item.id !== config.id);
    connections.push(metadata);
    await this.context.globalState.update(CONNECTIONS_KEY, connections.sort((a, b) => a.name.localeCompare(b.name)));
    if (password !== undefined) {
      await this.context.secrets.store(this.secretKey(config.id), password);
    }
  }

  async delete(id: string): Promise<void> {
    await this.context.globalState.update(CONNECTIONS_KEY, this.getAll().filter((item) => item.id !== id));
    await this.context.secrets.delete(this.secretKey(id));
  }

  async withPassword(config: ConnectionConfig): Promise<ConnectionConfigWithPassword> {
    return { ...config, password: await this.context.secrets.get(this.secretKey(config.id)) };
  }

  getSelectedConnectionId(): string | undefined {
    return this.context.workspaceState.get<string>(SELECTED_CONNECTION_KEY);
  }

  async setSelectedConnectionId(id: string | undefined): Promise<void> {
    await this.context.workspaceState.update(SELECTED_CONNECTION_KEY, id);
  }

  private secretKey(id: string): string {
    return `database.connection.${id}.password`;
  }
}
