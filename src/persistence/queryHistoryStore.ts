import * as vscode from 'vscode';
import { QueryHistoryItem } from '../types';

const HISTORY_KEY = 'database.queryHistory';

export class QueryHistoryStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): QueryHistoryItem[] {
    return this.context.workspaceState.get<QueryHistoryItem[]>(HISTORY_KEY, []);
  }

  async add(item: QueryHistoryItem): Promise<void> {
    const maxItems = vscode.workspace.getConfiguration('database').get<number>('history.maxItems', 1000);
    const history = [item, ...this.getAll().filter((existing) => existing.id !== item.id)].slice(0, maxItems);
    await this.context.workspaceState.update(HISTORY_KEY, history);
  }

  async update(item: QueryHistoryItem): Promise<void> {
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().map((existing) => existing.id === item.id ? item : existing));
  }

  async delete(id: string): Promise<void> {
    await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => item.id !== id));
  }
}
