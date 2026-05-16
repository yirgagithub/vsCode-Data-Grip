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
const DatabaseTreeProvider_1 = require("./explorer/DatabaseTreeProvider");
const nodes_1 = require("./explorer/nodes");
const connectionStore_1 = require("./persistence/connectionStore");
const queryConsoleStore_1 = require("./persistence/queryConsoleStore");
const queryHistoryStore_1 = require("./persistence/queryHistoryStore");
const resultSessionStore_1 = require("./persistence/resultSessionStore");
const schemaContextService_1 = require("./services/schemaContextService");
const sqlSectionHighlighter_1 = require("./services/sqlSectionHighlighter");
const sqlSectionService_1 = require("./services/sqlSectionService");
const vsCodeLanguageModelSqlAdapter_1 = require("./ai/vsCodeLanguageModelSqlAdapter");
const ConnectionEditorPanel_1 = require("./webviews/connection/ConnectionEditorPanel");
const QueryMapProvider_1 = require("./webviews/queryMap/QueryMapProvider");
const ResultsPanelProvider_1 = require("./webviews/results/ResultsPanelProvider");
const TableDataPanel_1 = require("./webviews/table/TableDataPanel");
const logger_1 = require("./utils/logger");
const identifiers_1 = require("./utils/identifiers");
function activate(context) {
    const logger = new logger_1.Logger();
    const connectionStore = new connectionStore_1.ConnectionStore(context);
    const connectionManager = new connectionManager_1.ConnectionManager(connectionStore);
    const historyStore = new queryHistoryStore_1.QueryHistoryStore(context);
    const consoleStore = new queryConsoleStore_1.QueryConsoleStore(context);
    const executor = new queryExecutor_1.QueryExecutor(connectionManager, historyStore);
    const resultStore = new resultSessionStore_1.ResultSessionStore(context);
    const schemaContext = new schemaContextService_1.SchemaContextService(connectionManager);
    const sectionService = new sqlSectionService_1.SqlSectionService();
    const highlighter = new sqlSectionHighlighter_1.SqlSectionHighlighter();
    const aiAdapter = new vsCodeLanguageModelSqlAdapter_1.VsCodeLanguageModelSqlAdapter();
    let queryMap;
    const results = new ResultsPanelProvider_1.ResultsPanelProvider(context, resultStore, executor, async (tab) => revealSourceForTab(tab), (tabs) => queryMap?.updateResults(tabs));
    queryMap = new QueryMapProvider_1.QueryMapProvider(sectionService, async (documentUri, section) => {
        await highlighter.reveal(documentUri, rangeToPlain(section.range), section.sql);
    }, async (documentUri, section) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'sql' || editor.document.uri.toString() !== documentUri) {
            return;
        }
        await executeDetected(editor, section);
    });
    const tree = new DatabaseTreeProvider_1.DatabaseTreeProvider(connectionManager);
    const treeView = vscode.window.createTreeView('databaseExplorer', { treeDataProvider: tree, showCollapseAll: true });
    context.subscriptions.push(treeView, highlighter, vscode.window.registerWebviewViewProvider(ResultsPanelProvider_1.ResultsPanelProvider.viewType, results), vscode.window.registerWebviewViewProvider(QueryMapProvider_1.QueryMapProvider.viewType, queryMap));
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    status.command = 'database.pickConnection';
    status.text = '$(database) Database';
    status.show();
    context.subscriptions.push(status);
    context.subscriptions.push(registerSqlCompletions(connectionManager, schemaContext, sectionService));
    context.subscriptions.push(registerSqlStatementCodeLens(sectionService));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        queryMap.updateFromEditor(editor);
        highlighter.refreshVisibleEditors();
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.uri.toString() === event.document.uri.toString()) {
            queryMap.updateFromEditor(editor);
            highlighter.clear(event.document.uri.toString());
        }
    }));
    queryMap.updateConsoles(consoleStore.getAll(), connectionManager.getConnections());
    queryMap.updateFromEditor(vscode.window.activeTextEditor);
    queryMap.updateResults(results.getTabs());
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
    register('database.addConnection', async () => {
        const config = await ConnectionEditorPanel_1.ConnectionEditorPanel.open(context, connectionManager);
        if (!config) {
            return;
        }
        await connectionManager.save(config);
        queryMap.updateConsoles(consoleStore.getAll(), connectionManager.getConnections());
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
            queryMap.updateConsoles(consoleStore.getAll(), connectionManager.getConnections());
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
            queryMap.updateConsoles(consoleStore.getAll(), connectionManager.getConnections());
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
        tree.refresh();
    });
    register('database.refreshExplorer', () => {
        schemaContext.invalidate();
        tree.refresh();
    });
    register('database.showResults', () => results.show());
    register('database.focusResults', () => results.show());
    register('database.focusExplorer', () => vscode.commands.executeCommand('databaseExplorer.focus'));
    register('database.pickConnection', async () => {
        const connection = await connectionManager.pickConnection();
        if (connection) {
            await connectionManager.setSelectedConnection(connection.id);
            status.text = `$(database) ${connection.name}`;
        }
    });
    register('database.openSqlConsole', async () => {
        const connection = connectionManager.getPreferredConnection() ?? await connectionManager.pickConnection();
        const doc = await consoleStore.openOrCreate(connection, '', { reuse: false });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
        queryMap.updateConsoles(consoleStore.getAll(), connectionManager.getConnections());
        queryMap.updateFromEditor(vscode.window.activeTextEditor);
    });
    register('database.openQueryFile', async () => {
        const connection = connectionManager.getPreferredConnection();
        const doc = await consoleStore.openOrCreate(connection, '', { reuse: false });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
        queryMap.updateConsoles(consoleStore.getAll(), connectionManager.getConnections());
        queryMap.updateFromEditor(vscode.window.activeTextEditor);
    });
    register('database.executeCurrentQuery', () => executeFromEditor('smart'));
    register('database.executeSelection', () => executeFromEditor('selection'));
    register('database.executeFile', () => executeFromEditor('file'));
    register('database.executeStatementRange', async (uriText, startLine, startCharacter, endLine, endCharacter) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || typeof uriText !== 'string' || editor.document.uri.toString() !== uriText) {
            return;
        }
        if (![startLine, startCharacter, endLine, endCharacter].every((value) => typeof value === 'number')) {
            return;
        }
        const range = new vscode.Range(new vscode.Position(startLine, startCharacter), new vscode.Position(endLine, endCharacter));
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
        const picked = await vscode.window.showQuickPick(historyStore.getAll()
            .filter((item) => !connection || item.connectionId === connection.id)
            .map((item) => ({
            label: `${item.favorite ? '$(star-full) ' : ''}${item.sql.replace(/\s+/g, ' ').slice(0, 90)}`,
            description: `${item.status}${item.rowCount !== undefined ? ` - ${item.rowCount} rows` : ''}`,
            detail: `${new Date(item.executedAt).toLocaleString()}${item.sourceFile ? ` - ${item.sourceFile}` : ''}`,
            item
        })), { placeHolder: 'Query history', matchOnDetail: true });
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
    async function executeFromEditor(mode) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const detected = mode === 'file'
            ? { sql: editor.document.getText(), range: new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }
            : mode === 'selection'
                ? sectionService.detect(editor.document, editor.selection)
                : sectionService.detect(editor.document, editor.selection);
        if (!detected?.sql.trim()) {
            void vscode.window.showInformationMessage('No SQL section to run.');
            return;
        }
        await executeDetected(editor, detected);
    }
    async function executeDetected(editor, detected) {
        const connection = connectionManager.getPreferredConnection() ?? await connectionManager.pickConnection();
        if (!connection) {
            return;
        }
        const decoration = vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground') });
        editor.setDecorations(decoration, [detected.range]);
        try {
            const maxRows = configuredDefaultMaxRows();
            const tab = await executor.execute({
                connectionId: connection.id,
                sql: detected.sql,
                maxRows,
                source: {
                    fileName: editor.document.fileName,
                    documentUri: editor.document.uri.toString(),
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
            await results.addTab(tab);
            await highlighter.reveal(editor.document.uri.toString(), rangeToPlain(detected.range), detected.sql);
            queryMap.updateResults(results.getTabs());
            await consoleStore.markExecuted(editor.document.uri.toString(), {
                startLine: detected.range.start.line,
                startColumn: detected.range.start.character,
                endLine: detected.range.end.line,
                endColumn: detected.range.end.character
            });
            status.text = `$(database) ${connection.name} ${tab.executionTimeMs ?? 0}ms`;
        }
        finally {
            decoration.dispose();
        }
    }
    async function runAi(action) {
        const editor = vscode.window.activeTextEditor;
        const connection = connectionManager.getPreferredConnection();
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
function registerSqlCompletions(connectionManager, schemaContext, sectionService) {
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
            const connection = connectionManager.getPreferredConnection();
            if (!connection || !connectionManager.isConnected(connection.id)) {
                return items;
            }
            try {
                items.push(...await getMetadataCompletionItems(connectionManager, schemaContext, sectionService, connection.id, document, position, linePrefix));
            }
            catch {
                return items;
            }
            return items;
        }
    }, '.', ' ', '"');
}
function registerSqlStatementCodeLens(sectionService) {
    const emitter = new vscode.EventEmitter();
    const documentEvents = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'sql') {
            emitter.fire();
        }
    });
    const provider = vscode.languages.registerCodeLensProvider('sql', {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document) {
            return sectionService.getSections(document).map((section, index) => {
                const preview = section.sql.replace(/\s+/g, ' ').slice(0, 72);
                return new vscode.CodeLens(section.range, {
                    title: `$(play) Run Query ${index + 1}`,
                    tooltip: preview,
                    command: 'database.executeStatementRange',
                    arguments: [
                        document.uri.toString(),
                        section.range.start.line,
                        section.range.start.character,
                        section.range.end.line,
                        section.range.end.character
                    ]
                });
            });
        }
    });
    return vscode.Disposable.from(documentEvents, provider, emitter);
}
async function getMetadataCompletionItems(connectionManager, schemaContext, sectionService, connectionId, document, position, linePrefix) {
    const config = connectionManager.getConnection(connectionId);
    if (!config) {
        return [];
    }
    const section = sectionService.detect(document, new vscode.Selection(position, position));
    const aliasTarget = linePrefix.match(/(?:"([^"]+)"|(\w+))\.$/);
    if (aliasTarget) {
        const alias = stripQuotes(aliasTarget[1] ?? aliasTarget[2]);
        const target = section?.aliases.find((item) => item.alias === alias || item.table === alias);
        const schema = target?.schema ?? config.defaultSchema ?? 'public';
        const table = target?.table ?? alias;
        const columns = await schemaContext.getColumns(config, schema, table);
        return columns.map((column) => {
            const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
            item.detail = column.dataType;
            item.insertText = column.name;
            return item;
        });
    }
    const entry = await schemaContext.loadDefaultSchema(config);
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
        for (const table of section.tables.slice(0, 8)) {
            const columns = await schemaContext.getColumns(config, table.schema ?? config.defaultSchema ?? 'public', table.table);
            for (const column of columns) {
                const item = new vscode.CompletionItem(column.name, vscode.CompletionItemKind.Field);
                item.detail = column.dataType;
                items.push(item);
            }
        }
    }
    return filterMetadataItems(items, linePrefix);
}
function filterMetadataItems(items, linePrefix) {
    if (/\b(from|join|update|into)\s+[\w"]*$/i.test(linePrefix) || /\.$/.test(linePrefix)) {
        return items;
    }
    return items.filter((item) => item.kind === vscode.CompletionItemKind.Keyword);
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