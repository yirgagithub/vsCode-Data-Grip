import * as vscode from 'vscode';
import { QueryMemoryItem } from '../types';

const MEMORY_KEY = 'database.queryMemory';

export class QueryMemoryStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): QueryMemoryItem[] {
    return this.context.workspaceState.get<QueryMemoryItem[]>(MEMORY_KEY, []);
  }

  get(id: string): QueryMemoryItem | undefined {
    return this.getAll().find((item) => item.id === id);
  }

  async upsert(item: QueryMemoryItem): Promise<void> {
    const maxItems = vscode.workspace.getConfiguration('database').get<number>('queryMemory.maxItems', 2000);
    const next = [item, ...this.getAll().filter((existing) => existing.id !== item.id)]
      .sort((a, b) => (b.executedAt ?? b.updatedAt) - (a.executedAt ?? a.updatedAt))
      .slice(0, Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 2000);
    await this.context.workspaceState.update(MEMORY_KEY, next);
  }

  async update(id: string, patch: Partial<QueryMemoryItem>): Promise<void> {
    const now = Date.now();
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().map((item) => (
      item.id === id ? { ...item, ...patch, updatedAt: now } : item
    )));
  }

  async delete(id: string): Promise<void> {
    await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => item.id !== id));
  }
}
