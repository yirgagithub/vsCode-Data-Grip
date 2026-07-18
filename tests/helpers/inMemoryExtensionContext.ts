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
  documentConnections: Array<SqlDocumentConnectionRecord & { id: string }>;
}

const rawPersistedRecords: unknown = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/compatibility/persisted-records.json'),
  'utf8'
));

export function assertPersistedRecords(value: unknown): asserts value is PersistedRecords {
  const root = requiredObject(value, 'persistedRecords');
  const stores = [
    'connections', 'queryConsoles', 'queryHistory', 'queryMemory', 'resultSessions', 'documentConnections'
  ] as const;
  for (const store of stores) requiredArray(root[store], store);

  validateRecords(root.connections, 'connections', [
    'id', 'name', 'type', 'host', 'port', 'database', 'username', 'sslMode', 'color'
  ]);
  validateRecords(root.queryConsoles, 'queryConsoles', [
    'id', 'connectionId', 'documentUri', 'createdAt', 'updatedAt'
  ]);
  validateRecords(root.queryHistory, 'queryHistory', [
    'id', 'connectionId', 'databaseType', 'sql', 'executedAt', 'status'
  ]);
  validateRecords(root.queryMemory, 'queryMemory', [
    'id', 'sourceKind', 'sourceId', 'sql', 'summaryStatus', 'tables', 'columns', 'outputColumns', 'indexedAt', 'updatedAt'
  ]);
  validateRecords(root.resultSessions, 'resultSessions', [
    'id', 'title', 'pinned', 'connectionId', 'databaseType', 'queryText', 'executionStatus', 'executionStartedAt',
    'resultSets', 'activeResultSetIndex', 'filters', 'sort', 'columnState', 'createdAt', 'updatedAt'
  ]);
  validateRecords(root.documentConnections, 'documentConnections', [
    'id', 'documentUri', 'connectionId', 'updatedAt'
  ]);

  for (const [index, value] of requiredArray(root.resultSessions, 'resultSessions').entries()) {
    const session = requiredObject(value, `resultSessions[${index}]`);
    validateRecords(session.resultSets, `resultSessions[${index}].resultSets`, [
      'id', 'title', 'fields', 'rows', 'rowCount', 'durationMs'
    ]);
  }
}

function validateRecords(value: unknown, path: string, fields: string[]): void {
  for (const [index, recordValue] of requiredArray(value, path).entries()) {
    const record = requiredObject(recordValue, `${path}[${index}]`);
    for (const field of fields) {
      if (!(field in record) || record[field] === undefined || record[field] === null) {
        throw new Error(`Missing required fixture field: ${path}[${index}].${field}`);
      }
    }
  }
}

function requiredArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected fixture array: ${path}`);
  return value;
}

function requiredObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected fixture object: ${path}`);
  }
  return value as Record<string, unknown>;
}

assertPersistedRecords(rawPersistedRecords);
export const persistedRecords = rawPersistedRecords;

export function createInMemoryExtensionContext(initial: {
  globalState?: Record<string, unknown>;
  workspaceState?: Record<string, unknown>;
  secrets?: Record<string, string>;
} = {}): vscode.ExtensionContext {
  const jsonClone = <T>(value: T): T => {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error('top-level value is not representable');
      return JSON.parse(serialized) as T;
    } catch (error) {
      throw new Error(`Memento values must be JSON-compatible: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const globalState = new Map(Object.entries(initial.globalState ?? {}).map(([key, value]) => [key, jsonClone(value)]));
  const workspaceState = new Map(Object.entries(initial.workspaceState ?? {}).map(([key, value]) => [key, jsonClone(value)]));
  const secrets = new Map<string, string>(Object.entries(initial.secrets ?? {}));
  const secretListeners = new Set<(event: { key: string }) => unknown>();

  const memento = (values: Map<string, unknown>) => ({
    get<T>(key: string, fallback?: T): T | undefined {
      return values.has(key) ? jsonClone(values.get(key)) as T : fallback;
    },
    async update(key: string, value: unknown): Promise<void> {
      if (value === undefined) values.delete(key);
      else values.set(key, jsonClone(value));
    },
    keys(): readonly string[] {
      return [...values.keys()];
    }
  });

  return {
    globalState: memento(globalState),
    workspaceState: memento(workspaceState),
    secrets: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
        secretListeners.forEach((listener) => listener({ key }));
      },
      delete: async (key: string) => {
        secrets.delete(key);
        secretListeners.forEach((listener) => listener({ key }));
      },
      onDidChange: ((listener: (event: { key: string }) => unknown) => {
        secretListeners.add(listener);
        return { dispose: () => secretListeners.delete(listener) };
      }) as vscode.Event<{ key: string }>
    }
  } as vscode.ExtensionContext;
}

export function compatibilityContext(): vscode.ExtensionContext {
  return createInMemoryExtensionContext({
    globalState: { 'database.connections': persistedRecords.connections },
    workspaceState: {
      'database.selectedConnectionId': 'legacy-connection',
      'database.queryConsoles': persistedRecords.queryConsoles,
      'database.queryHistory': persistedRecords.queryHistory,
      'database.queryMemory': persistedRecords.queryMemory,
      'database.resultTabs': persistedRecords.resultSessions,
      'database.sqlDocumentConnections': persistedRecords.documentConnections
    },
    secrets: { 'database.connection.legacy-connection.password': 'synthetic-secret' }
  });
}
