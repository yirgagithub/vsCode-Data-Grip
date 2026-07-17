import { describe, expect, it } from 'vitest';
import { formatFieldValue, rowsToCsv, rowsToInsertSql, rowsToMarkdown, rowsToTsv } from '../src/webviews/results/app/format';

const temporalRow = {
  date_value: '2025-11-09',
  time_value: '14:23:45.123456',
  timestamp_value: '2025-11-09 14:23:45.123456',
  timestamp_tz_value: '2025-11-09T14:23:45.123456+05:30'
};

describe('result format helpers', () => {
  it('preserves date-only calendar values without UTC shifting', () => {
    const localDate = new Date(2025, 10, 9);

    expect(formatFieldValue(localDate, { dataTypeId: 1082, dataTypeName: 'date' })).toBe('2025-11-09');
    expect(formatFieldValue(localDate, { dataTypeId: 1184, dataTypeName: 'timestamptz' })).toBe(localDate.toISOString());
    expect(formatFieldValue('2025-11-09', { dataTypeName: 'date' })).toBe('2025-11-09');
  });

  it('preserves temporal strings through field and copy/export formatting', () => {
    for (const value of Object.values(temporalRow)) {
      expect(formatFieldValue(value)).toBe(value);
    }

    expect(rowsToTsv([temporalRow])).toBe(
      'date_value\ttime_value\ttimestamp_value\ttimestamp_tz_value\n' +
      '2025-11-09\t14:23:45.123456\t2025-11-09 14:23:45.123456\t2025-11-09T14:23:45.123456+05:30'
    );
    expect(rowsToCsv([temporalRow])).toBe(
      'date_value,time_value,timestamp_value,timestamp_tz_value\n' +
      '2025-11-09,14:23:45.123456,2025-11-09 14:23:45.123456,2025-11-09T14:23:45.123456+05:30'
    );
    expect(rowsToMarkdown([temporalRow])).toBe(
      '| date_value | time_value | timestamp_value | timestamp_tz_value |\n' +
      '| --- | --- | --- | --- |\n' +
      '| 2025-11-09 | 14:23:45.123456 | 2025-11-09 14:23:45.123456 | 2025-11-09T14:23:45.123456+05:30 |'
    );
  });

  it('renders markdown tables', () => {
    expect(rowsToMarkdown([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Ben' }
    ])).toBe(
      '| id | name |\n| --- | --- |\n| 1 | Ada |\n| 2 | Ben |'
    );
  });

  it('renders insert SQL batches', () => {
    expect(rowsToInsertSql([
      { id: 1, name: 'Ada', active: true }
    ], 'public', 'users')).toBe(
      'insert into "public"."users" ("id", "name", "active")\nvalues\n  (1, \'Ada\', true);'
    );
  });

  it('renders insert SQL for the requested database type', () => {
    expect(rowsToInsertSql([
      { id: 1, name: 'Ada', active: true }
    ], 'app', 'users', 'mysql')).toBe(
      'insert into `app`.`users` (`id`, `name`, `active`)\nvalues\n  (1, \'Ada\', true);'
    );
  });
});
