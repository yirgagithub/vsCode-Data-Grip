import { beforeAll, describe, expect, it, vi } from 'vitest';

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
});
