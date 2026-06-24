import { describe, expect, it } from 'vitest';
import { rowsToInsertSql, rowsToMarkdown } from '../src/webviews/results/app/format';

describe('result format helpers', () => {
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
