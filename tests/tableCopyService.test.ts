import { describe, expect, it } from 'vitest';
import { buildTableCopyPreview } from '../src/services/tableCopyService';
import { ColumnInfo } from '../src/types';

describe('table copy service', () => {
  it('builds a create-table plus insert script for another connection', () => {
    const preview = buildTableCopyPreview(
      'public',
      'orders',
      'archive',
      'orders_copy',
      columns(),
      [{ id: 1, status: 'new' }, { id: 2, status: 'done' }],
      'source',
      'target'
    );

    expect(preview.sql).toContain('create table "archive"."orders_copy"');
    expect(preview.sql).toContain('insert into "archive"."orders_copy"');
    expect(preview.sql).toContain('-- Source table: "public"."orders"');
    expect(preview.sourceRowCount).toBe(2);
  });

  it('still builds structure-only SQL for empty tables', () => {
    const preview = buildTableCopyPreview(
      'public',
      'empty_table',
      'archive',
      'empty_table_copy',
      columns(),
      [],
      'source',
      'target'
    );

    expect(preview.sql).toContain('create table "archive"."empty_table_copy"');
    expect(preview.sql).not.toContain('insert into "archive"."empty_table_copy"');
    expect(preview.warnings).toContain('No data rows were found; only the table structure will be copied.');
  });

  it('uses destination database syntax for copy scripts', () => {
    const preview = buildTableCopyPreview(
      'public',
      'orders',
      'archive',
      'orders_copy',
      columns(),
      [{ id: 1, status: 'new' }],
      'source',
      'target',
      'mysql'
    );

    expect(preview.sql).toContain('create table `archive`.`orders_copy`');
    expect(preview.sql).toContain('insert into `archive`.`orders_copy` (`id`, `status`)');
  });
});

function columns(): ColumnInfo[] {
  return [
    { schema: 'public', table: 'orders', name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
    { schema: 'public', table: 'orders', name: 'status', ordinal: 2, dataType: 'text', nullable: true }
  ];
}
