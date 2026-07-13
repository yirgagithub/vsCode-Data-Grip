import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { parseQueryMemorySummaryText } from '../src/ai/queryMemorySummaryParser';
import { ConnectionManager } from '../src/database/connectionManager';
import { QueryExecutor } from '../src/database/queryExecutor';
import { splitSqlStatements } from '../src/database/sqlSplitter';
import { PostgresDriver } from '../src/database/drivers/postgresDriver';
import { VsCodeLanguageModelSqlAdapter } from '../src/ai/vsCodeLanguageModelSqlAdapter';
import { resolveDocumentConnection } from '../src/services/documentConnectionResolver';
import { connectionDefaultsForType } from '../src/services/connectionDefaults';
import { executionOriginForDocument, isQueryConsoleHistoryItem, isQueryConsoleMemoryItem, queryConsoleDocumentUris } from '../src/services/queryConsoleHistory';
import { extractQualifiedColumns, extractQueryTables, outputColumnNames } from '../src/services/queryMemoryMetadata';
import { QueryMemorySearch } from '../src/services/queryMemorySearch';
import { QueryMemoryService } from '../src/services/queryMemoryService';
import { normalizeExplainJsonPlan } from '../src/services/queryPlanService';
import { QueryConsoleStore } from '../src/persistence/queryConsoleStore';
import { SchemaContextService } from '../src/services/schemaContextService';
import { connectionMetadataFingerprint, parseStoredSchemaCacheEntry, SCHEMA_METADATA_CACHE_VERSION, serializeSchemaCacheEntry } from '../src/services/schemaMetadataCacheStore';
import { SqlDiagnosticsService } from '../src/services/sqlDiagnosticsService';
import { relationCompletionCandidates, relationCompletionContext, selectListColumnCompletionContext, unqualifiedColumnCompletionContext } from '../src/services/sqlMetadataCompletion';
import { connectAndRefreshSqlMetadata } from '../src/services/sqlMetadataWarmup';
import { SqlParameterPrompt } from '../src/services/sqlParameterPrompt';
import { applySqlParameterValues, findSqlParameters, uniqueSqlParameterNames } from '../src/services/sqlParameters';
import { SqlSafetyClassifier } from '../src/services/sqlSafetyClassifier';
import { SqlSectionService } from '../src/services/sqlSectionService';
import { shouldRunSelectionForStatement } from '../src/services/sqlSelectionExecution';
import { buildTablePerformancePrepassFlags } from '../src/services/tablePerformanceAdvisorService';
import { orphanedConnectionRecordIds } from '../src/persistence/orphanedConnectionRecords';
import { partitionExistingConsoleRecords } from '../src/persistence/queryConsoleRecords';
import { ResultsPanelProvider } from '../src/webviews/results/ResultsPanelProvider';
import { ConnectionConfig, QueryConsoleRecord, QueryHistoryItem, QueryMemoryItem, QueryResultTab, SchemaCacheEntry, TablePerformanceAdviceRequest, TableStatsInfo, TableWorkloadSummary } from '../src/types';
import { profileColumn } from '../src/services/dataProfileService';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(async () => undefined)
  },
  lm: {
    selectChatModels: vi.fn(async () => [])
  },
  LanguageModelChatMessage: {
    User: vi.fn((content: string) => ({ role: 'user', content }))
  },
  CancellationTokenSource: class {
    token = {};
  },
  workspace: {
    workspaceFolders: [],
    fs: {
      createDirectory: vi.fn(async () => undefined),
      stat: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined)
    },
    openTextDocument: vi.fn(async (uri: unknown) => ({ uri })),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: unknown) => fallback)
    }))
  },
  window: {
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    createWebviewPanel: vi.fn()
  },
  ViewColumn: {
    Active: -1
  },
  Diagnostic: class {
    constructor(public range: unknown, public message: string, public severity: number) {}
  },
  DiagnosticSeverity: {
    Error: 0
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  Position: class {
    constructor(public line: number, public character: number) {}
    compareTo(other: { line: number; character: number }) {
      return this.line - other.line || this.character - other.character;
    }
  },
  Range: class {
    start: { line: number; character: number };
    end: { line: number; character: number };

    constructor(start: { line: number; character: number }, end: { line: number; character: number }) {
      this.start = start;
      this.end = end;
    }

    get isEmpty() {
      return this.start.line === this.end.line && this.start.character === this.end.character;
    }

    isEqual(other: { start: { line: number; character: number }; end: { line: number; character: number } }) {
      return this.start.line === other.start.line
        && this.start.character === other.start.character
        && this.end.line === other.end.line
        && this.end.character === other.end.character;
    }
  },
  Uri: {
    parse: vi.fn((value: string) => ({
      path: value.replace(/^file:\/\//, ''),
      fsPath: value.replace(/^file:\/\//, ''),
      toString: () => value
    })),
    joinPath: vi.fn((base: { toString?: () => string; path?: string }, ...segments: string[]) => {
      const baseText = base?.toString?.() ?? base?.path ?? '';
      const value = [baseText.replace(/\/+$/, ''), ...segments.map((segment) => segment.replace(/^\/+|\/+$/g, ''))].filter(Boolean).join('/');
      return {
        path: value.replace(/^file:\/\//, ''),
        fsPath: value.replace(/^file:\/\//, ''),
        toString: () => value
      };
    })
  }
}));

describe('SqlSafetyClassifier', () => {
  const classifier = new SqlSafetyClassifier();

  it('flags destructive statements and missing where clauses', () => {
    expect(classifier.classify('drop table public.users').risk).toBe('destructive');
    expect(classifier.classify('delete from invoices').reasons).toContain('DELETE has no WHERE clause.');
    expect(classifier.classify('update users set active = false').risk).toBe('destructive');
  });

  it('flags production connections even for reads', () => {
    const result = classifier.classify('select * from invoices', { production: true });
    expect(result.risk).toBe('production');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('builds preview sql for risky writes', () => {
    expect(classifier.previewSql('delete from invoices where customer_id = 10')).toContain('select *');
    expect(classifier.previewSql('update public.users set active = false where id = 1')).toContain('where id = 1');
    expect(classifier.previewSql('delete from [dbo].[invoices] where customer_id = 10', 'sqlserver')).toContain('select top (100) *');
    expect(classifier.previewSql('update "APP"."USERS" set active = 0 where id = 1', 'oracle')).toContain('fetch first 100 rows only');
  });
});

describe('SQL statement splitting', () => {
  it('splits a selected block into multiple executable statements', () => {
    const statements = splitSqlStatements(`select *
from public.adjust_offer
limit 100;

select * from public.appsflyer_offer;`);

    expect(statements.map((statement) => statement.sql)).toEqual([
      'select *\nfrom public.adjust_offer\nlimit 100',
      'select * from public.appsflyer_offer'
    ]);
  });

  it('runs a selection when the code lens range only overlaps it', () => {
    expect(shouldRunSelectionForStatement([
      {
        sql: 'select * from public.event_fact',
        range: textRange(0, 0, 0, 31)
      }
    ], textRange(0, 0, 0, 42))).toBe(true);
  });

  it('runs a large multi-statement selection when the code lens range only overlaps part of it', () => {
    const selectedSql = `select network_offer_id
from adjust_offer;

select * from public.appsflyer_offer;`;

    expect(shouldRunSelectionForStatement([
      {
        sql: selectedSql,
        range: textRange(3, 0, 6, 38)
      }
    ], textRange(0, 0, 4, 18))).toBe(true);
  });

  it('does not let a single-token selection override a code lens run', () => {
    expect(shouldRunSelectionForStatement([
      {
        sql: 'network_offer_id',
        range: textRange(3, 7, 3, 23)
      }
    ], textRange(0, 0, 4, 18))).toBe(false);
  });
});

describe('QueryExecutor batch execution', () => {
  it('executes multi-statement SQL through one driver batch so temp tables and transactions share a session', async () => {
    const local = connection({ id: 'local' });
    const executeStatements = vi.fn(async (_params, statements: string[]) => statements.map((sql, index) => ({
      executionId: `execution-${index}`,
      fields: [],
      rows: [],
      rowCount: 0,
      command: sql.split(/\s+/)[0]?.toUpperCase(),
      durationMs: 1
    })));
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      getTransactionMode: vi.fn(() => 'auto'),
      isTransactionOpen: vi.fn(() => false),
      getDriver: vi.fn(() => ({ executeStatements }))
    };
    const executor = new QueryExecutor(
      manager as never,
      { add: vi.fn() } as never,
      undefined,
      safeClassifier() as never
    );
    const sql = 'begin; create temp table t as select 1 as id; select * from t; commit;';

    const tab = await executor.execute({ connectionId: local.id, sql });

    expect(executeStatements).toHaveBeenCalledTimes(1);
    expect(executeStatements.mock.calls[0][1]).toEqual([
      'begin',
      'create temp table t as select 1 as id',
      'select * from t',
      'commit'
    ]);
    expect(tab.executionStatus).toBe('completed');
    expect(tab.resultSets).toHaveLength(4);
  });

  it('starts a manual transaction before executing the first statement', async () => {
    const local = connection({ id: 'local' });
    const executeStatements = vi.fn(async (_params, statements: string[]) => statements.map((sql, index) => ({
      executionId: `execution-${index}`,
      fields: [],
      rows: [],
      rowCount: 0,
      command: sql.split(/\s+/)[0]?.toUpperCase(),
      durationMs: 1
    })));
    const beginTransaction = vi.fn(async () => undefined);
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      getTransactionMode: vi.fn(() => 'manual'),
      isTransactionOpen: vi.fn(() => false),
      beginTransaction,
      getDriver: vi.fn(() => ({ executeStatements }))
    };
    const executor = new QueryExecutor(
      manager as never,
      { add: vi.fn() } as never,
      undefined,
      safeClassifier() as never
    );

    await executor.execute({ connectionId: local.id, sql: 'select 1' });

    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(executeStatements).toHaveBeenCalledTimes(1);
  });

  it('refuses writes on read-only connections before hitting the driver', async () => {
    const local = connection({ id: 'local', readOnlyDefault: true });
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      getTransactionMode: vi.fn(() => 'auto'),
      isTransactionOpen: vi.fn(() => false),
      getDriver: vi.fn(() => ({ executeStatements: vi.fn() }))
    };
    const executor = new QueryExecutor(
      manager as never,
      { add: vi.fn() } as never,
      undefined,
      safeClassifier() as never
    );

    const tab = await executor.execute({ connectionId: local.id, sql: 'update users set active = false' });

    expect(tab.executionStatus).toBe('failed');
    expect(tab.error?.message).toContain('read-only by default');
    expect(manager.getDriver).not.toHaveBeenCalled();
  });

  it('marks user-cancelled executions as cancelled in result tabs and history', async () => {
    const local = connection({ id: 'local' });
    const executeStatements = vi.fn(async () => {
      const error = new Error('canceling statement due to user request') as Error & { code: string };
      error.code = '57014';
      throw error;
    });
    const historyStore = { add: vi.fn() };
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      getTransactionMode: vi.fn(() => 'auto'),
      isTransactionOpen: vi.fn(() => false),
      getDriver: vi.fn(() => ({ executeStatements }))
    };
    const executor = new QueryExecutor(
      manager as never,
      historyStore as never,
      undefined,
      safeClassifier() as never
    );

    const tab = await executor.execute({
      connectionId: local.id,
      sql: 'select pg_sleep(60)',
      isCancellationRequested: () => true,
      source: { origin: 'queryConsole', documentUri: 'file:///global/query-consoles/local.sql' }
    });

    expect(tab.executionStatus).toBe('cancelled');
    expect(tab.error).toBeUndefined();
    expect(historyStore.add.mock.calls[0][0]).toMatchObject({
      status: 'cancelled',
      errorMessage: undefined
    });
  });

  it('keeps statement timeouts as failures instead of user cancellations', async () => {
    const local = connection({ id: 'local' });
    const executeStatements = vi.fn(async () => {
      const error = new Error('canceling statement due to statement timeout') as Error & { code: string };
      error.code = '57014';
      throw error;
    });
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      getTransactionMode: vi.fn(() => 'auto'),
      isTransactionOpen: vi.fn(() => false),
      getDriver: vi.fn(() => ({ executeStatements }))
    };
    const executor = new QueryExecutor(
      manager as never,
      { add: vi.fn() } as never,
      undefined,
      safeClassifier() as never
    );

    const tab = await executor.execute({
      connectionId: local.id,
      sql: 'select pg_sleep(60)',
      isCancellationRequested: () => false,
      source: { origin: 'queryConsole', documentUri: 'file:///global/query-consoles/local.sql' }
    });

    expect(tab.executionStatus).toBe('failed');
    expect(tab.error?.message).toContain('statement timeout');
  });

  it('delegates explicit cancellation to the active connection driver', async () => {
    const cancelQuery = vi.fn(async () => undefined);
    const executor = new QueryExecutor(
      { getDriverByConnectionId: vi.fn(() => ({ cancelQuery })) } as never,
      { add: vi.fn() } as never,
      undefined,
      safeClassifier() as never
    );

    await executor.cancel('local', 'execution-1');

    expect(cancelQuery).toHaveBeenCalledWith('execution-1');
  });
});

describe('QueryConsoleStore storage', () => {
  it('creates new query console files in extension global storage even when a workspace is open', async () => {
    const workspaceMock = vscode.workspace as unknown as {
      workspaceFolders: Array<{ uri: unknown }>;
      fs: {
        createDirectory: ReturnType<typeof vi.fn>;
        stat: ReturnType<typeof vi.fn>;
        writeFile: ReturnType<typeof vi.fn>;
      };
      openTextDocument: ReturnType<typeof vi.fn>;
    };
    const globalStorageUri = vscode.Uri.parse('file:///global-storage/data-grip');
    const workspaceUri = vscode.Uri.parse('file:///workspace/project');
    const records: QueryConsoleRecord[] = [];
    workspaceMock.workspaceFolders = [{ uri: workspaceUri }];
    workspaceMock.fs.createDirectory.mockClear();
    workspaceMock.fs.writeFile.mockClear();
    workspaceMock.fs.stat.mockRejectedValue(Object.assign(new Error('FileNotFound'), { code: 'FileNotFound' }));
    workspaceMock.openTextDocument.mockClear();

    const store = new QueryConsoleStore({
      globalStorageUri,
      workspaceState: {
        get: vi.fn((_key: string, fallback: QueryConsoleRecord[]) => records.length ? records : fallback),
        update: vi.fn(async (_key: string, value: QueryConsoleRecord[]) => {
          records.splice(0, records.length, ...value);
        })
      }
    } as never);

    await store.openOrCreate(connection({ id: 'local', name: 'Local', database: 'app' }));

    expect(workspaceMock.fs.createDirectory.mock.calls[0][0].toString()).toBe('file:///global-storage/data-grip/query-consoles');
    expect(records[0].documentUri).toContain('file:///global-storage/data-grip/query-consoles/');
    expect(records[0].documentUri).not.toContain('/workspace/project');
    expect(workspaceMock.fs.writeFile.mock.calls[0][0].toString()).toBe(records[0].documentUri);

    workspaceMock.workspaceFolders = [];
    workspaceMock.fs.stat.mockResolvedValue(undefined);
  });
});

describe('PostgresDriver result normalization', () => {
  it('does not crash when a command result omits fields and rows', async () => {
    const driver = new StubPostgresDriver([{ command: 'CREATE', rowCount: null }]);

    const [result] = await driver.executeStatements(
      { connectionId: 'local', sql: 'create temp table t as select 1' },
      ['create temp table t as select 1']
    );

    expect(result.fields).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
    expect(result.command).toBe('CREATE');
  });

  it('emits statement progress for each statement in a batch', async () => {
    const driver = new StubPostgresDriver([
      { command: 'SELECT', rowCount: 1, fields: [], rows: [{ id: 1 }] },
      { command: 'INSERT', rowCount: 2, fields: [], rows: [] }
    ]);
    const onProgress = vi.fn();
    const firstSql = 'select *\nfrom users';
    const secondSql = 'insert into audit_log select * from users';

    await driver.executeStatements(
      { connectionId: 'local', sql: `${firstSql}; ${secondSql};`, onProgress },
      [firstSql, secondSql]
    );

    expect(onProgress.mock.calls.map(([progress]) => progress.status)).toEqual([
      'started',
      'completed',
      'started',
      'completed'
    ]);
    expect(onProgress.mock.calls.map(([progress]) => progress.sql)).toEqual([
      firstSql,
      firstSql,
      secondSql,
      secondSql
    ]);
    expect(onProgress.mock.calls[1][0]).toMatchObject({ statementIndex: 0, statementCount: 2, rowCount: 1, command: 'SELECT' });
    expect(onProgress.mock.calls[3][0]).toMatchObject({ statementIndex: 1, statementCount: 2, rowCount: 2, command: 'INSERT' });
  });
});

describe('ResultsPanelProvider', () => {
  it('keeps forced result tabs separate when executing a selected SQL batch', async () => {
    const savedTabs: QueryResultTab[][] = [];
    const provider = new ResultsPanelProvider(
      { extensionUri: {} } as never,
      connectionManagerStub(),
      {
        getTabs: () => [],
        saveTabs: async (tabs: QueryResultTab[]) => {
          savedTabs.push(tabs);
        }
      } as never,
      {} as never
    );

    await provider.addTab(resultTab({
      id: 'tab-adjust',
      title: 'SELECT public.adjust_offer',
      queryText: 'select * from public.adjust_offer limit 100'
    }), { forceNew: true });
    await provider.addTab(resultTab({
      id: 'tab-appsflyer',
      title: 'SELECT public.appsflyer_offer',
      queryText: 'select * from public.appsflyer_offer'
    }), { forceNew: true });

    expect(provider.getTabs().map((tab) => tab.queryText)).toEqual([
      'select * from public.adjust_offer limit 100',
      'select * from public.appsflyer_offer'
    ]);
    expect(savedTabs.at(-1)?.map((tab) => tab.id)).toEqual(['tab-adjust', 'tab-appsflyer']);
  });

  it('lets the result toolbar run an active multi-statement editor selection before rerunning a tab', async () => {
    const executor = { execute: vi.fn() };
    const runActiveSelection = vi.fn(async () => true);
    const provider = new ResultsPanelProvider(
      { extensionUri: {} } as never,
      connectionManagerStub(),
      {
        getTabs: () => [resultTab({ id: 'tab-adjust', queryText: 'select * from public.adjust_offer' })],
        saveTabs: vi.fn()
      } as never,
      executor as never,
      undefined,
      undefined,
      runActiveSelection
    );

    await (provider as never as { onMessage(message: unknown): Promise<void> }).onMessage({
      type: 'rerunTab',
      tabId: 'tab-adjust',
      maxRows: 1000
    });

    expect(runActiveSelection).toHaveBeenCalledWith(1000);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('shows a running placeholder while rerunning a result tab', async () => {
    const savedTabs: QueryResultTab[][] = [];
    let resolveExecution: ((tab: QueryResultTab) => void) | undefined;
    const executor = {
      execute: vi.fn(() => new Promise<QueryResultTab>((resolve) => {
        resolveExecution = resolve;
      }))
    };
    const provider = new ResultsPanelProvider(
      { extensionUri: {} } as never,
      connectionManagerStub(),
      {
        getTabs: () => [resultTab({ id: 'tab-adjust', queryText: 'select * from public.adjust_offer', rowCount: 7 })],
        saveTabs: async (tabs: QueryResultTab[]) => {
          savedTabs.push(tabs);
        }
      } as never,
      executor as never
    );

    const rerun = (provider as never as { onMessage(message: unknown): Promise<void> }).onMessage({
      type: 'rerunTab',
      tabId: 'tab-adjust',
      maxRows: 1000
    });
    await vi.waitFor(() => expect(executor.execute).toHaveBeenCalledTimes(1));

    expect(provider.getTab('tab-adjust')?.executionStatus).toBe('running');
    expect(provider.getTab('tab-adjust')?.resultSets).toEqual([]);
    expect(savedTabs.at(-1)?.[0].executionStatus).toBe('running');

    resolveExecution?.(resultTab({
      id: 'tab-next',
      queryText: 'select * from public.adjust_offer',
      rowCount: 42,
      executionStatus: 'completed'
    }));
    await rerun;

    expect(provider.getTab('tab-adjust')?.executionStatus).toBe('completed');
    expect(provider.getTab('tab-adjust')?.rowCount).toBe(42);
    expect(provider.getTab('tab-next')).toBeUndefined();
  });

  it('reruns a result tab without the client row limit when All rows is requested', async () => {
    const local = connection({ id: 'local' });
    const executor = {
      execute: vi.fn(async (params) => resultTab({
        id: 'tab-next',
        connectionId: params.connectionId,
        queryText: params.sql,
        maxRows: params.maxRows,
        rowCount: 750,
        executionStatus: 'completed'
      }))
    };
    const provider = new ResultsPanelProvider(
      { extensionUri: {} } as never,
      connectionManagerStub(),
      {
        getTabs: () => [resultTab({ id: 'tab-adjust', connectionId: local.id, queryText: 'select * from public.adjust_offer', maxRows: 500 })],
        saveTabs: vi.fn()
      } as never,
      executor as never
    );

    await (provider as never as { onMessage(message: unknown): Promise<void> }).onMessage({
      type: 'rerunTab',
      tabId: 'tab-adjust',
      maxRows: null
    });

    expect(executor.execute).toHaveBeenCalledWith(expect.objectContaining({ maxRows: undefined }));
    expect(provider.getTab('tab-adjust')?.maxRows).toBeUndefined();
    expect(provider.getTab('tab-adjust')?.rowCount).toBe(750);
  });

  it('routes result toolbar cancel messages to the cancel callback', async () => {
    const cancel = vi.fn(async () => undefined);
    const provider = new ResultsPanelProvider(
      { extensionUri: {} } as never,
      connectionManagerStub(),
      {
        getTabs: () => [resultTab({ id: 'tab-adjust', queryText: 'select * from public.adjust_offer' })],
        saveTabs: vi.fn()
      } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      cancel
    );

    await (provider as never as { onMessage(message: unknown): Promise<void> }).onMessage({
      type: 'cancelTab',
      tabId: 'tab-adjust'
    });

    expect(cancel).toHaveBeenCalledWith('tab-adjust');
  });
});

describe('query memory metadata', () => {
  it('extracts tables, qualified columns, and output field names', () => {
    const sql = 'select c.email, o.total from public.customers c join orders o on o.customer_id = c.id';
    expect(extractQueryTables(sql)).toEqual(['public.customers', 'orders']);
    expect(extractQualifiedColumns(sql)).toEqual(['c.email', 'o.total', 'o.customer_id', 'c.id']);
    expect(outputColumnNames([{ name: 'email' }, { name: 'email' }, { name: 'total' }])).toEqual(['email', 'total']);
  });
});

describe('QueryMemorySearch', () => {
  it('scores summaries, tables, output columns, and recency', () => {
    const now = Date.now();
    const items: QueryMemoryItem[] = [
      memory({ id: 'a', title: 'Duplicate invoice check', summary: 'Finds duplicate invoices by customer.', tables: ['invoices'], outputColumns: ['invoice_number'], executedAt: now }),
      memory({ id: 'b', title: 'User login list', summary: 'Returns users by last login.', tables: ['users'], outputColumns: ['last_login'], executedAt: now - 30 * 24 * 60 * 60 * 1000 })
    ];
    const [first] = new QueryMemorySearch().search(items, { query: 'duplicate invoice_number invoices' });
    expect(first.item.id).toBe('a');
    expect(first.score).toBeGreaterThan(20);
  });

  it('filters failed results by default', () => {
    const items = [memory({ id: 'failed', status: 'failed', summary: 'missing column error' })];
    expect(new QueryMemorySearch().search(items, { query: 'missing' })).toHaveLength(0);
    expect(new QueryMemorySearch().search(items, { query: 'missing', includeFailed: true })).toHaveLength(1);
  });
});

describe('table performance advisor data', () => {
  it('aggregates target-table workload from query memory by duration-weighted runs', async () => {
    const items = [
      memory({
        id: 'slow',
        connectionId: 'local',
        tables: ['public.event_fact'],
        sql: `select e.user_id, count(*)
from public.event_fact e
join public.users u on e.user_id = u.id
where e.created_at >= current_date - interval '30 days'
group by e.user_id
order by e.created_at desc`,
        runCount: 3,
        durationMs: 1200,
        executedAt: 20
      }),
      memory({
        id: 'other-connection',
        connectionId: 'prod',
        tables: ['public.event_fact'],
        sql: 'select * from public.event_fact e where e.created_at > current_date',
        runCount: 99,
        durationMs: 9999
      })
    ];
    const service = new QueryMemoryService(
      { getAll: vi.fn(() => []) } as never,
      { getAll: vi.fn(() => items), get: vi.fn(), upsert: vi.fn(), delete: vi.fn() } as never,
      { getAll: vi.fn(() => []) } as never,
      { getConnection: vi.fn() } as never
    );

    const workload = await service.getTableWorkload('local', 'public.event_fact');

    expect(workload.queryCount).toBe(1);
    expect(workload.totalRunCount).toBe(3);
    expect(workload.totalDurationMs).toBe(1200);
    expect(workload.topQueries[0]).toMatchObject({ score: 3600, runCount: 3, durationMs: 1200 });
    expect(workload.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'join', column: 'user_id', queryCount: 1, runCount: 3 }),
      expect.objectContaining({ role: 'filter', column: 'created_at', queryCount: 1, runCount: 3 }),
      expect.objectContaining({ role: 'groupBy', column: 'user_id', queryCount: 1, runCount: 3 }),
      expect.objectContaining({ role: 'orderBy', column: 'created_at', queryCount: 1, runCount: 3 })
    ]));
  });

  it('builds deterministic Redshift flags and ready-to-run maintenance DDL', () => {
    const flags = buildTablePerformancePrepassFlags(redshiftStats({
      skewRows: 5.4,
      unsortedPct: 28,
      statsOffPct: 17,
      sortKey1: undefined
    }), workloadSummary([
      { role: 'join', column: 'user_id', runCount: 8, durationMs: 9000 },
      { role: 'filter', column: 'created_at', runCount: 12, durationMs: 14000 }
    ]));

    expect(flags.map((flag) => flag.kind)).toEqual([
      'redshift_distribution_skew',
      'redshift_unsorted_rows',
      'redshift_stale_stats',
      'redshift_missing_sortkey_candidate'
    ]);
    expect(flags.map((flag) => flag.ddl)).toEqual(expect.arrayContaining([
      'alter table "public"."event_fact" alter distkey "user_id";',
      'vacuum sort only "public"."event_fact";',
      'analyze "public"."event_fact";',
      'alter table "public"."event_fact" alter sortkey ("created_at");'
    ]));
  });
});

describe('AI provider settings', () => {
  it('falls back to any registered VS Code language model when the preferred vendor is unavailable', async () => {
    const workspaceMock = vscode.workspace as unknown as { getConfiguration: ReturnType<typeof vi.fn> };
    workspaceMock.getConfiguration.mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => ({
        'ai.provider': 'vscodeLanguageModel',
        'ai.vscodeLanguageModel.vendor': 'copilot'
      } as Record<string, unknown>)[key] ?? fallback)
    });
    const selectChatModels = vi.fn(async (selector?: Record<string, unknown>) => {
      if (selector?.vendor === 'copilot') {
        return [];
      }
      return [{
        vendor: 'anthropic',
        family: 'claude',
        id: 'claude-local',
        sendRequest: vi.fn(async () => ({
          text: (async function* () {
            yield 'select 1;';
          })()
        }))
      }];
    });
    const vscodeMock = vscode as unknown as { lm?: { selectChatModels: typeof selectChatModels } };
    const previousLm = vscodeMock.lm;
    vscodeMock.lm = { selectChatModels };
    try {
      const adapter = new VsCodeLanguageModelSqlAdapter();
      await expect(adapter.isAvailable()).resolves.toBe(true);
      await expect(adapter.send({
        action: 'fix',
        selectedSql: 'select 1',
        relevantSchema: { tables: [] }
      })).resolves.toBe('select 1;');
      expect(selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' });
      expect(selectChatModels).toHaveBeenCalledWith();
    } finally {
      vscodeMock.lm = previousLm;
      workspaceMock.getConfiguration.mockReset();
      workspaceMock.getConfiguration.mockImplementation(() => ({
        get: vi.fn((_key: string, fallback: unknown) => fallback)
      }));
    }
  });

  it('routes table performance advice through a configured OpenAI-compatible endpoint', async () => {
    const workspaceMock = vscode.workspace as unknown as { getConfiguration: ReturnType<typeof vi.fn> };
    workspaceMock.getConfiguration.mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => ({
        'ai.provider': 'openAiCompatible',
        'ai.openAiCompatible.baseUrl': 'http://localhost:11434/v1',
        'ai.openAiCompatible.model': 'local-sql-advisor',
        'ai.openAiCompatible.apiKey': 'test-key'
      } as Record<string, unknown>)[key] ?? fallback)
    });
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            findings: ['Statistics are stale.'],
            recommendations: [{
              kind: 'analyze',
              impact: 'medium',
              rationale: 'stats_off is above the threshold.',
              ddl: 'analyze "public"."event_fact";'
            }]
          })
        }
      }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const adapter = new VsCodeLanguageModelSqlAdapter();
      const advice = await adapter.adviseTablePerformance(tableAdviceRequest());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      expect(body.model).toBe('local-sql-advisor');
      expect(body.messages[0].content).toContain('Deterministic flags JSON');
      expect(advice.recommendations).toEqual([{
        kind: 'analyze',
        impact: 'medium',
        rationale: 'stats_off is above the threshold.',
        ddl: 'analyze "public"."event_fact";'
      }]);
    } finally {
      vi.unstubAllGlobals();
      workspaceMock.getConfiguration.mockReset();
      workspaceMock.getConfiguration.mockImplementation(() => ({
        get: vi.fn((_key: string, fallback: unknown) => fallback)
      }));
    }
  });
});

describe('Visual Explain plans', () => {
  it('normalizes EXPLAIN FORMAT JSON into a tree with deterministic hot-node annotations', () => {
    const plan = normalizeExplainJsonPlan([{
      Plan: {
        'Node Type': 'Nested Loop',
        'Startup Cost': 0.4,
        'Total Cost': 98123.45,
        'Plan Rows': 25000,
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'event_fact',
            'Total Cost': 88000,
            'Plan Rows': 150000,
            Filter: '(created_at >= current_date)'
          },
          {
            'Node Type': 'Sort',
            'Total Cost': 40000,
            'Plan Rows': 25000,
            'Sort Key': ['created_at']
          }
        ]
      },
      'Planning Time': 2.5,
      'Execution Time': 120.75
    }], false);

    expect(plan.format).toBe('json');
    expect(plan.root?.nodeType).toBe('Nested Loop');
    expect(plan.root?.children.map((child) => child.nodeType)).toEqual(['Seq Scan', 'Sort']);
    expect(plan.planningTimeMs).toBe(2.5);
    expect(plan.executionTimeMs).toBe(120.75);
    expect(plan.annotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'plan', severity: 'medium', message: expect.stringContaining('Nested loop') }),
      expect.objectContaining({ nodeId: 'plan.1', severity: 'high', message: expect.stringContaining('Sequential scan') }),
      expect.objectContaining({ nodeId: 'plan.2', severity: 'medium', message: expect.stringContaining('Sort') })
    ]));
  });
});

describe('data profiling', () => {
  it('computes sampled column nulls, distinct values, top values, min/max, and histogram buckets', () => {
    const profile = profileColumn('status', 'text', true, ['paid', 'paid', 'open', null, 'paid']);

    expect(profile).toMatchObject({
      name: 'status',
      rowCount: 5,
      nullCount: 1,
      nullPct: 20,
      distinctCount: 2,
      min: 'open',
      max: 'paid'
    });
    expect(profile.topValues).toEqual([
      { value: 'paid', count: 3 },
      { value: 'open', count: 1 }
    ]);
    expect(profile.histogram).toEqual([
      { label: 'paid', count: 3 },
      { label: 'open', count: 1 }
    ]);
  });

  it('builds numeric histograms for numeric-looking values', () => {
    const profile = profileColumn('amount', 'numeric', false, [1, 2, 2, 5, 10, null]);

    expect(profile.nullPct).toBeCloseTo(16.7);
    expect(profile.min).toBe('1');
    expect(profile.max).toBe('10');
    expect(profile.histogram.reduce((total, bucket) => total + bucket.count, 0)).toBe(5);
  });
});

describe('parseQueryMemorySummaryText', () => {
  it('parses fenced JSON and filters invalid arrays', () => {
    const parsed = parseQueryMemorySummaryText('```json\n{"title":" Duplicate invoice check ","summary":" Finds duplicate invoices. ","tables":["invoices",1],"columns":["i.id",false]}\n```');
    expect(parsed).toEqual({
      title: 'Duplicate invoice check',
      summary: 'Finds duplicate invoices.',
      tables: ['invoices'],
      columns: ['i.id']
    });
  });

  it('rejects malformed summaries', () => {
    expect(() => parseQueryMemorySummaryText('not json')).toThrow(/summary JSON/);
    expect(() => parseQueryMemorySummaryText('{"title":"Only title"}')).toThrow(/missing title or summary/);
  });
});

describe('resolveDocumentConnection', () => {
  it('uses the console-bound connection instead of the preferred fallback', () => {
    const local = connection({ id: 'local', name: 'APH-Local' });
    const production = connection({ id: 'production', name: 'APH-Production', production: true });
    const consoleRecord = consoleFor('file:///workspace/.vscode-data-grip/aph-local.sql', 'local');

    const resolved = resolveDocumentConnection(consoleRecord.documentUri, [consoleRecord], [local, production], production);

    expect(resolved).toMatchObject({
      isBound: true,
      boundConnectionId: 'local',
      connection: { id: 'local' }
    });
  });

  it('does not fall back when a console is bound to a missing connection', () => {
    const production = connection({ id: 'production', name: 'APH-Production', production: true });
    const consoleRecord = consoleFor('file:///workspace/.vscode-data-grip/aph-local.sql', 'local');

    const resolved = resolveDocumentConnection(consoleRecord.documentUri, [consoleRecord], [production], production);

    expect(resolved.isBound).toBe(true);
    expect(resolved.boundConnectionId).toBe('local');
    expect(resolved.connection).toBeUndefined();
  });
});

describe('connection defaults', () => {
  it('uses Redshift connection defaults that match the Redshift endpoint shape', () => {
    expect(connectionDefaultsForType('redshift')).toMatchObject({
      port: '5439',
      database: 'dev',
      sslMode: 'require'
    });
  });

  it('keeps PostgreSQL defaults separate from Redshift defaults', () => {
    expect(connectionDefaultsForType('postgres')).toMatchObject({
      port: '5432',
      database: 'postgres',
      sslMode: 'disable'
    });
  });

  it('provides MySQL defaults', () => {
    expect(connectionDefaultsForType('mysql')).toMatchObject({
      port: '3306',
      database: 'mysql',
      sslMode: 'disable'
    });
  });

  it('provides defaults for every supported driver type', () => {
    expect(connectionDefaultsForType('sqlite')).toMatchObject({ port: '0', database: ':memory:' });
    expect(connectionDefaultsForType('sqlserver')).toMatchObject({ port: '1433', database: 'master' });
    expect(connectionDefaultsForType('oracle')).toMatchObject({ port: '1521', database: 'ORCLPDB1' });
    expect(connectionDefaultsForType('redis')).toMatchObject({ port: '6379', database: '0' });
    expect(connectionDefaultsForType('snowflake')).toMatchObject({ port: '443', database: 'SNOWFLAKE' });
  });
});

describe('ConnectionManager', () => {
  it('reconnects an active connection after saving timeout changes', async () => {
    let saved = connection({ id: 'dwh', type: 'redshift', queryTimeoutMs: 300000 });
    const store = {
      getAll: vi.fn(() => [saved]),
      save: vi.fn(async (config) => {
        const { password: _password, ...metadata } = config;
        saved = metadata;
      }),
      withPassword: vi.fn(async (config) => ({ ...config, password: 'secret' })),
      setSelectedConnectionId: vi.fn(),
      getSelectedConnectionId: vi.fn(() => saved.id),
      delete: vi.fn()
    };
    const driver = {
      id: 'redshift',
      displayName: 'Redshift',
      connect: vi.fn(async (config) => ({ id: config.id, config, connectedAt: Date.now() })),
      disconnect: vi.fn()
    };
    const manager = new ConnectionManager(store as never);
    (manager as unknown as { drivers: Map<string, unknown> }).drivers.set('redshift', driver);

    await manager.connect(saved.id);
    await manager.save({ ...saved, queryTimeoutMs: 1800000, password: 'secret' });

    expect(driver.connect).toHaveBeenCalledTimes(2);
    expect(driver.connect.mock.calls[1][0].queryTimeoutMs).toBe(1800000);
    expect(manager.getActiveConnections()[0].config.queryTimeoutMs).toBe(1800000);
  });
});

describe('partitionExistingConsoleRecords', () => {
  it('separates stale query console records from existing SQL files', async () => {
    const records = [
      consoleFor('file:///workspace/.vscode-data-grip/live.sql', 'local'),
      consoleFor('file:///workspace/.vscode-data-grip/missing.sql', 'local')
    ];

    const result = await partitionExistingConsoleRecords(
      records,
      async (documentUri) => !documentUri.endsWith('/missing.sql')
    );

    expect(result.existing.map((record) => record.documentUri)).toEqual(['file:///workspace/.vscode-data-grip/live.sql']);
    expect(result.missing.map((record) => record.documentUri)).toEqual(['file:///workspace/.vscode-data-grip/missing.sql']);
  });

  it('finds query session records tied to deleted connections', () => {
    const result = orphanedConnectionRecordIds({
      consoles: [
        consoleFor('file:///workspace/.vscode-data-grip/live.sql', 'local'),
        consoleFor('file:///workspace/.vscode-data-grip/orphan.sql', 'deleted')
      ],
      sqlDocuments: [
        { documentUri: 'file:///workspace/report.sql', connectionId: 'local', updatedAt: 1 },
        { documentUri: 'file:///workspace/old.sql', connectionId: 'deleted', updatedAt: 1 }
      ],
      history: [
        historyFor({ id: 'history-live', connectionId: 'local' }),
        historyFor({ id: 'history-orphan', connectionId: 'deleted' })
      ],
      memory: [
        memory({ id: 'memory-live', connectionId: 'local', latestHistoryId: 'history-live' }),
        memory({ id: 'memory-orphan-connection', connectionId: 'deleted' }),
        memory({ id: 'memory-orphan-history', connectionId: 'local', historyIds: ['history-orphan'] })
      ]
    }, ['local']);

    expect(result).toEqual({
      consoleIds: ['console-deleted'],
      sqlDocumentUris: ['file:///workspace/old.sql'],
      historyIds: ['history-orphan'],
      memoryIds: ['memory-orphan-connection', 'memory-orphan-history']
    });
  });
});

describe('query console history filters', () => {
  const consoleUris = queryConsoleDocumentUris([
    consoleFor('file:///workspace/.vscode-data-grip/local.sql', 'local')
  ]);

  it('classifies executions from tracked consoles separately from project sql files', () => {
    expect(executionOriginForDocument('file:///workspace/.vscode-data-grip/local.sql', consoleUris)).toBe('queryConsole');
    expect(executionOriginForDocument('file:///workspace/project/report.sql', consoleUris)).toBe('sqlFile');
  });

  it('keeps only query console history, including legacy records from tracked consoles', () => {
    const consoleHistory = historyFor({ documentUri: 'file:///workspace/.vscode-data-grip/local.sql' });
    const legacyConsoleHistory = historyFor({ documentUri: 'file:///old-workspace/.vscode-data-grip/deleted-console.sql' });
    const projectHistory = historyFor({ documentUri: 'file:///workspace/project/report.sql' });
    const taggedConsoleHistory = historyFor({ sourceOrigin: 'queryConsole', documentUri: 'file:///workspace/project/report.sql' });
    const taggedProjectHistory = historyFor({ sourceOrigin: 'sqlFile', documentUri: 'file:///workspace/.vscode-data-grip/local.sql' });

    expect(isQueryConsoleHistoryItem(consoleHistory, consoleUris)).toBe(true);
    expect(isQueryConsoleHistoryItem(legacyConsoleHistory, consoleUris)).toBe(true);
    expect(isQueryConsoleHistoryItem(projectHistory, consoleUris)).toBe(false);
    expect(isQueryConsoleHistoryItem(taggedConsoleHistory, consoleUris)).toBe(true);
    expect(isQueryConsoleHistoryItem(taggedProjectHistory, consoleUris)).toBe(false);
  });

  it('keeps query memory search scoped to query console-backed records', () => {
    expect(isQueryConsoleMemoryItem(memory({ documentUri: 'file:///workspace/.vscode-data-grip/local.sql' }), consoleUris)).toBe(true);
    expect(isQueryConsoleMemoryItem(memory({ documentUri: 'file:///workspace/project/report.sql' }), consoleUris)).toBe(false);
  });
});

describe('schema metadata cache', () => {
  it('fingerprints connection identity fields and rejects incompatible snapshots', () => {
    const local = connection({ id: 'local', database: 'app' });
    const otherDatabase = connection({ id: 'local', database: 'warehouse' });
    const entry = schemaEntry({ connectionId: local.id });
    const serialized = serializeSchemaCacheEntry(local, entry);

    expect(connectionMetadataFingerprint(local)).not.toBe(connectionMetadataFingerprint(otherDatabase));
    expect(parseStoredSchemaCacheEntry(local, serialized)?.entry.connectionId).toBe('local');
    expect(parseStoredSchemaCacheEntry(otherDatabase, serialized)).toBeUndefined();
    expect(parseStoredSchemaCacheEntry(local, serialized.replace(`"version":${SCHEMA_METADATA_CACHE_VERSION}`, '"version":0'))).toBeUndefined();
  });

  it('hydrates stale disk metadata for columns without connecting or hitting the driver', async () => {
    const local = connection({ id: 'local' });
    const hydrated = schemaEntry({
      connectionId: local.id,
      loadedAt: Date.now() - 10 * 60_000,
      columns: {
        'public.users': [
          { schema: 'public', table: 'users', name: 'email', ordinal: 1, dataType: 'text', nullable: false }
        ]
      }
    });
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => false),
      getDriver: vi.fn()
    };
    const store = {
      hydrate: vi.fn(async () => hydrated),
      persist: vi.fn(),
      deleteConnection: vi.fn(),
      getStorageError: vi.fn()
    };

    const service = new SchemaContextService(manager as never, store as never);
    const entry = await service.getCachedForConnection(local, 'public');
    const columns = await service.getCachedColumns(local, 'public', 'users');

    expect(entry?.status).toBe('stale');
    expect(columns?.map((column) => column.name)).toEqual(['email']);
    expect(manager.getDriver).not.toHaveBeenCalled();
  });

  it('does not reuse stale columns after a live column refresh failure', async () => {
    const local = connection({ id: 'local' });
    const hydrated = schemaEntry({
      connectionId: local.id,
      loadedAt: Date.now() - 10 * 60_000,
      columns: {
        'public.users': [
          { schema: 'public', table: 'users', name: 'old_email', ordinal: 1, dataType: 'text', nullable: false }
        ]
      }
    });
    const driver = {
      getSchemas: vi.fn(async () => [{ name: 'public' }]),
      getTables: vi.fn(async () => [{ schema: 'public', name: 'users', type: 'table' }]),
      getViews: vi.fn(async () => []),
      getColumns: vi.fn(async () => {
        throw new Error('column metadata unavailable');
      })
    };
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      getDriver: vi.fn(() => driver)
    };
    const store = {
      hydrate: vi.fn(async () => hydrated),
      persist: vi.fn(),
      deleteConnection: vi.fn(),
      getStorageError: vi.fn()
    };

    const service = new SchemaContextService(manager as never, store as never);
    await service.getCachedForConnection(local, 'public');
    const refreshed = await service.loadDefaultSchema(local, true);
    const columns = await service.getCachedColumns(local, 'public', 'users');

    expect(refreshed.status).toBe('ready');
    expect(columns).toBeUndefined();
    expect(store.persist).toHaveBeenCalledWith(local, expect.objectContaining({ columns: {} }));
  });

  it('keeps column metadata refresh from consuming the whole connection pool', async () => {
    const local = connection({ id: 'local' });
    const tables = Array.from({ length: 10 }, (_, index) => ({
      schema: 'public',
      name: `table_${index}`,
      type: 'table' as const
    }));
    let activeColumnLoads = 0;
    let maxActiveColumnLoads = 0;
    const driver = {
      getSchemas: vi.fn(async () => [{ name: 'public' }]),
      getTables: vi.fn(async () => tables),
      getViews: vi.fn(async () => []),
      getColumns: vi.fn(async (_connectionId: string, schema: string, table: string) => {
        activeColumnLoads += 1;
        maxActiveColumnLoads = Math.max(maxActiveColumnLoads, activeColumnLoads);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activeColumnLoads -= 1;
        return [{ schema, table, name: 'id', ordinal: 1, dataType: 'integer', nullable: false }];
      })
    };
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      getDriver: vi.fn(() => driver)
    };
    const store = {
      hydrate: vi.fn(),
      persist: vi.fn(),
      deleteConnection: vi.fn(),
      getStorageError: vi.fn()
    };

    const service = new SchemaContextService(manager as never, store as never);
    const refreshed = await service.loadDefaultSchema(local, true);

    expect(refreshed.status).toBe('ready');
    expect(Object.keys(refreshed.columns)).toHaveLength(tables.length);
    expect(maxActiveColumnLoads).toBeLessThanOrEqual(4);
  });

  it('deduplicates overlapping forced schema refreshes for the same connection', async () => {
    const local = connection({ id: 'local' });
    let resolveTables: ((tables: Array<{ schema: string; name: string; type: 'table' }>) => void) | undefined;
    const tablesPending = new Promise<Array<{ schema: string; name: string; type: 'table' }>>((resolve) => {
      resolveTables = resolve;
    });
    const driver = {
      getSchemas: vi.fn(async () => [{ name: 'public' }]),
      getTables: vi.fn(async () => tablesPending),
      getViews: vi.fn(async () => []),
      getColumns: vi.fn(async (_connectionId: string, schema: string, table: string) => [
        { schema, table, name: 'id', ordinal: 1, dataType: 'integer', nullable: false }
      ])
    };
    const manager = {
      getConnection: vi.fn(() => local),
      isConnected: vi.fn(() => true),
      getDriver: vi.fn(() => driver)
    };
    const store = {
      hydrate: vi.fn(),
      persist: vi.fn(),
      deleteConnection: vi.fn(),
      getStorageError: vi.fn()
    };

    const service = new SchemaContextService(manager as never, store as never);
    const first = service.loadDefaultSchema(local, true);
    const second = service.loadDefaultSchema(local, true);

    resolveTables?.([{ schema: 'public', name: 'users', type: 'table' }]);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(driver.getSchemas).toHaveBeenCalledTimes(1);
    expect(driver.getTables).toHaveBeenCalledTimes(1);
    expect(driver.getViews).toHaveBeenCalledTimes(1);
    expect(driver.getColumns).toHaveBeenCalledTimes(1);
  });
});

describe('SQL diagnostics', () => {
  it('does not treat FROM inside EXTRACT casts as a table reference', async () => {
    const local = connection({ id: 'local' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [{ schema: 'public', name: 'event_fact', type: 'table' }],
          columns: {
            'public.event_fact': [
              { schema: 'public', table: 'event_fact', name: 'event_datetime', ordinal: 1, dataType: 'timestamp', nullable: true },
              { schema: 'public', table: 'event_fact', name: 'network_offer_id', ordinal: 2, dataType: 'integer', nullable: true }
            ]
          }
        })),
        getCachedColumns: vi.fn(async () => [
          { schema: 'public', table: 'event_fact', name: 'event_datetime', ordinal: 1, dataType: 'timestamp', nullable: true },
          { schema: 'public', table: 'event_fact', name: 'network_offer_id', ordinal: 2, dataType: 'integer', nullable: true }
        ]),
        refreshDefaultSchemaInBackground: vi.fn(),
        refreshSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = `select extract(day from event_datetime::date) as source_name
from public.event_fact
where event_datetime::date between '2026-06-01' and '2026-06-01'`;

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain(
      'Table or view "event_datetime" does not exist in public.'
    );
  });

  it('accepts generated selects with quoted schema and table names', async () => {
    const local = connection({ id: 'local' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [{ schema: 'public', name: 'adjust_offer', type: 'table' }]
        })),
        getCachedColumns: vi.fn(),
        refreshDefaultSchemaInBackground: vi.fn(),
        refreshSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = `select *
from "public"."adjust_offer"
limit 100;`;

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain('Expected a table name after FROM.');
    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain(
      'Table or view "public.adjust_offer" does not exist in public.'
    );
  });

  it('skips planner validation and missing-column checks while SQL parameters still need values', async () => {
    const local = connection({ id: 'local' });
    const validateQuery = vi.fn();
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => true),
        getDriver: vi.fn(() => ({ validateQuery }))
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [{ schema: 'public', name: 'event_fact', type: 'table' }]
        })),
        getCachedColumns: vi.fn(async () => [
          { schema: 'public', table: 'event_fact', name: 'event_datetime', ordinal: 1, dataType: 'timestamp', nullable: true }
        ]),
        refreshDefaultSchemaInBackground: vi.fn(),
        refreshSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = `select event_datetime
from public.event_fact
where event_datetime::date between '{startDate}' and :endDate`;

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);

    expect(validateQuery).not.toHaveBeenCalled();
    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain('Column "startDate" does not exist on public.event_fact.');
    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain('Column "endDate" does not exist on public.event_fact.');
    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain('BETWEEN requires an AND upper bound.');
  });

  it('flags incomplete BETWEEN expressions before SQL parameters are resolved', async () => {
    const local = connection({ id: 'local' });
    const validateQuery = vi.fn();
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => true),
        getDriver: vi.fn(() => ({ validateQuery }))
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [{ schema: 'public', name: 'adjust_offer', type: 'table' }],
          columns: {
            'public.adjust_offer': [
              { schema: 'public', table: 'adjust_offer', name: 'date', ordinal: 1, dataType: 'date', nullable: true }
            ]
          }
        })),
        getCachedColumns: vi.fn(async () => [
          { schema: 'public', table: 'adjust_offer', name: 'date', ordinal: 1, dataType: 'date', nullable: true }
        ]),
        refreshDefaultSchemaInBackground: vi.fn(),
        refreshSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = 'select * from public.adjust_offer where date between :date';

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);

    expect(validateQuery).not.toHaveBeenCalled();
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toContain('BETWEEN requires an AND upper bound.');
  });

  it('does not flag tables created earlier in the same script as missing schema objects', async () => {
    const local = connection({ id: 'local' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [{ schema: 'public', name: 'adjust_reporting_raw', type: 'table' }]
        })),
        getCachedColumns: vi.fn(),
        refreshDefaultSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );

    const diagnostics = await service.getDiagnostics(sqlDocument(`create temp table adjust_kpi_raw__keeper as
select *
from public.adjust_reporting_raw;

insert into public.adjust_reporting_raw(channel)
select channel
from adjust_kpi_raw__keeper;`) as never, undefined, local);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain(
      'Table or view "adjust_kpi_raw__keeper" does not exist in public.'
    );
  });

  it('accepts Redshift INSERT statements that use a WITH query expression', async () => {
    const local = connection({ id: 'redshift', type: 'redshift' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [
            { schema: 'public', name: 'vivo_api_cost_report', type: 'table' },
            { schema: 'public', name: 'cost_plus_offers_fact', type: 'table' }
          ]
        })),
        getCachedColumns: vi.fn(),
        refreshDefaultSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = `begin;

create temp table cost_plus_offers_fact_staging
(
 like public.cost_plus_offers_fact
);

insert into cost_plus_offers_fact_staging (
 date,
 network_offer_id,
 installs
)
with cost_data as (
 select
   vcr.date::date as date,
   trim(split_part(vcr.ad_name, '*', 1))::varchar(255) as network_offer_id,
   sum(vcr.installs) as installs
 from public.vivo_api_cost_report vcr
 where vcr.date::date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
 group by 1, 2
)
select date, network_offer_id, installs
from cost_data;`;

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);
    const messages = diagnostics.map((diagnostic) => diagnostic.message);

    expect(messages).not.toContain('Expected a table name after INTO.');
    expect(messages).not.toContain('Table or view "cost_data" does not exist in public.');
    expect(messages).not.toContain('Table or view "cost_plus_offers_fact_staging" does not exist in public.');
  });

  it('accepts multi-step Redshift scripts with insert CTEs and update CTEs', async () => {
    const local = connection({ id: 'redshift', type: 'redshift' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [
            { schema: 'public', name: 'cost_plus_offers_fact', type: 'table' },
            { schema: 'public', name: 'vivo_api_cost_report', type: 'table' },
            { schema: 'public', name: 'aph_appsflyer_direct_sources_payout_revenue', type: 'table' },
            { schema: 'public', name: 'aph_adjust_reporting_direct_sources_payout_revenue', type: 'table' },
            { schema: 'public', name: 'offer_fact', type: 'table' },
            { schema: 'public', name: 'offer_all_fact', type: 'table' },
            { schema: 'public', name: 'mediasource_dim', type: 'table' }
          ]
        })),
        getCachedColumns: vi.fn(),
        refreshDefaultSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = `begin;

create temp table cost_plus_offers_fact_staging
(
 like public.cost_plus_offers_fact
);

insert into cost_plus_offers_fact_staging (
 date,
 country,
 campaign,
 channel,
 ad_id,
 media_source,
 app_id,
 installs,
 revenue,
 cost,
 mmp,
 category,
 checksum,
 natural_key_hash,
 is_active,
 insert_at,
 modified_at,
 source,
 network_offer_id,
 campaign_id,
 adgroup_id,
 adgroup_name,
 ad_creative_id,
 ad_name,
 placement,
 advertiser_id
)
with cost_data as (
 select
   vcr.date::date as date,
   null::varchar(256) as country,
   vcr.campaign_name::varchar(256) as campaign_name,
   null::varchar(256) as campaign_id,
   null::varchar(256) as adgroup_id,
   null::varchar(256) as adgroup_name,
   vcr.ad_id::varchar(256) as ad_creative_id,
   vcr.ad_name::varchar(256) as ad_name,
   'N/A'::varchar(256) as placement,
   vcr.ad_id::varchar(256) as ad_id,
   vcr.package_name::varchar(256) as package_name,
   trim(split_part(vcr.ad_name, '*', 1))::varchar(255) as network_offer_id,
   sum(vcr.cost) as total_cost,
   sum(vcr.installs) as installs
 from public.vivo_api_cost_report vcr
 where vcr.date::date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
 group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
),
rps_data as (
 select
   dspr.date,
   dspr.network_offer_id,
   dspr.revenue as revenue_percentage,
   dspr.direct_source_id,
   'Appsflyer'::varchar(256) as mmp
 from public.aph_appsflyer_direct_sources_payout_revenue dspr
 where dspr.date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval

 union all

 select
   dspr.date,
   dspr.network_offer_id,
   dspr.revenue as revenue_percentage,
   dspr.direct_source_id,
   'Adjust'::varchar(256) as mmp
 from public.aph_adjust_reporting_direct_sources_payout_revenue dspr
 where dspr.date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
),
offer_data as (
 select network_offer_id, app_identifier, network_advertiser_id, category, ingestion_time::date as offer_date, campaign
 from (
   select *,
     row_number() over (
       partition by network_offer_id, ingestion_time::date
       order by ingestion_time desc
     ) as rn
   from public.offer_fact
   where ingestion_time::date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
 ) as offer_ranked
 where rn = 1
),
offer_all_data as (
 select
   network_offer_id,
   campaign,
   app_identifier,
   network_advertiser_id,
   row_number() over (partition by network_offer_id order by time_saved desc) as rn
 from public.offer_all_fact
)
select
 cd.date,
 cd.country,
 coalesce(ofd.campaign, oaf.campaign, cd.campaign_name) as campaign,
 cd.placement as channel,
 cd.ad_id,
 md.media_source,
 coalesce(ofd.app_identifier, oaf.app_identifier, cd.package_name) as app_id,
 cd.installs,
 cd.total_cost / (1 - (rd.revenue_percentage / 100)) as revenue,
 cd.total_cost as cost,
 rd.mmp,
 ofd.category,
 md5(coalesce(cd.installs::text, '') || coalesce(cd.total_cost::text, '')) as checksum,
 md5(coalesce(cd.date::text, '') || coalesce(cd.country, '') || coalesce(cd.campaign_name, '') || coalesce(rd.network_offer_id::text, '') || 'cost_plus_offers_fact_vivo') as natural_key_hash,
 true as is_active,
 current_date as insert_at,
 current_date as modified_at,
 'cost_plus_offers_fact_vivo'::varchar(100) as source,
 rd.network_offer_id,
 cd.campaign_id,
 cd.adgroup_id,
 cd.adgroup_name,
 cd.ad_creative_id,
 cd.ad_name,
 cd.placement,
 coalesce(ofd.network_advertiser_id, oaf.network_advertiser_id) as advertiser_id
from cost_data cd
left join rps_data rd
 on cd.date = rd.date
 and cd.network_offer_id = rd.network_offer_id::varchar(255)
left join public.mediasource_dim md
 on rd.direct_source_id = md.direct_source_id
left join offer_data ofd
 on rd.network_offer_id = ofd.network_offer_id
 and rd.date = ofd.offer_date
left join offer_all_data oaf
 on rd.network_offer_id = oaf.network_offer_id
 and oaf.rn = 1
where rd.network_offer_id is not null;

update public.cost_plus_offers_fact as t
set
 installs = s.installs,
 revenue = s.revenue,
 cost = s.cost,
 checksum = s.checksum,
 modified_at = current_date,
 is_active = true
from cost_plus_offers_fact_staging s
where t.natural_key_hash = s.natural_key_hash
 and (coalesce(t.checksum, '') != coalesce(s.checksum, '') or t.is_active = false);

insert into public.cost_plus_offers_fact
select s.*
from cost_plus_offers_fact_staging s
left join public.cost_plus_offers_fact t
 on t.natural_key_hash = s.natural_key_hash
where t.natural_key_hash is null;

with active_hashes as (
 select natural_key_hash from cost_plus_offers_fact_staging
)
update public.cost_plus_offers_fact
set is_active = false,
 modified_at = current_date
where source = 'cost_plus_offers_fact_vivo'
 and date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
 and natural_key_hash not in (select natural_key_hash from active_hashes);

drop table if exists cost_plus_offers_fact_staging;
commit;`;

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);
  });

  it('still flags relations that are neither in schema metadata nor created in the script', async () => {
    const local = connection({ id: 'local' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({ connectionId: local.id, tables: [] })),
        getCachedColumns: vi.fn(),
        refreshDefaultSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );

    const diagnostics = await service.getDiagnostics(sqlDocument('select * from missing_relation;') as never, undefined, local);
    const missingRelation = diagnostics.find((diagnostic) => diagnostic.message === 'Table or view "missing_relation" does not exist in public.');

    expect(missingRelation).toBeDefined();
    expect(missingRelation?.severity).toBe(vscode.DiagnosticSeverity.Warning);
  });

  it('keeps structural syntax diagnostics as errors', async () => {
    const local = connection({ id: 'local' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({ connectionId: local.id, tables: [] })),
        getCachedColumns: vi.fn(),
        refreshDefaultSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );

    const diagnostics = await service.getDiagnostics(sqlDocument('select (1;') as never, undefined, local);
    const syntaxIssue = diagnostics.find((diagnostic) => diagnostic.message === 'Missing closing parenthesis.');

    expect(syntaxIssue).toBeDefined();
    expect(syntaxIssue?.severity).toBe(vscode.DiagnosticSeverity.Error);
  });

  it('flags an unqualified missing column on the column token for single-table queries', async () => {
    const local = connection({ id: 'local' });
    const service = new SqlDiagnosticsService(
      {
        getPreferredConnection: vi.fn(() => local),
        isConnected: vi.fn(() => false)
      } as never,
      {
        getCachedForConnection: vi.fn(async () => schemaEntry({
          connectionId: local.id,
          tables: [{ schema: 'public', name: 'event_fact', type: 'table' }],
          columns: {
            'public.event_fact': [
              { schema: 'public', table: 'event_fact', name: 'revenue', ordinal: 1, dataType: 'numeric', nullable: true },
              { schema: 'public', table: 'event_fact', name: 'event_datetime', ordinal: 2, dataType: 'timestamp', nullable: true }
            ]
          }
        })),
        getCachedColumns: vi.fn(async () => [
          { schema: 'public', table: 'event_fact', name: 'revenue', ordinal: 1, dataType: 'numeric', nullable: true },
          { schema: 'public', table: 'event_fact', name: 'event_datetime', ordinal: 2, dataType: 'timestamp', nullable: true }
        ]),
        refreshDefaultSchemaInBackground: vi.fn(),
        refreshSchemaInBackground: vi.fn()
      } as never,
      new SqlSectionService()
    );
    const sql = `select sum(revenue) as revenue, sum(cost)
from public.event_fact
where event_datetime::date between '2026-05-01' and '2026-05-31'`;

    const diagnostics = await service.getDiagnostics(sqlDocument(sql) as never, undefined, local);
    const missingColumn = diagnostics.find((diagnostic) => diagnostic.message === 'Column "cost" does not exist on public.event_fact.');

    expect(missingColumn).toBeDefined();
    expect(missingColumn?.severity).toBe(vscode.DiagnosticSeverity.Warning);
    expect(missingColumn?.range).toMatchObject(textRange(0, 36, 0, 40));
    expect(diagnostics.map((diagnostic) => diagnostic.message)).not.toContain('Column "date" does not exist on public.event_fact.');
  });
});

describe('SQL parameters', () => {
  it('collects values in a compact parameter webview', async () => {
    const windowMock = vscode.window as unknown as {
      showQuickPick: ReturnType<typeof vi.fn>;
      showInputBox: ReturnType<typeof vi.fn>;
      createWebviewPanel: ReturnType<typeof vi.fn>;
    };
    windowMock.showQuickPick.mockReset();
    windowMock.showInputBox.mockReset();
    windowMock.createWebviewPanel.mockReset();
    let messageHandler: ((message: unknown) => void) | undefined;
    let disposeHandler: (() => void) | undefined;
    const panel = {
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        })
      },
      onDidDispose: vi.fn((handler: () => void) => {
        disposeHandler = handler;
        return { dispose: vi.fn() };
      }),
      dispose: vi.fn(() => disposeHandler?.())
    };
    windowMock.createWebviewPanel.mockReturnValueOnce(panel);
    const prompt = new SqlParameterPrompt();
    const sql = `select *
from public.event_fact
where event_datetime::date = {startDate}`;

    const resolving = prompt.resolve(sql);
    await Promise.resolve();
    messageHandler?.({ type: 'execute', values: { startDate: '2026-06-01' } });
    const resolved = await resolving;

    expect(windowMock.showQuickPick).not.toHaveBeenCalled();
    expect(windowMock.showInputBox).not.toHaveBeenCalled();
    expect(windowMock.createWebviewPanel).toHaveBeenCalledWith(
      'databaseSqlParameters',
      'Parameters',
      vscode.ViewColumn.Active,
      expect.objectContaining({ enableScripts: true })
    );
    expect(panel.webview.html).toContain('Parameters');
    expect(panel.webview.html).toContain('startDate');
    expect(panel.webview.html).toContain('SQL context');
    expect(panel.dispose).toHaveBeenCalled();
    expect(resolved).toContain("event_datetime::date = '2026-06-01'");
  });

  it('prefills previous parameter values only within the same query session', async () => {
    const windowMock = vscode.window as unknown as {
      createWebviewPanel: ReturnType<typeof vi.fn>;
    };
    windowMock.createWebviewPanel.mockReset();
    const messageHandlers: Array<(message: unknown) => void> = [];
    const panels = Array.from({ length: 3 }, () => ({
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
          messageHandlers.push(handler);
          return { dispose: vi.fn() };
        })
      },
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn()
    }));
    for (const panel of panels) {
      windowMock.createWebviewPanel.mockReturnValueOnce(panel);
    }
    const prompt = new SqlParameterPrompt();
    const sql = 'select * from public.event_fact where event_datetime::date >= :startDate';

    const firstRun = prompt.resolve(sql, { sessionKey: 'console-a' });
    await Promise.resolve();
    messageHandlers[0]?.({ type: 'execute', values: { startDate: '2026-06-01' } });
    await firstRun;

    const secondRun = prompt.resolve(sql, { sessionKey: 'console-a' });
    await Promise.resolve();

    expect(panels[1].webview.html).toContain('"value":"2026-06-01"');

    messageHandlers[1]?.({ type: 'cancel' });
    await secondRun;
    const otherSessionRun = prompt.resolve(sql, { sessionKey: 'console-b' });
    await Promise.resolve();

    expect(panels[2].webview.html).not.toContain('"value":"2026-06-01"');

    messageHandlers[2]?.({ type: 'cancel' });
    await otherSessionRun;
  });

  it('finds brace and named placeholders without treating PostgreSQL casts as parameters', () => {
    const sql = `select event_datetime::date
from public.event_fact
where event_datetime::date between {startDate} and :endDate
  and status = :status
-- :commented_out`;

    const parameters = findSqlParameters(sql);

    expect(uniqueSqlParameterNames(parameters)).toEqual(['startDate', 'endDate', 'status']);
    expect(parameters.map((parameter) => parameter.placeholder)).not.toContain(':date');
  });

  it('ignores brace and named placeholders inside SQL string literals', () => {
    const sql = `select *
from public.event_fact
where event_datetime::date between {startDate} and :endDate
  and literal_brace = '{startDate}'
  and literal_colon = ":startDate"
  and status = :status`;

    const parameters = findSqlParameters(sql);

    expect(uniqueSqlParameterNames(parameters)).toEqual(['startDate', 'endDate', 'status']);
    expect(parameters.map((parameter) => parameter.placeholder)).toEqual(['{startDate}', ':endDate', ':status']);
  });

  it('applies parameter values as escaped SQL literals', () => {
    const sql = `select *
from public.event_fact
where event_datetime::date between {startDate} and :endDate
  and network_affiliate_id = :affiliateId
  and source = :source`;

    expect(applySqlParameterValues(sql, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      affiliateId: '343',
      source: "Bob's Ads"
    })).toContain("between '2026-06-01' and '2026-06-30'\n  and network_affiliate_id = 343\n  and source = 'Bob''s Ads'");
  });

  it('allows raw SQL expressions with an explicit sql prefix', () => {
    const sql = 'select * from public.event_fact where event_datetime::date >= :month_ago';

    expect(applySqlParameterValues(sql, {
      month_ago: "sql:current_date - interval '1 month'"
    })).toContain("event_datetime::date >= current_date - interval '1 month'");
  });
});

describe('SQL metadata warmup', () => {
  it('connects an offline query console connection before refreshing metadata', async () => {
    const local = connection({ id: 'local' });
    const active = { id: local.id, config: local, connectedAt: Date.now() };
    const manager = {
      isConnected: vi.fn(() => false),
      connect: vi.fn(async () => active)
    };
    const schemaContext = {
      refreshDefaultSchemaInBackground: vi.fn()
    };

    await connectAndRefreshSqlMetadata(manager, schemaContext, local);

    expect(manager.connect).toHaveBeenCalledWith(local.id);
    expect(schemaContext.refreshDefaultSchemaInBackground).toHaveBeenCalledWith(local);
  });

  it('refreshes an already-connected query console connection without reconnecting', async () => {
    const local = connection({ id: 'local' });
    const manager = {
      isConnected: vi.fn(() => true),
      connect: vi.fn()
    };
    const schemaContext = {
      refreshDefaultSchemaInBackground: vi.fn()
    };

    await connectAndRefreshSqlMetadata(manager, schemaContext, local);

    expect(manager.connect).not.toHaveBeenCalled();
    expect(schemaContext.refreshDefaultSchemaInBackground).toHaveBeenCalledWith(local);
  });
});

describe('SQL metadata completions', () => {
  it('recognizes select-list column completion before the FROM table below the cursor', () => {
    const sql = `select network_
from public.adjust_offer`;
    const cursorPrefix = sql.slice(0, sql.indexOf('\n'));

    expect(selectListColumnCompletionContext(cursorPrefix)).toBe(true);
    expect(new SqlSectionService().extractTables(sql)).toEqual([
      { schema: 'public', table: 'adjust_offer' }
    ]);
  });

  it('does not treat relation clauses as select-list column completion', () => {
    expect(selectListColumnCompletionContext('select network_offer from public.')).toBe(false);
    expect(selectListColumnCompletionContext('select network_offer from public.adjust_offer where network_')).toBe(false);
  });

  it('recognizes unqualified column completion in filter and ordering clauses', () => {
    expect(unqualifiedColumnCompletionContext('select network_offer from public.adjust_offer where event_')).toBe(true);
    expect(unqualifiedColumnCompletionContext('select network_offer from public.adjust_offer order by event_')).toBe(true);
    expect(unqualifiedColumnCompletionContext('select network_offer from public.adjust_offer join public.')).toBe(false);
  });

  it('uses the nearest select before the cursor for select-list column completion', () => {
    expect(selectListColumnCompletionContext('with previous as (select id from public.old_table) select network_')).toBe(true);
  });

  it('matches schema-qualified table prefixes without treating them as aliases', () => {
    const context = relationCompletionContext('select * from public.appsflyer_');
    const entry = schemaEntry({
      tables: [
        { schema: 'public', name: 'appsflyer_offer', type: 'table' },
        { schema: 'private', name: 'appsflyer_offer', type: 'table' },
        { schema: 'public', name: 'adjust_offer', type: 'table' }
      ]
    });

    expect(context).toEqual({ schema: 'public', partial: 'appsflyer_' });
    expect(relationCompletionCandidates(entry, context!).map((relation) => `${relation.schema}.${relation.name}`)).toEqual([
      'public.appsflyer_offer'
    ]);
  });

  it('matches all tables for a schema-qualified trailing dot', () => {
    const context = relationCompletionContext('join public.');
    const entry = schemaEntry({
      tables: [
        { schema: 'public', name: 'appsflyer_offer', type: 'table' },
        { schema: 'public', name: 'users', type: 'table' },
        { schema: 'private', name: 'users', type: 'table' }
      ]
    });

    expect(context).toEqual({ schema: 'public', partial: '' });
    expect(relationCompletionCandidates(entry, context!).map((relation) => relation.name)).toEqual([
      'appsflyer_offer',
      'users'
    ]);
  });
});

function memory(overrides: Partial<QueryMemoryItem>): QueryMemoryItem {
  return {
    id: overrides.id ?? 'memory',
    sourceKind: 'history',
    sourceId: overrides.sourceId ?? overrides.id ?? 'history',
    connectionId: overrides.connectionId,
    databaseType: overrides.databaseType,
    databaseName: overrides.databaseName,
    connectionName: overrides.connectionName,
    sql: overrides.sql ?? 'select * from invoices',
    title: overrides.title,
    summary: overrides.summary,
    summaryStatus: overrides.summaryStatus ?? 'ready',
    tables: overrides.tables ?? [],
    columns: overrides.columns ?? [],
    outputColumns: overrides.outputColumns ?? [],
    documentUri: overrides.documentUri,
    status: overrides.status ?? 'completed',
    historyIds: overrides.historyIds,
    latestHistoryId: overrides.latestHistoryId,
    durationMs: overrides.durationMs,
    runCount: overrides.runCount,
    lastExecutedAt: overrides.lastExecutedAt,
    indexedAt: overrides.indexedAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    executedAt: overrides.executedAt
  };
}

function redshiftStats(overrides: NonNullable<TableStatsInfo['redshift']>): TableStatsInfo {
  return {
    schema: 'public',
    table: 'event_fact',
    databaseType: 'redshift',
    rowEstimate: overrides.rowCount,
    columns: [],
    redshift: {
      rowCount: 100000,
      ...overrides
    }
  };
}

function workloadSummary(columns: Array<{ role: TableWorkloadSummary['columns'][number]['role']; column: string; runCount: number; durationMs: number }>): TableWorkloadSummary {
  return {
    connectionId: 'local',
    table: 'public.event_fact',
    queryCount: 1,
    totalRunCount: columns.reduce((total, item) => total + item.runCount, 0),
    totalDurationMs: columns.reduce((total, item) => total + item.durationMs, 0),
    topQueries: [],
    columns: columns.map((item) => ({
      ...item,
      queryCount: 1
    }))
  };
}

function tableAdviceRequest(): TablePerformanceAdviceRequest {
  return {
    connectionName: 'Local DWH',
    databaseType: 'redshift',
    databaseName: 'analytics',
    schema: 'public',
    table: 'event_fact',
    tableDdl: 'create table "public"."event_fact" ("user_id" int, "created_at" timestamp);',
    stats: redshiftStats({ statsOffPct: 20 }),
    prepassFlags: [{
      kind: 'redshift_stale_stats',
      impact: 'medium',
      message: 'Redshift statistics are stale enough to affect plan quality.',
      evidence: 'stats_off=20%',
      recommendationKind: 'analyze',
      ddl: 'analyze "public"."event_fact";'
    }],
    workload: workloadSummary([
      { role: 'filter', column: 'created_at', runCount: 4, durationMs: 2000 }
    ])
  };
}

function historyFor(overrides: Partial<QueryHistoryItem>): QueryHistoryItem {
  return {
    id: overrides.id ?? 'history',
    connectionId: overrides.connectionId ?? 'local',
    databaseType: overrides.databaseType ?? 'postgres',
    sql: overrides.sql ?? 'select * from invoices',
    sourceOrigin: overrides.sourceOrigin,
    sourceFile: overrides.sourceFile,
    documentUri: overrides.documentUri,
    favorite: overrides.favorite,
    executedAt: overrides.executedAt ?? Date.now(),
    status: overrides.status ?? 'completed'
  };
}

function connection(overrides: Partial<ConnectionConfig>): ConnectionConfig {
  return {
    id: overrides.id ?? 'connection',
    name: overrides.name ?? 'Connection',
    type: overrides.type ?? 'postgres',
    host: overrides.host ?? 'localhost',
    port: overrides.port ?? 5432,
    database: overrides.database ?? 'aph',
    username: overrides.username ?? 'postgres',
    sslMode: overrides.sslMode ?? 'prefer',
    color: overrides.color ?? 'green',
    defaultSchema: overrides.defaultSchema ?? 'public',
    production: overrides.production,
    readOnlyDefault: overrides.readOnlyDefault
  };
}

function schemaEntry(overrides: Partial<SchemaCacheEntry>): SchemaCacheEntry {
  return {
    connectionId: overrides.connectionId ?? 'local',
    schemaName: overrides.schemaName ?? 'public',
    schemas: overrides.schemas ?? [{ name: 'public' }],
    tables: overrides.tables ?? [{ schema: 'public', name: 'users', type: 'table' }],
    views: overrides.views ?? [],
    columns: overrides.columns ?? {},
    indexes: overrides.indexes ?? {},
    keys: overrides.keys ?? {},
    loadedAt: overrides.loadedAt ?? Date.now(),
    status: overrides.status ?? 'ready',
    errorMessage: overrides.errorMessage,
    cacheVersion: overrides.cacheVersion,
    connectionFingerprint: overrides.connectionFingerprint,
    source: overrides.source
  };
}

function sqlDocument(text: string) {
  const lines = text.split('\n');
  return {
    languageId: 'sql',
    uri: { toString: () => 'file:///workspace/query.sql' },
    getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) => {
      if (!range) {
        return text;
      }
      return text.slice(offsetAt(lines, range.start), offsetAt(lines, range.end));
    },
    positionAt: (offset: number) => positionAt(lines, offset),
    offsetAt: (position: { line: number; character: number }) => offsetAt(lines, position)
  };
}

function positionAt(lines: string[], offset: number): { line: number; character: number } {
  let remaining = Math.max(0, offset);
  for (let line = 0; line < lines.length; line += 1) {
    if (remaining <= lines[line].length) {
      return { line, character: remaining };
    }
    remaining -= lines[line].length + 1;
  }
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

function offsetAt(lines: string[], position: { line: number; character: number }): number {
  let offset = 0;
  for (let line = 0; line < Math.min(position.line, lines.length); line += 1) {
    offset += lines[line].length + 1;
  }
  return offset + position.character;
}

function consoleFor(documentUri: string, connectionId: string): QueryConsoleRecord {
  return {
    id: `console-${connectionId}`,
    connectionId,
    documentUri,
    createdAt: 1,
    updatedAt: 1
  };
}

function resultTab(overrides: Partial<QueryResultTab>): QueryResultTab {
  return {
    id: overrides.id ?? 'tab',
    title: overrides.title ?? 'SQL',
    customTitle: overrides.customTitle,
    pinned: overrides.pinned ?? false,
    connectionId: overrides.connectionId ?? 'local',
    databaseType: overrides.databaseType ?? 'postgres',
    databaseName: overrides.databaseName ?? 'aph',
    schemaName: overrides.schemaName ?? 'public',
    queryText: overrides.queryText ?? 'select 1',
    sourceOrigin: overrides.sourceOrigin,
    sourceFile: overrides.sourceFile,
    sourceDocumentUri: overrides.sourceDocumentUri,
    sourceQueryId: overrides.sourceQueryId,
    sourceSectionIndex: overrides.sourceSectionIndex,
    sourceRange: overrides.sourceRange,
    executionStatus: overrides.executionStatus ?? 'completed',
    executionStartedAt: overrides.executionStartedAt ?? 1,
    executionFinishedAt: overrides.executionFinishedAt ?? 2,
    executionTimeMs: overrides.executionTimeMs ?? 1,
    rowCount: overrides.rowCount ?? 0,
    maxRows: overrides.maxRows,
    error: overrides.error,
    resultSets: overrides.resultSets ?? [],
    transaction: overrides.transaction,
    activeResultSetIndex: overrides.activeResultSetIndex ?? 0,
    filters: overrides.filters ?? [],
    sort: overrides.sort ?? [],
    columnState: overrides.columnState ?? [],
    scrollState: overrides.scrollState,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 2
  };
}

function connectionManagerStub() {
  return {
    getTransactionMode: vi.fn(() => 'auto'),
    isTransactionOpen: vi.fn(() => false),
    beginTransaction: vi.fn(async () => undefined),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined)
  } as never;
}

function safeClassifier() {
  return {
    classify: vi.fn(() => ({
      risk: 'safe',
      reasons: [],
      statements: [],
      requiresConfirmation: false,
      previewAvailable: false
    }))
  };
}

function textRange(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter }
  };
}

class StubPostgresDriver extends PostgresDriver {
  private readonly client: { processID: number; query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  private readonly pool: { connect: ReturnType<typeof vi.fn> };

  constructor(private readonly queryResults: unknown[]) {
    super();
    this.client = {
      processID: 123,
      query: vi.fn(async () => this.queryResults.shift()),
      release: vi.fn()
    };
    this.pool = {
      connect: vi.fn(async () => this.client)
    };
  }

  protected override requirePool(_connectionId: string) {
    return this.pool as never;
  }
}
