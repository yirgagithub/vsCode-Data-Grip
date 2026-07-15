import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(async () => undefined)
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: unknown) => fallback)
    }))
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }
}));

import { ConnectionManager } from '../src/database/connectionManager';
import { DatabaseDriver } from '../src/database/drivers/DatabaseDriver';
import { QueryExecutor } from '../src/database/queryExecutor';
import { DataProfileService } from '../src/services/dataProfileService';
import { ErDiagramService } from '../src/services/erDiagramService';
import { QueryPlanAnalyzerService } from '../src/services/queryPlanAnalyzerService';
import { compareSchemas } from '../src/services/schemaDiffService';
import { DEFAULTS_BY_DATABASE_TYPE } from '../src/services/connectionDefaults';
import { SqlSafetyClassifier } from '../src/services/sqlSafetyClassifier';
import { TablePerformanceAdvisorService } from '../src/services/tablePerformanceAdvisorService';
import { buildTableCopyPreview } from '../src/services/tableCopyService';
import { buildTableImportData, buildTableImportPreview, buildTableImportStatements } from '../src/services/tableImportService';
import { rowsToInsertSql } from '../src/webviews/results/app/format';
import {
  ColumnInfo,
  ConnectionConfig,
  ConnectionConfigWithPassword,
  DatabaseType,
  DbConnection,
  QueryPlanResult,
  SchemaCacheEntry,
  TableStatsInfo,
  TableWorkloadSummary
} from '../src/types';

const supportedEngines: DatabaseType[] = ['postgres', 'redshift', 'mysql', 'sqlite', 'sqlserver', 'oracle', 'redis', 'snowflake'];
const sqlEngines = supportedEngines.filter((engine) => engine !== 'redis') as Array<Exclude<DatabaseType, 'redis'>>;

const tableRefs: Record<Exclude<DatabaseType, 'redis'>, string> = {
  postgres: '"app"."users"',
  redshift: '"app"."users"',
  mysql: '`app`.`users`',
  sqlite: '"app"."users"',
  sqlserver: '[app].[users]',
  oracle: '"app"."users"',
  snowflake: '"app"."users"'
};

type Capability = 'supported' | 'unsupported';
type ObjectCapability = { enumerate: Capability; define: Capability };
type EngineObjectCapabilities = Record<DatabaseType, Record<'table' | 'view' | 'function' | 'procedure' | 'trigger', ObjectCapability>>;

const engineObjectCapabilities: EngineObjectCapabilities = {
  postgres: capabilityRow(true, true, true, true, true, true, true, true, true, true),
  redshift: capabilityRow(true, true, true, true, true, true, true, true, true, false),
  mysql: capabilityRow(true, true, true, true, true, true, true, true, true, true),
  sqlite: capabilityRow(true, true, true, true, false, false, false, false, true, true),
  sqlserver: capabilityRow(true, true, true, true, true, true, true, true, false, true),
  oracle: capabilityRow(true, true, true, true, true, true, true, true, false, true),
  redis: capabilityRow(false, false, false, false, false, false, false, false, false, false),
  snowflake: capabilityRow(true, true, true, true, true, true, true, true, false, false)
};

describe('database engine functional matrix', () => {
  it('documents enumeration and native-definition support for every database object kind', () => {
    expect(engineObjectCapabilities).toEqual({
      postgres: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'supported', define: 'supported' },
        procedure: { enumerate: 'supported', define: 'supported' },
        trigger: { enumerate: 'supported', define: 'supported' }
      },
      redshift: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'supported', define: 'supported' },
        procedure: { enumerate: 'supported', define: 'supported' },
        trigger: { enumerate: 'supported', define: 'unsupported' }
      },
      mysql: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'supported', define: 'supported' },
        procedure: { enumerate: 'supported', define: 'supported' },
        trigger: { enumerate: 'supported', define: 'supported' }
      },
      sqlite: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'unsupported', define: 'unsupported' },
        procedure: { enumerate: 'unsupported', define: 'unsupported' },
        trigger: { enumerate: 'supported', define: 'supported' }
      },
      sqlserver: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'supported', define: 'supported' },
        procedure: { enumerate: 'supported', define: 'supported' },
        trigger: { enumerate: 'unsupported', define: 'supported' }
      },
      oracle: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'supported', define: 'supported' },
        procedure: { enumerate: 'supported', define: 'supported' },
        trigger: { enumerate: 'unsupported', define: 'supported' }
      },
      redis: {
        table: { enumerate: 'unsupported', define: 'unsupported' },
        view: { enumerate: 'unsupported', define: 'unsupported' },
        function: { enumerate: 'unsupported', define: 'unsupported' },
        procedure: { enumerate: 'unsupported', define: 'unsupported' },
        trigger: { enumerate: 'unsupported', define: 'unsupported' }
      },
      snowflake: {
        table: { enumerate: 'supported', define: 'supported' },
        view: { enumerate: 'supported', define: 'supported' },
        function: { enumerate: 'supported', define: 'supported' },
        procedure: { enumerate: 'supported', define: 'supported' },
        trigger: { enumerate: 'unsupported', define: 'unsupported' }
      }
    });
  });

  it('has connection defaults and registered drivers for every supported engine', () => {
    expect(Object.keys(DEFAULTS_BY_DATABASE_TYPE).sort()).toEqual([...supportedEngines].sort());

    const manager = new ConnectionManager(store([]) as never);
    for (const engine of supportedEngines) {
      const defaults = DEFAULTS_BY_DATABASE_TYPE[engine];
      expect(defaults.name).toBeTruthy();
      expect(defaults.port).toBeTruthy();
      expect(defaults.database).toBeTruthy();
      expect(manager.getDriver(engine).id).toBe(engine);
    }
  });

  it.each(sqlEngines)('generates target-engine scripts for import/copy/export/schema diff on %s', (engine) => {
    const columns = tableColumns(engine);
    const importPreview = buildTableImportPreview(engine, 'app', 'users', columns, 'users.csv', 'id,name,active\n1,Ada,true\n');
    const importData = buildTableImportData('users.csv', 'id,name,active\n1,Ada,true\n', importPreview.mapping);
    const importSql = buildTableImportStatements(engine, 'app', 'users', importData).join('\n');
    const copyPreview = buildTableCopyPreview('app', 'users', 'app', 'users_copy', columns, [{ id: 1, name: 'Ada', active: true }], 'source', 'target', engine);
    const exportedInsert = rowsToInsertSql([{ id: 1, name: 'Ada', active: true }], 'app', 'users', engine);
    const diff = compareSchemas({
      sourceConnectionName: 'source',
      targetConnectionName: 'target',
      targetDatabaseType: engine,
      sourceSchema: {
        schemaName: 'app',
        tables: [{ schema: 'app', name: 'users', type: 'table' }],
        views: [{ schema: 'app', name: 'active_users', type: 'view' }],
        columns: { 'app.users': columns }
      },
      targetSchema: {
        schemaName: 'app',
        tables: [{ schema: 'app', name: 'users', type: 'table' }, { schema: 'app', name: 'legacy_users', type: 'table' }],
        views: [],
        columns: { 'app.users': columns.slice(0, 2) }
      }
    });

    for (const sql of [importSql, copyPreview.sql, exportedInsert, diff.migrationSql]) {
      expectExplicitSql(sql);
    }
    expect(importSql).toContain(tableRefs[engine]);
    expect(exportedInsert).toContain(tableRefs[engine]);
    expect(diff.migrationSql).toContain(tableRefs[engine]);
    expect(importSql).toContain(engine === 'sqlserver' || engine === 'oracle' ? '(1, \'Ada\', 1)' : '(1, \'Ada\', true)');
  });

  it.each(supportedEngines)('connects, tests, disconnects, deletes, and dispatches transactions for %s', async (engine) => {
    const config = connection(engine);
    const fakeStore = store([config]);
    const testConnection = vi.fn(async () => ({ ok: true, message: 'Connection successful', serverVersion: `${engine} 1.0` }));
    const connect = vi.fn(async (nextConfig: ConnectionConfigWithPassword): Promise<DbConnection> => ({
      id: nextConfig.id,
      config: nextConfig,
      connectedAt: Date.now()
    }));
    const disconnect = vi.fn(async () => undefined);
    const beginTransaction = vi.fn(async () => undefined);
    const commitTransaction = vi.fn(async () => undefined);
    const rollbackTransaction = vi.fn(async () => undefined);
    const driver = {
      id: engine,
      testConnection,
      connect,
      disconnect,
      beginTransaction,
      commitTransaction,
      rollbackTransaction,
      isTransactionOpen: vi.fn(() => true)
    } as unknown as DatabaseDriver;
    const manager = new ConnectionManager(fakeStore as never);
    (manager as unknown as { drivers: Map<DatabaseType, DatabaseDriver> }).drivers.set(engine, driver);

    await expect(manager.testConfig({ ...config, password: 'secret' })).resolves.toBe(`${engine} 1.0`);
    const active = await manager.connect(config.id);
    expect(active.config.type).toBe(engine);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ id: config.id, type: engine, password: 'secret' }));
    expect(fakeStore.setSelectedConnectionId).toHaveBeenCalledWith(config.id);

    await manager.beginTransaction(config.id);
    expect(beginTransaction).toHaveBeenCalledWith(config.id);
    expect(manager.getTransactionMode(config.id)).toBe('manual');
    expect(manager.isTransactionOpen(config.id)).toBe(true);

    await manager.commitTransaction(config.id);
    await manager.rollbackTransaction(config.id);
    expect(commitTransaction).toHaveBeenCalledWith(config.id);
    expect(rollbackTransaction).toHaveBeenCalledWith(config.id);

    await manager.delete(config.id);
    expect(disconnect).toHaveBeenCalledWith(config.id);
    expect(fakeStore.delete).toHaveBeenCalledWith(config.id);
    expect(manager.isConnected(config.id)).toBe(false);
  });

  it.each(supportedEngines)('builds safety preview SQL with %s syntax', (engine) => {
    const classifier = new SqlSafetyClassifier();
    const deletePreview = classifier.previewSql(deleteSql(engine), engine);
    const updatePreview = classifier.previewSql(updateSql(engine), engine);
    const explainPreview = classifier.previewSql(selectSql(engine), engine);

    expect(deletePreview).toBeTruthy();
    expect(updatePreview).toBeTruthy();
    expect(explainPreview).toBeTruthy();
    for (const sql of [deletePreview, updatePreview, explainPreview]) {
      expectExplicitSql(sql ?? '');
    }

    if (engine === 'redis') {
      expect(deletePreview).toContain('Safety preview is not available for Redis commands');
      expect(updatePreview).toContain('Safety preview is not available for Redis commands');
      expect(explainPreview).toContain('Safety preview is not available for Redis commands');
      return;
    }

    expect(deletePreview).toContain(tableNameFor(engine));
    expect(updatePreview).toContain(tableNameFor(engine));

    if (engine === 'sqlserver') {
      expect(deletePreview).toContain('select top (100) *');
      expect(updatePreview).toContain('select top (100) *');
      expect(explainPreview).toContain('set showplan_text on;');
    } else if (engine === 'oracle') {
      expect(deletePreview).toContain('fetch first 100 rows only');
      expect(updatePreview).toContain('fetch first 100 rows only');
      expect(explainPreview).toContain('select * from table(dbms_xplan.display);');
    } else {
      expect(deletePreview).toContain('limit 100');
      expect(updatePreview).toContain('limit 100');
      expect(explainPreview).toMatch(/^explain /i);
    }
  });

  it.each(supportedEngines)('profiles sampled table data through the %s driver', async (engine) => {
    const config = connection(engine);
    const columns = logicalColumns(engine);
    const driver = {
      id: engine,
      getColumns: vi.fn(async () => columns),
      getTablePreview: vi.fn(async () => ({
        executionId: `${engine}-preview`,
        fields: columns.map((column) => ({ name: column.name, dataTypeName: column.dataType })),
        rows: [
          { id: 1, name: 'Ada', active: true },
          { id: 2, name: null, active: false }
        ],
        rowCount: 2,
        durationMs: 1
      }))
    } as unknown as DatabaseDriver;
    const manager = serviceManager(config, driver, false);
    const ai = {
      isAvailable: vi.fn(async () => true),
      summarizeDataProfile: vi.fn(async (request: { databaseType: DatabaseType }) => ({
        summary: `Profiled ${request.databaseType}`,
        anomalies: []
      }))
    };
    const service = new DataProfileService(manager as never, ai);

    const report = await service.profileTable(config, 'app', 'users', 2);

    expect(manager.connect).toHaveBeenCalledWith(config.id);
    expect(driver.getColumns).toHaveBeenCalledWith(config.id, 'app', 'users');
    expect(driver.getTablePreview).toHaveBeenCalledWith(config.id, 'app', 'users', 2);
    expect(report.databaseType).toBe(engine);
    expect(report.columns.map((column) => column.name)).toEqual(['id', 'name', 'active']);
    expect(ai.summarizeDataProfile).toHaveBeenCalledWith(expect.objectContaining({ databaseType: engine }));
  });

  it.each(supportedEngines)('runs query-plan analysis through the %s driver', async (engine) => {
    const config = connection(engine);
    const plan: QueryPlanResult = {
      format: 'text',
      analyze: true,
      rawText: `${engine} plan`,
      annotations: []
    };
    const driver = {
      id: engine,
      explainQuery: vi.fn(async () => plan)
    } as unknown as DatabaseDriver;
    const manager = serviceManager(config, driver, false);
    const ai = {
      isAvailable: vi.fn(async () => true),
      annotateQueryPlan: vi.fn(async () => ({
        findings: [`${engine} finding`],
        annotations: [{ severity: 'low' as const, message: `${engine} annotation` }]
      }))
    };
    const service = new QueryPlanAnalyzerService(manager as never, ai);

    const result = await service.explain(config, 'select * from app.users', { analyze: true });

    expect(manager.connect).toHaveBeenCalledWith(config.id);
    expect(driver.explainQuery).toHaveBeenCalledWith({ connectionId: config.id, sql: 'select * from app.users' }, { analyze: true });
    expect(ai.annotateQueryPlan).toHaveBeenCalledWith(expect.objectContaining({ databaseType: engine }));
    expect(result.aiFindings).toEqual([`${engine} finding`]);
  });

  it.each(supportedEngines)('builds ER metadata through the %s driver', async (engine) => {
    const config = connection(engine);
    const schema = schemaCacheEntry(config.id);
    const getForeignKeys = vi.fn(async (_connectionId: string, _schema: string, table: string) => table === 'orders'
      ? [{ name: 'orders_user_fk', columns: ['user_id'], foreignSchema: 'app', foreignTable: 'users', foreignColumns: ['id'] }]
      : []);
    const driver = {
      id: engine,
      getForeignKeys
    } as unknown as DatabaseDriver;
    const manager = serviceManager(config, driver, false);
    const schemaContext = {
      loadSchema: vi.fn(async () => schema),
      getPrimaryKeys: vi.fn(async (_connection: ConnectionConfig, _schema: string, table: string) => table === 'users'
        ? [{ name: 'users_pk', columns: ['id'] }]
        : [{ name: 'orders_pk', columns: ['id'] }])
    };
    const service = new ErDiagramService(manager as never, schemaContext as never);

    const report = await service.build({ connection: config, schemaName: 'app' });

    expect(manager.connect).toHaveBeenCalledWith(config.id);
    expect(schemaContext.loadSchema).toHaveBeenCalledWith(config, 'app');
    expect(getForeignKeys).toHaveBeenCalledWith(config.id, 'app', 'orders');
    expect(report.tables.map((table) => table.name)).toEqual(['active_users', 'orders', 'users']);
    expect(report.relations).toEqual([expect.objectContaining({ fromTable: 'orders', toTable: 'users' })]);
  });

  it.each(supportedEngines)('builds table-performance requests through the %s driver', async (engine) => {
    const config = connection(engine);
    const stats: TableStatsInfo = {
      schema: 'app',
      table: 'users',
      databaseType: engine,
      rowEstimate: engine === 'postgres' ? 50_000 : 100,
      seqScan: engine === 'postgres' ? 300 : undefined,
      idxScan: engine === 'postgres' ? 2 : undefined,
      columns: [{ name: 'id' }, { name: 'name' }],
      redshift: engine === 'redshift'
        ? { skewRows: 5, unsortedPct: 33, statsOffPct: 20, sortKey1: undefined }
        : undefined
    };
    const workload = workloadFor(config.id);
    const driver = {
      id: engine,
      getTableDDL: vi.fn(async () => engine === 'redis' ? '-- Redis logical view: app.users' : `create table ${tableNameFor(engine)} (id int);`),
      getTableStats: vi.fn(async () => stats)
    } as unknown as DatabaseDriver;
    const manager = serviceManager(config, driver, false);
    const memory = { getTableWorkload: vi.fn(async () => workload) };
    const ai = {
      adviseTablePerformance: vi.fn(async (request: { databaseType: DatabaseType }) => ({
        findings: [`${request.databaseType} reviewed`],
        recommendations: []
      }))
    };
    const service = new TablePerformanceAdvisorService(manager as never, memory as never, ai);

    const report = await service.analyzeTable(config, 'app', 'users');

    expect(manager.connect).toHaveBeenCalledWith(config.id);
    expect(driver.getTableDDL).toHaveBeenCalledWith(config.id, 'app', 'users');
    expect(driver.getTableStats).toHaveBeenCalledWith(config.id, 'app', 'users');
    expect(memory.getTableWorkload).toHaveBeenCalledWith(config.id, 'app.users');
    expect(ai.adviseTablePerformance).toHaveBeenCalledWith(expect.objectContaining({ databaseType: engine }));
    expect(report.request.databaseType).toBe(engine);
    for (const flag of report.request.prepassFlags) {
      expect(flag.ddl ?? '').not.toMatch(/\bundefined\b/i);
    }
  });

  it('keeps Redis command-oriented instead of emitting SQL scripts', () => {
    const columns = tableColumns('postgres');
    const importPreview = buildTableImportPreview('redis', 'db0', 'keys', columns, 'keys.csv', 'key\nuser:1\n');
    const importData = buildTableImportData('keys.csv', 'key\nuser:1\n', importPreview.mapping);

    expect(() => buildTableImportStatements('redis', 'db0', 'keys', importData)).toThrow('Redis');
    expect(() => buildTableCopyPreview('db0', 'keys', 'db0', 'keys_copy', columns, [{ key: 'user:1' }], 'source', 'target', 'redis')).toThrow('Redis');
    expect(() => rowsToInsertSql([{ key: 'user:1' }], 'db0', 'keys', 'redis')).toThrow('Redis');
    expect(() => compareSchemas({
      sourceConnectionName: 'source',
      targetConnectionName: 'target',
      targetDatabaseType: 'redis',
      sourceSchema: { schemaName: 'db0', tables: [], views: [], columns: {} },
      targetSchema: { schemaName: 'db0', tables: [], views: [], columns: {} }
    })).toThrow('Redis');
  });

  it.each(supportedEngines)('propagates syntax errors through query execution for %s', async (engine) => {
    const config = connection(engine);
    const syntaxError = {
      message: `${engine} syntax error near "from"`,
      code: engine === 'mysql' ? 'ER_PARSE_ERROR' : '42601',
      detail: 'The statement could not be parsed.',
      hint: 'Check the selected SQL.',
      position: '8'
    };
    const executeStatements = vi.fn(async () => {
      throw syntaxError;
    });
    const manager = {
      getConnection: vi.fn(() => config),
      isConnected: vi.fn(() => true),
      connect: vi.fn(async () => undefined),
      getTransactionMode: vi.fn(() => 'auto'),
      isTransactionOpen: vi.fn(() => false),
      getDriver: vi.fn(() => ({ executeStatements }))
    };
    const historyStore = { add: vi.fn(async () => undefined) };
    const recorder = { recordHistoryItem: vi.fn(async () => undefined) };
    const executor = new QueryExecutor(manager as never, historyStore as never, recorder);

    const tab = await executor.execute({
      connectionId: config.id,
      sql: 'select from users',
      source: { origin: 'queryConsole' }
    });

    expect(tab.executionStatus).toBe('failed');
    expect(tab.databaseType).toBe(engine);
    expect(tab.error).toMatchObject(syntaxError);
    expect(historyStore.add).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: config.id,
      databaseType: engine,
      status: 'failed',
      errorMessage: syntaxError.message
    }));
    expect(recorder.recordHistoryItem).toHaveBeenCalledWith(expect.objectContaining({
      databaseType: engine,
      status: 'failed'
    }));
  });
});

function tableColumns(engine: Exclude<DatabaseType, 'redis'>): ColumnInfo[] {
  const textType: Record<Exclude<DatabaseType, 'redis'>, string> = {
    postgres: 'text',
    redshift: 'varchar(255)',
    mysql: 'varchar(255)',
    sqlite: 'text',
    sqlserver: 'nvarchar(max)',
    oracle: 'varchar2(255)',
    snowflake: 'varchar'
  };
  return [
    { schema: 'app', table: 'users', name: 'id', ordinal: 1, dataType: engine === 'oracle' ? 'number' : 'integer', nullable: false },
    { schema: 'app', table: 'users', name: 'name', ordinal: 2, dataType: textType[engine], nullable: false },
    { schema: 'app', table: 'users', name: 'active', ordinal: 3, dataType: engine === 'sqlserver' ? 'bit' : 'boolean', nullable: true }
  ];
}

function logicalColumns(engine: DatabaseType): ColumnInfo[] {
  return [
    { schema: 'app', table: 'users', name: 'id', ordinal: 1, dataType: engine === 'redis' ? 'string' : 'integer', nullable: false },
    { schema: 'app', table: 'users', name: 'name', ordinal: 2, dataType: engine === 'redis' ? 'string' : 'text', nullable: true },
    { schema: 'app', table: 'users', name: 'active', ordinal: 3, dataType: engine === 'redis' ? 'string' : 'boolean', nullable: true }
  ];
}

function schemaCacheEntry(connectionId: string): SchemaCacheEntry {
  return {
    connectionId,
    schemaName: 'app',
    source: 'live',
    schemas: [{ name: 'app' }],
    tables: [
      { schema: 'app', name: 'orders', type: 'table' },
      { schema: 'app', name: 'users', type: 'table' }
    ],
    views: [{ schema: 'app', name: 'active_users', type: 'view' }],
    columns: {
      'app.users': [
        { schema: 'app', table: 'users', name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
        { schema: 'app', table: 'users', name: 'name', ordinal: 2, dataType: 'text', nullable: false }
      ],
      'app.orders': [
        { schema: 'app', table: 'orders', name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
        { schema: 'app', table: 'orders', name: 'user_id', ordinal: 2, dataType: 'integer', nullable: false }
      ],
      'app.active_users': [
        { schema: 'app', table: 'active_users', name: 'id', ordinal: 1, dataType: 'integer', nullable: false }
      ]
    },
    indexes: {},
    keys: {},
    foreignKeys: {},
    status: 'ready'
  };
}

function workloadFor(connectionId: string): TableWorkloadSummary {
  return {
    connectionId,
    table: 'app.users',
    queryCount: 1,
    totalRunCount: 4,
    totalDurationMs: 1200,
    topQueries: [{ sql: 'select * from app.users where name = ?', runCount: 4, durationMs: 1200, score: 10 }],
    columns: [{ column: 'name', role: 'filter', queryCount: 1, runCount: 4, durationMs: 1200 }]
  };
}

function serviceManager(config: ConnectionConfig, driver: DatabaseDriver, connected: boolean) {
  return {
    isConnected: vi.fn(() => connected),
    connect: vi.fn(async () => ({ id: config.id, config, connectedAt: Date.now() })),
    getDriver: vi.fn(() => driver)
  };
}

function tableNameFor(engine: DatabaseType): string {
  switch (engine) {
    case 'mysql':
      return '`app`.`users`';
    case 'sqlserver':
      return '[app].[users]';
    case 'oracle':
      return '"APP"."USERS"';
    case 'redis':
      return 'user:1';
    default:
      return '"app"."users"';
  }
}

function deleteSql(engine: DatabaseType): string {
  if (engine === 'redis') {
    return 'DEL user:1';
  }
  return `delete from ${tableNameFor(engine)} where id = 1`;
}

function updateSql(engine: DatabaseType): string {
  if (engine === 'redis') {
    return 'SET user:1 Ada';
  }
  return `update ${tableNameFor(engine)} set name = 'Ada' where id = 1`;
}

function selectSql(engine: DatabaseType): string {
  if (engine === 'redis') {
    return 'GET user:1';
  }
  return `select * from ${tableNameFor(engine)}`;
}

function connection(type: DatabaseType): ConnectionConfig {
  const defaults = DEFAULTS_BY_DATABASE_TYPE[type];
  return {
    id: `${type}-local`,
    name: defaults.name,
    type,
    host: '127.0.0.1',
    port: Number(defaults.port),
    database: defaults.database,
    username: 'user',
    sslMode: defaults.sslMode,
    color: defaults.color
  };
}

function store(connections: ConnectionConfig[]) {
  return {
    getAll: vi.fn(() => connections),
    save: vi.fn(async (_config: ConnectionConfigWithPassword) => undefined),
    withPassword: vi.fn(async (config: ConnectionConfig) => ({ ...config, password: 'secret' })),
    setSelectedConnectionId: vi.fn(async (_id: string | undefined) => undefined),
    getSelectedConnectionId: vi.fn(() => undefined),
    delete: vi.fn(async (_id: string) => undefined)
  };
}

function expectExplicitSql(sql: string): void {
  expect(sql.trim()).not.toBe('');
  expect(sql).not.toMatch(/\bundefined\b/i);
  expect(sql).not.toMatch(/\bNaN\b/i);
  expect(sql).not.toContain('[object Object]');
}

function capabilityRow(
  tableEnumerate: boolean,
  tableDefine: boolean,
  viewEnumerate: boolean,
  viewDefine: boolean,
  functionEnumerate: boolean,
  functionDefine: boolean,
  procedureEnumerate: boolean,
  procedureDefine: boolean,
  triggerEnumerate: boolean,
  triggerDefine: boolean
): EngineObjectCapabilities[DatabaseType] {
  const state = (value: boolean): Capability => value ? 'supported' : 'unsupported';
  return {
    table: { enumerate: state(tableEnumerate), define: state(tableDefine) },
    view: { enumerate: state(viewEnumerate), define: state(viewDefine) },
    function: { enumerate: state(functionEnumerate), define: state(functionDefine) },
    procedure: { enumerate: state(procedureEnumerate), define: state(procedureDefine) },
    trigger: { enumerate: state(triggerEnumerate), define: state(triggerDefine) }
  };
}
