import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { ResultSessionStore } from '../src/persistence/resultSessionStore';
import type { QueryResultTab } from '../src/types';
import { compatibilityContext, createInMemoryExtensionContext } from './helpers/inMemoryExtensionContext';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => true) }))
  }
}));

describe('ResultSessionStore temporal values', () => {
  it('reads the reviewed legacy result session fixture', () => {
    const record = new ResultSessionStore(compatibilityContext()).getTabs()
      .find(({ id }) => id === 'legacy-result-session');

    expect(record?.resultSets[0].rows[0]).toEqual({
      synthetic_id: 42, null_value: null, date_value: '2025-11-09',
      timestamp_tz_value: '2025-11-09T14:23:45.123456+05:30', numeric_value: '12345678901234567890.123456789',
      binary_value: { type: 'Buffer', data: [0, 127, 255] }, json_value: { nested: [true, null, 'value'] },
      engine_value: 'infinity'
    });
  });

  it('models VS Code Memento JSON normalization and rejection', async () => {
    const context = createInMemoryExtensionContext();
    await context.workspaceState.update('normalized', { date: new Date('2025-01-02T03:04:05.000Z'), missing: undefined, nan: NaN });
    expect(context.workspaceState.get('normalized')).toEqual({ date: '2025-01-02T03:04:05.000Z', nan: null });
    await expect(context.workspaceState.update('unsupported', 1n)).rejects.toThrow(/JSON-compatible/);
  });

  it('persists and restores temporal strings without conversion', async () => {
    const temporalRow = {
      date_value: '2025-11-09',
      time_value: '14:23:45.123456',
      timestamp_value: '2025-11-09 14:23:45.123456',
      timestamp_tz_value: '2025-11-09T14:23:45.123456+05:30'
    };
    const context = createInMemoryExtensionContext();
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
