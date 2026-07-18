import { describe, expect, it } from 'vitest';
import { AgentDatabaseService } from '../src/mcp/agentDatabaseService';
import { BasicDatabaseDriver, executionResultFromRows } from '../src/database/drivers/driverUtils';
import {
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExecuteQueryParams,
  QueryExecutionResult,
  SchemaInfo,
  TableInfo,
  TablePreviewOptions
} from '../src/types';

class FakeDriver extends BasicDatabaseDriver {
  readonly id = 'postgres' as const;
  readonly displayName = 'PostgreSQL';
  readonly executedSql: string[] = [];
  rows: Record<string, unknown>[] = [{ answer: 42 }];
  connected = false;

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    this.connected = true;
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(_params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    this.executedSql.push(...statements);
    return statements.map((sql) => executionResultFromRows(this.rows, Date.now(), sql));
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    return [{ name: 'public' }];
  }

  async getTables(_connectionId: string, schema: string): Promise<TableInfo[]> {
    return [{ schema, name: 'orders', type: 'table', rowEstimate: 12 }];
  }

  async getColumns(_connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    return [
      { schema, table, name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
      { schema, table, name: 'status', ordinal: 2, dataType: 'text', nullable: true }
    ];
  }

  async getTablePreview(_connectionId: string, _schema: string, _table: string, _limit: number, _options?: TablePreviewOptions): Promise<QueryExecutionResult> {
    return executionResultFromRows([{ id: 1 }], Date.now(), 'select * from public.orders');
  }
}

function createService(driver = new FakeDriver(), defaultMaxRows = 25): { service: AgentDatabaseService; driver: FakeDriver } {
  return {
    driver,
    service: new AgentDatabaseService({
      defaultMaxRows,
      connections: [{
        id: 'local',
        name: 'Local',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'app',
        username: 'app',
        password: 'secret',
        sslMode: 'disable',
        color: 'blue'
      }],
      queryMemory: [{
        id: 'memory-1',
        sourceKind: 'history',
        sourceId: 'history-1',
        connectionId: 'local',
        databaseType: 'postgres',
        databaseName: 'app',
        connectionName: 'Local',
        sql: 'select status, count(*) from orders group by status',
        title: 'orders by status',
        summary: 'Counts orders by status.',
        summaryStatus: 'ready',
        tables: ['orders'],
        columns: ['orders.status'],
        outputColumns: ['status', 'count'],
        status: 'completed',
        indexedAt: Date.now(),
        updatedAt: Date.now()
      }]
    }, new Map([['postgres', driver]]))
  };
}

describe('AgentDatabaseService MCP tools', () => {
  it('lists connections without exposing passwords', () => {
    const { service } = createService();

    expect(service.listConnections()).toEqual([expect.objectContaining({
      id: 'local',
      name: 'Local',
      hasPassword: true
    })]);
    expect(JSON.stringify(service.listConnections())).not.toContain('secret');
  });

  it('returns schema context with columns', async () => {
    const { service } = createService();

    await expect(service.getSchema({ connectionId: 'local' })).resolves.toEqual([
      expect.objectContaining({
        schema: { name: 'public' },
        tables: [expect.objectContaining({
          name: 'orders',
          columns: [expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'status' })]
        })]
      })
    ]);
  });

  it('runs read-only queries and rejects writes', async () => {
    const { service, driver } = createService();

    await expect(service.runReadOnlyQuery({ connectionId: 'local', sql: 'select * from orders', maxRows: 5 })).resolves.toEqual([
      expect.objectContaining({ rows: [{ answer: 42 }] })
    ]);
    expect(driver.executedSql).toEqual(['select * from orders']);

    await expect(service.runReadOnlyQuery({ connectionId: 'local', sql: 'delete from orders' })).rejects.toThrow(/read-only/i);
    expect(driver.executedSql).toEqual(['select * from orders']);
  });

  it('enforces MCP row limits even when a driver returns too many rows', async () => {
    const driver = new FakeDriver();
    driver.rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { service } = createService(driver, 2);

    await expect(service.runReadOnlyQuery({ connectionId: 'local', sql: 'select * from orders' })).resolves.toEqual([
      expect.objectContaining({ rows: [{ id: 1 }, { id: 2 }] })
    ]);
  });

  it('returns temporal strings unchanged through the MCP query service', async () => {
    const driver = new FakeDriver();
    driver.rows = [{
      date_value: '2025-11-09',
      time_value: '14:23:45.123456',
      timestamp_value: '2025-11-09 14:23:45.123456',
      timestamp_tz_value: '2025-11-09T14:23:45.123456+05:30'
    }];
    const { service } = createService(driver);

    const [result] = await service.runReadOnlyQuery({ connectionId: 'local', sql: 'select temporal_values' });

    expect(result.rows).toEqual(driver.rows);
  });

  it('clamps excessive configured default row limits', async () => {
    const driver = new FakeDriver();
    driver.rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1 }));
    const { service } = createService(driver, 5000);

    const [result] = await service.runReadOnlyQuery({ connectionId: 'local', sql: 'select * from orders' });

    expect(result.rows).toHaveLength(1000);
  });

  it('searches local query memory', () => {
    const { service } = createService();

    const results = service.searchQueryMemory('orders status', 'local');

    expect(results[0]?.item.title).toBe('orders by status');
    expect(results[0]?.reasons.length).toBeGreaterThan(0);
  });
});
