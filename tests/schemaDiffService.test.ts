import { describe, expect, it } from 'vitest';
import { compareSchemas, formatSchemaDiffMarkdown } from '../src/services/schemaDiffService';
import { ColumnInfo } from '../src/types';

describe('schema diff service', () => {
  it('derives create, drop, and alter migration SQL', () => {
    const report = compareSchemas({
      sourceConnectionName: 'source',
      targetConnectionName: 'target',
      targetDatabaseType: 'postgres',
      sourceSchema: {
        schemaName: 'public',
        tables: [{ schema: 'public', name: 'orders', type: 'table' }, { schema: 'public', name: 'new_table', type: 'table' }],
        views: [{ schema: 'public', name: 'active_orders', type: 'view' }],
        columns: {
          'public.orders': columns([
            { name: 'id', dataType: 'integer', nullable: false },
            { name: 'status', dataType: 'text', nullable: true },
            { name: 'created_at', dataType: 'timestamp', nullable: false }
          ]),
          'public.new_table': columns([
            { name: 'id', dataType: 'bigint', nullable: false }
          ])
        }
      },
      targetSchema: {
        schemaName: 'public',
        tables: [{ schema: 'public', name: 'legacy_orders', type: 'table' }, { schema: 'public', name: 'orders', type: 'table' }],
        views: [],
        columns: {
          'public.orders': columns([
            { name: 'id', dataType: 'integer', nullable: false },
            { name: 'status', dataType: 'varchar', nullable: false },
            { name: 'legacy_flag', dataType: 'boolean', nullable: true }
          ])
        }
      }
    });

    expect(report.createViews).toHaveLength(1);
    expect(report.createTables).toHaveLength(1);
    expect(report.dropTables).toHaveLength(1);
    expect(report.alterTables).toHaveLength(1);
    expect(report.migrationSql).toContain('create table "public"."new_table"');
    expect(report.migrationSql).toContain('drop table if exists "public"."legacy_orders"');
    expect(report.migrationSql).toContain('add column');
    expect(formatSchemaDiffMarkdown(report)).toContain('Schema Diff');
  });

  it('uses target database syntax for migration SQL', () => {
    const report = compareSchemas({
      sourceConnectionName: 'source',
      targetConnectionName: 'target',
      targetDatabaseType: 'sqlserver',
      sourceSchema: {
        schemaName: 'dbo',
        tables: [{ schema: 'dbo', name: 'orders', type: 'table' }],
        views: [],
        columns: {
          'dbo.orders': columns([
            { name: 'id', dataType: 'int', nullable: false },
            { name: 'status', dataType: 'nvarchar(255)', nullable: true }
          ], 'dbo', 'orders')
        }
      },
      targetSchema: {
        schemaName: 'dbo',
        tables: [{ schema: 'dbo', name: 'orders', type: 'table' }],
        views: [],
        columns: {
          'dbo.orders': columns([
            { name: 'id', dataType: 'int', nullable: false }
          ], 'dbo', 'orders')
        }
      }
    });

    expect(report.migrationSql).toContain('alter table [dbo].[orders]');
    expect(report.migrationSql).toContain('add [status] nvarchar(255);');
  });
});

function columns(values: Array<Pick<ColumnInfo, 'name' | 'dataType' | 'nullable'>>, schema = 'public', table = 'orders'): ColumnInfo[] {
  return values.map((value, index) => ({
    schema,
    table,
    name: value.name,
    ordinal: index + 1,
    dataType: value.dataType,
    nullable: value.nullable
  }));
}
