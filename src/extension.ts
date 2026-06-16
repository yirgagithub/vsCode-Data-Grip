import * as vscode from 'vscode';
import { ConnectionManager } from './database/connectionManager';
import { QueryExecutor } from './database/queryExecutor';
import { splitSqlStatements } from './database/sqlSplitter';
import { DatabaseTreeProvider } from './explorer/DatabaseTreeProvider';
import { CatalogNode, ColumnNode, ConnectionNode, FolderNode, RoutineNode, SchemaNode, SchemasNode, TableNode, TriggerNode, ViewNode } from './explorer/nodes';
import { ConnectionStore } from './persistence/connectionStore';
import { QueryConsoleStore } from './persistence/queryConsoleStore';
import { SqlDocumentConnectionStore } from './persistence/sqlDocumentConnectionStore';
import { QueryHistoryStore } from './persistence/queryHistoryStore';
import { QueryMemoryStore } from './persistence/queryMemoryStore';
import { ResultSessionStore } from './persistence/resultSessionStore';
import { orphanedConnectionRecordIds } from './persistence/orphanedConnectionRecords';
import { DataProfileService } from './services/dataProfileService';
import { QueryMemoryService } from './services/queryMemoryService';
import { executionOriginForDocument, isQueryConsoleHistoryItem, queryConsoleDocumentUris } from './services/queryConsoleHistory';
import { SchemaContextService } from './services/schemaContextService';
import { SchemaMetadataCacheStore } from './services/schemaMetadataCacheStore';
import { relationCompletionCandidates, relationCompletionContext, unqualifiedColumnCompletionContext } from './services/sqlMetadataCompletion';
import { connectAndRefreshSqlMetadata } from './services/sqlMetadataWarmup';
import { SqlDiagnosticsService } from './services/sqlDiagnosticsService';
import { SqlParameterPrompt } from './services/sqlParameterPrompt';
import { rangeFromPlain as rangeFromSource, SqlSectionHighlighter } from './services/sqlSectionHighlighter';
import { SqlSectionService } from './services/sqlSectionService';
import { shouldRunSelectionForStatement } from './services/sqlSelectionExecution';
import { buildTablePerformancePrepassFlags, TablePerformanceAdvisorService } from './services/tablePerformanceAdvisorService';
import { VsCodeLanguageModelSqlAdapter } from './ai/vsCodeLanguageModelSqlAdapter';
import { QueryMemoryController } from './controllers/queryMemoryController';
import { DocumentConnectionBinding, DocumentConnectionResolution, resolveDocumentConnection } from './services/documentConnectionResolver';
import { QueryOutputService } from './services/queryOutputService';
import { ErDiagramService } from './services/erDiagramService';
import { QueryPlanAnalyzerService } from './services/queryPlanAnalyzerService';
import { compareResultSets, formatResultSetDiffMarkdown } from './services/resultSetDiffService';
import { compareSchemas, formatSchemaDiffMarkdown } from './services/schemaDiffService';
import { querySnippets } from './services/querySnippetService';
import { formatSqlText, sqlFormatterDialect } from './services/sqlFormattingService';
import { buildTableCopyPreview } from './services/tableCopyService';
import { buildTableImportPreview } from './services/tableImportService';
import { SessionMonitorPanel } from './webviews/session/SessionMonitorPanel';
import { ErDiagramPanel } from './webviews/erDiagram/ErDiagramPanel';
import { ConnectionEditorPanel } from './webviews/connection/ConnectionEditorPanel';
import { QueryMapProvider } from './webviews/queryMap/QueryMapProvider';
import { ResultsPanelProvider } from './webviews/results/ResultsPanelProvider';
import { TableDataPanel } from './webviews/table/TableDataPanel';
import { Logger } from './utils/logger';
import { qualifiedName, quoteIdentifier } from './utils/identifiers';
import { createId } from './utils/id';
import { ConnectionConfig, QueryConsoleRecord, QueryExecutionProgress, QueryPlanResult, QueryResultTab, SchemaCacheEntry, TableStatsInfo, TableWorkloadSummary } from './types';

const PROJECT_SQL_SESSION_PREFIX = 'project-sql:';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  const connectionStore = new ConnectionStore(context);
  const connectionManager = new ConnectionManager(connectionStore);
  const historyStore = new QueryHistoryStore(context);
  const consoleStore = new QueryConsoleStore(context);
  const sqlDocumentConnections = new SqlDocumentConnectionStore(context);
  const resultStore = new ResultSessionStore(context);
  const schemaContext = new SchemaContextService(connectionManager, new SchemaMetadataCacheStore(context));
  const sectionService = new SqlSectionService();
  const highlighter = new SqlSectionHighlighter();
  const sqlDiagnostics = vscode.languages.createDiagnosticCollection('database-sql');
  const diagnosticsService = new SqlDiagnosticsService(connectionManager, schemaContext, sectionService);
  const parameterPrompt = new SqlParameterPrompt();
  const aiAdapter = new VsCodeLanguageModelSqlAdapter();
  const refreshAiAvailability = () => {
    void aiAdapter.isAvailable().then((available) => {
      void vscode.commands.executeCommand('setContext', 'database.aiAvailable', available);
    });
  };
  void vscode.commands.executeCommand('setContext', 'database.aiAvailable', false);
  refreshAiAvailability();
  const memoryStore = new QueryMemoryStore(context);
  const memoryService = new QueryMemoryService(historyStore, memoryStore, consoleStore, connectionManager, aiAdapter);
  const tablePerformanceAdvisor = new TablePerformanceAdvisorService(connectionManager, memoryService, aiAdapter);
  const erDiagramService = new ErDiagramService(connectionManager, schemaContext);
  const queryPlanAnalyzer = new QueryPlanAnalyzerService(connectionManager, aiAdapter);
  const dataProfiler = new DataProfileService(connectionManager, aiAdapter);
  const executor = new QueryExecutor(connectionManager, historyStore, memoryService);
  const queryOutput = new QueryOutputService();
  const diagnosticTimers = new Map<string, NodeJS.Timeout>();
  const diagnosticVersions = new Map<string, number>();
  const consoleAutoSaves = new Map<string, Promise<void>>();
  const consoleAutoSaveQueued = new Set<string>();
  const runningDocuments = new Map<string, number>();
  interface RunningQueryExecution {
    tabId: string;
    connectionId: string;
    documentUri: string;
    title: string;
    startedAt: number;
    executionIds: Set<string>;
    cancelRequested: boolean;
  }
  const runningQueries = new Map<string, RunningQueryExecution>();
  void vscode.commands.executeCommand('setContext', 'database.queryRunning', false);
  const statementRunningDecoration = vscode.window.createTextEditorDecorationType({
    before: {
      contentIconPath: vscode.Uri.joinPath(context.extensionUri, 'media', 'sql-running.svg'),
      width: '12px',
      height: '12px',
      margin: '0 6px 0 0'
    }
  });
  const statementCompletedDecoration = vscode.window.createTextEditorDecorationType({
    before: { contentText: '✓ ', color: new vscode.ThemeColor('testing.iconPassed') }
  });
  const statementFailedDecoration = vscode.window.createTextEditorDecorationType({
    before: { contentText: '✗ ', color: new vscode.ThemeColor('testing.iconFailed') }
  });
  let pruningMissingConsoles = false;
  let pruningUnknownConnections = false;
  let queryMap: QueryMapProvider;
  const results = new ResultsPanelProvider(
    context,
    connectionManager,
    resultStore,
    executor,
    async (tab) => revealSourceForTab(tab),
    (tabs) => queryMap?.updateResults(tabs),
    async (maxRows) => executeActiveMultiStatementSelection(maxRows),
    async (tabId) => cancelRunningQuery(tabId),
    async (tab, resultSetIndex) => compareResultTabs(tab, resultSetIndex)
  );
  queryMap = new QueryMapProvider(
    context.extensionUri,
    sectionService,
    async (documentUri, section) => {
      await highlighter.reveal(documentUri, rangeToPlain(section.range), section.sql);
    },
    async (documentUri, section) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'sql' || editor.document.uri.toString() !== documentUri) {
        return;
      }
      await executeDetected(editor, section);
    },
    () => queryConsoleHistoryItems(),
    async (item) => openHistoryItem(item),
    async (id, pinned) => {
      if (documentUriFromProjectSqlSessionId(id)) {
        return;
      }
      await consoleStore.setPinned(id, pinned);
      refreshQueryMap();
    },
    async (id) => {
      await untrackActiveSession(id);
      refreshQueryMap();
    },
    async (id, direction) => {
      if (documentUriFromProjectSqlSessionId(id)) {
        return;
      }
      await consoleStore.move(id, direction);
      refreshQueryMap();
    },
    async (documentUri) => {
      if (queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
        await consoleStore.touchDocument(documentUri, { opened: true });
      } else {
        await sqlDocumentConnections.touch(documentUri);
      }
      await results.show(connectionIdForDocumentUri(documentUri));
      refreshQueryMap();
    },
    async (item) => {
      await historyStore.update(item);
      refreshQueryMap();
    },
    async (id) => {
      await historyStore.delete(id);
      refreshQueryMap();
    },
    async (ids) => {
      await clearActiveSessionsById(ids);
      refreshQueryMap();
    },
    async (ids) => {
      const idSet = new Set(ids);
      const memoryIds = memoryStore.getAll()
        .filter((item) => item.historyIds?.some((id) => idSet.has(id)) || (item.latestHistoryId !== undefined && idSet.has(item.latestHistoryId)))
        .map((item) => item.id);
      await historyStore.deleteMany(ids);
      await memoryStore.deleteMany(memoryIds);
      refreshQueryMap();
    },
    () => refreshQueryMap()
  );
  const tree = new DatabaseTreeProvider(connectionManager);
  context.subscriptions.push(connectionManager.onDidChangeActiveConnections(() => {
    refreshQueryMap();
    tree.refresh();
    updateSqlConnectionStatus(vscode.window.activeTextEditor);
    const activeDocument = vscode.window.activeTextEditor?.document;
    const connection = activeDocument?.languageId === 'sql' ? connectionForDocument(activeDocument) : undefined;
    if (connection && connectionManager.isConnected(connection.id)) {
      schemaContext.refreshDefaultSchemaInBackground(connection);
    }
  }));

  const treeView = vscode.window.createTreeView('databaseExplorer', { treeDataProvider: tree, showCollapseAll: true });
  context.subscriptions.push(
    treeView,
    highlighter,
    queryOutput,
    sqlDiagnostics,
    vscode.window.registerWebviewViewProvider(ResultsPanelProvider.viewType, results),
    vscode.window.registerWebviewViewProvider(QueryMapProvider.viewType, queryMap)
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  status.command = 'database.pickConnection';
  status.text = '$(database) Database';
  status.show();
  context.subscriptions.push(status, statementRunningDecoration, statementCompletedDecoration, statementFailedDecoration);
  const sqlCodeLensRefresh = new vscode.EventEmitter<void>();
  context.subscriptions.push(sqlCodeLensRefresh);
  context.subscriptions.push(registerSqlCompletions(connectionManager, schemaContext, sectionService, connectionForDocument, context));
  context.subscriptions.push(registerSqlConnectionCodeLens(sqlConnectionLensTitle, sectionService, sqlCodeLensRefresh.event));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    queryMap.updateFromEditor(editor);
    syncResultsToEditor(editor);
    updateSqlConnectionStatus(editor);
    highlightActiveSqlSection(editor);
    highlighter.refreshVisibleEditors();
    updateSqlDiagnostics(editor?.document, editor?.selection);
  }));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
    highlightActiveSqlSection(event.textEditor);
    updateSqlDiagnostics(event.textEditor.document, event.selections[0]);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    autoSaveQueryConsoleDocument(event.document);
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.toString() === event.document.uri.toString()) {
      queryMap.updateFromEditor(editor);
      highlightActiveSqlSection(editor);
    }
    updateSqlDiagnostics(event.document, editor?.selection);
  }));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
    const documentUri = document.uri.toString();
    consoleAutoSaves.delete(documentUri);
    consoleAutoSaveQueued.delete(documentUri);
    sqlDiagnostics.delete(document.uri);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('database.ai')) {
      refreshAiAvailability();
    }
  }));
  const sqlFormatter: vscode.DocumentFormattingEditProvider & vscode.DocumentRangeFormattingEditProvider = {
    async provideDocumentFormattingEdits(document: vscode.TextDocument) {
      return formatSqlDocument(document);
    },
    async provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range) {
      return formatSqlDocument(document, range);
    }
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('sql', sqlFormatter),
    vscode.languages.registerDocumentRangeFormattingEditProvider('sql', sqlFormatter)
  );
  refreshQueryMap();
  void schemaContext.warmFromDisk(connectionManager.getConnections());
  queryMap.updateFromEditor(vscode.window.activeTextEditor);
  queryMap.updateResults(results.getTabs());
  highlightActiveSqlSection(vscode.window.activeTextEditor);
  updateSqlConnectionStatus(vscode.window.activeTextEditor);
  for (const document of vscode.workspace.textDocuments) {
    updateSqlDiagnostics(document);
  }

  const register = (command: string, callback: (...args: unknown[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, async (...args) => {
      try {
        return await callback(...args);
      } catch (error) {
        logger.error(command, error);
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return undefined;
      }
    }));
  };

  function refreshQueryMap(): void {
    const connections = connectionManager.getConnections();
    const knownConnectionIds = new Set(connections.map((connection) => connection.id));
    queryMap.updateConsoles(
      activeSessionRecords(knownConnectionIds),
      connections,
      connectionManager.getActiveConnections().map((connection) => connection.config.id)
    );
    void pruneMissingConsoleRecords();
    void pruneUnknownConnectionRecords();
  }

  interface DatabaseObjectPick extends vscode.QuickPickItem {
    objectKind: 'table' | 'view' | 'column';
    node: TableNode | ViewNode | ColumnNode;
  }

  async function collectDatabaseObjects(): Promise<DatabaseObjectPick[]> {
    const picks: DatabaseObjectPick[] = [];
    for (const connection of connectionManager.getConnections()) {
      let entries = schemaContext.getAnyCached(connection.id);
      if (!entries.length && connectionManager.isConnected(connection.id)) {
        entries = [await schemaContext.loadDefaultSchema(connection)];
      }
      for (const entry of entries) {
        const schemaLabel = `${connection.name} • ${entry.schemaName}`;
        for (const table of entry.tables) {
          const node = new TableNode(connection, table);
          picks.push({
            objectKind: 'table',
            node,
            label: table.name,
            description: `table • ${schemaLabel}`,
            detail: `${table.schema}.${table.name}`
          });
        }
        for (const view of entry.views) {
          const node = new ViewNode(connection, view);
          picks.push({
            objectKind: 'view',
            node,
            label: view.name,
            description: `view • ${schemaLabel}`,
            detail: `${view.schema}.${view.name}`
          });
        }
        for (const [tableKey, columns] of Object.entries(entry.columns)) {
          const [schemaName, tableName] = tableKey.split('.');
          for (const column of columns) {
            const node = new ColumnNode(connection, column);
            picks.push({
              objectKind: 'column',
              node,
              label: `${tableName}.${column.name}`,
              description: `column • ${schemaLabel}`,
              detail: `${schemaName}.${tableName}.${column.name}`
            });
          }
        }
      }
    }
    return picks.sort((left, right) => {
      const leftKey = `${left.description ?? ''} ${left.detail ?? ''} ${left.label}`;
      const rightKey = `${right.description ?? ''} ${right.detail ?? ''} ${right.label}`;
      return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function autoSaveQueryConsoleDocument(document: vscode.TextDocument): void {
    const documentUri = document.uri.toString();
    if (!document.isDirty || !queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
      return;
    }
    if (consoleAutoSaves.has(documentUri)) {
      consoleAutoSaveQueued.add(documentUri);
      return;
    }
    const save = async () => {
      try {
        do {
          consoleAutoSaveQueued.delete(documentUri);
          if (document.isDirty) {
            try {
              await document.save();
            } catch (error) {
              logger.error('queryConsoleAutoSave', error);
              return;
            }
          }
        } while (consoleAutoSaveQueued.has(documentUri));
      } finally {
        consoleAutoSaves.delete(documentUri);
        consoleAutoSaveQueued.delete(documentUri);
      }
    };
    const promise = save();
    consoleAutoSaves.set(documentUri, promise);
  }

  function activeSessionRecords(knownConnectionIds = currentConnectionIds()): QueryConsoleRecord[] {
    const consoles = consoleStore.getAll();
    const knownConsoles = consoles.filter((record) => knownConnectionIds.has(record.connectionId));
    const consoleUris = new Set(knownConsoles.map((record) => record.documentUri));
    const projectSessions = sqlDocumentConnections.getAll()
      .filter((record) => knownConnectionIds.has(record.connectionId) && !!record.lastTouchedAt && !consoleUris.has(record.documentUri))
      .map((record) => ({
        id: projectSqlSessionId(record.documentUri),
        connectionId: record.connectionId,
        documentUri: record.documentUri,
        lastExecutedRange: record.lastExecutedRange,
        lastTouchedAt: record.lastTouchedAt,
        createdAt: record.updatedAt,
        updatedAt: record.updatedAt
      }));
    return [
      ...knownConsoles,
      ...projectSessions
    ];
  }

  function projectSqlSessionId(documentUri: string): string {
    return `${PROJECT_SQL_SESSION_PREFIX}${encodeURIComponent(documentUri)}`;
  }

  function documentUriFromProjectSqlSessionId(id: string): string | undefined {
    if (!id.startsWith(PROJECT_SQL_SESSION_PREFIX)) {
      return undefined;
    }
    try {
      return decodeURIComponent(id.slice(PROJECT_SQL_SESSION_PREFIX.length));
    } catch {
      return undefined;
    }
  }

  async function untrackActiveSession(id: string): Promise<void> {
    const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
    if (projectDocumentUri) {
      await sqlDocumentConnections.delete(projectDocumentUri);
      return;
    }
    await consoleStore.delete(id);
  }

  async function clearActiveSessionsById(ids: string[]): Promise<void> {
    const consoleIds: string[] = [];
    const projectDocumentUris: string[] = [];
    for (const id of ids) {
      const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
      if (projectDocumentUri) {
        projectDocumentUris.push(projectDocumentUri);
      } else {
        consoleIds.push(id);
      }
    }
    await consoleStore.deleteMany(consoleIds);
    await Promise.all(projectDocumentUris.map((documentUri) => sqlDocumentConnections.delete(documentUri)));
  }

  function beginDocumentExecution(documentUri: string): () => void {
    runningDocuments.set(documentUri, (runningDocuments.get(documentUri) ?? 0) + 1);
    queryMap.updateRunningDocuments([...runningDocuments.keys()]);
    return () => {
      const count = (runningDocuments.get(documentUri) ?? 1) - 1;
      if (count > 0) {
        runningDocuments.set(documentUri, count);
      } else {
        runningDocuments.delete(documentUri);
      }
      queryMap.updateRunningDocuments([...runningDocuments.keys()]);
    };
  }

  function beginRunningQuery(tab: QueryResultTab, documentUri: string): RunningQueryExecution {
    const running: RunningQueryExecution = {
      tabId: tab.id,
      connectionId: tab.connectionId,
      documentUri,
      title: tab.customTitle ?? tab.title,
      startedAt: tab.executionStartedAt,
      executionIds: new Set(),
      cancelRequested: false
    };
    runningQueries.set(tab.id, running);
    updateQueryRunningContext();
    return running;
  }

  function finishRunningQuery(tabId: string): void {
    runningQueries.delete(tabId);
    updateQueryRunningContext();
  }

  function updateQueryRunningContext(): void {
    void vscode.commands.executeCommand('setContext', 'database.queryRunning', runningQueries.size > 0);
  }

  function trackRunningProgress(running: RunningQueryExecution, progress: QueryExecutionProgress): void {
    if (!progress.executionId) {
      return;
    }
    if (progress.status === 'started') {
      running.executionIds.add(progress.executionId);
      if (running.cancelRequested) {
        void cancelExecution(running, progress.executionId).catch((error) => logger.error('database.cancelCurrentQuery', error));
      }
      return;
    }
    running.executionIds.delete(progress.executionId);
  }

  async function cancelExecution(running: RunningQueryExecution, executionId: string): Promise<void> {
    await executor.cancel(running.connectionId, executionId);
  }

  function runningQueryForCancellation(tabId?: string): RunningQueryExecution | undefined {
    if (tabId) {
      return runningQueries.get(tabId);
    }
    const activeTab = results.getActiveTab();
    if (activeTab) {
      const runningTab = runningQueries.get(activeTab.id);
      if (runningTab) {
        return runningTab;
      }
    }
    const activeDocumentUri = vscode.window.activeTextEditor?.document.uri.toString();
    if (activeDocumentUri) {
      const runningForDocument = [...runningQueries.values()]
        .filter((running) => running.documentUri === activeDocumentUri)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      if (runningForDocument) {
        return runningForDocument;
      }
    }
    return [...runningQueries.values()].sort((a, b) => b.startedAt - a.startedAt)[0];
  }

  async function cancelRunningQuery(tabId?: string): Promise<void> {
    const running = runningQueryForCancellation(tabId);
    if (!running) {
      void vscode.window.showInformationMessage('No query is currently running.');
      return;
    }
    running.cancelRequested = true;
    if (!running.executionIds.size) {
      void vscode.window.showInformationMessage(`Cancel requested for ${running.title}.`);
      return;
    }
    const executionIds = [...running.executionIds];
    const settled = await Promise.allSettled(executionIds.map((executionId) => cancelExecution(running, executionId)));
    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length === settled.length) {
      throw new Error(`Could not cancel ${running.title}: ${failures[0]?.reason instanceof Error ? failures[0].reason.message : String(failures[0]?.reason)}`);
    }
    if (failures.length) {
      logger.error('database.cancelCurrentQuery', failures.map((failure) => failure.reason).join('\n'));
    }
    void vscode.window.showInformationMessage(`Cancel requested for ${running.title}.`);
  }

  function createStatementStatusUpdater(editor: vscode.TextEditor, range: vscode.Range, sql: string): (progress: QueryExecutionProgress) => void {
    const statements = splitSqlStatements(sql);
    const sqlParts = statements.length ? statements : [{ sql, start: 0, end: sql.length }];
    const baseOffset = editor.document.offsetAt(range.start);
    const statuses = sqlParts.map((statement) => ({
      range: new vscode.Range(
        editor.document.positionAt(baseOffset + statement.start),
        editor.document.positionAt(baseOffset + statement.start)
      ),
      status: undefined as 'running' | 'completed' | 'failed' | undefined
    }));
    const apply = () => {
      editor.setDecorations(statementRunningDecoration, statuses.filter((item) => item.status === 'running').map((item) => item.range));
      editor.setDecorations(statementCompletedDecoration, statuses.filter((item) => item.status === 'completed').map((item) => item.range));
      editor.setDecorations(statementFailedDecoration, statuses.filter((item) => item.status === 'failed').map((item) => item.range));
    };
    apply();
    return (progress: QueryExecutionProgress) => {
      const item = statuses[progress.statementIndex];
      if (!item) {
        return;
      }
      item.status = progress.status === 'started'
        ? 'running'
        : progress.status === 'completed'
          ? 'completed'
          : 'failed';
      apply();
    };
  }

  function queryConsoleHistoryItems(knownConnectionIds = currentConnectionIds()): import('./types').QueryHistoryItem[] {
    const consoleUris = queryConsoleDocumentUris(consoleStore.getAll().filter((record) => knownConnectionIds.has(record.connectionId)));
    return historyStore.getAll().filter((item) => knownConnectionIds.has(item.connectionId) && isQueryConsoleHistoryItem(item, consoleUris));
  }

  async function markActiveSessionExecuted(
    documentUri: string,
    connectionId: string,
    range: QueryConsoleRecord['lastExecutedRange']
  ): Promise<void> {
    if (queryConsoleDocumentUris(consoleStore.getAll()).has(documentUri)) {
      await consoleStore.markExecuted(documentUri, range);
      return;
    }
    await sqlDocumentConnections.markExecuted(documentUri, connectionId, range);
  }

  async function pruneMissingConsoleRecords(): Promise<void> {
    if (pruningMissingConsoles) {
      return;
    }
    pruningMissingConsoles = true;
    try {
      const removed = await consoleStore.pruneMissingDocuments();
      if (removed > 0) {
        queryMap.updateConsoles(
          activeSessionRecords(),
          connectionManager.getConnections(),
          connectionManager.getActiveConnections().map((connection) => connection.config.id)
        );
      }
    } finally {
      pruningMissingConsoles = false;
    }
  }

  function currentConnectionIds(): Set<string> {
    return new Set(connectionManager.getConnections().map((connection) => connection.id));
  }

  async function pruneUnknownConnectionRecords(): Promise<void> {
    if (pruningUnknownConnections) {
      return;
    }
    pruningUnknownConnections = true;
    try {
      const knownConnectionIds = currentConnectionIds();
      const orphaned = orphanedConnectionRecordIds({
        consoles: consoleStore.getAll(),
        sqlDocuments: sqlDocumentConnections.getAll(),
        history: historyStore.getAll(),
        memory: memoryStore.getAll()
      }, knownConnectionIds);
      const removedCount = orphaned.consoleIds.length + orphaned.sqlDocumentUris.length + orphaned.historyIds.length + orphaned.memoryIds.length;
      if (!removedCount) {
        return;
      }
      await Promise.all([
        consoleStore.deleteMany(orphaned.consoleIds),
        sqlDocumentConnections.deleteMany(orphaned.sqlDocumentUris),
        historyStore.deleteMany(orphaned.historyIds),
        memoryStore.deleteMany(orphaned.memoryIds)
      ]);
      queryMap.updateConsoles(
        activeSessionRecords(currentConnectionIds()),
        connectionManager.getConnections(),
        connectionManager.getActiveConnections().map((connection) => connection.config.id)
      );
    } finally {
      pruningUnknownConnections = false;
    }
  }

  function documentConnectionBindings(): DocumentConnectionBinding[] {
    return [...consoleStore.getAll(), ...sqlDocumentConnections.getAll()];
  }

  function resolveConnectionForDocument(document: vscode.TextDocument): DocumentConnectionResolution {
    return resolveDocumentConnection(
      document.uri.toString(),
      documentConnectionBindings(),
      connectionManager.getConnections()
    );
  }

  function connectionForDocument(document: vscode.TextDocument): ConnectionConfig | undefined {
    return resolveConnectionForDocument(document).connection;
  }

  async function formatSqlDocument(document: vscode.TextDocument, range?: vscode.Range): Promise<vscode.TextEdit[]> {
    if (document.lineCount === 0) {
      return [];
    }
    const targetRange = range ?? new vscode.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).range.end.character);
    const source = document.getText(targetRange);
    const formatted = await formatSqlText(source, sqlFormatterDialect(connectionForDocument(document)));
    if (formatted === source) {
      return [];
    }
    return [vscode.TextEdit.replace(targetRange, formatted)];
  }

  function connectionFromArg(node: unknown): ConnectionConfig | undefined {
    const id = connectionIdFromArg(node);
    return id ? connectionManager.getConnection(id) : undefined;
  }

  function connectionIdForDocumentUri(documentUri: string): string | undefined {
    return resolveDocumentConnection(
      documentUri,
      documentConnectionBindings(),
      connectionManager.getConnections()
    ).connection?.id;
  }

  function activeConnectionId(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    return editor?.document.languageId === 'sql' ? connectionForDocument(editor.document)?.id : undefined;
  }

  function syncResultsToEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'sql') {
      return;
    }
    const documentUri = editor.document.uri.toString();
    const isTrackedConsole = consoleStore.getAll().some((record) => record.documentUri === documentUri);
    const hasResults = results.getTabs().some((tab) => tab.sourceDocumentUri === documentUri);
    const connection = connectionForDocument(editor.document);
    if ((isTrackedConsole || hasResults) && connection) {
      results.setActiveConnection(connection.id);
    }
  }

  function updateSqlConnectionStatus(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'sql') {
      status.command = 'database.pickConnection';
      status.text = '$(database) Database';
      return;
    }
    const resolved = resolveConnectionForDocument(editor.document);
    status.command = 'database.setSqlFileConnection';
    if (resolved.connection) {
      status.text = `$(database) ${resolved.connection.name}`;
    } else if (resolved.isBound) {
      status.text = '$(warning) Missing database';
    } else {
      status.text = '$(database) Select Database';
    }
  }

  function sqlConnectionLensTitle(document: vscode.TextDocument): string {
    const resolved = resolveConnectionForDocument(document);
    if (resolved.connection) {
      return `$(database) Database: ${resolved.connection.name}`;
    }
    if (resolved.isBound) {
      return '$(warning) Database: Missing connection';
    }
    return '$(database) Select Database Connection';
  }

  function recordQueryOutput(tab: import('./types').QueryResultTab): void {
    const connection = connectionManager.getConnection(tab.connectionId);
    if (connection) {
      queryOutput.record(connection, tab);
    }
  }

  new QueryMemoryController(context, memoryService, connectionManager, executor, aiAdapter, async (tab) => {
    await results.addTab(tab);
    recordQueryOutput(tab);
    queryMap.updateResults(results.getTabs());
  }).register(register);

  register('database.addConnection', async () => {
    const config = await ConnectionEditorPanel.open(context, connectionManager);
    if (!config) {
      return;
    }
    await connectionManager.save(config);
    refreshQueryMap();
    tree.refresh();
  });

  register('database.editConnection', async (node?: unknown) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const existing = connectionManager.getConnection(id);
    const next = existing ? await ConnectionEditorPanel.open(context, connectionManager, existing) : undefined;
    if (next) {
      await connectionManager.save(next);
      schemaContext.invalidate(id);
      refreshQueryMap();
      tree.refresh();
    }
  });

  register('database.deleteConnection', async (node?: unknown) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const answer = await vscode.window.showWarningMessage('Delete this connection?', { modal: true }, 'Delete');
    if (answer === 'Delete') {
      await connectionManager.delete(id);
      await schemaContext.deletePersistent(id);
      refreshQueryMap();
      tree.refresh();
    }
  });

  register('database.testConnection', async (node?: unknown) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const message = await connectionManager.test(id);
    void vscode.window.showInformationMessage(`Connection successful: ${message}`);
  });

  register('database.connect', async (node?: unknown) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    const connection = await connectionManager.connect(id);
    status.text = `$(database) ${connection.config.name}`;
    schemaContext.refreshDefaultSchemaInBackground(connection.config);
    refreshQueryMap();
    tree.refresh();
  });

  register('database.disconnect', async (node?: unknown) => {
    const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
    if (!id) {
      return;
    }
    await connectionManager.disconnect(id);
    schemaContext.invalidate(id);
    status.text = '$(database) Database';
    refreshQueryMap();
    tree.refresh();
  });

  register('database.refreshExplorer', (node?: unknown) => {
    const target = databaseNodeFromArg(node) ?? treeView.selection[0];
    const connectionId = connectionIdFromArg(target);
    if (connectionId) {
      schemaContext.invalidate(connectionId);
      const connection = connectionManager.getConnection(connectionId);
      if (connection && connectionManager.isConnected(connection.id)) {
        schemaContext.refreshSchemaInBackground(connection, target ? schemaFromNode(target).schema : connection.defaultSchema ?? 'public');
      }
      tree.refresh(target);
      return;
    }
    schemaContext.invalidate();
    for (const active of connectionManager.getActiveConnections()) {
      schemaContext.refreshDefaultSchemaInBackground(active.config);
    }
    tree.refresh();
  });
  register('database.showResults', () => results.show(activeConnectionId()));
  register('database.focusResults', () => results.show(activeConnectionId()));
  register('database.focusExplorer', () => vscode.commands.executeCommand('databaseExplorer.focus'));
  register('database.goToDatabaseObject', async () => {
    const objects = await collectDatabaseObjects();
    if (!objects.length) {
      void vscode.window.showInformationMessage('No cached database objects found yet.');
      return;
    }
    const picked = await vscode.window.showQuickPick(objects, {
      placeHolder: 'Go to database object',
      matchOnDetail: true,
      matchOnDescription: true
    });
    if (!picked) {
      return;
    }
    await treeView.reveal(picked.node, { expand: true, focus: true, select: true });
    if (picked.objectKind === 'table') {
      await vscode.commands.executeCommand('database.openTableData', picked.node);
    }
  });
  register('database.sessionMonitor', async (node?: unknown) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode.window.showInformationMessage('Pick a database connection first.');
      return;
    }
    await SessionMonitorPanel.open(context, connectionManager, connection);
  });
  register('database.showSqlMetadataStatus', () => showSqlMetadataStatus());
  register('database.setSqlFileConnection', (resource?: unknown) => setSqlFileConnection(resource));
  register('database.pickConnection', async () => {
    const connection = await connectionManager.pickConnection();
    if (connection) {
      await connectionManager.setSelectedConnection(connection.id);
      status.text = `$(database) ${connection.name}`;
    }
  });

  register('database.openSqlConsole', async (node?: unknown) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection() ?? await connectionManager.pickConnection();
    const doc = await consoleStore.openOrCreate(connection, '', { reuse: false });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
    results.setActiveConnection(connection?.id);
    if (connection) {
      void warmSqlMetadata(connection, 'Query console');
    }
    refreshQueryMap();
    queryMap.updateFromEditor(vscode.window.activeTextEditor);
  });

  register('database.openQueryFile', async (node?: unknown) => {
    const connection = connectionFromArg(node) ?? connectionManager.getPreferredConnection();
    const doc = await consoleStore.openOrCreate(connection, '', { reuse: false });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
    results.setActiveConnection(connection?.id);
    if (connection) {
      void warmSqlMetadata(connection, 'Query file');
    }
    refreshQueryMap();
    queryMap.updateFromEditor(vscode.window.activeTextEditor);
  });

  register('database.executeCurrentQuery', () => executeFromEditor('run'));
  register('database.executeSelection', () => executeFromEditor('selection'));
  register('database.executeFile', () => executeFromEditor('run'));
  register('database.cancelCurrentQuery', () => cancelRunningQuery());
  register('database.executeStatementRange', async (uriText?: unknown, startLine?: unknown, startCharacter?: unknown, endLine?: unknown, endCharacter?: unknown) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || typeof uriText !== 'string' || editor.document.uri.toString() !== uriText) {
      return;
    }
    if (![startLine, startCharacter, endLine, endCharacter].every((value) => typeof value === 'number')) {
      return;
    }
    const range = new vscode.Range(
      new vscode.Position(startLine as number, startCharacter as number),
      new vscode.Position(endLine as number, endCharacter as number)
    );
    const selections = selectedSqlDetections(editor);
    if (shouldRunSelectionForStatement(selections, range)) {
      await executeFromEditor('selection');
      return;
    }
    const section = sectionService.getSections(editor.document).find((item) => item.range.isEqual(range));
    await executeDetected(editor, {
      sql: editor.document.getText(range),
      range,
      index: section?.index,
      id: section?.id
    });
  });
  register('database.openTableData', async (node?: unknown) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    await TableDataPanel.open(context, connectionManager, node);
  });

  register('database.analyzeTablePerformance', async (node?: unknown) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const report = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Analyzing ${qualifiedName(node.table.schema, node.table.name)}`,
      cancellable: false
    }, () => tablePerformanceAdvisor.analyzeTable(node.connection, node.table.schema, node.table.name));
    await TableDataPanel.openPerformanceAdvisor(context, node, report, (title, sql) => openSqlScript(title, sql, node.connection));
  });

  register('database.profileTableData', async (node?: unknown) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const configuredSampleRows = vscode.workspace.getConfiguration('database').get<number>('dataProfile.sampleRows', 5000);
    const sampleRows = Number.isFinite(configuredSampleRows) && configuredSampleRows && configuredSampleRows > 0
      ? Math.floor(configuredSampleRows)
      : 5000;
    const report = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Profiling ${qualifiedName(node.table.schema, node.table.name)}`,
      cancellable: false
    }, () => dataProfiler.profileTable(node.connection, node.table.schema, node.table.name, sampleRows));
    await TableDataPanel.openDataProfile(context, node, report);
  });

  register('database.generateTableMaintenanceSql', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    if (!connectionManager.isConnected(target.connection.id)) {
      await connectionManager.connect(target.connection.id);
    }
    const stats = await connectionManager.getDriver(target.connection.type).getTableStats(target.connection.id, target.schema, target.name);
    const sql = maintenanceScriptFromStats(stats);
    if (!sql) {
      void vscode.window.showInformationMessage(`No Redshift maintenance SQL was generated for ${qualifiedName(target.schema, target.name)}.`);
      return;
    }
    await openSqlScript(`Maintenance ${target.name}`, `${sql}\n`, target.connection);
  });

  register('database.compareSchemas', async (node?: unknown) => {
    const source = schemaLikeTarget(node);
    if (!source) {
      return;
    }
    const targetConnection = await pickDestinationConnection(connectionManager, source.connection.id);
    if (!targetConnection) {
      return;
    }
    if (!connectionManager.isConnected(source.connection.id)) {
      await connectionManager.connect(source.connection.id);
    }
    if (!connectionManager.isConnected(targetConnection.id)) {
      await connectionManager.connect(targetConnection.id);
    }
    const sourceSchema = await schemaContext.loadSchema(source.connection, source.schema);
    if (sourceSchema.status !== 'ready') {
      void vscode.window.showWarningMessage(`Could not load source schema ${source.schema}: ${sourceSchema.errorMessage ?? 'metadata unavailable'}`);
      return;
    }
    const targetSchemaName = await vscode.window.showInputBox({
      title: 'Target schema',
      prompt: 'Schema to compare against',
      value: source.schema,
      ignoreFocusOut: true
    });
    if (!targetSchemaName) {
      return;
    }
    const targetSchema = await schemaContext.loadSchema(targetConnection, targetSchemaName.trim());
    if (targetSchema.status !== 'ready') {
      void vscode.window.showWarningMessage(`Could not load target schema ${targetSchemaName.trim()}: ${targetSchema.errorMessage ?? 'metadata unavailable'}`);
      return;
    }
    const report = compareSchemas({
      sourceConnectionName: source.connection.name,
      targetConnectionName: targetConnection.name,
      sourceSchema: snapshotFromSchemaEntry(sourceSchema),
      targetSchema: snapshotFromSchemaEntry(targetSchema)
    });
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: formatSchemaDiffMarkdown(report)
    });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  });

  register('database.showErDiagram', async (node?: unknown) => {
    const target = schemaLikeTarget(node);
    if (!target) {
      return;
    }
    const report = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Building ER diagram for ${target.schema}`,
      cancellable: false
    }, () => erDiagramService.build({ connection: target.connection, schemaName: target.schema }));
    await ErDiagramPanel.open(context, report);
  });

  register('database.insertQuerySnippet', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sql') {
      void vscode.window.showInformationMessage('Open a SQL editor before inserting a query snippet.');
      return;
    }
    const picked = await vscode.window.showQuickPick(querySnippets().map((snippet) => ({
      label: snippet.label,
      description: snippet.description,
      snippet
    })), {
      placeHolder: 'Insert query snippet'
    });
    if (!picked) {
      return;
    }
    await editor.insertSnippet(new vscode.SnippetString(picked.snippet.snippet));
  });

  register('database.copyName', async (node?: unknown) => {
    const name = objectName(node);
    if (name) {
      await vscode.env.clipboard.writeText(name);
    }
  });

  register('database.copyQualifiedName', async (node?: unknown) => {
    const name = qualifiedObjectName(node);
    if (name) {
      await vscode.env.clipboard.writeText(name);
    }
  });

  register('database.importTableData', async (node?: unknown) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import data',
      filters: {
        'Data files': ['csv', 'json']
      }
    });
    const file = files?.[0];
    if (!file) {
      return;
    }
    const fileBytes = await vscode.workspace.fs.readFile(file);
    const fileText = Buffer.from(fileBytes).toString('utf8');
    const columns = await schemaContext.getColumns(node.connection, node.table.schema, node.table.name);
    const preview = buildTableImportPreview(node.table.schema, node.table.name, columns, file.path, fileText);
    const summary = [
      `-- Import source: ${file.fsPath}`,
      `-- Source columns: ${preview.columns.join(', ')}`,
      `-- Row count: ${preview.rowCount}`,
      ...preview.mapping.map((item) => `-- ${item.source} -> ${item.target}`),
      ...preview.warnings.map((warning) => `-- ${warning}`),
      ''
    ].join('\n');
    await openSqlScript(`Import ${node.table.name}`, `${summary}${preview.sql}\n`, node.connection);
  });

  register('database.copyTableToConnection', async (node?: unknown) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    const sourceConnection = node.connection;
    const destination = await pickDestinationConnection(connectionManager, sourceConnection.id);
    if (!destination) {
      return;
    }
    const targetSchema = await vscode.window.showInputBox({
      title: 'Target schema',
      prompt: 'Schema to create the copied table in',
      value: destination.defaultSchema ?? sourceConnection.defaultSchema ?? node.table.schema,
      ignoreFocusOut: true
    });
    if (!targetSchema) {
      return;
    }
    const targetTable = await vscode.window.showInputBox({
      title: 'Target table',
      prompt: 'Name of the copied table',
      value: `${node.table.name}_copy`,
      ignoreFocusOut: true
    });
    if (!targetTable) {
      return;
    }
    if (!connectionManager.isConnected(sourceConnection.id)) {
      await connectionManager.connect(sourceConnection.id);
    }
    const [columns, sourceRows, sourceDdl] = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Copying ${qualifiedName(node.table.schema, node.table.name)}`,
      cancellable: false
    }, async () => Promise.all([
      schemaContext.getColumns(sourceConnection, node.table.schema, node.table.name),
      connectionManager.getDriver(sourceConnection.type).executeQuery({
        connectionId: sourceConnection.id,
        sql: `select * from ${qualifiedName(node.table.schema, node.table.name)}`
      }),
      connectionManager.getDriver(sourceConnection.type).getTableDDL(sourceConnection.id, node.table.schema, node.table.name)
    ]));
    const preview = buildTableCopyPreview(
      node.table.schema,
      node.table.name,
      targetSchema.trim(),
      targetTable.trim(),
      columns,
      sourceRows.rows,
      sourceConnection.name,
      destination.name
    );
    const header = [
      `-- Source connection: ${sourceConnection.name}`,
      `-- Destination connection: ${destination.name}`,
      `-- Source table: ${qualifiedName(node.table.schema, node.table.name)}`,
      `-- Source DDL:`,
      ...sourceDdl.trim().split('\n').map((line) => `-- ${line}`),
      ''
    ].join('\n');
    await openSqlScript(`Copy ${node.table.name} to ${destination.name}`, `${header}${preview.sql}\n`, destination);
  });

  async function openSqlScript(title: string, content: string, connection?: ConnectionConfig): Promise<void> {
    const doc = await openSqlEditor(connectionManager, title, content, connection);
    if (!connection) {
      return;
    }
    await sqlDocumentConnections.set(doc.uri.toString(), connection.id);
    await connectionManager.setSelectedConnection(connection.id);
    results.setActiveConnection(connection.id);
    updateSqlConnectionStatus(vscode.window.activeTextEditor);
    refreshQueryMap();
    sqlCodeLensRefresh.fire();
  }

  register('database.showObjectDdl', async (node?: unknown) => {
    const sql = await objectDdl(connectionManager, node);
    if (sql) {
      await openSqlScript(`${objectName(node) ?? 'Object'} DDL`, `${sql}\n`, schemaFromNode(node).connection);
    }
  });

  register('database.generateSelect', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlScript(`SELECT ${target.name}`, `select *\nfrom ${qualifiedName(target.schema, target.name)}\nlimit 100;\n`, target.connection);
    }
  });

  register('database.generateInsert', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    const columns = await connectionManager.getDriver(target.connection.type).getColumns(target.connection.id, target.schema, target.name);
    const writable = columns.filter((column) => !column.defaultValue).map((column) => quoteIdentifier(column.name));
    const sql = writable.length
      ? `insert into ${qualifiedName(target.schema, target.name)} (${writable.join(', ')})\nvalues (${writable.map(() => 'null').join(', ')});\n`
      : `insert into ${qualifiedName(target.schema, target.name)}\ndefault values;\n`;
    await openSqlScript(`INSERT ${target.name}`, sql, target.connection);
  });

  register('database.generateUpdate', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    await openSqlScript(`UPDATE ${target.name}`, `update ${qualifiedName(target.schema, target.name)}\nset ${quoteIdentifier('column_name')} = null\nwhere ${quoteIdentifier('id')} = '<id>';\n`, target.connection);
  });

  register('database.generateDelete', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlScript(`DELETE ${target.name}`, `delete from ${qualifiedName(target.schema, target.name)}\nwhere ${quoteIdentifier('id')} = '<id>';\n`, target.connection);
    }
  });

  register('database.modifyTable', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlScript(`ALTER ${target.name}`, `alter table ${qualifiedName(target.schema, target.name)}\n  add column ${quoteIdentifier('new_column')} text;\n`, target.connection);
    }
  });

  register('database.renameObject', async (node?: unknown) => {
    const sql = renameTemplate(node);
    if (sql) {
      await openSqlScript(`Rename ${objectName(node)}`, sql, schemaFromNode(node).connection);
    }
  });

  register('database.dropObject', async (node?: unknown) => {
    const sql = dropTemplate(node);
    if (sql) {
      await openSqlScript(`Drop ${objectName(node)}`, sql, schemaFromNode(node).connection);
    }
  });

  register('database.newObject', async (node?: unknown) => {
    const picked = await vscode.window.showQuickPick([
      { label: 'Query Console', command: 'database.openSqlConsole' },
      { label: 'Query File', command: 'database.openQueryFile' },
      { label: 'CREATE TABLE script', command: 'database.newTable' },
      { label: 'CREATE VIEW script', command: 'database.newView' },
      { label: 'CREATE MATERIALIZED VIEW script', command: 'database.newMaterializedView' },
      { label: 'ADD COLUMN script', command: 'database.newColumn' },
      { label: 'CREATE INDEX script', command: 'database.newIndex' },
      { label: 'UNIQUE KEY script', command: 'database.newUniqueKey' },
      { label: 'FOREIGN KEY script', command: 'database.newForeignKey' },
      { label: 'CHECK script', command: 'database.newCheck' },
      { label: 'CREATE SCHEMA script', command: 'database.newSchema' },
      { label: 'CREATE SEQUENCE script', command: 'database.newSequence' }
    ], { placeHolder: 'Generate database SQL script' });
    if (picked) {
      await vscode.commands.executeCommand(picked.command, node);
    }
  });

  register('database.newTable', async (node?: unknown) => openSqlScript('New Table', newObjectTemplate(node, 'table'), schemaFromNode(node).connection));
  register('database.newView', async (node?: unknown) => openSqlScript('New View', newObjectTemplate(node, 'view'), schemaFromNode(node).connection));
  register('database.newMaterializedView', async (node?: unknown) => openSqlScript('New Materialized View', newObjectTemplate(node, 'materialized_view'), schemaFromNode(node).connection));
  register('database.newColumn', async (node?: unknown) => openSqlScript('New Column', newObjectTemplate(node, 'column'), schemaFromNode(node).connection));
  register('database.newIndex', async (node?: unknown) => openSqlScript('New Index', newObjectTemplate(node, 'index'), schemaFromNode(node).connection));
  register('database.newUniqueKey', async (node?: unknown) => openSqlScript('New Unique Key', newObjectTemplate(node, 'unique_key'), schemaFromNode(node).connection));
  register('database.newForeignKey', async (node?: unknown) => openSqlScript('New Foreign Key', newObjectTemplate(node, 'foreign_key'), schemaFromNode(node).connection));
  register('database.newCheck', async (node?: unknown) => openSqlScript('New Check', newObjectTemplate(node, 'check'), schemaFromNode(node).connection));
  register('database.newSchema', async (node?: unknown) => openSqlScript('New Schema', newObjectTemplate(node, 'schema'), schemaFromNode(node).connection));
  register('database.newSequence', async (node?: unknown) => openSqlScript('New Sequence', newObjectTemplate(node, 'sequence'), schemaFromNode(node).connection));

  register('database.quickDocumentation', async (node?: unknown) => {
    const docs = await quickDocumentation(connectionManager, node);
    if (docs) {
      void vscode.window.showInformationMessage(docs, { modal: true });
    }
  });

  register('database.showQueryHistory', async () => {
    const connection = connectionManager.getPreferredConnection();
    const picked = await vscode.window.showQuickPick(queryConsoleHistoryItems()
      .filter((item) => !connection || item.connectionId === connection.id)
      .map((item) => ({
        label: `${item.favorite ? '$(star-full) ' : ''}${item.sql.replace(/\s+/g, ' ').slice(0, 90)}`,
        description: `${item.status}${item.rowCount !== undefined ? ` - ${item.rowCount} rows` : ''}`,
        detail: `${new Date(item.executedAt).toLocaleString()}${item.sourceFile ? ` - ${item.sourceFile}` : ''}`,
        item
      })), { placeHolder: 'Query console history', matchOnDetail: true });
    if (picked) {
      const action = await vscode.window.showQuickPick([
        { label: 'Open in Console', action: 'open' as const },
        { label: picked.item.favorite ? 'Remove Favorite' : 'Favorite', action: 'favorite' as const },
        { label: 'Copy SQL', action: 'copy' as const },
        { label: 'Delete', action: 'delete' as const }
      ], { placeHolder: 'History action' });
      if (action?.action === 'open') {
        await openHistoryItem(picked.item);
      } else if (action?.action === 'favorite') {
        await historyStore.update({ ...picked.item, favorite: !picked.item.favorite });
      } else if (action?.action === 'copy') {
        await vscode.env.clipboard.writeText(picked.item.sql);
      } else if (action?.action === 'delete') {
        await historyStore.delete(picked.item.id);
      }
    }
  });

  register('database.aiFixSql', () => runAi('fix'));
  register('database.aiExplainSql', () => runAi('explain'));
  register('database.visualExplainSql', () => runVisualExplain(false));
  register('database.visualExplainAnalyzeSql', () => runVisualExplain(true));

  async function executeFromEditor(mode: 'run' | 'smart' | 'selection' | 'file', options: { maxRows?: number } = {}): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const selectedDetections = mode === 'file' ? [] : selectedSqlDetections(editor);
    let detections: Array<{ sql: string; range: vscode.Range; index?: number; id?: string }>;
    if (mode === 'file') {
      detections = [{ sql: editor.document.getText(), range: new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
    } else if (mode === 'run') {
      const detected = sectionService.detectExecutable(editor.document, editor.selection);
      detections = selectedDetections.length > 0
        ? selectedDetections
        : detected
          ? [detected]
          : [{ sql: editor.document.getText(), range: new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
    } else if (mode === 'selection' || selectedDetections.length > 0) {
      detections = selectedDetections;
    } else {
      const detected = sectionService.detectExecutable(editor.document, editor.selection);
      detections = detected ? [detected] : [];
    }

    if (!detections.some((detected) => detected.sql.trim())) {
      void vscode.window.showInformationMessage('No SQL section to run.');
      return;
    }

    const forceNewResultTab = detections.length > 1;
    for (const detected of detections) {
      await executeDetected(editor, detected, { forceNewResultTab, maxRows: options.maxRows });
    }
  }

  async function compareResultTabs(sourceTab: QueryResultTab, resultSetIndex: number): Promise<void> {
    const sourceResultSet = sourceTab.resultSets[resultSetIndex] ?? sourceTab.resultSets[0];
    if (!sourceResultSet) {
      void vscode.window.showInformationMessage('This result tab does not contain rows to compare.');
      return;
    }

    const candidates = results.getTabs().filter((tab) => tab.id !== sourceTab.id && tab.resultSets.length > 0);
    if (!candidates.length) {
      void vscode.window.showInformationMessage('Open another result tab on the same connection to compare against.');
      return;
    }

    const picked = await vscode.window.showQuickPick(candidates.map((tab) => ({
      label: tab.customTitle ?? tab.title,
      description: `${tab.executionStatus}${tab.executionTimeMs !== undefined ? ` - ${tab.executionTimeMs}ms` : ''}`,
      detail: `${tab.databaseName ?? 'database'} • ${tab.resultSets[0]?.rowCount ?? 0} rows`,
      tab
    })), {
      placeHolder: `Compare ${sourceTab.customTitle ?? sourceTab.title} against`
    });
    if (!picked) {
      return;
    }

    const targetResultSet = picked.tab.resultSets[resultSetIndex] ?? picked.tab.resultSets[0];
    if (!targetResultSet) {
      void vscode.window.showInformationMessage('The selected comparison tab does not contain a matching result set.');
      return;
    }

    const report = compareResultSets(
      sourceResultSet,
      targetResultSet,
      sourceTab.customTitle ?? sourceTab.title,
      picked.tab.customTitle ?? picked.tab.title
    );
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: formatResultSetDiffMarkdown(report)
    });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }

  async function runVisualExplain(analyze: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sql') {
      void vscode.window.showInformationMessage('Open a SQL editor before running Visual Explain.');
      return;
    }
    const resolved = resolveConnectionForDocument(editor.document);
    if (resolved.isBound && !resolved.connection) {
      void vscode.window.showErrorMessage(`This SQL console is bound to a connection that no longer exists: ${resolved.boundConnectionId}`);
      return;
    }
    const connection = resolved.connection ?? await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    if (analyze) {
      const answer = await vscode.window.showWarningMessage(
        'EXPLAIN ANALYZE executes the SQL to collect runtime timings.',
        { modal: true },
        'Run EXPLAIN ANALYZE'
      );
      if (answer !== 'Run EXPLAIN ANALYZE') {
        return;
      }
    }
    if (!resolved.isBound) {
      await sqlDocumentConnections.set(editor.document.uri.toString(), connection.id);
      results.setActiveConnection(connection.id);
      updateSqlConnectionStatus(editor);
      sqlCodeLensRefresh.fire();
    }

    const detected: { sql: string; range: vscode.Range; index?: number; id?: string } | undefined =
      selectedSqlDetections(editor)[0] ?? sectionService.detectExecutable(editor.document, editor.selection);
    if (!detected?.sql.trim()) {
      void vscode.window.showInformationMessage('No SQL section to explain.');
      return;
    }
    const sourceSql = detected.sql;
    const executableSql = await parameterPrompt.resolve(sourceSql);
    if (executableSql === undefined) {
      return;
    }

    const documentUri = editor.document.uri.toString();
    const sourceOrigin = executionOriginForDocument(documentUri, queryConsoleDocumentUris(consoleStore.getAll()));
    const sourceRange = rangeToPlain(detected.range);
    const runningTab = await results.addTab(createRunningResultTab(connection, executableSql, undefined, {
      origin: sourceOrigin,
      fileName: editor.document.fileName,
      documentUri,
      queryId: detected.id,
      sectionIndex: detected.index,
      range: sourceRange
    }), { forceNew: true });

    try {
      const plan = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${analyze ? 'Running EXPLAIN ANALYZE' : 'Running EXPLAIN'} for ${connection.name}`,
        cancellable: false
      }, () => queryPlanAnalyzer.explain(connection, executableSql, { analyze }));
      const tab = createPlanResultTab(connection, executableSql, plan, {
        origin: sourceOrigin,
        fileName: editor.document.fileName,
        documentUri,
        queryId: detected.id,
        sectionIndex: detected.index,
        range: sourceRange
      });
      await results.addTab({ ...tab, id: runningTab.id, pinned: runningTab.pinned, customTitle: runningTab.customTitle }, { replaceTabId: runningTab.id });
      await highlighter.reveal(documentUri, sourceRange, sourceSql);
      queryMap.updateResults(results.getTabs());
      refreshQueryMap();
    } catch (error) {
      const failed = {
        ...runningTab,
        executionStatus: 'failed' as const,
        executionFinishedAt: Date.now(),
        executionTimeMs: Date.now() - runningTab.executionStartedAt,
        error: {
          message: error instanceof Error ? error.message : String(error)
        },
        updatedAt: Date.now()
      };
      await results.addTab(failed, { replaceTabId: runningTab.id });
    }
  }

  async function executeActiveMultiStatementSelection(maxRows?: number): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sql') {
      return false;
    }
    const selections = selectedSqlDetections(editor);
    if (!selections.some((selection) => splitSqlStatements(selection.sql).length > 1)) {
      return false;
    }
    await executeFromEditor('selection', { maxRows });
    return true;
  }

  function highlightActiveSqlSection(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'sql') {
      return;
    }
    const section = selectedSqlDetections(editor)[0] ?? sectionService.detectExecutable(editor.document, editor.selection);
    if (!section?.sql.trim()) {
      highlighter.clear(editor.document.uri.toString());
      return;
    }
    highlighter.highlight(editor, {
      startLine: section.range.start.line,
      startColumn: section.range.start.character,
      endLine: section.range.end.line,
      endColumn: section.range.end.character
    });
  }

  function selectedSqlDetections(editor: vscode.TextEditor): Array<{ sql: string; range: vscode.Range }> {
    return editor.selections
      .filter((selection) => !selection.isEmpty)
      .map((selection) => trimSelection(editor.document, selection))
      .filter((range) => !range.isEmpty)
      .sort(compareRanges)
      .filter((range, index, ranges) => index === 0 || !range.isEqual(ranges[index - 1]))
      .map((range) => ({
        sql: editor.document.getText(range),
        range
      }));
  }

  function updateSqlDiagnostics(document: vscode.TextDocument | undefined, selection?: vscode.Selection): void {
    if (!document || document.languageId !== 'sql') {
      return;
    }
    const documentUri = document.uri.toString();
    const version = (diagnosticVersions.get(documentUri) ?? 0) + 1;
    diagnosticVersions.set(documentUri, version);
    const existingTimer = diagnosticTimers.get(documentUri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    sqlDiagnostics.set(document.uri, sectionService.getSyntaxIssues(document));
    const timer = setTimeout(() => {
      diagnosticTimers.delete(documentUri);
      const resolved = resolveConnectionForDocument(document);
      void diagnosticsService.getDiagnostics(document, selection, resolved.connection ?? null).then((diagnostics) => {
        if (diagnosticVersions.get(documentUri) === version) {
          sqlDiagnostics.set(document.uri, diagnostics);
        }
      });
    }, 450);
    diagnosticTimers.set(documentUri, timer);
  }

  async function showSqlMetadataStatus(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const connection = editor?.document.languageId === 'sql'
      ? connectionForDocument(editor.document)
      : connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode.window.showInformationMessage('No database connection is selected for this SQL editor.');
      return;
    }

    const status = await schemaContext.metadataStatus(connection);
    const entry = status.entry;
    const age = entry?.loadedAt ? formatAge(Date.now() - entry.loadedAt) : 'never';
    const tableCount = entry ? entry.tables.length + entry.views.length : 0;
    const columnCount = entry ? Object.values(entry.columns).reduce((sum, columns) => sum + columns.length, 0) : 0;
    const problem = metadataProblem(status);
    const cause = metadataCause(status);
    const fix = metadataFix(status);
    const content = [
      '# SQL Metadata Status',
      '',
      `Problem: ${problem}`,
      `Cause: ${cause}`,
      `Fix: ${fix}`,
      '',
      '## Details',
      '',
      `- Connection: ${connection.name} (${connection.id})`,
      `- Connected: ${status.connected ? 'yes' : 'no'}`,
      `- Schema: ${status.schemaName}`,
      `- Cache status: ${entry?.status ?? 'empty'}`,
      `- Fresh enough for diagnostics: ${status.freshForDiagnostics ? 'yes' : 'no'}`,
      `- Refresh running: ${status.refreshRunning ? 'yes' : 'no'}`,
      `- Source: ${entry?.source ?? 'none'}`,
      `- Age: ${age}`,
      `- Schemas cached: ${entry?.schemas.length ?? 0}`,
      `- Tables/views cached: ${tableCount}`,
      `- Columns cached: ${columnCount}`,
      `- Last error: ${entry?.errorMessage ?? 'none'}`,
      `- Storage fallback: ${status.storageError ? `in-memory only (${status.storageError})` : 'disk cache available'}`,
      ''
    ].join('\n');
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }

  async function warmSqlMetadata(connection: ConnectionConfig, surface: string): Promise<void> {
    try {
      await connectAndRefreshSqlMetadata(connectionManager, schemaContext, connection);
    } catch (error) {
      void vscode.window.showWarningMessage(`${surface} is bound to ${connection.name}, but metadata refresh could not connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function setSqlFileConnection(resource?: unknown): Promise<void> {
    const document = await sqlDocumentFromArg(resource);
    if (!document) {
      void vscode.window.showInformationMessage('Open a SQL file before selecting a database connection.');
      return;
    }
    const connection = await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    await sqlDocumentConnections.set(document.uri.toString(), connection.id);
    await connectionManager.setSelectedConnection(connection.id);
    try {
      if (!connectionManager.isConnected(connection.id)) {
        await connectionManager.connect(connection.id);
      }
    } catch (error) {
      void vscode.window.showWarningMessage(`SQL file is bound to ${connection.name}, but connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    schemaContext.invalidate(connection.id);
    schemaContext.refreshDefaultSchemaInBackground(connection);
    results.setActiveConnection(connection.id);
    updateSqlConnectionStatus(vscode.window.activeTextEditor);
    updateSqlDiagnostics(document, vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()
      ? vscode.window.activeTextEditor.selection
      : undefined);
    refreshQueryMap();
    sqlCodeLensRefresh.fire();
  }

  async function sqlDocumentFromArg(resource?: unknown): Promise<vscode.TextDocument | undefined> {
    const document = resource instanceof vscode.Uri
      ? await vscode.workspace.openTextDocument(resource)
      : vscode.window.activeTextEditor?.document;
    if (!document) {
      return undefined;
    }
    const isSqlFile = document.languageId === 'sql' || document.uri.fsPath.toLowerCase().endsWith('.sql');
    return isSqlFile ? document : undefined;
  }

  async function executeDetected(editor: vscode.TextEditor, detected: { sql: string; range: vscode.Range; index?: number; id?: string }, options: { forceNewResultTab?: boolean; maxRows?: number } = {}): Promise<void> {
    const resolved = resolveConnectionForDocument(editor.document);
    if (resolved.isBound && !resolved.connection) {
      void vscode.window.showErrorMessage(`This SQL console is bound to a connection that no longer exists: ${resolved.boundConnectionId}`);
      return;
    }
    const connection = resolved.connection ?? await connectionManager.pickConnection();
    if (!connection) {
      return;
    }
    if (!resolved.isBound) {
      await sqlDocumentConnections.set(editor.document.uri.toString(), connection.id);
      results.setActiveConnection(connection.id);
      updateSqlConnectionStatus(editor);
      sqlCodeLensRefresh.fire();
    }
    const sourceSql = detected.sql;
    const executableSql = await parameterPrompt.resolve(sourceSql);
    if (executableSql === undefined) {
      return;
    }

    const decoration = vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground') });
    editor.setDecorations(decoration, [detected.range]);
    let endDocumentExecution: (() => void) | undefined;
    let runningTabId: string | undefined;
    let elapsedTimer: NodeJS.Timeout | undefined;
    try {
      const maxRows = options.maxRows ?? configuredDefaultMaxRows();
      const documentUri = editor.document.uri.toString();
      const sourceOrigin = executionOriginForDocument(documentUri, queryConsoleDocumentUris(consoleStore.getAll()));
      const executedRange = {
        startLine: detected.range.start.line,
        startColumn: detected.range.start.character,
        endLine: detected.range.end.line,
        endColumn: detected.range.end.character
      };
      await markActiveSessionExecuted(documentUri, connection.id, executedRange);
      refreshQueryMap();
      endDocumentExecution = beginDocumentExecution(documentUri);
      const statementCount = splitSqlStatements(executableSql).length || 1;
      const updateStatementStatus = createStatementStatusUpdater(editor, detected.range, sourceSql);
      const outputStartedAt = Date.now();
      queryOutput.recordExecutionStarted(connection, editor.document.fileName, statementCount, outputStartedAt);
      elapsedTimer = setInterval(() => {
        queryOutput.recordExecutionElapsed(connection, outputStartedAt);
      }, 5000);
      const runningTab = await results.addTab(createRunningResultTab(connection, executableSql, maxRows, {
        origin: sourceOrigin,
        fileName: editor.document.fileName,
        documentUri,
        queryId: detected.id,
        sectionIndex: detected.index,
        range: executedRange
      }), { forceNew: options.forceNewResultTab });
      runningTabId = runningTab.id;
      const runningQuery = beginRunningQuery(runningTab, documentUri);
      queryMap.updateResults(results.getTabs());
      const tab = await executor.execute({
        connectionId: connection.id,
        sql: executableSql,
        isCancellationRequested: () => runningQuery.cancelRequested,
        onProgress: (progress) => {
          trackRunningProgress(runningQuery, progress);
          updateStatementStatus(progress);
          queryOutput.recordProgress(connection, progress);
        },
        maxRows,
        source: {
          origin: sourceOrigin,
          fileName: editor.document.fileName,
          documentUri,
          queryId: detected.id,
          sectionIndex: detected.index,
          range: {
            startLine: detected.range.start.line,
            startColumn: detected.range.start.character,
            endLine: detected.range.end.line,
            endColumn: detected.range.end.character
          }
        }
      });
      await results.addTab({ ...tab, id: runningTab.id, pinned: runningTab.pinned, customTitle: runningTab.customTitle }, { replaceTabId: runningTab.id });
      recordQueryOutput(tab);
      await highlighter.reveal(documentUri, rangeToPlain(detected.range), sourceSql);
      queryMap.updateResults(results.getTabs());
      await markActiveSessionExecuted(documentUri, connection.id, executedRange);
      refreshQueryMap();
      status.text = `$(database) ${connection.name} ${tab.executionTimeMs ?? 0}ms`;
    } finally {
      if (runningTabId) {
        finishRunningQuery(runningTabId);
      }
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
      }
      endDocumentExecution?.();
      decoration.dispose();
    }
  }

  function createRunningResultTab(
    connection: ConnectionConfig,
    sql: string,
    maxRows: number | undefined,
    source: {
      origin: QueryResultTab['sourceOrigin'];
      fileName?: string;
      documentUri?: string;
      queryId?: string;
      sectionIndex?: number;
      range?: QueryResultTab['sourceRange'];
    }
  ): QueryResultTab {
    const now = Date.now();
    return {
      id: createId('tab'),
      title: resultTitle(sql, source.fileName),
      pinned: false,
      connectionId: connection.id,
      databaseType: connection.type,
      databaseName: connection.database,
      schemaName: connection.defaultSchema,
      queryText: sql,
      sourceOrigin: source.origin,
      sourceFile: source.fileName,
      sourceDocumentUri: source.documentUri,
      sourceQueryId: source.queryId,
      sourceSectionIndex: source.sectionIndex,
      sourceRange: source.range,
      executionStatus: 'running',
      executionStartedAt: now,
      maxRows,
      resultSets: [],
      activeResultSetIndex: 0,
      filters: [],
      sort: [],
      columnState: [],
      createdAt: now,
      updatedAt: now
    };
  }

  function createPlanResultTab(
    connection: ConnectionConfig,
    sql: string,
    plan: QueryPlanResult,
    source: {
      origin: QueryResultTab['sourceOrigin'];
      fileName?: string;
      documentUri?: string;
      queryId?: string;
      sectionIndex?: number;
      range?: QueryResultTab['sourceRange'];
    }
  ): QueryResultTab {
    const now = Date.now();
    return {
      id: createId('tab'),
      title: `${plan.analyze ? 'EXPLAIN ANALYZE' : 'EXPLAIN'} ${resultTitle(sql, source.fileName)}`,
      pinned: false,
      connectionId: connection.id,
      databaseType: connection.type,
      databaseName: connection.database,
      schemaName: connection.defaultSchema,
      queryText: sql,
      sourceOrigin: source.origin,
      sourceFile: source.fileName,
      sourceDocumentUri: source.documentUri,
      sourceQueryId: source.queryId,
      sourceSectionIndex: source.sectionIndex,
      sourceRange: source.range,
      executionStatus: 'completed',
      executionStartedAt: now,
      executionFinishedAt: now,
      executionTimeMs: plan.executionTimeMs,
      rowCount: plan.root ? 1 : undefined,
      resultSets: [],
      plan,
      activeResultSetIndex: 0,
      filters: [],
      sort: [],
      columnState: [],
      createdAt: now,
      updatedAt: now
    };
  }

  function resultTitle(sql: string, fileName?: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? 'SQL';
    if (from) {
      return `${keyword} ${from.replace(/"/g, '')}`;
    }
    if (normalized) {
      return keyword;
    }
    return fileName?.split(/[\\/]/).pop() ?? 'SQL';
  }

  async function runAi(action: 'fix' | 'explain'): Promise<void> {
    if (!await aiAdapter.isAvailable()) {
      void vscode.window.showInformationMessage('AI SQL actions need a VS Code language model provider or configured database.ai.openAiCompatible settings.');
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const connection = editor ? connectionForDocument(editor.document) : undefined;
    if (!editor || !connection) {
      void vscode.window.showInformationMessage('Open a SQL editor and select a connection first.');
      return;
    }
    const section = sectionService.detect(editor.document, editor.selection);
    const entry = await schemaContext.loadDefaultSchema(connection);
    const sql = await aiAdapter.send({
      action,
      selectedSql: section?.sql,
      relevantSchema: {
        connectionName: connection.name,
        databaseType: connection.type,
        databaseName: connection.database,
        defaultSchema: connection.defaultSchema,
        tables: [...entry.tables, ...entry.views].slice(0, 50).map((table) => ({
          schema: table.schema,
          name: table.name,
          type: table.type
        }))
      }
    });
    const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: `${sql}\n` });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }

  async function openHistoryItem(item: import('./types').QueryHistoryItem): Promise<void> {
    if (item.documentUri) {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(item.documentUri));
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const currentText = doc.getText();
        if (item.sourceRange && currentText.includes(item.sql.trim())) {
          const range = rangeFromPlain(item.sourceRange);
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range);
        } else {
          const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(currentText.length));
          await editor.edit((edit) => edit.replace(fullRange, `${item.sql}\n`));
        }
        results.setActiveConnection(item.connectionId);
        refreshQueryMap();
        return;
      } catch {
        // Fall back to opening the SQL in a durable console below.
      }
    }
    const doc = await consoleStore.openOrCreate(connectionManager.getConnection(item.connectionId), `${item.sql}\n`, { reuse: false });
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    results.setActiveConnection(item.connectionId);
    refreshQueryMap();
  }

  async function revealSourceForTab(tab: import('./types').QueryResultTab): Promise<void> {
    if (!tab.sourceDocumentUri || !tab.sourceRange) {
      return;
    }
    await highlighter.reveal(tab.sourceDocumentUri, tab.sourceRange, tab.queryText);
    const editor = vscode.window.activeTextEditor;
    queryMap.updateFromEditor(editor?.document.uri.toString() === tab.sourceDocumentUri ? editor : undefined);
  }
}

export function deactivate(): void {}

function connectionIdFromArg(value: unknown): string | undefined {
  const maybe = value as { connection?: { id?: string }; id?: string };
  return maybe?.connection?.id ?? maybe?.id;
}

function databaseNodeFromArg(value: unknown): CatalogNode | ColumnNode | ConnectionNode | FolderNode | SchemaNode | SchemasNode | TableNode | ViewNode | undefined {
  if (
    value instanceof CatalogNode
    || value instanceof ColumnNode
    || value instanceof ConnectionNode
    || value instanceof FolderNode
    || value instanceof SchemaNode
    || value instanceof SchemasNode
    || value instanceof TableNode
    || value instanceof ViewNode
  ) {
    return value;
  }
  return undefined;
}

function trimSelection(document: vscode.TextDocument, selection: vscode.Selection): vscode.Range {
  const text = document.getText(selection);
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  const trailing = text.match(/\s*$/)?.[0].length ?? 0;
  const startOffset = document.offsetAt(selection.start) + leading;
  const endOffset = document.offsetAt(selection.end) - trailing;
  return new vscode.Range(document.positionAt(startOffset), document.positionAt(Math.max(startOffset, endOffset)));
}

function compareRanges(a: vscode.Range, b: vscode.Range): number {
  return a.start.compareTo(b.start) || a.end.compareTo(b.end);
}

type SqlMetadataStatus = Awaited<ReturnType<SchemaContextService['metadataStatus']>>;

function metadataProblem(status: SqlMetadataStatus): string {
  if (!status.entry) {
    return 'No metadata snapshot is available for this connection and schema.';
  }
  if (status.entry.status === 'ready') {
    return 'Metadata is fresh enough for schema diagnostics and autocomplete.';
  }
  if (status.entry.status === 'stale') {
    return 'Metadata exists, but it is stale, so autocomplete may use it and diagnostics stay quiet.';
  }
  if (status.entry.status === 'loading') {
    return 'Metadata refresh is currently running.';
  }
  return 'The last metadata refresh failed, so diagnostics stay quiet.';
}

function metadataCause(status: SqlMetadataStatus): string {
  if (!status.entry) {
    return status.connected ? 'The cache has not finished warming yet.' : 'The connection is not active and no disk snapshot was found.';
  }
  if (status.entry.status === 'ready') {
    return 'The cache was loaded from disk or live database metadata within the freshness window.';
  }
  if (status.entry.status === 'stale') {
    return 'The last successful metadata load is older than the freshness window.';
  }
  if (status.entry.status === 'loading') {
    return 'The extension is refreshing schema metadata in the background.';
  }
  return status.entry.errorMessage ?? 'The database driver could not refresh metadata.';
}

function metadataFix(status: SqlMetadataStatus): string {
  if (status.entry?.status === 'ready') {
    return 'No action needed.';
  }
  if (status.connected) {
    return 'Wait for the background refresh or run Database: Refresh Database Explorer.';
  }
  return 'Connect this database, then open a query console or run Database: Refresh Database Explorer.';
}

function formatAge(ageMs: number): string {
  if (ageMs < 60_000) {
    return `${Math.max(0, Math.round(ageMs / 1000))}s`;
  }
  if (ageMs < 60 * 60_000) {
    return `${Math.round(ageMs / 60_000)}m`;
  }
  return `${Math.round(ageMs / (60 * 60_000))}h`;
}

function registerSqlCompletions(
  connectionManager: ConnectionManager,
  schemaContext: SchemaContextService,
  sectionService: SqlSectionService,
  getConnectionForDocument: (document: vscode.TextDocument) => ConnectionConfig | undefined,
  context: vscode.ExtensionContext
): vscode.Disposable {
  const keywords = [
    'select', 'from', 'where', 'join', 'left join', 'inner join', 'group by', 'order by',
    'limit', 'with', 'insert into', 'update', 'delete from', 'create table', 'alter table',
    'drop table', 'case', 'when', 'then', 'else', 'end', 'distinct', 'having', 'union all'
  ];

  return vscode.languages.registerCompletionItemProvider('sql', {
    async provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position).text.slice(0, position.character);
      const items = keywords.map((keyword) => {
        const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
        item.insertText = keyword;
        return item;
      });

      const connection = getConnectionForDocument(document);
      if (!connection) {
        return items;
      }

      try {
        const metadataItems = await getMetadataCompletionItems(connectionManager, schemaContext, sectionService, connection, document, position, linePrefix);
        if (metadataItems.length > 0) {
          await showFirstSchemaCompletionMessage(context, connection);
        }
        items.push(...metadataItems);
      } catch {
        return items;
      }

      return items;
    }
  }, '.', ' ', '"');
}

async function getMetadataCompletionItems(
  connectionManager: ConnectionManager,
  schemaContext: SchemaContextService,
  sectionService: SqlSectionService,
  config: ConnectionConfig,
  document: vscode.TextDocument,
  position: vscode.Position,
  linePrefix: string,
): Promise<vscode.CompletionItem[]> {
  const defaultSchema = config.defaultSchema ?? 'public';
  if (connectionManager.isConnected(config.id)) {
    schemaContext.refreshDefaultSchemaInBackground(config);
  }

  const section = sectionService.detect(document, new vscode.Selection(position, position));
  const statementPrefix = section ? document.getText(new vscode.Range(section.range.start, position)) : linePrefix;
  const relationContext = relationCompletionContext(linePrefix);
  if (relationContext?.schema) {
    const entry = await schemaContext.getCachedForConnection(config, defaultSchema);
    if (!entry || !['ready', 'stale', 'error'].includes(entry.status)) {
      return [];
    }
    return relationCompletionCandidates(entry, relationContext).slice(0, 300).map((relation) => {
      const item = new vscode.CompletionItem(relation.name, vscode.CompletionItemKind.Struct);
      item.detail = `${relation.schema}.${relation.name}`;
      item.insertText = relation.name;
      return item;
    });
  }

  const aliasTarget = linePrefix.match(/(?:"([^"]+)"|(\w+))\.$/);
  if (aliasTarget) {
    const alias = stripQuotes(aliasTarget[1] ?? aliasTarget[2]);
    const target = section?.aliases.find((item) => item.alias === alias || item.table === alias);
    const schema = target?.schema ?? defaultSchema;
    const table = target?.table ?? alias;
    const columns = await schemaContext.getCachedColumns(config, schema, table);
    if (!columns) {
      return [];
    }
    return columns.slice(0, 300).map((column) => {
      const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
      item.detail = column.dataType;
      item.insertText = column.name;
      return item;
    });
  }

  if (section && unqualifiedColumnCompletionContext(statementPrefix)) {
    return getSectionColumnCompletionItems(schemaContext, config, section.tables, defaultSchema);
  }

  const entry = await schemaContext.getCachedForConnection(config, defaultSchema);
  if (!entry || !['ready', 'stale', 'error'].includes(entry.status)) {
    return [];
  }
  const items: vscode.CompletionItem[] = [];
  for (const schema of entry.schemas.slice(0, 30)) {
    items.push(new vscode.CompletionItem(schema.name, vscode.CompletionItemKind.Module));
  }
  for (const table of [...entry.tables, ...entry.views].slice(0, 300)) {
    const tableItem = new vscode.CompletionItem(table.name, vscode.CompletionItemKind.Struct);
    tableItem.detail = `${table.schema}.${table.name}`;
    tableItem.insertText = table.name;
    items.push(tableItem);
  }

  return filterMetadataItems(items, linePrefix);
}

async function getSectionColumnCompletionItems(
  schemaContext: SchemaContextService,
  config: ConnectionConfig,
  tables: Array<{ schema?: string; table: string }>,
  defaultSchema: string
): Promise<vscode.CompletionItem[]> {
  const items: vscode.CompletionItem[] = [];
  for (const table of tables.slice(0, 8)) {
    const columns = await schemaContext.getCachedColumns(config, table.schema ?? defaultSchema, table.table) ?? [];
    for (const column of columns) {
      if (items.some((item) => item.label === column.name)) {
        continue;
      }
      const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
      item.detail = `${table.schema ?? defaultSchema}.${table.table} ${column.dataType}`;
      item.insertText = column.name;
      items.push(item);
    }
  }
  return items.slice(0, 300);
}

async function showFirstSchemaCompletionMessage(context: vscode.ExtensionContext, connection: ConnectionConfig): Promise<void> {
  const key = `database.schemaCompletionReady.${connection.id}`;
  if (context.globalState.get<boolean>(key)) {
    return;
  }
  await context.globalState.update(key, true);
  void vscode.window.showInformationMessage(`Schema-backed SQL completions are ready for ${connection.name}.`);
}

function filterMetadataItems(items: vscode.CompletionItem[], linePrefix: string): vscode.CompletionItem[] {
  if (/\b(from|join|update|into)\s+[\w"]*$/i.test(linePrefix) || /\.$/.test(linePrefix)) {
    return items;
  }
  return items.filter((item) => item.kind === vscode.CompletionItemKind.Keyword);
}

function registerSqlConnectionCodeLens(
  connectionLensTitle: (document: vscode.TextDocument) => string,
  sectionService: SqlSectionService,
  refreshEvent?: vscode.Event<void>
): vscode.Disposable {
  const emitter = new vscode.EventEmitter<void>();
  const documentEvents = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === 'sql') {
      emitter.fire();
    }
  });
  const refreshEvents = refreshEvent?.(() => emitter.fire());

  const provider = vscode.languages.registerCodeLensProvider('sql', {
    onDidChangeCodeLenses: emitter.event,
    provideCodeLenses(document) {
      const top = new vscode.Range(0, 0, 0, 0);
      const lenses = [
        new vscode.CodeLens(top, {
          title: connectionLensTitle(document),
          tooltip: 'Select the database connection for this SQL file',
          command: 'database.setSqlFileConnection',
          arguments: [document.uri]
        })
      ];
      for (const section of sectionService.getSections(document)) {
        if (!section.sql.trim()) {
          continue;
        }
        const range = new vscode.Range(section.range.start, section.range.start);
        lenses.push(new vscode.CodeLens(range, {
          title: '$(play) Execute SQL Section',
          tooltip: 'Run this SQL section.',
          command: 'database.executeStatementRange',
          arguments: [
            document.uri.toString(),
            section.range.start.line,
            section.range.start.character,
            section.range.end.line,
            section.range.end.character
          ]
        }));
      }
      return lenses;
    }
  });

  return refreshEvents
    ? vscode.Disposable.from(documentEvents, refreshEvents, provider, emitter)
    : vscode.Disposable.from(documentEvents, provider, emitter);
}

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function rangeFromPlain(range: NonNullable<import('./types').QueryHistoryItem['sourceRange']>): vscode.Range {
  return rangeFromSource(range);
}

function rangeToPlain(range: vscode.Range): NonNullable<import('./types').QueryHistoryItem['sourceRange']> {
  return {
    startLine: range.start.line,
    startColumn: range.start.character,
    endLine: range.end.line,
    endColumn: range.end.character
  };
}

async function openSqlEditor(
  connectionManager: ConnectionManager,
  title: string,
  content = '',
  connection = connectionManager.getPreferredConnection()
): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.parse(`untitled:${title}${connection ? ` - ${connection.name}` : ''}.sql`);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Active,
    preview: false
  });
  await vscode.languages.setTextDocumentLanguage(doc, 'sql');
  if (content && doc.getText().length === 0) {
    await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), content));
  }
  return doc;
}

function configuredDefaultMaxRows(): number | undefined {
  const maxRows = vscode.workspace.getConfiguration('database').get<number>('defaultMaxRows', 500);
  return Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
}

function objectName(node: unknown): string | undefined {
  if (node instanceof ConnectionNode) {
    return node.connection.name;
  }
  if (node instanceof CatalogNode) {
    return node.connection.database;
  }
  if (node instanceof SchemaNode) {
    return node.schema.name;
  }
  if (node instanceof FolderNode) {
    return node.tableName ?? node.schema;
  }
  if (node instanceof TableNode) {
    return node.table.name;
  }
  if (node instanceof ViewNode) {
    return node.view.name;
  }
  if (node instanceof RoutineNode) {
    return node.routine.name;
  }
  if (node instanceof TriggerNode) {
    return node.trigger.name;
  }
  if (node instanceof ColumnNode) {
    return node.column.name;
  }
  return undefined;
}

function qualifiedObjectName(node: unknown): string | undefined {
  if (node instanceof SchemaNode) {
    return quoteIdentifier(node.schema.name);
  }
  if (node instanceof FolderNode && node.tableName) {
    return qualifiedName(node.schema, node.tableName);
  }
  if (node instanceof TableNode) {
    return qualifiedName(node.table.schema, node.table.name);
  }
  if (node instanceof ViewNode) {
    return qualifiedName(node.view.schema, node.view.name);
  }
  if (node instanceof RoutineNode) {
    return qualifiedName(node.routine.schema, node.routine.name);
  }
  if (node instanceof TriggerNode) {
    return qualifiedName(node.trigger.schema, node.trigger.table) + '.' + quoteIdentifier(node.trigger.name);
  }
  if (node instanceof ColumnNode) {
    return `${qualifiedName(node.column.schema, node.column.table)}.${quoteIdentifier(node.column.name)}`;
  }
  if (node instanceof CatalogNode || node instanceof ConnectionNode) {
    return node.connection.database;
  }
  return objectName(node);
}

function tableLikeTarget(node: unknown): { connection: import('./types').ConnectionConfig; schema: string; name: string; kind: 'table' | 'view' } | undefined {
  if (node instanceof TableNode) {
    return { connection: node.connection, schema: node.table.schema, name: node.table.name, kind: 'table' };
  }
  if (node instanceof ViewNode) {
    return { connection: node.connection, schema: node.view.schema, name: node.view.name, kind: 'view' };
  }
  if (node instanceof FolderNode && node.tableName) {
    return { connection: node.connection, schema: node.schema, name: node.tableName, kind: 'table' };
  }
  if (node instanceof ColumnNode) {
    return { connection: node.connection, schema: node.column.schema, name: node.column.table, kind: 'table' };
  }
  return undefined;
}

async function pickDestinationConnection(connectionManager: ConnectionManager, sourceConnectionId: string): Promise<ConnectionConfig | undefined> {
  const connections = connectionManager.getConnections().filter((connection) => connection.id !== sourceConnectionId);
  if (!connections.length) {
    void vscode.window.showInformationMessage('Add another database connection before copying a table.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(connections.map((connection) => ({
    label: connection.name,
    description: `${connection.type}${connection.production ? ' - prod' : ''}`,
    detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
    connection
  })), { placeHolder: 'Copy table to which connection?' });
  return picked?.connection;
}

function maintenanceScriptFromStats(stats: TableStatsInfo): string | undefined {
  if (stats.databaseType !== 'redshift') {
    return undefined;
  }
  const flags = buildTablePerformancePrepassFlags(stats, emptyWorkload()).filter((flag) => flag.kind === 'redshift_unsorted_rows' || flag.kind === 'redshift_stale_stats');
  if (!flags.length) {
    return undefined;
  }
  const statements: string[] = [];
  const table = qualifiedName(stats.schema, stats.table);
  if (flags.some((flag) => flag.kind === 'redshift_unsorted_rows')) {
    statements.push(`vacuum sort only ${table};`);
  }
  if (flags.some((flag) => flag.kind === 'redshift_stale_stats')) {
    statements.push(`analyze ${table};`);
  }
  return statements.join('\n');
}

function emptyWorkload(): TableWorkloadSummary {
  return {
    connectionId: '',
    table: '',
    queryCount: 0,
    totalRunCount: 0,
    totalDurationMs: 0,
    topQueries: [],
    columns: []
  };
}

async function objectDdl(connectionManager: ConnectionManager, node: unknown): Promise<string | undefined> {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    return connectionManager.getDriver(node.connection.type).getTableDDL(node.connection.id, node.table.schema, node.table.name);
  }
  if (node instanceof SchemaNode) {
    return `create schema if not exists ${quoteIdentifier(node.schema.name)};\n`;
  }
  return undefined;
}

function schemaFromNode(node: unknown): { schema: string; connection?: import('./types').ConnectionConfig } {
  if (node instanceof SchemaNode) {
    return { schema: node.schema.name, connection: node.connection };
  }
  if (node instanceof FolderNode) {
    return { schema: node.schema, connection: node.connection };
  }
  if (node instanceof TableNode) {
    return { schema: node.table.schema, connection: node.connection };
  }
  if (node instanceof ViewNode) {
    return { schema: node.view.schema, connection: node.connection };
  }
  if (node instanceof ColumnNode) {
    return { schema: node.column.schema, connection: node.connection };
  }
  if (node instanceof RoutineNode) {
    return { schema: node.routine.schema, connection: node.connection };
  }
  if (node instanceof TriggerNode) {
    return { schema: node.trigger.schema, connection: node.connection };
  }
  const connection = node instanceof ConnectionNode || node instanceof CatalogNode ? node.connection : undefined;
  return { schema: connection?.defaultSchema ?? 'public', connection };
}

function schemaLikeTarget(node: unknown): { connection: ConnectionConfig; schema: string } | undefined {
  if (node instanceof SchemaNode) {
    return { connection: node.connection, schema: node.schema.name };
  }
  if (node instanceof FolderNode) {
    return { connection: node.connection, schema: node.schema };
  }
  if (node instanceof TableNode) {
    return { connection: node.connection, schema: node.table.schema };
  }
  if (node instanceof ViewNode) {
    return { connection: node.connection, schema: node.view.schema };
  }
  if (node instanceof ColumnNode) {
    return { connection: node.connection, schema: node.column.schema };
  }
  if (node instanceof RoutineNode) {
    return { connection: node.connection, schema: node.routine.schema };
  }
  if (node instanceof TriggerNode) {
    return { connection: node.connection, schema: node.trigger.schema };
  }
  if (node instanceof ConnectionNode || node instanceof CatalogNode) {
    return { connection: node.connection, schema: node.connection.defaultSchema ?? 'public' };
  }
  return undefined;
}

function snapshotFromSchemaEntry(entry: SchemaCacheEntry) {
  return {
    schemaName: entry.schemaName,
    tables: entry.tables,
    views: entry.views,
    columns: entry.columns
  };
}

function newObjectTemplate(node: unknown, type: string): string {
  const { schema } = schemaFromNode(node);
  const table = tableLikeTarget(node);
  if (type === 'table') {
    return `create table ${qualifiedName(schema, 'new_table')} (\n  id bigserial primary key,\n  created_at timestamp not null default now()\n);\n`;
  }
  if (type === 'view') {
    return `create or replace view ${qualifiedName(schema, 'new_view')} as\nselect *\nfrom ${qualifiedName(schema, 'source_table')};\n`;
  }
  if (type === 'materialized_view') {
    return `create materialized view ${qualifiedName(schema, 'new_materialized_view')} as\nselect *\nfrom ${qualifiedName(schema, 'source_table')};\n`;
  }
  if (type === 'column') {
    const target = table ?? { schema, name: 'table_name' };
    return `alter table ${qualifiedName(target.schema, target.name)}\n  add column ${quoteIdentifier('new_column')} text;\n`;
  }
  if (type === 'index') {
    const target = table ?? { schema, name: 'table_name' };
    return `create index ${quoteIdentifier(`idx_${target.name}_column`)}\non ${qualifiedName(target.schema, target.name)} (${quoteIdentifier('column_name')});\n`;
  }
  if (type === 'unique_key') {
    const target = table ?? { schema, name: 'table_name' };
    return `alter table ${qualifiedName(target.schema, target.name)}\n  add constraint ${quoteIdentifier(`${target.name}_column_key`)} unique (${quoteIdentifier('column_name')});\n`;
  }
  if (type === 'foreign_key') {
    const target = table ?? { schema, name: 'table_name' };
    return `alter table ${qualifiedName(target.schema, target.name)}\n  add constraint ${quoteIdentifier(`${target.name}_fk`)} foreign key (${quoteIdentifier('column_name')})\n  references ${qualifiedName(schema, 'referenced_table')} (${quoteIdentifier('id')});\n`;
  }
  if (type === 'check') {
    const target = table ?? { schema, name: 'table_name' };
    return `alter table ${qualifiedName(target.schema, target.name)}\n  add constraint ${quoteIdentifier(`${target.name}_check`)} check (${quoteIdentifier('column_name')} is not null);\n`;
  }
  if (type === 'schema') {
    return `create schema ${quoteIdentifier('new_schema')};\n`;
  }
  if (type === 'sequence') {
    return `create sequence ${qualifiedName(schema, 'new_sequence')}\n  start with 1\n  increment by 1;\n`;
  }
  return '';
}

function renameTemplate(node: unknown): string | undefined {
  if (node instanceof TableNode) {
    return `alter table ${qualifiedName(node.table.schema, node.table.name)}\n  rename to ${quoteIdentifier(`${node.table.name}_new`)};\n`;
  }
  if (node instanceof ViewNode) {
    return `alter view ${qualifiedName(node.view.schema, node.view.name)}\n  rename to ${quoteIdentifier(`${node.view.name}_new`)};\n`;
  }
  if (node instanceof SchemaNode) {
    return `alter schema ${quoteIdentifier(node.schema.name)}\n  rename to ${quoteIdentifier(`${node.schema.name}_new`)};\n`;
  }
  if (node instanceof ColumnNode) {
    return `alter table ${qualifiedName(node.column.schema, node.column.table)}\n  rename column ${quoteIdentifier(node.column.name)} to ${quoteIdentifier(`${node.column.name}_new`)};\n`;
  }
  return undefined;
}

function dropTemplate(node: unknown): string | undefined {
  if (node instanceof TableNode) {
    return `drop table ${qualifiedName(node.table.schema, node.table.name)};\n`;
  }
  if (node instanceof ViewNode) {
    return `drop view ${qualifiedName(node.view.schema, node.view.name)};\n`;
  }
  if (node instanceof SchemaNode) {
    return `drop schema ${quoteIdentifier(node.schema.name)};\n`;
  }
  if (node instanceof ColumnNode) {
    return `alter table ${qualifiedName(node.column.schema, node.column.table)}\n  drop column ${quoteIdentifier(node.column.name)};\n`;
  }
  return undefined;
}

async function quickDocumentation(connectionManager: ConnectionManager, node: unknown): Promise<string | undefined> {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    const columns = await connectionManager.getDriver(node.connection.type).getColumns(node.connection.id, node.table.schema, node.table.name);
    return `${qualifiedName(node.table.schema, node.table.name)}\n${columns.map((column) => `${column.name} ${column.dataType}${column.nullable ? '' : ' not null'}`).join('\n')}`;
  }
  if (node instanceof ColumnNode) {
    return `${qualifiedName(node.column.schema, node.column.table)}.${quoteIdentifier(node.column.name)}\n${node.column.dataType}${node.column.nullable ? '' : ' not null'}`;
  }
  if (node instanceof RoutineNode) {
    return [
      `${qualifiedName(node.routine.schema, node.routine.name)}`,
      node.routine.kind === 'procedure' ? 'Procedure' : 'Function',
      node.routine.returnType ? `Returns: ${node.routine.returnType}` : undefined,
      node.routine.language ? `Language: ${node.routine.language}` : undefined,
      node.routine.comment
    ].filter(Boolean).join('\n');
  }
  if (node instanceof TriggerNode) {
    return [
      `${qualifiedName(node.trigger.schema, node.trigger.table)}.${quoteIdentifier(node.trigger.name)}`,
      node.trigger.timing ? `Timing: ${node.trigger.timing}` : undefined,
      node.trigger.orientation ? `Orientation: ${node.trigger.orientation}` : undefined,
      node.trigger.events?.length ? `Events: ${node.trigger.events.join(', ')}` : undefined,
      node.trigger.enabled ? `Enabled: ${node.trigger.enabled}` : undefined
    ].filter(Boolean).join('\n');
  }
  return qualifiedObjectName(node);
}
