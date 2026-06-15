import { describe, expect, it } from 'vitest';
import { compareResultSets, formatResultSetDiffMarkdown } from '../src/services/resultSetDiffService';
import { ResultSet } from '../src/types';

describe('result set diff service', () => {
  it('compares row changes, additions, and removals', () => {
    const left = resultSet([
      { id: 1, status: 'open', amount: 10 },
      { id: 2, status: 'closed', amount: 25 }
    ]);
    const right = resultSet([
      { id: 1, status: 'open', amount: 12 },
      { id: 3, status: 'new', amount: 5 }
    ]);

    const report = compareResultSets(left, right, 'Left tab', 'Right tab');

    expect(report.identityColumns).toContain('id');
    expect(report.changedRows).toHaveLength(1);
    expect(report.changedRows[0].changes.map((change) => change.column)).toEqual(['amount']);
    expect(report.addedRows).toHaveLength(1);
    expect(report.removedRows).toHaveLength(1);
    expect(formatResultSetDiffMarkdown(report)).toContain('Result Set Diff');
  });
});

function resultSet(rows: Record<string, unknown>[]): ResultSet {
  return {
    id: 'result',
    title: 'Result',
    fields: rows[0] ? Object.keys(rows[0]).map((name) => ({ name })) : [],
    rows,
    rowCount: rows.length,
    durationMs: 1
  };
}
