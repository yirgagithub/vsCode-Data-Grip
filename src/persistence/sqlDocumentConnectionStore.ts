import * as vscode from 'vscode';
import { DocumentConnectionBinding } from '../services/documentConnectionResolver';

const SQL_DOCUMENT_CONNECTIONS_KEY = 'database.sqlDocumentConnections';
const MAX_SQL_DOCUMENT_CONNECTIONS = 500;

export interface SqlDocumentConnectionRecord extends DocumentConnectionBinding {
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
    const records = this.getAll().filter((record) => record.documentUri !== documentUri);
    records.push({ documentUri, connectionId, updatedAt: Date.now() });
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS)
    );
  }

  async delete(documentUri: string): Promise<void> {
    await this.context.workspaceState.update(
      SQL_DOCUMENT_CONNECTIONS_KEY,
      this.getAll().filter((record) => record.documentUri !== documentUri)
    );
  }
}
