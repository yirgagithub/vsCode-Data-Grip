import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { ResultSessionStore } from '../src/persistence/resultSessionStore';
import type { QueryResultTab } from '../src/types';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => true) }))
  }
}));

describe('ResultSessionStore temporal values', () => {
  it('persists and restores temporal strings without conversion', async () => {
    const temporalRow = {
      date_value: '2025-11-09',
      time_value: '14:23:45.123456',
      timestamp_value: '2025-11-09 14:23:45.123456',
      timestamp_tz_value: '2025-11-09T14:23:45.123456+05:30'
    };
    let persisted: QueryResultTab[] = [];
    const context = {
      workspaceState: {
        get: vi.fn((_key: string, fallback: QueryResultTab[]) => persisted.length ? persisted : fallback),
        update: vi.fn(async (_key: string, value: QueryResultTab[]) => {
          persisted = JSON.parse(JSON.stringify(value)) as QueryResultTab[];
        })
      }
    } as never;
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => true) } as never);
    const store = new ResultSessionStore(context);
    const tab = {
      id: 'temporal', title: 'Temporal', pinned: true, connectionId: 'local', databaseType: 'postgres',
      queryText: 'select temporal_values', executionStatus: 'completed', executionStartedAt: 1,
      resultSets: [{ id: 'result', title: 'Result', fields: [], rows: [temporalRow], rowCount: 1, durationMs: 1 }],
      activeResultSetIndex: 0, filters: [], sort: [], columnState: [], createdAt: 1, updatedAt: 1
    } satisfies QueryResultTab;

    await store.saveTabs([tab]);

    expect(store.getTabs()[0].resultSets[0].rows).toEqual([temporalRow]);
  });
});
