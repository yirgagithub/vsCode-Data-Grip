import { describe, expect, it } from 'vitest';
import { formatSqlServerTemporalValue } from '../src/database/drivers/sqlServerDriver';

describe('formatSqlServerTemporalValue', () => {
  const value = new Date('2024-03-31T23:34:56.789Z');

  it.each([
    ['date', '2024-03-31'],
    ['time', '23:34:56.789'],
    ['datetime', '2024-03-31T23:34:56.789'],
    ['datetime2', '2024-03-31T23:34:56.789'],
    ['smalldatetime', '2024-03-31T23:34:56.789'],
    ['datetimeoffset', '2024-03-31T23:34:56.789Z']
  ] as const)('formats SQL Server %s values deterministically', (type, expected) => {
    expect(formatSqlServerTemporalValue(type, value)).toBe(expected);
  });

  it('preserves null temporal values', () => {
    expect(formatSqlServerTemporalValue('date', null)).toBeNull();
  });
});
