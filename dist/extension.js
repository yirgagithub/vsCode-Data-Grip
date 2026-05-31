"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const connectionManager_1 = require("./database/connectionManager");
const queryExecutor_1 = require("./database/queryExecutor");
const sqlSplitter_1 = require("./database/sqlSplitter");
const DatabaseTreeProvider_1 = require("./explorer/DatabaseTreeProvider");
const nodes_1 = require("./explorer/nodes");
const connectionStore_1 = require("./persistence/connectionStore");
const queryConsoleStore_1 = require("./persistence/queryConsoleStore");
const sqlDocumentConnectionStore_1 = require("./persistence/sqlDocumentConnectionStore");
const queryHistoryStore_1 = require("./persistence/queryHistoryStore");
const queryMemoryStore_1 = require("./persistence/queryMemoryStore");
const resultSessionStore_1 = require("./persistence/resultSessionStore");
const queryMemoryService_1 = require("./services/queryMemoryService");
const queryConsoleHistory_1 = require("./services/queryConsoleHistory");
const schemaContextService_1 = require("./services/schemaContextService");
const schemaMetadataCacheStore_1 = require("./services/schemaMetadataCacheStore");
const sqlMetadataCompletion_1 = require("./services/sqlMetadataCompletion");
const sqlMetadataWarmup_1 = require("./services/sqlMetadataWarmup");
const sqlDiagnosticsService_1 = require("./services/sqlDiagnosticsService");
const sqlSectionHighlighter_1 = require("./services/sqlSectionHighlighter");
const sqlSectionService_1 = require("./services/sqlSectionService");
const sqlSelectionExecution_1 = require("./services/sqlSelectionExecution");
const vsCodeLanguageModelSqlAdapter_1 = require("./ai/vsCodeLanguageModelSqlAdapter");
const queryMemoryController_1 = require("./controllers/queryMemoryController");
const documentConnectionResolver_1 = require("./services/documentConnectionResolver");
const queryOutputService_1 = require("./services/queryOutputService");
const ConnectionEditorPanel_1 = require("./webviews/connection/ConnectionEditorPanel");
const QueryMapProvider_1 = require("./webviews/queryMap/QueryMapProvider");
const ResultsPanelProvider_1 = require("./webviews/results/ResultsPanelProvider");
const TableDataPanel_1 = require("./webviews/table/TableDataPanel");
const logger_1 = require("./utils/logger");
const identifiers_1 = require("./utils/identifiers");
const PROJECT_SQL_SESSION_PREFIX = 'project-sql:';
function activate(context) {
    const logger = new logger_1.Logger();
    const connectionStore = new connectionStore_1.ConnectionStore(context);
    const connectionManager = new connectionManager_1.ConnectionManager(connectionStore);
    const historyStore = new queryHistoryStore_1.QueryHistoryStore(context);
    const consoleStore = new queryConsoleStore_1.QueryConsoleStore(context);
    const sqlDocumentConnections = new sqlDocumentConnectionStore_1.SqlDocumentConnectionStore(context);
    const resultStore = new resultSessionStore_1.ResultSessionStore(context);
    const schemaContext = new schemaContextService_1.SchemaContextService(connectionManager, new schemaMetadataCacheStore_1.SchemaMetadataCacheStore(context));
    const sectionService = new sqlSectionService_1.SqlSectionService();
    const highlighter = new sqlSectionHighlighter_1.SqlSectionHighlighter();
    const sqlDiagnostics = vscode.languages.createDiagnosticCollection('database-sql');
    const diagnosticsService = new sqlDiagnosticsService_1.SqlDiagnosticsService(connectionManager, schemaContext, sectionService);
    const aiAdapter = new vsCodeLanguageModelSqlAdapter_1.VsCodeLanguageModelSqlAdapter();
    const memoryStore = new queryMemoryStore_1.QueryMemoryStore(context);
    const memoryService = new queryMemoryService_1.QueryMemoryService(historyStore, memoryStore, consoleStore, connectionManager, aiAdapter);
    const executor = new queryExecutor_1.QueryExecutor(connectionManager, historyStore, memoryService);
    const queryOutput = new queryOutputService_1.QueryOutputService();
    const diagnosticTimers = new Map();
    const diagnosticVersions = new Map();
    const runningDocuments = new Map();
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
    let queryMap;
    const results = new ResultsPanelProvider_1.ResultsPanelProvider(context, resultStore, executor, async (tab) => revealSourceForTab(tab), (tabs) => queryMap?.updateResults(tabs), async (maxRows) => executeActiveMultiStatementSelection(maxRows));
    queryMap = new QueryMapProvider_1.QueryMapProvider(sectionService, async (documentUri, section) => {
        await highlighter.reveal(documentUri, rangeToPlain(section.range), section.sql);
    }, async (documentUri, section) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql' || editor.document.uri.toString() !== documentUri) {
            return;
        }
        await executeDetected(editor, section);
    }, () => queryConsoleHistoryItems(), async (item) => openHistoryItem(item), async (id, pinned) => {
        if (documentUriFromProjectSqlSessionId(id)) {
            return;
        }
        await consoleStore.setPinned(id, pinned);
        refreshQueryMap();
    }, async (id) => {
        await untrackActiveSession(id);
        refreshQueryMap();
    }, async (id, direction) => {
        if (documentUriFromProjectSqlSessionId(id)) {
            return;
        }
        await consoleStore.move(id, direction);
        refreshQueryMap();
    }, async (documentUri) => {
        if ((0, queryConsoleHistory_1.queryConsoleDocumentUris)(consoleStore.getAll()).has(documentUri)) {
            await consoleStore.touchDocument(documentUri, { opened: true });
        }
        else {
            await sqlDocumentConnections.touch(documentUri);
        }
        await results.show(connectionIdForDocumentUri(documentUri));
        refreshQueryMap();
    }, async (item) => {
        await historyStore.update(item);
        refreshQueryMap();
    }, async (id) => {
        await historyStore.delete(id);
        refreshQueryMap();
    }, async (ids) => {
        await clearActiveSessionsById(ids);
        refreshQueryMap();
    }, async (ids) => {
        const idSet = new Set(ids);
        const memoryIds = memoryStore.getAll()
            .filter((item) => item.historyIds?.some((id) => idSet.has(id)) || (item.latestHistoryId !== undefined && idSet.has(item.latestHistoryId)))
            .map((item) => item.id);
        await historyStore.deleteMany(ids);
        await memoryStore.deleteMany(memoryIds);
        refreshQueryMap();
    }, () => refreshQueryMap());
    const tree = new DatabaseTreeProvider_1.DatabaseTreeProvider(connectionManager);
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
    context.subscriptions.push(treeView, highlighter, queryOutput, sqlDiagnostics, vscode.window.registerWebviewViewProvider(ResultsPanelProvider_1.ResultsPanelProvider.viewType, results), vscode.window.registerWebviewViewProvider(QueryMapProvider_1.QueryMapProvider.viewType, queryMap));
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    status.command = 'database.pickConnection';
    status.text = '$(database) Database';
    status.show();
    context.subscriptions.push(status, statementRunningDecoration, statementCompletedDecoration, statementFailedDecoration);
    const sqlCodeLensRefresh = new vscode.EventEmitter();
    context.subscriptions.push(sqlCodeLensRefresh);
    context.subscriptions.push(registerSqlCompletions(connectionManager, schemaContext, sectionService, connectionForDocument, context));
    context.subscriptions.push(registerSqlConnectionCodeLens(sqlConnectionLensTitle, sqlCodeLensRefresh.event));
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
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.uri.toString() === event.document.uri.toString()) {
            queryMap.updateFromEditor(editor);
            highlightActiveSqlSection(editor);
        }
        updateSqlDiagnostics(event.document, editor?.selection);
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
        sqlDiagnostics.delete(document.uri);
    }));
    refreshQueryMap();
    void schemaContext.warmFromDisk(connectionManager.getConnections());
    queryMap.updateFromEditor(vscode.window.activeTextEditor);
    queryMap.updateResults(results.getTabs());
    highlightActiveSqlSection(vscode.window.activeTextEditor);
    updateSqlConnectionStatus(vscode.window.activeTextEditor);
    for (const document of vscode.workspace.textDocuments) {
        updateSqlDiagnostics(document);
    }
    const register = (command, callback) => {
        context.subscriptions.push(vscode.commands.registerCommand(command, async (...args) => {
            try {
                return await callback(...args);
            }
            catch (error) {
                logger.error(command, error);
                void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
                return undefined;
            }
        }));
    };
    function refreshQueryMap() {
        queryMap.updateConsoles(activeSessionRecords(), connectionManager.getConnections(), connectionManager.getActiveConnections().map((connection) => connection.config.id));
        void pruneMissingConsoleRecords();
    }
    function activeSessionRecords() {
        const consoles = consoleStore.getAll();
        const consoleUris = new Set(consoles.map((record) => record.documentUri));
        const projectSessions = sqlDocumentConnections.getAll()
            .filter((record) => !!record.lastTouchedAt && !consoleUris.has(record.documentUri))
            .map((record) => ({
            id: projectSqlSessionId(record.documentUri),
            connectionId: record.connectionId,
            documentUri: record.documentUri,
            lastExecutedRange: record.lastExecutedRange,
            lastTouchedAt: record.lastTouchedAt,
            createdAt: record.updatedAt,
            updatedAt: record.updatedAt
        }));
        return [...consoles, ...projectSessions];
    }
    function projectSqlSessionId(documentUri) {
        return `${PROJECT_SQL_SESSION_PREFIX}${encodeURIComponent(documentUri)}`;
    }
    function documentUriFromProjectSqlSessionId(id) {
        if (!id.startsWith(PROJECT_SQL_SESSION_PREFIX)) {
            return undefined;
        }
        try {
            return decodeURIComponent(id.slice(PROJECT_SQL_SESSION_PREFIX.length));
        }
        catch {
            return undefined;
        }
    }
    async function untrackActiveSession(id) {
        const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
        if (projectDocumentUri) {
            await sqlDocumentConnections.delete(projectDocumentUri);
            return;
        }
        await consoleStore.delete(id);
    }
    async function clearActiveSessionsById(ids) {
        const consoleIds = [];
        const projectDocumentUris = [];
        for (const id of ids) {
            const projectDocumentUri = documentUriFromProjectSqlSessionId(id);
            if (projectDocumentUri) {
                projectDocumentUris.push(projectDocumentUri);
            }
            else {
                consoleIds.push(id);
            }
        }
        await consoleStore.deleteMany(consoleIds);
        await Promise.all(projectDocumentUris.map((documentUri) => sqlDocumentConnections.delete(documentUri)));
    }
    function beginDocumentExecution(documentUri) {
        runningDocuments.set(documentUri, (runningDocuments.get(documentUri) ?? 0) + 1);
        queryMap.updateRunningDocuments([...runningDocuments.keys()]);
        return () => {
            const count = (runningDocuments.get(documentUri) ?? 1) - 1;
            if (count > 0) {
                runningDocuments.set(documentUri, count);
            }
            else {
                runningDocuments.delete(documentUri);
            }
            queryMap.updateRunningDocuments([...runningDocuments.keys()]);
        };
    }
    function createStatementStatusUpdater(editor, range, sql) {
        const statements = (0, sqlSplitter_1.splitSqlStatements)(sql);
        const sqlParts = statements.length ? statements : [{ sql, start: 0, end: sql.length }];
        const baseOffset = editor.document.offsetAt(range.start);
        const statuses = sqlParts.map((statement) => ({
            range: new vscode.Range(editor.document.positionAt(baseOffset + statement.start), editor.document.positionAt(baseOffset + statement.start)),
            status: undefined
        }));
        const apply = () => {
            editor.setDecorations(statementRunningDecoration, statuses.filter((item) => item.status === 'running').map((item) => item.range));
            editor.setDecorations(statementCompletedDecoration, statuses.filter((item) => item.status === 'completed').map((item) => item.range));
            editor.setDecorations(statementFailedDecoration, statuses.filter((item) => item.status === 'failed').map((item) => item.range));
        };
        apply();
        return (progress) => {
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
    function queryConsoleHistoryItems() {
        const consoleUris = (0, queryConsoleHistory_1.queryConsoleDocumentUris)(consoleStore.getAll());
        return historyStore.getAll().filter((item) => (0, queryConsoleHistory_1.isQueryConsoleHistoryItem)(item, consoleUris));
    }
    async function markActiveSessionExecuted(documentUri, connectionId, range) {
        if ((0, queryConsoleHistory_1.queryConsoleDocumentUris)(consoleStore.getAll()).has(documentUri)) {
            await consoleStore.markExecuted(documentUri, range);
            return;
        }
        await sqlDocumentConnections.markExecuted(documentUri, connectionId, range);
    }
    async function pruneMissingConsoleRecords() {
        if (pruningMissingConsoles) {
            return;
        }
        pruningMissingConsoles = true;
        try {
            const removed = await consoleStore.pruneMissingDocuments();
            if (removed > 0) {
                queryMap.updateConsoles(activeSessionRecords(), connectionManager.getConnections(), connectionManager.getActiveConnections().map((connection) => connection.config.id));
            }
        }
        finally {
            pruningMissingConsoles = false;
        }
    }
    function documentConnectionBindings() {
        return [...consoleStore.getAll(), ...sqlDocumentConnections.getAll()];
    }
    function resolveConnectionForDocument(document) {
        return (0, documentConnectionResolver_1.resolveDocumentConnection)(document.uri.toString(), documentConnectionBindings(), connectionManager.getConnections());
    }
    function connectionForDocument(document) {
        return resolveConnectionForDocument(document).connection;
    }
    function connectionFromArg(node) {
        const id = connectionIdFromArg(node);
        return id ? connectionManager.getConnection(id) : undefined;
    }
    function connectionIdForDocumentUri(documentUri) {
        return (0, documentConnectionResolver_1.resolveDocumentConnection)(documentUri, documentConnectionBindings(), connectionManager.getConnections()).connection?.id;
    }
    function activeConnectionId() {
        const editor = vscode.window.activeTextEditor;
        return editor?.document.languageId === 'sql' ? connectionForDocument(editor.document)?.id : undefined;
    }
    function syncResultsToEditor(editor) {
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
    function updateSqlConnectionStatus(editor) {
        if (!editor || editor.document.languageId !== 'sql') {
            status.command = 'database.pickConnection';
            status.text = '$(database) Database';
            return;
        }
        const resolved = resolveConnectionForDocument(editor.document);
        status.command = 'database.setSqlFileConnection';
        if (resolved.connection) {
            status.text = `$(database) ${resolved.connection.name}`;
        }
        else if (resolved.isBound) {
            status.text = '$(warning) Missing database';
        }
        else {
            status.text = '$(database) Select Database';
        }
    }
    function sqlConnectionLensTitle(document) {
        const resolved = resolveConnectionForDocument(document);
        if (resolved.connection) {
            return `$(database) Database: ${resolved.connection.name}`;
        }
        if (resolved.isBound) {
            return '$(warning) Database: Missing connection';
        }
        return '$(database) Select Database Connection';
    }
    function recordQueryOutput(tab) {
        const connection = connectionManager.getConnection(tab.connectionId);
        if (connection) {
            queryOutput.record(connection, tab);
        }
    }
    new queryMemoryController_1.QueryMemoryController(context, memoryService, connectionManager, executor, aiAdapter, async (tab) => {
        await results.addTab(tab);
        recordQueryOutput(tab);
        queryMap.updateResults(results.getTabs());
    }).register(register);
    register('database.testQueryMemorySummary', async () => {
        const sql = await vscode.window.showInputBox({
            prompt: 'SQL to summarize with VS Code Language Model',
            value: 'select sum(install) from public.adjust_offer'
        });
        if (!sql) {
            return;
        }
        const summary = await aiAdapter.summarizeQueryMemory({
            sql,
            connectionName: 'Test connection',
            databaseType: 'postgres',
            databaseName: 'test',
            outputColumns: ['sum']
        });
        const doc = await vscode.workspace.openTextDocument({
            language: 'json',
            content: `${JSON.stringify(summary, null, 2)}\n`
        });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    });
    register('database.addConnection', async () => {
        const config = await ConnectionEditorPanel_1.ConnectionEditorPanel.open(context, connectionManager);
        if (!config) {
            return;
        }
        await connectionManager.save(config);
        refreshQueryMap();
        tree.refresh();
    });
    register('database.editConnection', async (node) => {
        const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
        if (!id) {
            return;
        }
        const existing = connectionManager.getConnection(id);
        const next = existing ? await ConnectionEditorPanel_1.ConnectionEditorPanel.open(context, connectionManager, existing) : undefined;
        if (next) {
            await connectionManager.save(next);
            schemaContext.invalidate(id);
            refreshQueryMap();
            tree.refresh();
        }
    });
    register('database.deleteConnection', async (node) => {
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
    register('database.testConnection', async (node) => {
        const id = connectionIdFromArg(node) ?? (await connectionManager.pickConnection())?.id;
        if (!id) {
            return;
        }
        const message = await connectionManager.test(id);
        void vscode.window.showInformationMessage(`Connection successful: ${message}`);
    });
    register('database.connect', async (node) => {
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
    register('database.disconnect', async (node) => {
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
    register('database.refreshExplorer', (node) => {
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
    register('database.showSqlMetadataStatus', () => showSqlMetadataStatus());
    register('database.setSqlFileConnection', (resource) => setSqlFileConnection(resource));
    register('database.pickConnection', async () => {
        const connection = await connectionManager.pickConnection();
        if (connection) {
            await connectionManager.setSelectedConnection(connection.id);
            status.text = `$(database) ${connection.name}`;
        }
    });
    register('database.openSqlConsole', async (node) => {
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
    register('database.openQueryFile', async (node) => {
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
    register('database.executeStatementRange', async (uriText, startLine, startCharacter, endLine, endCharacter) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || typeof uriText !== 'string' || editor.document.uri.toString() !== uriText) {
            return;
        }
        if (![startLine, startCharacter, endLine, endCharacter].every((value) => typeof value === 'number')) {
            return;
        }
        const range = new vscode.Range(new vscode.Position(startLine, startCharacter), new vscode.Position(endLine, endCharacter));
        const selections = selectedSqlDetections(editor);
        if ((0, sqlSelectionExecution_1.shouldRunSelectionForStatement)(selections, range)) {
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
    register('database.cancelCurrentQuery', () => vscode.window.showInformationMessage('Cancellation is available from running result tabs.'));
    register('database.previewTableMetadata', async (node) => {
        if (node instanceof nodes_1.TableNode) {
            void vscode.window.showInformationMessage(`${(0, identifiers_1.qualifiedName)(node.table.schema, node.table.name)} ${node.table.comment ?? ''}`.trim());
        }
    });
    register('database.openTableData', async (node) => {
        if (!(node instanceof nodes_1.TableNode)) {
            return;
        }
        await TableDataPanel_1.TableDataPanel.open(context, connectionManager, node);
    });
    register('database.editTableData', async (node) => {
        if (node instanceof nodes_1.TableNode) {
            await TableDataPanel_1.TableDataPanel.open(context, connectionManager, node);
        }
    });
    register('database.copyName', async (node) => {
        const name = objectName(node);
        if (name) {
            await vscode.env.clipboard.writeText(name);
        }
    });
    register('database.copyQualifiedName', async (node) => {
        const name = qualifiedObjectName(node);
        if (name) {
            await vscode.env.clipboard.writeText(name);
        }
    });
    register('database.showObjectDdl', async (node) => {
        const sql = await objectDdl(connectionManager, node);
        if (sql) {
            await openSqlEditor(connectionManager, `${objectName(node) ?? 'Object'} DDL`, `${sql}\n`);
        }
    });
    register('database.generateSelect', async (node) => {
        const target = tableLikeTarget(node);
        if (target) {
            await openSqlEditor(connectionManager, `SELECT ${target.name}`, `select *\nfrom ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\nlimit 100;\n`);
        }
    });
    register('database.generateInsert', async (node) => {
        const target = tableLikeTarget(node);
        if (!target) {
            return;
        }
        const columns = await connectionManager.getDriver(target.connection.type).getColumns(target.connection.id, target.schema, target.name);
        const writable = columns.filter((column) => !column.defaultValue).map((column) => (0, identifiers_1.quoteIdentifier)(column.name));
        await openSqlEditor(connectionManager, `INSERT ${target.name}`, `insert into ${(0, identifiers_1.qualifiedName)(target.schema, target.name)} (${writable.join(', ')})\nvalues (${writable.map(() => '?').join(', ')});\n`);
    });
    register('database.generateUpdate', async (node) => {
        const target = tableLikeTarget(node);
        if (!target) {
            return;
        }
        await openSqlEditor(connectionManager, `UPDATE ${target.name}`, `update ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\nset ${(0, identifiers_1.quoteIdentifier)('column_name')} = ?\nwhere ${(0, identifiers_1.quoteIdentifier)('id')} = ?;\n`);
    });
    register('database.generateDelete', async (node) => {
        const target = tableLikeTarget(node);
        if (target) {
            await openSqlEditor(connectionManager, `DELETE ${target.name}`, `delete from ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\nwhere ${(0, identifiers_1.quoteIdentifier)('id')} = ?;\n`);
        }
    });
    register('database.modifyTable', async (node) => {
        const target = tableLikeTarget(node);
        if (target) {
            await openSqlEditor(connectionManager, `ALTER ${target.name}`, `alter table ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\n  add column ${(0, identifiers_1.quoteIdentifier)('new_column')} text;\n`);
        }
    });
    register('database.renameObject', async (node) => {
        const sql = renameTemplate(node);
        if (sql) {
            await openSqlEditor(connectionManager, `Rename ${objectName(node)}`, sql);
        }
    });
    register('database.dropObject', async (node) => {
        const sql = dropTemplate(node);
        if (sql) {
            await openSqlEditor(connectionManager, `Drop ${objectName(node)}`, sql);
        }
    });
    register('database.newObject', async (node) => {
        const picked = await vscode.window.showQuickPick([
            { label: 'Query Console', command: 'database.openSqlConsole' },
            { label: 'Query File...', command: 'database.openQueryFile' },
            { label: 'Table', command: 'database.newTable' },
            { label: 'View', command: 'database.newView' },
            { label: 'Materialized View', command: 'database.newMaterializedView' },
            { label: 'Column', command: 'database.newColumn' },
            { label: 'Index', command: 'database.newIndex' },
            { label: 'Unique Key', command: 'database.newUniqueKey' },
            { label: 'Foreign Key', command: 'database.newForeignKey' },
            { label: 'Check', command: 'database.newCheck' },
            { label: 'Schema', command: 'database.newSchema' },
            { label: 'Sequence', command: 'database.newSequence' }
        ], { placeHolder: 'New database object' });
        if (picked) {
            await vscode.commands.executeCommand(picked.command, node);
        }
    });
    register('database.newTable', async (node) => openSqlEditor(connectionManager, 'New Table', newObjectTemplate(node, 'table')));
    register('database.newView', async (node) => openSqlEditor(connectionManager, 'New View', newObjectTemplate(node, 'view')));
    register('database.newMaterializedView', async (node) => openSqlEditor(connectionManager, 'New Materialized View', newObjectTemplate(node, 'materialized_view')));
    register('database.newColumn', async (node) => openSqlEditor(connectionManager, 'New Column', newObjectTemplate(node, 'column')));
    register('database.newIndex', async (node) => openSqlEditor(connectionManager, 'New Index', newObjectTemplate(node, 'index')));
    register('database.newUniqueKey', async (node) => openSqlEditor(connectionManager, 'New Unique Key', newObjectTemplate(node, 'unique_key')));
    register('database.newForeignKey', async (node) => openSqlEditor(connectionManager, 'New Foreign Key', newObjectTemplate(node, 'foreign_key')));
    register('database.newCheck', async (node) => openSqlEditor(connectionManager, 'New Check', newObjectTemplate(node, 'check')));
    register('database.newSchema', async (node) => openSqlEditor(connectionManager, 'New Schema', newObjectTemplate(node, 'schema')));
    register('database.newSequence', async (node) => openSqlEditor(connectionManager, 'New Sequence', newObjectTemplate(node, 'sequence')));
    register('database.quickDocumentation', async (node) => {
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
                { label: 'Open in Console', action: 'open' },
                { label: picked.item.favorite ? 'Remove Favorite' : 'Favorite', action: 'favorite' },
                { label: 'Copy SQL', action: 'copy' },
                { label: 'Delete', action: 'delete' }
            ], { placeHolder: 'History action' });
            if (action?.action === 'open') {
                await openHistoryItem(picked.item);
            }
            else if (action?.action === 'favorite') {
                await historyStore.update({ ...picked.item, favorite: !picked.item.favorite });
            }
            else if (action?.action === 'copy') {
                await vscode.env.clipboard.writeText(picked.item.sql);
            }
            else if (action?.action === 'delete') {
                await historyStore.delete(picked.item.id);
            }
        }
    });
    register('database.aiFixSql', () => runAi('fix'));
    register('database.aiExplainSql', () => runAi('explain'));
    async function executeFromEditor(mode, options = {}) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selectedDetections = mode === 'file' ? [] : selectedSqlDetections(editor);
        let detections;
        if (mode === 'file') {
            detections = [{ sql: editor.document.getText(), range: new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
        }
        else if (mode === 'run') {
            const detected = sectionService.detectExecutable(editor.document, editor.selection);
            detections = selectedDetections.length > 0
                ? selectedDetections
                : detected
                    ? [detected]
                    : [{ sql: editor.document.getText(), range: new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }];
        }
        else if (mode === 'selection' || selectedDetections.length > 0) {
            detections = selectedDetections;
        }
        else {
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
    async function executeActiveMultiStatementSelection(maxRows) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql') {
            return false;
        }
        const selections = selectedSqlDetections(editor);
        if (!selections.some((selection) => (0, sqlSplitter_1.splitSqlStatements)(selection.sql).length > 1)) {
            return false;
        }
        await executeFromEditor('selection', { maxRows });
        return true;
    }
    function highlightActiveSqlSection(editor) {
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
    function selectedSqlDetections(editor) {
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
    function updateSqlDiagnostics(document, selection) {
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
    async function showSqlMetadataStatus() {
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
    async function warmSqlMetadata(connection, surface) {
        try {
            await (0, sqlMetadataWarmup_1.connectAndRefreshSqlMetadata)(connectionManager, schemaContext, connection);
        }
        catch (error) {
            void vscode.window.showWarningMessage(`${surface} is bound to ${connection.name}, but metadata refresh could not connect: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async function setSqlFileConnection(resource) {
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
        }
        catch (error) {
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
    async function sqlDocumentFromArg(resource) {
        const document = resource instanceof vscode.Uri
            ? await vscode.workspace.openTextDocument(resource)
            : vscode.window.activeTextEditor?.document;
        if (!document) {
            return undefined;
        }
        const isSqlFile = document.languageId === 'sql' || document.uri.fsPath.toLowerCase().endsWith('.sql');
        return isSqlFile ? document : undefined;
    }
    async function executeDetected(editor, detected, options = {}) {
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
        const decoration = vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground') });
        editor.setDecorations(decoration, [detected.range]);
        let endDocumentExecution;
        try {
            const maxRows = options.maxRows ?? configuredDefaultMaxRows();
            const documentUri = editor.document.uri.toString();
            const sourceOrigin = (0, queryConsoleHistory_1.executionOriginForDocument)(documentUri, (0, queryConsoleHistory_1.queryConsoleDocumentUris)(consoleStore.getAll()));
            const executedRange = {
                startLine: detected.range.start.line,
                startColumn: detected.range.start.character,
                endLine: detected.range.end.line,
                endColumn: detected.range.end.character
            };
            await markActiveSessionExecuted(documentUri, connection.id, executedRange);
            refreshQueryMap();
            endDocumentExecution = beginDocumentExecution(documentUri);
            const statementCount = (0, sqlSplitter_1.splitSqlStatements)(detected.sql).length || 1;
            const updateStatementStatus = createStatementStatusUpdater(editor, detected.range, detected.sql);
            queryOutput.recordExecutionStarted(connection, editor.document.fileName, statementCount);
            const tab = await executor.execute({
                connectionId: connection.id,
                sql: detected.sql,
                onProgress: (progress) => {
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
            await results.addTab(tab, { forceNew: options.forceNewResultTab });
            recordQueryOutput(tab);
            await highlighter.reveal(documentUri, rangeToPlain(detected.range), detected.sql);
            queryMap.updateResults(results.getTabs());
            await markActiveSessionExecuted(documentUri, connection.id, executedRange);
            refreshQueryMap();
            status.text = `$(database) ${connection.name} ${tab.executionTimeMs ?? 0}ms`;
        }
        finally {
            endDocumentExecution?.();
            decoration.dispose();
        }
    }
    async function runAi(action) {
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
    async function openHistoryItem(item) {
        if (item.documentUri) {
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(item.documentUri));
                const editor = await vscode.window.showTextDocument(doc, { preview: false });
                if (item.sourceRange) {
                    const range = rangeFromPlain(item.sourceRange);
                    editor.selection = new vscode.Selection(range.start, range.end);
                    editor.revealRange(range);
                }
                results.setActiveConnection(item.connectionId);
                refreshQueryMap();
                return;
            }
            catch {
                // Fall back to opening the SQL in a durable console below.
            }
        }
        const doc = await consoleStore.openOrCreate(connectionManager.getConnection(item.connectionId), `${item.sql}\n`);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        if (doc.getText().trim().length === 0) {
            await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), `${item.sql}\n`));
        }
        results.setActiveConnection(item.connectionId);
        refreshQueryMap();
    }
    async function revealSourceForTab(tab) {
        if (!tab.sourceDocumentUri || !tab.sourceRange) {
            return;
        }
        await highlighter.reveal(tab.sourceDocumentUri, tab.sourceRange, tab.queryText);
        const editor = vscode.window.activeTextEditor;
        queryMap.updateFromEditor(editor?.document.uri.toString() === tab.sourceDocumentUri ? editor : undefined);
    }
}
function deactivate() { }
function connectionIdFromArg(value) {
    const maybe = value;
    return maybe?.connection?.id ?? maybe?.id;
}
function databaseNodeFromArg(value) {
    if (value instanceof nodes_1.CatalogNode
        || value instanceof nodes_1.ColumnNode
        || value instanceof nodes_1.ConnectionNode
        || value instanceof nodes_1.FolderNode
        || value instanceof nodes_1.SchemaNode
        || value instanceof nodes_1.SchemasNode
        || value instanceof nodes_1.TableNode
        || value instanceof nodes_1.ViewNode) {
        return value;
    }
    return undefined;
}
function trimSelection(document, selection) {
    const text = document.getText(selection);
    const leading = text.match(/^\s*/)?.[0].length ?? 0;
    const trailing = text.match(/\s*$/)?.[0].length ?? 0;
    const startOffset = document.offsetAt(selection.start) + leading;
    const endOffset = document.offsetAt(selection.end) - trailing;
    return new vscode.Range(document.positionAt(startOffset), document.positionAt(Math.max(startOffset, endOffset)));
}
function compareRanges(a, b) {
    return a.start.compareTo(b.start) || a.end.compareTo(b.end);
}
function metadataProblem(status) {
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
function metadataCause(status) {
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
function metadataFix(status) {
    if (status.entry?.status === 'ready') {
        return 'No action needed.';
    }
    if (status.connected) {
        return 'Wait for the background refresh or run Database: Refresh Database Explorer.';
    }
    return 'Connect this database, then open a query console or run Database: Refresh Database Explorer.';
}
function formatAge(ageMs) {
    if (ageMs < 60_000) {
        return `${Math.max(0, Math.round(ageMs / 1000))}s`;
    }
    if (ageMs < 60 * 60_000) {
        return `${Math.round(ageMs / 60_000)}m`;
    }
    return `${Math.round(ageMs / (60 * 60_000))}h`;
}
function registerSqlCompletions(connectionManager, schemaContext, sectionService, getConnectionForDocument, context) {
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
            }
            catch {
                return items;
            }
            return items;
        }
    }, '.', ' ', '"');
}
async function getMetadataCompletionItems(connectionManager, schemaContext, sectionService, config, document, position, linePrefix) {
    const defaultSchema = config.defaultSchema ?? 'public';
    if (connectionManager.isConnected(config.id)) {
        schemaContext.refreshDefaultSchemaInBackground(config);
    }
    const section = sectionService.detect(document, new vscode.Selection(position, position));
    const relationContext = (0, sqlMetadataCompletion_1.relationCompletionContext)(linePrefix);
    if (relationContext?.schema) {
        const entry = await schemaContext.getCachedForConnection(config, defaultSchema);
        if (!entry || !['ready', 'stale', 'error'].includes(entry.status)) {
            return [];
        }
        return (0, sqlMetadataCompletion_1.relationCompletionCandidates)(entry, relationContext).slice(0, 300).map((relation) => {
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
    if (section && (0, sqlMetadataCompletion_1.selectListColumnCompletionContext)(document.getText(new vscode.Range(section.range.start, position)))) {
        return getSectionColumnCompletionItems(schemaContext, config, section.tables, defaultSchema);
    }
    const entry = await schemaContext.getCachedForConnection(config, defaultSchema);
    if (!entry || !['ready', 'stale', 'error'].includes(entry.status)) {
        return [];
    }
    const items = [];
    for (const schema of entry.schemas.slice(0, 30)) {
        items.push(new vscode.CompletionItem(schema.name, vscode.CompletionItemKind.Module));
    }
    for (const table of [...entry.tables, ...entry.views].slice(0, 300)) {
        const tableItem = new vscode.CompletionItem(table.name, vscode.CompletionItemKind.Struct);
        tableItem.detail = `${table.schema}.${table.name}`;
        tableItem.insertText = table.name;
        items.push(tableItem);
    }
    if (/\bwhere\s+[\w"]*$/i.test(linePrefix) && section) {
        items.push(...await getSectionColumnCompletionItems(schemaContext, config, section.tables, defaultSchema));
    }
    return filterMetadataItems(items, linePrefix);
}
async function getSectionColumnCompletionItems(schemaContext, config, tables, defaultSchema) {
    const items = [];
    for (const table of tables.slice(0, 8)) {
        const columns = await schemaContext.getCachedColumns(config, table.schema ?? defaultSchema, table.table) ?? [];
        for (const column of columns) {
            const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
            item.detail = column.dataType;
            item.insertText = column.name;
            items.push(item);
        }
    }
    return items.slice(0, 300);
}
async function showFirstSchemaCompletionMessage(context, connection) {
    const key = `database.schemaCompletionReady.${connection.id}`;
    if (context.globalState.get(key)) {
        return;
    }
    await context.globalState.update(key, true);
    void vscode.window.showInformationMessage(`Schema-backed SQL completions are ready for ${connection.name}.`);
}
function filterMetadataItems(items, linePrefix) {
    if (/\b(from|join|update|into)\s+[\w"]*$/i.test(linePrefix) || /\.$/.test(linePrefix)) {
        return items;
    }
    return items.filter((item) => item.kind === vscode.CompletionItemKind.Keyword);
}
function registerSqlConnectionCodeLens(connectionLensTitle, refreshEvent) {
    const emitter = new vscode.EventEmitter();
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
            return [
                new vscode.CodeLens(top, {
                    title: '$(run-all) EXECUTE FILE / SELECTION',
                    tooltip: 'Run the active selection, the SQL block under the cursor, or the whole file.',
                    command: 'database.executeFile'
                }),
                new vscode.CodeLens(top, {
                    title: connectionLensTitle(document),
                    tooltip: 'Select the database connection for this SQL file',
                    command: 'database.setSqlFileConnection',
                    arguments: [document.uri]
                })
            ];
        }
    });
    return refreshEvents
        ? vscode.Disposable.from(documentEvents, refreshEvents, provider, emitter)
        : vscode.Disposable.from(documentEvents, provider, emitter);
}
function stripQuotes(value) {
    return value.replace(/^"|"$/g, '');
}
function rangeFromPlain(range) {
    return (0, sqlSectionHighlighter_1.rangeFromPlain)(range);
}
function rangeToPlain(range) {
    return {
        startLine: range.start.line,
        startColumn: range.start.character,
        endLine: range.end.line,
        endColumn: range.end.character
    };
}
async function openSqlEditor(connectionManager, title, content = '') {
    const connection = connectionManager.getPreferredConnection();
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
}
function configuredDefaultMaxRows() {
    const maxRows = vscode.workspace.getConfiguration('database').get('defaultMaxRows', 500);
    return Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
}
function objectName(node) {
    if (node instanceof nodes_1.ConnectionNode) {
        return node.connection.name;
    }
    if (node instanceof nodes_1.CatalogNode) {
        return node.connection.database;
    }
    if (node instanceof nodes_1.SchemaNode) {
        return node.schema.name;
    }
    if (node instanceof nodes_1.FolderNode) {
        return node.tableName ?? node.schema;
    }
    if (node instanceof nodes_1.TableNode) {
        return node.table.name;
    }
    if (node instanceof nodes_1.ViewNode) {
        return node.view.name;
    }
    if (node instanceof nodes_1.ColumnNode) {
        return node.column.name;
    }
    return undefined;
}
function qualifiedObjectName(node) {
    if (node instanceof nodes_1.SchemaNode) {
        return (0, identifiers_1.quoteIdentifier)(node.schema.name);
    }
    if (node instanceof nodes_1.FolderNode && node.tableName) {
        return (0, identifiers_1.qualifiedName)(node.schema, node.tableName);
    }
    if (node instanceof nodes_1.TableNode) {
        return (0, identifiers_1.qualifiedName)(node.table.schema, node.table.name);
    }
    if (node instanceof nodes_1.ViewNode) {
        return (0, identifiers_1.qualifiedName)(node.view.schema, node.view.name);
    }
    if (node instanceof nodes_1.ColumnNode) {
        return `${(0, identifiers_1.qualifiedName)(node.column.schema, node.column.table)}.${(0, identifiers_1.quoteIdentifier)(node.column.name)}`;
    }
    if (node instanceof nodes_1.CatalogNode || node instanceof nodes_1.ConnectionNode) {
        return node.connection.database;
    }
    return objectName(node);
}
function tableLikeTarget(node) {
    if (node instanceof nodes_1.TableNode) {
        return { connection: node.connection, schema: node.table.schema, name: node.table.name, kind: 'table' };
    }
    if (node instanceof nodes_1.ViewNode) {
        return { connection: node.connection, schema: node.view.schema, name: node.view.name, kind: 'view' };
    }
    if (node instanceof nodes_1.FolderNode && node.tableName) {
        return { connection: node.connection, schema: node.schema, name: node.tableName, kind: 'table' };
    }
    if (node instanceof nodes_1.ColumnNode) {
        return { connection: node.connection, schema: node.column.schema, name: node.column.table, kind: 'table' };
    }
    return undefined;
}
async function objectDdl(connectionManager, node) {
    if (node instanceof nodes_1.TableNode) {
        if (!connectionManager.isConnected(node.connection.id)) {
            await connectionManager.connect(node.connection.id);
        }
        return connectionManager.getDriver(node.connection.type).getTableDDL(node.connection.id, node.table.schema, node.table.name);
    }
    if (node instanceof nodes_1.ViewNode) {
        return `-- View DDL template\ncreate or replace view ${(0, identifiers_1.qualifiedName)(node.view.schema, node.view.name)} as\nselect ...;\n`;
    }
    if (node instanceof nodes_1.SchemaNode) {
        return `create schema if not exists ${(0, identifiers_1.quoteIdentifier)(node.schema.name)};\n`;
    }
    return undefined;
}
function schemaFromNode(node) {
    if (node instanceof nodes_1.SchemaNode) {
        return { schema: node.schema.name, connection: node.connection };
    }
    if (node instanceof nodes_1.FolderNode) {
        return { schema: node.schema, connection: node.connection };
    }
    if (node instanceof nodes_1.TableNode) {
        return { schema: node.table.schema, connection: node.connection };
    }
    if (node instanceof nodes_1.ViewNode) {
        return { schema: node.view.schema, connection: node.connection };
    }
    if (node instanceof nodes_1.ColumnNode) {
        return { schema: node.column.schema, connection: node.connection };
    }
    const connection = node instanceof nodes_1.ConnectionNode || node instanceof nodes_1.CatalogNode ? node.connection : undefined;
    return { schema: connection?.defaultSchema ?? 'public', connection };
}
function newObjectTemplate(node, type) {
    const { schema } = schemaFromNode(node);
    const table = tableLikeTarget(node);
    if (type === 'table') {
        return `create table ${(0, identifiers_1.qualifiedName)(schema, 'new_table')} (\n  id bigserial primary key,\n  created_at timestamp not null default now()\n);\n`;
    }
    if (type === 'view') {
        return `create or replace view ${(0, identifiers_1.qualifiedName)(schema, 'new_view')} as\nselect *\nfrom ${(0, identifiers_1.qualifiedName)(schema, 'source_table')};\n`;
    }
    if (type === 'materialized_view') {
        return `create materialized view ${(0, identifiers_1.qualifiedName)(schema, 'new_materialized_view')} as\nselect *\nfrom ${(0, identifiers_1.qualifiedName)(schema, 'source_table')};\n`;
    }
    if (type === 'column') {
        const target = table ?? { schema, name: 'table_name' };
        return `alter table ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\n  add column ${(0, identifiers_1.quoteIdentifier)('new_column')} text;\n`;
    }
    if (type === 'index') {
        const target = table ?? { schema, name: 'table_name' };
        return `create index ${(0, identifiers_1.quoteIdentifier)(`idx_${target.name}_column`)}\non ${(0, identifiers_1.qualifiedName)(target.schema, target.name)} (${(0, identifiers_1.quoteIdentifier)('column_name')});\n`;
    }
    if (type === 'unique_key') {
        const target = table ?? { schema, name: 'table_name' };
        return `alter table ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\n  add constraint ${(0, identifiers_1.quoteIdentifier)(`${target.name}_column_key`)} unique (${(0, identifiers_1.quoteIdentifier)('column_name')});\n`;
    }
    if (type === 'foreign_key') {
        const target = table ?? { schema, name: 'table_name' };
        return `alter table ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\n  add constraint ${(0, identifiers_1.quoteIdentifier)(`${target.name}_fk`)} foreign key (${(0, identifiers_1.quoteIdentifier)('column_name')})\n  references ${(0, identifiers_1.qualifiedName)(schema, 'referenced_table')} (${(0, identifiers_1.quoteIdentifier)('id')});\n`;
    }
    if (type === 'check') {
        const target = table ?? { schema, name: 'table_name' };
        return `alter table ${(0, identifiers_1.qualifiedName)(target.schema, target.name)}\n  add constraint ${(0, identifiers_1.quoteIdentifier)(`${target.name}_check`)} check (${(0, identifiers_1.quoteIdentifier)('column_name')} is not null);\n`;
    }
    if (type === 'schema') {
        return `create schema ${(0, identifiers_1.quoteIdentifier)('new_schema')};\n`;
    }
    if (type === 'sequence') {
        return `create sequence ${(0, identifiers_1.qualifiedName)(schema, 'new_sequence')}\n  start with 1\n  increment by 1;\n`;
    }
    return '';
}
function renameTemplate(node) {
    if (node instanceof nodes_1.TableNode) {
        return `alter table ${(0, identifiers_1.qualifiedName)(node.table.schema, node.table.name)}\n  rename to ${(0, identifiers_1.quoteIdentifier)(`${node.table.name}_new`)};\n`;
    }
    if (node instanceof nodes_1.ViewNode) {
        return `alter view ${(0, identifiers_1.qualifiedName)(node.view.schema, node.view.name)}\n  rename to ${(0, identifiers_1.quoteIdentifier)(`${node.view.name}_new`)};\n`;
    }
    if (node instanceof nodes_1.SchemaNode) {
        return `alter schema ${(0, identifiers_1.quoteIdentifier)(node.schema.name)}\n  rename to ${(0, identifiers_1.quoteIdentifier)(`${node.schema.name}_new`)};\n`;
    }
    if (node instanceof nodes_1.ColumnNode) {
        return `alter table ${(0, identifiers_1.qualifiedName)(node.column.schema, node.column.table)}\n  rename column ${(0, identifiers_1.quoteIdentifier)(node.column.name)} to ${(0, identifiers_1.quoteIdentifier)(`${node.column.name}_new`)};\n`;
    }
    return undefined;
}
function dropTemplate(node) {
    if (node instanceof nodes_1.TableNode) {
        return `drop table ${(0, identifiers_1.qualifiedName)(node.table.schema, node.table.name)};\n`;
    }
    if (node instanceof nodes_1.ViewNode) {
        return `drop view ${(0, identifiers_1.qualifiedName)(node.view.schema, node.view.name)};\n`;
    }
    if (node instanceof nodes_1.SchemaNode) {
        return `drop schema ${(0, identifiers_1.quoteIdentifier)(node.schema.name)};\n`;
    }
    if (node instanceof nodes_1.ColumnNode) {
        return `alter table ${(0, identifiers_1.qualifiedName)(node.column.schema, node.column.table)}\n  drop column ${(0, identifiers_1.quoteIdentifier)(node.column.name)};\n`;
    }
    return undefined;
}
async function quickDocumentation(connectionManager, node) {
    if (node instanceof nodes_1.TableNode) {
        if (!connectionManager.isConnected(node.connection.id)) {
            await connectionManager.connect(node.connection.id);
        }
        const columns = await connectionManager.getDriver(node.connection.type).getColumns(node.connection.id, node.table.schema, node.table.name);
        return `${(0, identifiers_1.qualifiedName)(node.table.schema, node.table.name)}\n${columns.map((column) => `${column.name} ${column.dataType}${column.nullable ? '' : ' not null'}`).join('\n')}`;
    }
    if (node instanceof nodes_1.ColumnNode) {
        return `${(0, identifiers_1.qualifiedName)(node.column.schema, node.column.table)}.${(0, identifiers_1.quoteIdentifier)(node.column.name)}\n${node.column.dataType}${node.column.nullable ? '' : ' not null'}`;
    }
    return qualifiedObjectName(node);
}
//# sourceMappingURL=extension.js.map