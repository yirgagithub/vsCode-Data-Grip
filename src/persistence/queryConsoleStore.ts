import * as vscode from 'vscode';
import { ConnectionConfig, QueryConsoleRecord } from '../types';
import { createId } from '../utils/id';
import { partitionExistingConsoleRecords } from './queryConsoleRecords';

const CONSOLES_KEY = 'database.queryConsoles';

export class QueryConsoleStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): QueryConsoleRecord[] {
    return this.context.workspaceState.get<QueryConsoleRecord[]>(CONSOLES_KEY, []);
  }

  async pruneMissingDocuments(): Promise<number> {
    const records = this.getAll();
    const { existing, missing } = await partitionExistingConsoleRecords(
      records,
      (documentUri) => this.documentExists(documentUri)
    );

    if (missing.length) {
      await this.context.workspaceState.update(CONSOLES_KEY, existing);
    }
    return missing.length;
  }

  getByConnection(connectionId: string): QueryConsoleRecord | undefined {
    return this.getAll()
      .filter((record) => record.connectionId === connectionId)
      .sort((a, b) => (b.lastTouchedAt ?? b.updatedAt) - (a.lastTouchedAt ?? a.updatedAt))[0];
  }

  async openOrCreate(connection: ConnectionConfig | undefined, initialSql = '', options: { reuse?: boolean } = {}): Promise<vscode.TextDocument> {
    const reuse = options.reuse ?? true;
    const existing = reuse && connection ? this.getByConnection(connection.id) : undefined;
    if (existing) {
      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(existing.documentUri));
        await this.touch(existing.id, { opened: true });
        return document;
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
        sortOrder: -now,
        lastOpenedAt: now,
        lastTouchedAt: now,
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
    const now = Date.now();
    records[index] = { ...records[index], lastExecutedRange: range, lastTouchedAt: now, updatedAt: now };
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }

  async touch(id: string, options: { opened?: boolean } = {}): Promise<void> {
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => (
      record.id === id
        ? { ...record, lastOpenedAt: options.opened ? now : record.lastOpenedAt, lastTouchedAt: now, updatedAt: now }
        : record
    )));
  }

  async touchDocument(documentUri: string, options: { opened?: boolean } = {}): Promise<void> {
    const record = this.getAll().find((item) => item.documentUri === documentUri);
    if (record) {
      await this.touch(record.id, options);
    }
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => (
      record.id === id ? { ...record, pinned, updatedAt: now } : record
    )));
  }

  async move(id: string, direction: 'up' | 'down'): Promise<void> {
    const records = this.getAll();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return;
    }
    const siblings = records
      .filter((item) => item.connectionId === record.connectionId)
      .sort((a, b) => this.sortValue(a) - this.sortValue(b));
    const index = siblings.findIndex((item) => item.id === id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const swap = siblings[swapIndex];
    if (index === -1 || !swap) {
      return;
    }
    const firstOrder = this.sortValue(record);
    const secondOrder = this.sortValue(swap);
    const now = Date.now();
    await this.context.workspaceState.update(CONSOLES_KEY, records.map((item) => {
      if (item.id === record.id) {
        return { ...item, sortOrder: secondOrder, updatedAt: now };
      }
      if (item.id === swap.id) {
        return { ...item, sortOrder: firstOrder, updatedAt: now };
      }
      return item;
    }));
  }

  async delete(id: string): Promise<void> {
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => record.id !== id));
  }

  async deleteMany(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    if (!idSet.size) {
      return;
    }
    await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => !idSet.has(record.id)));
  }

  private async save(record: QueryConsoleRecord): Promise<void> {
    const records = this.getAll().filter((existing) => existing.id !== record.id);
    records.push(record);
    await this.context.workspaceState.update(CONSOLES_KEY, records);
  }

  private sortValue(record: QueryConsoleRecord): number {
    return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
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
        void vscode.window.showInformationMessage('No workspace is open. Query console files are stored in extension storage; SQL autocomplete still works after metadata warms.');
      }
    }
  }

  private defaultContent(connection: ConnectionConfig | undefined, uri?: vscode.Uri): string {
    return connection
      ? `-- ${connection.name} / ${connection.database}\n-- Schema: ${connection.defaultSchema ?? 'public'}\n\nselect *\nfrom \nlimit 100;\n`
      : `-- SQL Console\n\n`;
  }

  private safeName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sql-console';
  }

  private async documentExists(documentUri: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.parse(documentUri));
      return true;
    } catch (error) {
      return !this.isFileNotFound(error);
    }
  }

  private isFileNotFound(error: unknown): boolean {
    const code = error instanceof vscode.FileSystemError
      ? error.code
      : typeof error === 'object' && error !== null
        ? (error as { code?: unknown }).code
        : undefined;
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return code === 'FileNotFound' || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
}
