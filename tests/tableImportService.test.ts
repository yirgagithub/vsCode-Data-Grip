import { describe, expect, it } from 'vitest';
import { buildTableImportData, buildTableImportPreview, buildTableImportStatements } from '../src/services/tableImportService';
import { ColumnInfo } from '../src/types';

const columns: ColumnInfo[] = [
  { schema: 'public', table: 'users', name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
  { schema: 'public', table: 'users', name: 'name', ordinal: 2, dataType: 'text', nullable: false },
  { schema: 'public', table: 'users', name: 'active', ordinal: 3, dataType: 'boolean', nullable: true }
];

describe('tableImportService', () => {
  it('builds an editable import preview from CSV input', () => {
    const preview = buildTableImportPreview('postgres', 'public', 'users', columns, 'users.csv', 'id,name,active\n1,Ada,true\n2,Ben,false\n');

    expect(preview.rowCount).toBe(2);
    expect(preview.sourceColumns).toEqual(['id', 'name', 'active']);
    expect(preview.mapping).toEqual([
      { source: 'id', target: 'id', targetType: 'integer', auto: true },
      { source: 'name', target: 'name', targetType: 'text', auto: true },
      { source: 'active', target: 'active', targetType: 'boolean', auto: true }
    ]);
    expect(preview.sampleRows).toEqual([
      { id: 1, name: 'Ada', active: true },
      { id: 2, name: 'Ben', active: false }
    ]);
  });

  it('builds an editable import preview from JSON input', () => {
    const preview = buildTableImportPreview('postgres', 'public', 'users', columns, 'users.json', JSON.stringify([
      { id: 10, name: 'Ava', active: true }
    ]));

    expect(preview.rowCount).toBe(1);
    expect(preview.sampleRows).toEqual([{ id: 10, name: 'Ava', active: true }]);
  });

  it('materializes rows with a manual mapping', () => {
    const data = buildTableImportData('users.csv', 'user_id,full_name\n1,Ada\n', [
      { source: 'user_id', target: 'id' },
      { source: 'full_name', target: 'name' },
      { source: null, target: 'active' }
    ]);

    expect(data).toEqual({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Ada' }]
    });
  });

  it('uses destination database syntax for direct import batches', () => {
    const preview = buildTableImportPreview('sqlserver', 'dbo', 'users', columns, 'users.csv', 'id,name,active\n1,Ada,true\n');
    const data = buildTableImportData('users.csv', 'id,name,active\n1,Ada,true\n', preview.mapping);
    const [sql] = buildTableImportStatements('sqlserver', 'dbo', 'users', data);

    expect(sql).toContain('insert into [dbo].[users] ([id], [name], [active])');
    expect(sql).toContain('(1, \'Ada\', 1)');
  });
});
