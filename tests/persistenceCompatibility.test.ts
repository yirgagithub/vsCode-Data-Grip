import { describe, expect, it, vi } from 'vitest';
import { ConnectionStore } from '../src/persistence/connectionStore';
import { QueryConsoleStore } from '../src/persistence/queryConsoleStore';
import { QueryHistoryStore } from '../src/persistence/queryHistoryStore';
import { QueryMemoryStore } from '../src/persistence/queryMemoryStore';
import { ResultSessionStore } from '../src/persistence/resultSessionStore';
import { SqlDocumentConnectionStore } from '../src/persistence/sqlDocumentConnectionStore';
import { compatibilityContext, persistedRecords } from './helpers/inMemoryExtensionContext';

vi.mock('vscode', () => ({}));

describe('persisted record compatibility', () => {
  it('keeps a reviewed fixture for every persisted store', () => {
    expect(Object.keys(persistedRecords).sort()).toEqual([
      'connections', 'documentConnections', 'queryConsoles', 'queryHistory', 'queryMemory', 'resultSessions'
    ]);
    Object.values(persistedRecords).forEach((records) => expect(records).not.toEqual([]));
  });

  it('reads connection records through ConnectionStore', () => {
    const record = new ConnectionStore(compatibilityContext()).getAll().find(({ id }) => id === 'legacy-connection');
    expect(record?.database).toBe('synthetic_app');
    expect(record).not.toHaveProperty('password');
  });

  it('reads query console records through QueryConsoleStore', () => {
    const record = new QueryConsoleStore(compatibilityContext()).getAll().find(({ id }) => id === 'legacy-console');
    expect(record?.documentUri).toBe('file:///synthetic/query-console.sql');
  });

  it('reads query history records through QueryHistoryStore', () => {
    const record = new QueryHistoryStore(compatibilityContext()).getAll().find(({ id }) => id === 'legacy-history');
    expect(record?.sql).toBe('select synthetic_id from synthetic_table');
  });

  it('reads query memory records through QueryMemoryStore', () => {
    const record = new QueryMemoryStore(compatibilityContext()).get('legacy-memory');
    expect(record?.summary).toBe('Reads synthetic identifiers.');
  });

  it('reads result session records through ResultSessionStore', () => {
    const record = new ResultSessionStore(compatibilityContext()).getTabs().find(({ id }) => id === 'legacy-result-session');
    expect(record?.title).toBe('Legacy query');
  });

  it('reads document bindings through SqlDocumentConnectionStore', () => {
    const record = new SqlDocumentConnectionStore(compatibilityContext()).get('file:///synthetic/bound.sql');
    expect(record?.connectionId).toBe('legacy-connection');
  });
});
