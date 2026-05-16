import * as vscode from 'vscode';
import { ConnectionConfig, QueryConsoleRecord } from '../types';
import { createId } from '../utils/id';

const CONSOLES_KEY = 'database.queryConsoles';

export class QueryConsoleStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): QueryConsoleRecord[] {
    return this.context.workspaceState.get<QueryConsoleRecord[]>(CONSOLES_KEY, []);
  }

  getByConnection(connectionId: string): QueryConsoleRecord | undefined {
    return this.getAll()
      .filter((record) => record.connectionId === connectionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  async openOrCreate(connection: ConnectionConfig | undefined, initialSql = '', options: { reuse?: boolean } = {}): Promise<vscode.TextDocument> {
    const reuse = options.reuse ?? true;
    const existing = reuse && connection ? this.getByConnection(connection.id) : undefined;
    if (existing) {
      try {
        return await vscode.workspace.openTextDocument(vscode.Uri.parse(existing.documentUri));
      } catch {
        await this.delete(existing.id);
      }
    }

    const uri = await this.createConsoleUri(connection);
    await this.ensureFile(uri, initialSql || this.defaultContent(connection, uri));
    const now = Date.now();
    if (connection) {
      await this.save({
        id: createId('console'),
        connectionId: connection.id,
        documentUri: uri.toString(),
        schemaName: connection.defaultSchema,
        createdAt: now,
        updatedAt: now
      });
    }
    return vscode.workspace.openTextDocument(uri);
  }

  async markExecuted(documentUri: string, range: QueryConsoleRecord['lastExecutedRange']): Promise<void> {
    const records = this.getAll();
    const index = records.findIndex((record) => record.documentUri === documentUri);
    if (index === -1) {
      return;
    }
    records[index] = { ...records[index], lastExecutedRange: range, updatedAt: Date.now() };
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }

  async delete(id: string): Promise<void> {
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => record.id !== id));
  }

  private async save(record: QueryConsoleRecord): Promise<void> {
    const records = this.getAll().filter((existing) => existing.id !== record.id);
    records.push(record);
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }

  private async createConsoleUri(connection: ConnectionConfig | undefined): Promise<vscode.Uri> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const base = folder
      ? vscode.Uri.joinPath(folder, '.vscode-data-grip')
      : vscode.Uri.joinPath(this.context.globalStorageUri, 'query-consoles');
    await vscode.workspace.fs.createDirectory(base);
    const name = this.safeName(connection ? `${connection.name}-${connection.database}` : 'sql-console');
    const existing = new Set(this.getAll().map((record) => record.documentUri));
    for (let index = 1; index < 10_000; index += 1) {
      const suffix = index === 1 ? '' : `-${index}`;
      const uri = vscode.Uri.joinPath(base, `${name}${suffix}.sql`);
      if (!existing.has(uri.toString())) {
        try {
          await vscode.workspace.fs.stat(uri);
        } catch {
          return uri;
        }
      }
    }
    return vscode.Uri.joinPath(base, `${name}-${Date.now()}.sql`);
  }

  private async ensureFile(uri: vscode.Uri, content: string): Promise<void> {
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showWarningMessage('No workspace is open. Query console files are stored in extension storage.');
      }
    }
  }

  private defaultContent(connection: ConnectionConfig | undefined, uri?: vscode.Uri): string {
    const pathLine = uri ? `-- File: ${uri.fsPath}\n` : '';
    return connection
      ? `-- ${connection.name} / ${connection.database}\n-- Schema: ${connection.defaultSchema ?? 'public'}\n${pathLine}\nselect *\nfrom \nlimit 100;\n`
      : `-- SQL Console\n${pathLine}\n`;
  }

  private safeName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sql-console';
  }
}
