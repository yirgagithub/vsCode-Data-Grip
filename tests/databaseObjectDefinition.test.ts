import { describe, expect, it } from 'vitest';
import { BasicDatabaseDriver } from '../src/database/drivers/driverUtils';
import { RedisDriver } from '../src/database/drivers/redisDriver';
import { ColumnInfo, ConnectionConfigWithPassword, DbConnection, ExecuteQueryParams, QueryExecutionResult, SchemaInfo, TableInfo, TablePreviewOptions } from '../src/types';

class ContractDriver extends BasicDatabaseDriver {
  readonly id = 'sqlite' as const;
  readonly displayName = 'Contract';
  async connect(_config: ConnectionConfigWithPassword): Promise<DbConnection> { throw new Error('unused'); }
  async disconnect(_connectionId: string): Promise<void> {}
  async executeQuery(_params: ExecuteQueryParams): Promise<QueryExecutionResult> { throw new Error('unused'); }
  async executeStatements(_params: ExecuteQueryParams, _statements: string[]): Promise<QueryExecutionResult[]> { return []; }
  async getSchemas(_connectionId: string): Promise<SchemaInfo[]> { return []; }
  async getTables(_connectionId: string, _schema: string): Promise<TableInfo[]> { return []; }
  async getColumns(_connectionId: string, _schema: string, _table: string): Promise<ColumnInfo[]> { return []; }
  async getTablePreview(_connectionId: string, _schema: string, _table: string, _limit: number, _options?: TablePreviewOptions): Promise<QueryExecutionResult> { throw new Error('unused'); }
  override async getTableDDL(): Promise<string> { return 'native table text\n'; }
}

describe('database object definition contract', () => {
  it('does not synthesize feature definitions in the shared base driver', async () => {
    const driver = new ContractDriver();
    await expect(driver.getObjectDefinition('local', { kind: 'table', schema: 'main', name: 'users' }))
      .resolves.toBeUndefined();
  });
  it.each(['view', 'function', 'procedure', 'trigger'] as const)('returns undefined for unsupported %s definitions', async (kind) => {
    const driver = new ContractDriver();
    await expect(driver.getObjectDefinition('local', { kind, schema: 'main', name: 'thing' }))
      .resolves.toBeUndefined();
  });

  it.each(['table', 'view', 'function', 'procedure', 'trigger'] as const)('keeps Redis %s definitions unsupported', async (kind) => {
    await expect(new RedisDriver().getObjectDefinition('missing', { kind, schema: 'db0', name: 'keys' })).resolves.toBeUndefined();
  });
});
