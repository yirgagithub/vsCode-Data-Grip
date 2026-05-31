import { describe, expect, it } from 'vitest';
import { PostgresDriver } from '../src/database/drivers/postgresDriver';
import { ConnectionConfigWithPassword } from '../src/types';

const run = process.env.DATABASE_INTEGRATION_URL ? describe : describe.skip;

run('Postgres metadata integration', () => {
  it('loads schemas, tables, and columns from a seeded database', async () => {
    const driver = new PostgresDriver();
    const connection = configFromUrl(process.env.DATABASE_INTEGRATION_URL!);
    await driver.connect(connection);
    try {
      await driver.executeQuery({
        connectionId: connection.id,
        sql: 'create table if not exists public.vscode_data_grip_metadata_test (id integer primary key, email text not null)'
      });

      const schemas = await driver.getSchemas(connection.id);
      const tables = await driver.getTables(connection.id, 'public');
      const columns = await driver.getColumns(connection.id, 'public', 'vscode_data_grip_metadata_test');

      expect(schemas.some((schema) => schema.name === 'public')).toBe(true);
      expect(tables.some((table) => table.name === 'vscode_data_grip_metadata_test')).toBe(true);
      expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(['id', 'email']));
    } finally {
      await driver.disconnect(connection.id);
    }
  });
});

function configFromUrl(raw: string): ConnectionConfigWithPassword {
  const url = new URL(raw);
  return {
    id: 'metadata-integration',
    name: 'Metadata integration',
    type: 'postgres',
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, '') || 'postgres',
    username: decodeURIComponent(url.username || 'postgres'),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    sslMode: url.searchParams.get('sslmode') === 'require' ? 'require' : 'prefer',
    color: 'green',
    defaultSchema: 'public'
  };
}
