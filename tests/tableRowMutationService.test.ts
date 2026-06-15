import { describe, expect, it, vi } from 'vitest';
import { TableRowMutationService } from '../src/services/tableRowMutationService';
import { SchemaContextService } from '../src/services/schemaContextService';
import { ConnectionConfig } from '../src/types';

function connection(): ConnectionConfig {
  return {
    id: 'local',
    name: 'Local',
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'app',
    username: 'user',
    sslMode: 'prefer',
    color: 'gray',
    defaultSchema: 'public'
  };
}

describe('TableRowMutationService', () => {
  it('builds update SQL from cached primary keys and typed values', async () => {
    const schemaContext = {
      getPrimaryKeys: vi.fn(async () => [{ name: 'event_fact_pkey', columns: ['id'] }]),
      getColumns: vi.fn(async () => [])
    } as unknown as SchemaContextService;
    const service = new TableRowMutationService(schemaContext);

    const preview = await service.preview({
      kind: 'edit-cell',
      target: { connection: connection(), schema: 'public', table: 'event_fact' },
      originalRow: { id: 7, amount: 12.5 },
      column: 'amount',
      valueText: '18.75'
    });

    expect(preview.sql).toBe('update "public"."event_fact"\nset "amount" = 18.75\nwhere "id" = 7;');
  });

  it('builds delete SQL from cached primary keys', async () => {
    const schemaContext = {
      getPrimaryKeys: vi.fn(async () => [{ name: 'event_fact_pkey', columns: ['id'] }]),
      getColumns: vi.fn(async () => [])
    } as unknown as SchemaContextService;
    const service = new TableRowMutationService(schemaContext);

    const preview = await service.preview({
      kind: 'delete-row',
      target: { connection: connection(), schema: 'public', table: 'event_fact' },
      originalRow: { id: 11, amount: 2 }
    });

    expect(preview.sql).toBe('delete from "public"."event_fact"\nwhere "id" = 11;');
  });

  it('builds insert SQL from JSON input', async () => {
    const schemaContext = {
      getPrimaryKeys: vi.fn(async () => []),
      getColumns: vi.fn(async () => [])
    } as unknown as SchemaContextService;
    const service = new TableRowMutationService(schemaContext);

    const preview = await service.preview({
      kind: 'insert-row',
      target: { connection: connection(), schema: 'public', table: 'event_fact', columns: ['id', 'amount', 'active'] },
      rowText: '{"id":12,"amount":3.5,"active":true}'
    });

    expect(preview.sql).toBe('insert into "public"."event_fact" ("id", "amount", "active")\nvalues (12, 3.5, true);');
  });
});
