import * as vscode from 'vscode';
import { DocumentConnectionBinding } from '../services/documentConnectionResolver';

const SQL_DOCUMENT_CONNECTIONS_KEY = 'database.sqlDocumentConnections';
const MAX_SQL_DOCUMENT_CONNECTIONS = 500;

export interface SqlDocumentConnectionRecord extends DocumentConnectionBinding {
  lastTouchedAt?: number;
  lastExecutedRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  updatedAt: number;
}

export class SqlDocumentConnectionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): SqlDocumentConnectionRecord[] {
    return this.context.workspaceState.get<SqlDocumentConnectionRecord[]>(SQL_DOCUMENT_CONNECTIONS_KEY, []);
  }

  get(documentUri: string): SqlDocumentConnectionRecord | undefined {
    return this.getAll().find((record) => record.documentUri === documentUri);
  }

  async set(documentUri: string, connectionId: string): Promise<void> {
    const existing = this.get(documentUri);
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({ ...existing, documentUri, connectionId, updatedAt: Date.now() });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }

  async markExecuted(documentUri: string, connectionId: string, range: SqlDocumentConnectionRecord['lastExecutedRange']): Promise<void> {
    const now = Date.now();
    const existing = this.get(documentUri);
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({
      ...existing,
      documentUri,
      connectionId,
      lastExecutedRange: range,
      lastTouchedAt: now,
      updatedAt: now
    });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }

  async touch(documentUri: string): Promise<void> {
    const now = Date.now();
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().map((record) => record.documentUri === documentUri
        ? { ...record, lastTouchedAt: now, updatedAt: now }
        : record)
    );
  }

  async delete(documentUri: string): Promise<void> {
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().filter((record) => record.documentUri !== documentUri)
    );
  }
}
