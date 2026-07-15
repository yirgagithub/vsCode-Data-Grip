import { describe, expect, it } from 'vitest';
import { formatFieldValue, rowsToInsertSql, rowsToMarkdown } from '../src/webviews/results/app/format';

describe('result format helpers', () => {
  it('preserves date-only calendar values without UTC shifting', () => {
    expect(formatFieldValue(new Date('2025-11-08T23:00:00.000Z'), { dataTypeId: 1082, dataTypeName: 'date' })).toBe('2025-11-09');
    expect(formatFieldValue(new Date('2025-11-08T23:00:00.000Z'), { dataTypeId: 1184, dataTypeName: 'timestamptz' })).toBe('2025-11-08T23:00:00.000Z');
    expect(formatFieldValue('2025-11-09', { dataTypeName: 'date' })).toBe('2025-11-09');
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
