import type * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { SqlDocumentConnectionRecord } from '../../src/persistence/sqlDocumentConnectionStore';
import type {
  ConnectionConfig, QueryConsoleRecord, QueryHistoryItem, QueryMemoryItem, QueryResultTab
} from '../../src/types';

export interface PersistedRecords {
  connections: ConnectionConfig[];
  queryConsoles: QueryConsoleRecord[];
  queryHistory: QueryHistoryItem[];
  queryMemory: QueryMemoryItem[];
  resultSessions: QueryResultTab[];
  documentConnections: SqlDocumentConnectionRecord[];
}

export const persistedRecords = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/compatibility/persisted-records.json'),
  'utf8'
)) as PersistedRecords;

export function createInMemoryExtensionContext(initial: {
  globalState?: Record<string, unknown>;
  workspaceState?: Record<string, unknown>;
} = {}): vscode.ExtensionContext {
  const globalState = new Map(Object.entries(initial.globalState ?? {}));
  const workspaceState = new Map(Object.entries(initial.workspaceState ?? {}));

  const memento = (values: Map<string, unknown>) => ({
    get<T>(key: string, fallback?: T): T | undefined {
      return values.has(key) ? values.get(key) as T : fallback;
    },
    async update(key: string, value: unknown): Promise<void> {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    },
    keys(): readonly string[] {
      return [...values.keys()];
    }
  });

  return {
    globalState: memento(globalState),
    workspaceState: memento(workspaceState),
    secrets: {
      get: async () => undefined,
      store: async () => undefined,
      delete: async () => undefined,
      onDidChange: (() => ({ dispose() {} })) as never
    }
  } as vscode.ExtensionContext;
}

export function compatibilityContext(): vscode.ExtensionContext {
  return createInMemoryExtensionContext({
    globalState: { 'database.connections': persistedRecords.connections },
    workspaceState: {
      'database.queryConsoles': persistedRecords.queryConsoles,
      'database.queryHistory': persistedRecords.queryHistory,
      'database.queryMemory': persistedRecords.queryMemory,
      'database.resultTabs': persistedRecords.resultSessions,
      'database.sqlDocumentConnections': persistedRecords.documentConnections
    }
  });
}
