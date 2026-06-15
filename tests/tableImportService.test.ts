import { describe, expect, it } from 'vitest';
import { buildTableImportPreview } from '../src/services/tableImportService';
import { ColumnInfo } from '../src/types';

const columns: ColumnInfo[] = [
  { schema: 'public', table: 'users', name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
  { schema: 'public', table: 'users', name: 'name', ordinal: 2, dataType: 'text', nullable: false },
  { schema: 'public', table: 'users', name: 'active', ordinal: 3, dataType: 'boolean', nullable: true }
];

describe('tableImportService', () => {
  it('builds batched insert SQL from CSV input', () => {
    const preview = buildTableImportPreview('public', 'users', columns, 'users.csv', 'id,name,active\n1,Ada,true\n2,Ben,false\n');

    expect(preview.rowCount).toBe(2);
    expect(preview.mapping).toEqual([
      { source: 'id', target: 'id' },
      { source: 'name', target: 'name' },
      { source: 'active', target: 'active' }
    ]);
    expect(preview.sql).toContain('insert into "public"."users" ("id", "name", "active")');
    expect(preview.sql).toContain('(1, \'Ada\', true)');
    expect(preview.sql).toContain('(2, \'Ben\', false)');
  });

  it('builds batched insert SQL from JSON input', () => {
    const preview = buildTableImportPreview('public', 'users', columns, 'users.json', JSON.stringify([
      { id: 10, name: 'Ava', active: true }
    ]));

    expect(preview.rowCount).toBe(1);
    expect(preview.sql).toContain('(10, \'Ava\', true)');
  });
});
