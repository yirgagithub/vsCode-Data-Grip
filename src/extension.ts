import * as vscode from 'vscode';
import { ConnectionManager } from './database/connectionManager';
import { QueryExecutor } from './database/queryExecutor';
import { DatabaseTreeProvider } from './explorer/DatabaseTreeProvider';
import { CatalogNode, ColumnNode, ConnectionNode, FolderNode, SchemaNode, TableNode, ViewNode } from './explorer/nodes';
import { ConnectionStore } from './persistence/connectionStore';
import { QueryConsoleStore } from './persistence/queryConsoleStore';
import { QueryHistoryStore } from './persistence/queryHistoryStore';
import { QueryMemoryStore } from './persistence/queryMemoryStore';
import { ResultSessionStore } from './persistence/resultSessionStore';
import { QueryMemoryService } from './services/queryMemoryService';
import { SchemaContextService } from './services/schemaContextService';
import { SqlDiagnosticsService } from './services/sqlDiagnosticsService';
import { rangeFromPlain as rangeFromSource, SqlSectionHighlighter } from './services/sqlSectionHighlighter';
import { SqlSectionService } from './services/sqlSectionService';
import { VsCodeLanguageModelSqlAdapter } from './ai/vsCodeLanguageModelSqlAdapter';
import { QueryMemoryController } from './controllers/queryMemoryController';
import { ConnectionEditorPanel } from './webviews/connection/ConnectionEditorPanel';
import { QueryMapProvider } from './webviews/queryMap/QueryMapProvider';
import { ResultsPanelProvider } from './webviews/results/ResultsPanelProvider';
import { TableDataPanel } from './webviews/table/TableDataPanel';
import { Logger } from './utils/logger';
import { qualifiedName, quoteIdentifier } from './utils/identifiers';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  const connectionStore = new ConnectionStore(context);
  const connectionManager = new ConnectionManager(connectionStore);
  const historyStore = new QueryHistoryStore(context);
  const consoleStore = new QueryConsoleStore(context);
  const resultStore = new ResultSessionStore(context);
  const schemaContext = new SchemaContextService(connectionManager);
  const sectionService = new SqlSectionService();
  const highlighter = new SqlSectionHighlighter();
  const sqlDiagnostics = vscode.languages.createDiagnosticCollection('database-sql');
  const diagnosticsService = new SqlDiagnosticsService(connectionManager, schemaContext, sectionService);
  const aiAdapter = new VsCodeLanguageModelSqlAdapter();
  const memoryStore = new QueryMemoryStore(context);
  const memoryService = new QueryMemoryService(historyStore, memoryStore, consoleStore, connectionManager, aiAdapter);
  const executor = new QueryExecutor(connectionManager, historyStore, memoryService);
  const diagnosticTimers = new Map<string, NodeJS.Timeout>();
  const diagnosticVersions = new Map<string, number>();
  let queryMap: QueryMapProvider;
  const results = new ResultsPanelProvider(
    context,
    resultStore,
    executor,
    async (tab) => revealSourceForTab(tab),
    (tabs) => queryMap?.updateResults(tabs)
  );
  queryMap = new QueryMapProvider(
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
    () => historyStore.getAll(),
    async (item) => openHistoryItem(item),
    async (id, pinned) => {
      await consoleStore.setPinned(id, pinned);
      refreshQueryMap();
    },
    async (id) => {
      await consoleStore.delete(id);
      refreshQueryMap();
    },
    async (id, direction) => {
      await consoleStore.move(id, direction);
      refreshQueryMap();
    },
    async (documentUri) => {
      await consoleStore.touchDocument(documentUri, { opened: true });
      refreshQueryMap();
    },
    async (item) => {
      await historyStore.update(item);
      refreshQueryMap();
    },
    async (id) => {
      await historyStore.delete(id);
      refreshQueryMap();
    }
  );
  const tree = new DatabaseTreeProvider(connectionManager);

  const treeView = vscode.window.createTreeView('databaseExplorer', { treeDataProvider: tree, showCollapseAll: true });
  context.subscriptions.push(
    treeView,
    highlighter,
    sqlDiagnostics,
    vscode.window.registerWebviewViewProvider(ResultsPanelProvider.viewType, results),
    vscode.window.registerWebviewViewProvider(QueryMapProvider.viewType, queryMap)
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  status.command = 'database.pickConnection';
  status.text = '$(database) Database';
  status.show();
  context.subscriptions.push(status);
  context.subscriptions.push(registerSqlCompletions(connectionManager, schemaContext, sectionService));
  context.subscriptions.push(registerSqlStatementCodeLens(sectionService));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    queryMap.updateFromEditor(editor);
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
  queryMap.updateFromEditor(vscode.window.activeTextEditor);
  queryMap.updateResults(results.getTabs());
  highlightActiveSqlSection(vscode.window.activeTextEditor);
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
    queryMap.updateConsoles(
      consoleStore.getAll(),
      connectionManager.getConnections(),
      connectionManager.getActiveConnections().map((connection) => connection.config.id)
    );
  }

  new QueryMemoryController(context, memoryService, connectionManager, executor, aiAdapter, async (tab) => {
    await results.addTab(tab);
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
    refreshQueryMap();
    queryMap.updateFromEditor(vscode.window.activeTextEditor);
  });

  register('database.openQueryFile', async () => {
    const connection = connectionManager.getPreferredConnection();
    const doc = await consoleStore.openOrCreate(connection, '', { reuse: false });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
    refreshQueryMap();
    queryMap.updateFromEditor(vscode.window.activeTextEditor);
  });

  register('database.executeCurrentQuery', () => executeFromEditor('smart'));
  register('database.executeSelection', () => executeFromEditor('selection'));
  register('database.executeFile', () => executeFromEditor('file'));
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
    const section = sectionService.getSections(editor.document).find((item) => item.range.isEqual(range));
    await executeDetected(editor, {
      sql: editor.document.getText(range),
      range,
      index: section?.index,
      id: section?.id
    });
  });
  register('database.cancelCurrentQuery', () => vscode.window.showInformationMessage('Cancellation is available from running result tabs.'));

  register('database.previewTableMetadata', async (node?: unknown) => {
    if (node instanceof TableNode) {
      void vscode.window.showInformationMessage(`${qualifiedName(node.table.schema, node.table.name)} ${node.table.comment ?? ''}`.trim());
    }
  });

  register('database.openTableData', async (node?: unknown) => {
    if (!(node instanceof TableNode)) {
      return;
    }
    await TableDataPanel.open(context, connectionManager, node);
  });

  register('database.editTableData', async (node?: unknown) => {
    if (node instanceof TableNode) {
      await TableDataPanel.open(context, connectionManager, node);
    }
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

  register('database.showObjectDdl', async (node?: unknown) => {
    const sql = await objectDdl(connectionManager, node);
    if (sql) {
      await openSqlEditor(connectionManager, `${objectName(node) ?? 'Object'} DDL`, `${sql}\n`);
    }
  });

  register('database.generateSelect', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlEditor(connectionManager, `SELECT ${target.name}`, `select *\nfrom ${qualifiedName(target.schema, target.name)}\nlimit 100;\n`);
    }
  });

  register('database.generateInsert', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    const columns = await connectionManager.getDriver(target.connection.type).getColumns(target.connection.id, target.schema, target.name);
    const writable = columns.filter((column) => !column.defaultValue).map((column) => quoteIdentifier(column.name));
    await openSqlEditor(connectionManager, `INSERT ${target.name}`, `insert into ${qualifiedName(target.schema, target.name)} (${writable.join(', ')})\nvalues (${writable.map(() => '?').join(', ')});\n`);
  });

  register('database.generateUpdate', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (!target) {
      return;
    }
    await openSqlEditor(connectionManager, `UPDATE ${target.name}`, `update ${qualifiedName(target.schema, target.name)}\nset ${quoteIdentifier('column_name')} = ?\nwhere ${quoteIdentifier('id')} = ?;\n`);
  });

  register('database.generateDelete', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlEditor(connectionManager, `DELETE ${target.name}`, `delete from ${qualifiedName(target.schema, target.name)}\nwhere ${quoteIdentifier('id')} = ?;\n`);
    }
  });

  register('database.modifyTable', async (node?: unknown) => {
    const target = tableLikeTarget(node);
    if (target) {
      await openSqlEditor(connectionManager, `ALTER ${target.name}`, `alter table ${qualifiedName(target.schema, target.name)}\n  add column ${quoteIdentifier('new_column')} text;\n`);
    }
  });

  register('database.renameObject', async (node?: unknown) => {
    const sql = renameTemplate(node);
    if (sql) {
      await openSqlEditor(connectionManager, `Rename ${objectName(node)}`, sql);
    }
  });

  register('database.dropObject', async (node?: unknown) => {
    const sql = dropTemplate(node);
    if (sql) {
      await openSqlEditor(connectionManager, `Drop ${objectName(node)}`, sql);
    }
  });

  register('database.newObject', async (node?: unknown) => {
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

  register('database.newTable', async (node?: unknown) => openSqlEditor(connectionManager, 'New Table', newObjectTemplate(node, 'table')));
  register('database.newView', async (node?: unknown) => openSqlEditor(connectionManager, 'New View', newObjectTemplate(node, 'view')));
  register('database.newMaterializedView', async (node?: unknown) => openSqlEditor(connectionManager, 'New Materialized View', newObjectTemplate(node, 'materialized_view')));
  register('database.newColumn', async (node?: unknown) => openSqlEditor(connectionManager, 'New Column', newObjectTemplate(node, 'column')));
  register('database.newIndex', async (node?: unknown) => openSqlEditor(connectionManager, 'New Index', newObjectTemplate(node, 'index')));
  register('database.newUniqueKey', async (node?: unknown) => openSqlEditor(connectionManager, 'New Unique Key', newObjectTemplate(node, 'unique_key')));
  register('database.newForeignKey', async (node?: unknown) => openSqlEditor(connectionManager, 'New Foreign Key', newObjectTemplate(node, 'foreign_key')));
  register('database.newCheck', async (node?: unknown) => openSqlEditor(connectionManager, 'New Check', newObjectTemplate(node, 'check')));
  register('database.newSchema', async (node?: unknown) => openSqlEditor(connectionManager, 'New Schema', newObjectTemplate(node, 'schema')));
  register('database.newSequence', async (node?: unknown) => openSqlEditor(connectionManager, 'New Sequence', newObjectTemplate(node, 'sequence')));

  register('database.quickDocumentation', async (node?: unknown) => {
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

  async function executeFromEditor(mode: 'smart' | 'selection' | 'file'): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const detected = mode === 'file'
      ? { sql: editor.document.getText(), range: new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)) }
      : mode === 'selection'
        ? selectedSql(editor)
        : selectedSql(editor) ?? sectionService.detectExecutable(editor.document, editor.selection);

    if (!detected?.sql.trim()) {
      void vscode.window.showInformationMessage('No SQL section to run.');
      return;
    }

    await executeDetected(editor, detected);
  }

  function highlightActiveSqlSection(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'sql') {
      return;
    }
    const section = selectedSql(editor) ?? sectionService.detectExecutable(editor.document, editor.selection);
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

  function selectedSql(editor: vscode.TextEditor): { sql: string; range: vscode.Range } | undefined {
    if (editor.selection.isEmpty) {
      return undefined;
    }
    const range = trimSelection(editor.document, editor.selection);
    if (range.isEmpty) {
      return undefined;
    }
    return {
      sql: editor.document.getText(range),
      range
    };
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
      void diagnosticsService.getDiagnostics(document, selection).then((diagnostics) => {
        if (diagnosticVersions.get(documentUri) === version) {
          sqlDiagnostics.set(document.uri, diagnostics);
        }
      });
    }, 450);
    diagnosticTimers.set(documentUri, timer);
  }

  async function executeDetected(editor: vscode.TextEditor, detected: { sql: string; range: vscode.Range; index?: number; id?: string }): Promise<void> {
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
      refreshQueryMap();
      status.text = `$(database) ${connection.name} ${tab.executionTimeMs ?? 0}ms`;
    } finally {
      decoration.dispose();
    }
  }

  async function runAi(action: 'fix' | 'explain'): Promise<void> {
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

  async function openHistoryItem(item: import('./types').QueryHistoryItem): Promise<void> {
    if (item.documentUri) {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(item.documentUri));
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        if (item.sourceRange) {
          const range = rangeFromPlain(item.sourceRange);
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range);
        }
        refreshQueryMap();
        return;
      } catch {
        // Fall back to opening the SQL in a durable console below.
      }
    }
    const doc = await consoleStore.openOrCreate(connectionManager.getConnection(item.connectionId), `${item.sql}\n`);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    if (doc.getText().trim().length === 0) {
      await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), `${item.sql}\n`));
    }
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

function trimSelection(document: vscode.TextDocument, selection: vscode.Selection): vscode.Range {
  const text = document.getText(selection);
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  const trailing = text.match(/\s*$/)?.[0].length ?? 0;
  const startOffset = document.offsetAt(selection.start) + leading;
  const endOffset = document.offsetAt(selection.end) - trailing;
  return new vscode.Range(document.positionAt(startOffset), document.positionAt(Math.max(startOffset, endOffset)));
}

function registerSqlCompletions(
  connectionManager: ConnectionManager,
  schemaContext: SchemaContextService,
  sectionService: SqlSectionService
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

      const connection = connectionManager.getPreferredConnection();
      if (!connection || !connectionManager.isConnected(connection.id)) {
        return items;
      }

      try {
        items.push(...await getMetadataCompletionItems(connectionManager, schemaContext, sectionService, connection.id, document, position, linePrefix));
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
  connectionId: string,
  document: vscode.TextDocument,
  position: vscode.Position,
  linePrefix: string,
): Promise<vscode.CompletionItem[]> {
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

function filterMetadataItems(items: vscode.CompletionItem[], linePrefix: string): vscode.CompletionItem[] {
  if (/\b(from|join|update|into)\s+[\w"]*$/i.test(linePrefix) || /\.$/.test(linePrefix)) {
    return items;
  }
  return items.filter((item) => item.kind === vscode.CompletionItemKind.Keyword);
}

function registerSqlStatementCodeLens(sectionService: SqlSectionService): vscode.Disposable {
  const emitter = new vscode.EventEmitter<void>();
  const documentEvents = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === 'sql') {
      emitter.fire();
    }
  });

  const provider = vscode.languages.registerCodeLensProvider('sql', {
    onDidChangeCodeLenses: emitter.event,
    provideCodeLenses(document) {
      return sectionService.getSections(document).map((section) => new vscode.CodeLens(section.range, {
        title: '$(play)',
        tooltip: section.sql.replace(/\s+/g, ' ').slice(0, 120),
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
  });

  return vscode.Disposable.from(documentEvents, provider, emitter);
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

async function openSqlEditor(connectionManager: ConnectionManager, title: string, content = ''): Promise<void> {
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

async function objectDdl(connectionManager: ConnectionManager, node: unknown): Promise<string | undefined> {
  if (node instanceof TableNode) {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }
    return connectionManager.getDriver(node.connection.type).getTableDDL(node.connection.id, node.table.schema, node.table.name);
  }
  if (node instanceof ViewNode) {
    return `-- View DDL template\ncreate or replace view ${qualifiedName(node.view.schema, node.view.name)} as\nselect ...;\n`;
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
  const connection = node instanceof ConnectionNode || node instanceof CatalogNode ? node.connection : undefined;
  return { schema: connection?.defaultSchema ?? 'public', connection };
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
  return qualifiedObjectName(node);
}
