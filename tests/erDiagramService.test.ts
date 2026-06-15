import { describe, expect, it, vi } from 'vitest';
import { ErDiagramService } from '../src/services/erDiagramService';
import { ConnectionConfig } from '../src/types';

describe('er diagram service', () => {
  it('builds table cards and foreign-key relations from schema metadata', async () => {
    const connection = {
      id: 'local',
      name: 'Local',
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'app',
      username: 'app',
      sslMode: 'disable',
      color: 'blue'
    } as ConnectionConfig;
    const schemaContext = {
      loadSchema: vi.fn(async () => ({
        status: 'ready',
        schemaName: 'public',
        tables: [
          { schema: 'public', name: 'authors', type: 'table', rowEstimate: 10 },
          { schema: 'public', name: 'books', type: 'table', rowEstimate: 20 }
        ],
        views: [],
        columns: {
          'public.authors': [
            { name: 'id', dataType: 'integer', nullable: false },
            { name: 'name', dataType: 'text', nullable: false }
          ],
          'public.books': [
            { name: 'id', dataType: 'integer', nullable: false },
            { name: 'author_id', dataType: 'integer', nullable: false }
          ]
        },
        keys: {},
        indexes: {},
        schemas: []
      })),
      getPrimaryKeys: vi.fn(async (_connection: ConnectionConfig, _schema: string, table: string) => (
        table === 'authors'
          ? [{ name: 'authors_pkey', columns: ['id'] }]
          : [{ name: 'books_pkey', columns: ['id'] }]
      ))
    } as never;
    const connectionManager = {
      isConnected: vi.fn(() => true),
      connect: vi.fn(async () => undefined),
      getDriver: vi.fn(() => ({
        getForeignKeys: vi.fn(async (_connectionId: string, _schema: string, table: string) => (
          table === 'books'
            ? [{ name: 'books_author_id_fkey', columns: ['author_id'], foreignSchema: 'public', foreignTable: 'authors', foreignColumns: ['id'] }]
            : []
        ))
      }))
    } as never;

    const service = new ErDiagramService(connectionManager, schemaContext);
    const report = await service.build({ connection, schemaName: 'public' });

    expect(report.tables).toHaveLength(2);
    expect(report.tables.find((table) => table.name === 'authors')?.primaryKeys).toEqual(['id']);
    expect(report.relations).toHaveLength(1);
    expect(report.relations[0].fromTable).toBe('books');
    expect(report.relations[0].toTable).toBe('authors');
  });
});
