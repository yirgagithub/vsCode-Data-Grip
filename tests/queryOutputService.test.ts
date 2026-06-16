import { describe, expect, it, vi } from 'vitest';
import {
  formatDuration,
  formatQueryExecutionStartedOutput,
  formatQueryProgressOutput,
  formatQueryResultOutput
} from '../src/services/queryOutputService';
import { QueryResultTab } from '../src/types';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn()
    }))
  }
}));

describe('QueryOutputService formatting', () => {
  it('formats query start plainly with file context', () => {
    const lines = formatQueryExecutionStartedOutput('/tmp/query.sql', 2, Date.parse('2026-06-16T18:00:00Z'));

    expect(lines[1]).toContain('RUNNING 2 statements');
    expect(lines[2]).toBe('  file: /tmp/query.sql');
    expect(lines.join('\n')).not.toContain('\u001b[');
  });

  it('formats running SQL as a simple indented block', () => {
    const lines = formatQueryProgressOutput({
      statementIndex: 0,
      statementCount: 1,
      status: 'started',
      sql: 'select *\nfrom public.event_fact'
    });

    expect(lines.join('\n')).toContain([
      '  sql:',
      '    select *',
      '    from public.event_fact'
    ].join('\n'));
  });

  it('formats completed progress with readable duration, rows, and command', () => {
    const [line] = formatQueryProgressOutput({
      statementIndex: 0,
      statementCount: 1,
      status: 'completed',
      sql: 'select 1',
      durationMs: 72_000,
      rowCount: 10,
      command: 'SELECT'
    });

    expect(line).toContain('COMPLETED statement 1/1 completed in 1m 12s | 10 rows | SELECT');
    expect(line).not.toContain('\u001b[');
  });

  it('formats final result with total readable duration', () => {
    const [line] = formatQueryResultOutput({
      id: 'tab-1',
      title: 'SELECT public.event_fact',
      pinned: false,
      connectionId: 'local',
      databaseType: 'postgres',
      queryText: 'select 1',
      executionStatus: 'completed',
      executionStartedAt: Date.parse('2026-06-16T18:00:00Z'),
      executionFinishedAt: Date.parse('2026-06-16T18:01:12Z'),
      executionTimeMs: 72_000,
      rowCount: 10,
      resultSets: [],
      activeResultSetIndex: 0,
      filters: [],
      sort: [],
      columnState: [],
      createdAt: 1,
      updatedAt: 1
    } satisfies QueryResultTab);

    expect(line).toContain('COMPLETED total 1m 12s | 10 rows | SELECT public.event_fact');
    expect(line).not.toContain('\u001b[');
  });

  it('rounds sub-second and minute durations for logs', () => {
    expect(formatDuration(8)).toBe('1s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });
});
