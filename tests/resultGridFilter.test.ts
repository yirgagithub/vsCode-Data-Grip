import { beforeAll, describe, expect, it, vi } from 'vitest';
import { withPreservedResultGridState } from '../src/webviews/results/gridState';
import { QueryResultTab } from '../src/types';

describe('ResultGrid value filters', () => {
  beforeAll(() => {
    vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn() }));
  });

  it('starts a new value filter with no selected values', async () => {
    const { initialColumnFilterSelection } = await import('../src/webviews/results/app/components/ResultGrid');

    expect(initialColumnFilterSelection(undefined, ['active', 'paused'])).toEqual([]);
  });

  it('keeps existing selected values when reopening an active value filter', async () => {
    const { initialColumnFilterSelection } = await import('../src/webviews/results/app/components/ResultGrid');

    expect(initialColumnFilterSelection({ column: 'status', operator: 'values', value: '', values: ['active'] }, ['active', 'paused'])).toEqual(['active']);
  });

  it('does not match any rows when an applied value filter has no selected values', async () => {
    const { matchesColumnFilter } = await import('../src/webviews/results/app/components/ResultGrid');

    expect(matchesColumnFilter('active', { column: 'status', operator: 'values', value: '', values: [] })).toBe(false);
  });

  it('derives cascading options from rows matching every other filter', async () => {
    const { buildColumnFilterOptions, rowsForColumnOptions } = await import('../src/webviews/results/app/resultFilters');
    const rows = [
      { region: 'Africa', country: 'Ethiopia' },
      { region: 'Africa', country: 'Kenya' },
      { region: 'Europe', country: 'Germany' }
    ];
    const filters = [{ column: 'region', operator: 'values' as const, value: '', values: ['Africa'] }];
    const fields = [{ name: 'region' }, { name: 'country' }];

    expect(buildColumnFilterOptions(rowsForColumnOptions(rows, filters, 'country', fields), fields[1]).map((option) => option.label)).toEqual(['Ethiopia', 'Kenya']);
  });

  it('excludes the target column own filter when deriving its options', async () => {
    const { rowsForColumnOptions } = await import('../src/webviews/results/app/resultFilters');
    const rows = [{ region: 'Africa', country: 'Ethiopia' }, { region: 'Africa', country: 'Kenya' }];
    const filters = [
      { column: 'region', operator: 'values' as const, value: '', values: ['Africa'] },
      { column: 'country', operator: 'values' as const, value: '', values: ['Ethiopia'] }
    ];
    expect(rowsForColumnOptions(rows, filters, 'country', [{ name: 'region' }, { name: 'country' }])).toHaveLength(2);
  });

  it('keeps select-all state and count on the complete value set', async () => {
    const { selectionState, toggleAllValues } = await import('../src/webviews/results/app/resultFilters');
    const all = ['a', 'b', 'c'];
    expect(selectionState(new Set(['a']), all)).toBe('partial');
    expect(toggleAllValues(new Set(['a']), all)).toEqual(new Set());
    expect(toggleAllValues(new Set(), all)).toEqual(new Set(all));
  });

  it('warns at the high-cardinality thresholds', async () => {
    const { analyzeFilterCardinality } = await import('../src/webviews/results/app/resultFilters');
    const rows = Array.from({ length: 10_000 }, (_, index) => ({ value: `value-${index}` }));
    expect(analyzeFilterCardinality(rows, { name: 'value' }).warned).toBe(true);
    expect(analyzeFilterCardinality([{ value: 'x'.repeat(100) }], { name: 'value' }, { uniqueLimit: 20, memoryLimitBytes: 50 }).warned).toBe(true);
  });

  it('preserves filters and sort when pagination reruns replace the tab result set', () => {
    const previous = resultTab({
      filters: [{ column: 'status', operator: 'values', value: '', values: ['active'] }],
      sort: [{ column: 'created_at', direction: 'desc' }]
    });
    const next = resultTab({
      filters: [],
      sort: [],
      rowOffset: 50,
      resultSets: [{
        id: 'page-2',
        title: 'Page 2',
        fields: [{ name: 'status' }],
        rows: [{ status: 'active' }],
        rowCount: 1,
        durationMs: 2
      }]
    });

    expect(withPreservedResultGridState(next, previous)).toMatchObject({
      rowOffset: 50,
      filters: [{ column: 'status', operator: 'values', value: '', values: ['active'] }],
      sort: [{ column: 'created_at', direction: 'desc' }]
    });
  });
});

function resultTab(overrides: Partial<QueryResultTab>): QueryResultTab {
  return {
    id: overrides.id ?? 'tab',
    title: overrides.title ?? 'SQL',
    pinned: overrides.pinned ?? false,
    connectionId: overrides.connectionId ?? 'local',
    databaseType: overrides.databaseType ?? 'postgres',
    queryText: overrides.queryText ?? 'select * from events',
    executionStatus: overrides.executionStatus ?? 'completed',
    executionStartedAt: overrides.executionStartedAt ?? 1,
    executionFinishedAt: overrides.executionFinishedAt ?? 2,
    executionTimeMs: overrides.executionTimeMs ?? 1,
    rowCount: overrides.rowCount ?? 1,
    rowOffset: overrides.rowOffset,
    resultSets: overrides.resultSets ?? [{
      id: 'page-1',
      title: 'Page 1',
      fields: [{ name: 'status' }],
      rows: [{ status: 'active' }],
      rowCount: 1,
      durationMs: 1
    }],
    activeResultSetIndex: overrides.activeResultSetIndex ?? 0,
    filters: overrides.filters ?? [],
    sort: overrides.sort ?? [],
    columnState: overrides.columnState ?? [],
    scrollState: overrides.scrollState,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 2
  };
}
