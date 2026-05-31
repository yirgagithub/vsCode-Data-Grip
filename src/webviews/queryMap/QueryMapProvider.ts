import * as vscode from 'vscode';
import { ConnectionConfig, QueryConsoleRecord, QueryHistoryItem, QueryResultTab } from '../../types';
import { SqlQueryNode } from '../../services/sqlQueryTreeService';
import { SqlSection, SqlSectionService } from '../../services/sqlSectionService';

const PROJECT_SQL_SESSION_PREFIX = 'project-sql:';

interface QueryMapItem {
  id: string;
  documentUri: string;
  index: number;
  kind: SqlQueryNode['kind'];
  name?: string;
  title: string;
  preview: string;
  line: number;
  disabled: boolean;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  status?: QueryResultTab['executionStatus'];
  durationMs?: number;
  rowCount?: number;
  children: QueryMapItem[];
}

interface QueryMapDocumentGroup {
  id: string;
  documentUri: string;
  documentTitle: string;
  pinned: boolean;
  sortOrder: number;
  lastTouchedAt: number;
  isActiveConnection: boolean;
  isToday: boolean;
  running: boolean;
  projectFile: boolean;
  status?: QueryResultTab['executionStatus'];
  durationMs?: number;
  rowCount?: number;
  items: QueryMapItem[];
}

interface QueryMapGroup {
  id: string;
  connectionName: string;
  databaseName?: string;
  documents: QueryMapDocumentGroup[];
}

interface QueryMapHistoryItem {
  id: string;
  connectionId: string;
  sql: string;
  preview: string;
  status: QueryHistoryItem['status'];
  favorite: boolean;
  rowCount?: number;
  executedAt: number;
  sourceFile?: string;
}

interface QueryMapHistoryGroup {
  id: string;
  connectionName: string;
  databaseName?: string;
  items: QueryMapHistoryItem[];
}

interface OpenDocumentResult {
  editor?: vscode.TextEditor;
  missing: boolean;
}

type QueryMapMessage =
  | { type: 'ready' }
  | { type: 'newConsole' }
  | { type: 'refreshQuerySessions' }
  | { type: 'clearActiveSessions' }
  | { type: 'clearConsoleHistory' }
  | { type: 'openConsole'; consoleId: string; documentUri: string }
  | { type: 'togglePin'; consoleId: string; pinned: boolean }
  | { type: 'untrackConsole'; consoleId: string }
  | { type: 'moveConsole'; consoleId: string; direction: 'up' | 'down' }
  | { type: 'openHistory'; historyId: string }
  | { type: 'toggleFavoriteHistory'; historyId: string; favorite: boolean }
  | { type: 'copyHistory'; historyId: string }
  | { type: 'deleteHistory'; historyId: string }
  | { type: 'reveal'; documentUri: string; nodeId: string }
  | { type: 'run'; documentUri: string; nodeId: string };

export class QueryMapProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'databaseQueryMap';
  private view?: vscode.WebviewView;
  private groups: QueryMapGroup[] = [];
  private historyGroups: QueryMapHistoryGroup[] = [];
  private consoleRecords: QueryConsoleRecord[] = [];
  private connections: ConnectionConfig[] = [];
  private activeConnectionIds = new Set<string>();
  private runningDocumentUris = new Set<string>();
  private resultTabs: QueryResultTab[] = [];

  constructor(
    private readonly sectionService: SqlSectionService,
    private readonly revealSection: (documentUri: string, section: SqlSection) => Promise<void>,
    private readonly runSection: (documentUri: string, section: SqlSection) => Promise<void>,
    private readonly getHistoryItems: () => QueryHistoryItem[],
    private readonly openHistoryItem: (item: QueryHistoryItem) => Promise<void>,
    private readonly setConsolePinned: (id: string, pinned: boolean) => Promise<void>,
    private readonly untrackConsole: (id: string) => Promise<void>,
    private readonly moveConsole: (id: string, direction: 'up' | 'down') => Promise<void>,
    private readonly touchConsoleDocument: (documentUri: string) => Promise<void>,
    private readonly updateHistoryItem: (item: QueryHistoryItem) => Promise<void>,
    private readonly deleteHistoryItem: (id: string) => Promise<void>,
    private readonly clearActiveSessions: (ids: string[]) => Promise<void>,
    private readonly clearHistoryItems: (ids: string[]) => Promise<void>,
    private readonly refreshData: () => Promise<void> | void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: QueryMapMessage) => void this.onMessage(message));
    this.postState();
  }

  updateConsoles(records: QueryConsoleRecord[], connections: ConnectionConfig[], activeConnectionIds: string[] = []): void {
    this.consoleRecords = records;
    this.connections = connections;
    this.activeConnectionIds = new Set(activeConnectionIds);
    this.refreshGroups();
  }

  updateRunningDocuments(documentUris: string[]): void {
    this.runningDocumentUris = new Set(documentUris);
    this.refreshGroups();
  }

  updateFromEditor(_editor: vscode.TextEditor | undefined): void {
    this.refreshGroups();
  }

  refreshGroups(): void {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groupsByConnection = new Map<string, QueryMapGroup>();
    const todayStart = this.todayStart();

    for (const record of this.consoleRecords) {
      const connection = connectionById.get(record.connectionId);
      const touchedAt = record.lastTouchedAt ?? record.updatedAt;
      const isActiveConnection = this.activeConnectionIds.has(record.connectionId);
      const isToday = touchedAt >= todayStart;
      if (!record.pinned && !isActiveConnection && !isToday) {
        continue;
      }
      const connectionId = record.connectionId;
      const connectionName = connection?.name ?? 'Unknown connection';
      const databaseName = connection?.database;
      const running = this.runningDocumentUris.has(record.documentUri);
      const group = groupsByConnection.get(connectionId) ?? {
        id: connectionId,
        connectionName,
        databaseName,
        documents: []
      };
      const latestResult = this.latestResultForDocument(record.documentUri);
      group.documents.push({
        id: record.id,
        documentUri: record.documentUri,
        documentTitle: this.documentTitle(record.documentUri),
        pinned: record.pinned === true,
        sortOrder: this.consoleSortValue(record),
        lastTouchedAt: touchedAt,
        isActiveConnection,
        isToday,
        running,
        projectFile: record.id.startsWith(PROJECT_SQL_SESSION_PREFIX),
        status: running ? 'running' : latestResult?.executionStatus,
        durationMs: running ? undefined : latestResult?.executionTimeMs,
        rowCount: running ? undefined : latestResult?.rowCount,
        items: []
      });
      groupsByConnection.set(connectionId, group);
    }

    this.groups = [...groupsByConnection.values()]
      .map((group) => ({
        ...group,
        documents: group.documents.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.documentTitle.localeCompare(b.documentTitle))
      }))
      .sort((a, b) => `${a.connectionName}:${a.databaseName ?? ''}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ''}`));
    this.historyGroups = this.toHistoryGroups(this.getHistoryItems(), todayStart);
    this.postState();
  }

  private documentTitle(documentUri: string): string {
    try {
      const uri = vscode.Uri.parse(documentUri);
      return uri.fsPath.split(/[\\/]/).pop() || uri.toString();
    } catch {
      return documentUri.split(/[\\/]/).pop() || documentUri;
    }
  }

  updateResults(tabs: QueryResultTab[]): void {
    this.resultTabs = tabs;
    this.refreshGroups();
  }

  private async onMessage(message: QueryMapMessage): Promise<void> {
    if (message.type === 'ready') {
      this.postState();
      return;
    }
    if (message.type === 'refreshQuerySessions') {
      await this.refreshData();
      return;
    }
    if (message.type === 'newConsole') {
      await vscode.commands.executeCommand('database.openSqlConsole');
      return;
    }
    if (message.type === 'clearActiveSessions') {
      const ids = this.groups.flatMap((group) => group.documents.map((document) => document.id));
      if (!ids.length) {
        return;
      }
      const answer = await vscode.window.showWarningMessage('Clear active query sessions?', { modal: true }, 'Clear');
      if (answer === 'Clear') {
        await this.clearActiveSessions(ids);
      }
      return;
    }
    if (message.type === 'clearConsoleHistory') {
      const ids = this.historyGroups.flatMap((group) => group.items.map((item) => item.id));
      if (!ids.length) {
        return;
      }
      const answer = await vscode.window.showWarningMessage('Clear console history?', { modal: true }, 'Clear');
      if (answer === 'Clear') {
        await this.clearHistoryItems(ids);
      }
      return;
    }
    if (message.type === 'togglePin') {
      await this.setConsolePinned(message.consoleId, message.pinned);
      return;
    }
    if (message.type === 'untrackConsole') {
      await this.untrackConsole(message.consoleId);
      return;
    }
    if (message.type === 'moveConsole') {
      await this.moveConsole(message.consoleId, message.direction);
      return;
    }
    if (message.type === 'openHistory') {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await this.openHistoryItem(item);
      }
      return;
    }
    if (message.type === 'toggleFavoriteHistory') {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await this.updateHistoryItem({ ...item, favorite: message.favorite });
      }
      return;
    }
    if (message.type === 'copyHistory') {
      const item = this.getHistoryItems().find((history) => history.id === message.historyId);
      if (item) {
        await vscode.env.clipboard.writeText(item.sql);
      }
      return;
    }
    if (message.type === 'deleteHistory') {
      await this.deleteHistoryItem(message.historyId);
      return;
    }
    if (message.type === 'openConsole') {
      const opened = await this.openDocument(message.documentUri, { showMissingWarning: false });
      if (opened.editor) {
        await this.touchConsoleDocument(message.documentUri);
      } else if (opened.missing) {
        await this.untrackConsole(message.consoleId);
        void vscode.window.showInformationMessage('SQL console file no longer exists. Removed it from Active Session.');
      }
      return;
    }
    if (!message.documentUri) {
      return;
    }
    const opened = await this.openDocument(message.documentUri);
    if (!opened.editor) {
      return;
    }
    const editor = opened.editor;
    const node = this.findNodeById(this.sectionService.getTree(editor.document), message.nodeId);
    if (!node || !node.sql.trim()) {
      void vscode.window.showInformationMessage('No SQL section to run.');
      return;
    }
    const section = this.toSectionNode(node);
    if (message.type === 'reveal') {
      await this.revealSection(message.documentUri, section);
      return;
    }
    if (message.type === 'run') {
      await this.revealSection(message.documentUri, section);
      await this.runSection(message.documentUri, section);
    }
  }

  private async openDocument(documentUri: string, options: { showMissingWarning?: boolean } = {}): Promise<OpenDocumentResult> {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
      const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
      return { editor, missing: false };
    } catch (error) {
      if (this.isFileNotFound(error)) {
        if (options.showMissingWarning !== false) {
          void vscode.window.showWarningMessage('Source SQL file no longer exists.');
        }
        return { missing: true };
      }
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return { missing: false };
    }
  }

  private isFileNotFound(error: unknown): boolean {
    const code = error instanceof vscode.FileSystemError
      ? error.code
      : typeof error === 'object' && error !== null
        ? (error as { code?: unknown }).code
        : undefined;
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return code === 'FileNotFound' || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }

  private toItem(documentUri: string, section: SqlQueryNode): QueryMapItem {
    const lastRun = this.resultFor(documentUri, section);
    return {
      id: section.id,
      documentUri,
      index: section.index,
      kind: section.kind,
      name: section.name,
      title: this.itemTitle(section),
      preview: this.previewSql(section.sql, 160),
      line: section.range.start.line + 1,
      disabled: !section.sql.trim(),
      range: {
        startLine: section.range.start.line,
        startColumn: section.range.start.character,
        endLine: section.range.end.line,
        endColumn: section.range.end.character
      },
      children: section.children.map((child) => this.toItem(documentUri, child)),
      ...lastRun
    };
  }

  private resultFor(documentUri: string, section: SqlQueryNode): Partial<QueryMapItem> {
    const tab = [...this.resultTabs]
      .filter((item) => item.sourceDocumentUri === documentUri && (item.sourceQueryId === section.id || item.sourceSectionIndex === section.index))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!tab) {
      return {};
    }
    return {
      status: tab.executionStatus,
      durationMs: tab.executionTimeMs,
      rowCount: tab.rowCount
    };
  }

  private previewSql(sql: string, maxLength: number): string {
    return sql
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, maxLength);
  }

  private itemTitle(section: SqlQueryNode): string {
    if (section.kind === 'cte') {
      return section.name ? `CTE ${section.name}` : `CTE ${section.index + 1}`;
    }
    if (section.kind === 'subquery') {
      return `Subquery ${section.index + 1}`;
    }
    return `Query ${section.index + 1}`;
  }

  private postState(): void {
    void this.view?.webview.postMessage({
      type: 'state',
      groups: this.groups,
      historyGroups: this.historyGroups
    });
  }

  private latestResultForDocument(documentUri: string): QueryResultTab | undefined {
    return [...this.resultTabs]
      .filter((item) => item.sourceDocumentUri === documentUri)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  private toHistoryGroups(items: QueryHistoryItem[], todayStart: number): QueryMapHistoryGroup[] {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groups = new Map<string, QueryMapHistoryGroup>();
    for (const item of [...items]
      .filter((history) => history.executedAt < todayStart)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.executedAt - a.executedAt)
      .slice(0, 100)) {
      const connection = connectionById.get(item.connectionId);
      const group = groups.get(item.connectionId) ?? {
        id: item.connectionId,
        connectionName: connection?.name ?? 'Unknown connection',
        databaseName: connection?.database,
        items: []
      };
      group.items.push({
          id: item.id,
          connectionId: item.connectionId,
          sql: item.sql,
          preview: this.previewSql(item.sql, 180),
          status: item.status,
          favorite: item.favorite === true,
          rowCount: item.rowCount,
          executedAt: item.executedAt,
          sourceFile: item.sourceFile
      });
      groups.set(item.connectionId, group);
    }
    return [...groups.values()]
      .sort((a, b) => `${a.connectionName}:${a.databaseName ?? ''}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ''}`));
  }

  private todayStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  private consoleSortValue(record: QueryConsoleRecord): number {
    return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
  }

  private findNodeById(nodes: SqlQueryNode[], nodeId: string): SqlQueryNode | undefined {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      const child = this.findNodeById(node.children, nodeId);
      if (child) {
        return child;
      }
    }
    return undefined;
  }

  private toSectionNode(node: SqlQueryNode): SqlSection {
    return {
      ...node,
      aliases: this.sectionService.extractAliases(node.sql),
      tables: this.sectionService.extractTables(node.sql)
    };
  }

  private html(webview: vscode.Webview): string {
    const nonce = Date.now().toString();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --text-disabled: var(--vscode-disabledForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.45rem, 1.25rem + 0.45vw, 1.8rem);
      --tab-height: clamp(1.75rem, 1.55rem + 0.45vw, 2.15rem);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-panel);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border);
    }
    button:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    button:disabled {
      color: var(--text-disabled);
      cursor: default;
      opacity: .55;
    }
    .services-shell {
      height: 100vh;
      min-width: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-panel);
    }
    .services-header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .title {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .toolbar {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
    }
    .icon {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      display: inline-grid;
      place-items: center;
      padding: 0;
      color: var(--vscode-icon-foreground, var(--text-muted));
      flex: 0 0 auto;
    }
    .toolbar-glyph,
    .tree-toggle {
      position: relative;
      width: var(--icon-size);
      height: var(--icon-size);
      display: inline-block;
      color: currentColor;
      flex: 0 0 auto;
    }
    .toolbar-glyph::before,
    .toolbar-glyph::after,
    .tree-toggle::before {
      content: '';
      position: absolute;
      width: .42rem;
      height: .42rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
    }
    .tree-toggle::before {
      top: 50%;
      left: 50%;
      transform: translate(-55%, -50%) rotate(-45deg);
    }
    .tree-toggle.expanded::before {
      transform: translate(-55%, -62%) rotate(45deg);
    }
    .toolbar-glyph.expand-all::before,
    .toolbar-glyph.expand-all::after {
      left: 50%;
    }
    .toolbar-glyph.expand-all::before {
      top: .08rem;
      transform: translateX(-50%) rotate(-135deg);
    }
    .toolbar-glyph.expand-all::after {
      bottom: .08rem;
      transform: translateX(-50%) rotate(45deg);
    }
    .toolbar-glyph.collapse-all::before,
    .toolbar-glyph.collapse-all::after {
      left: 50%;
    }
    .toolbar-glyph.collapse-all::before {
      top: .08rem;
      transform: translateX(-50%) rotate(45deg);
    }
    .toolbar-glyph.collapse-all::after {
      bottom: .08rem;
      transform: translateX(-50%) rotate(-135deg);
    }
    .tabs {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      padding: var(--space-xxs) var(--space-sm) 0;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab {
      height: var(--tab-height);
      min-width: 0;
      padding: 0 var(--space-sm);
      color: var(--text-muted);
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      white-space: nowrap;
    }
    .tab.active {
      color: var(--text-main);
      background: var(--bg-main);
      border-color: var(--border);
      border-bottom-color: var(--bg-main);
    }
    .panel-layout {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-main);
    }
    .services-tree {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
      background: var(--bg-panel);
      scrollbar-width: thin;
    }
    .tree-group,
    .connection-header {
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      color: var(--text-main);
      font-weight: 600;
    }
    .connection-header {
      width: 100%;
      padding-left: calc(var(--space-md) + var(--space-sm));
      border: 0;
      border-radius: 0;
      text-align: left;
      font-weight: 500;
    }
    .tree-count {
      color: var(--text-muted);
      font-weight: 400;
      font-size: .9em;
    }
    .session-row {
      width: 100%;
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm) 0 calc(var(--space-md) * 2.2);
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .session-row:hover,
    .session-row.selected {
      background: var(--bg-hover);
    }
    .session-row.selected {
      background: var(--bg-selected);
    }
    .session-icon {
      color: var(--vscode-charts-blue);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .session-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .duration {
      color: var(--text-muted);
      font-size: .88em;
      font-variant-numeric: tabular-nums;
      justify-self: end;
    }
    .row-action {
      width: calc(var(--toolbar-button-size) * .92);
      height: calc(var(--toolbar-button-size) * .92);
      display: inline-grid;
      place-items: center;
      padding: 0;
      opacity: .35;
    }
    .session-row:hover .row-action,
    .row-action:focus-visible {
      opacity: 1;
    }
    .pin {
      color: var(--vscode-charts-yellow);
      opacity: 1;
    }
    .status {
      width: .48rem;
      height: .48rem;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .status-completed { background: var(--success); }
    .status-failed { background: var(--vscode-testing-iconFailed, var(--danger)); }
    .status-running,
    .status-queued {
      background: var(--vscode-progressBar-background, var(--accent));
      animation: pulse 1.1s ease-in-out infinite;
    }
    .status-cancelled { background: var(--vscode-testing-iconSkipped, var(--text-muted)); }
    .loader {
      width: .72rem;
      height: .72rem;
      flex: 0 0 auto;
      border-radius: 50%;
      border: 2px solid var(--vscode-progressBar-background, var(--accent));
      border-top-color: transparent;
      animation: spin .8s linear infinite;
    }
    .output {
      min-height: 0;
      display: grid;
      grid-template-rows: var(--tab-height) minmax(0, 1fr);
      border-top: 1px solid var(--border);
      background: var(--bg-main);
      overflow: hidden;
    }
    .output-tabs {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .output-tabs span:first-child {
      color: var(--text-main);
      font-weight: 600;
    }
    .output-title {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--text-muted);
    }
    .output-log {
      margin: 0;
      padding: var(--space-sm);
      overflow: auto;
      color: var(--text-main);
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.72rem, 0.7rem + 0.12vw, 0.86rem);
      white-space: pre-wrap;
      scrollbar-width: thin;
    }
    .log-time { color: var(--text-muted); }
    .log-success { color: var(--success); }
    .log-error { color: var(--danger); }
    .empty {
      min-height: 8rem;
      display: grid;
      place-items: center;
      padding: var(--space-md);
      color: var(--text-muted);
      text-align: center;
    }
    .menu {
      position: fixed;
      z-index: 20;
      min-width: 13rem;
      max-width: min(22rem, calc(100vw - 1rem));
      padding: var(--space-xxs) 0;
      background: var(--vscode-menu-background, var(--bg-elevated));
      color: var(--vscode-menu-foreground, var(--text-main));
      border: 1px solid var(--vscode-menu-border, var(--border));
      box-shadow: 0 .55rem 1.35rem color-mix(in srgb, black 32%, transparent);
    }
    .menu button {
      width: 100%;
      min-height: var(--row-height);
      display: grid;
      grid-template-columns: 1.25rem minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .menu button:hover:not(:disabled),
    .menu button:focus-visible {
      background: var(--vscode-menu-selectionBackground, var(--bg-hover));
      color: var(--vscode-menu-selectionForeground, var(--text-main));
    }
    .menu kbd {
      color: var(--text-muted);
      font: inherit;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    @media (min-width: 42rem) {
      .panel-layout {
        grid-template-rows: minmax(0, 1fr);
      }
      .output {
        border-top: 0;
        border-left: 1px solid var(--border);
      }
    }
    @media (max-width: 25rem) {
      .duration,
      .row-action {
        display: none;
      }
      .session-row {
        grid-template-columns: auto auto minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    let saved = vscode.getState() || {};
    let currentState = { groups: [], historyGroups: [] };
    let activeTab = saved.activeTab || 'active';
    let selected = saved.selected || undefined;
    let expanded = saved.expanded || {};
    let openMenuNode;

    function saveState() {
      vscode.setState({ activeTab, selected, expanded });
    }

    function render(state) {
      currentState = state || { groups: [], historyGroups: [] };
      root.innerHTML = '';
      closeMenu();
      const shell = document.createElement('div');
      shell.className = 'services-shell';
      shell.appendChild(renderHeader());
      shell.appendChild(renderTabs());
      shell.appendChild(activeTab === 'history' ? renderHistory() : renderActive());
      root.appendChild(shell);
    }

    function renderHeader() {
      const header = document.createElement('div');
      header.className = 'services-header';
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'Query session actions');
      toolbar.appendChild(icon('+', 'New query console', () => vscode.postMessage({ type: 'newConsole' })));
      toolbar.appendChild(icon('↻', 'Refresh', () => vscode.postMessage({ type: 'refreshQuerySessions' })));
      toolbar.appendChild(toolbarIcon('expand-all', 'Expand all', () => setAllExpanded(true)));
      toolbar.appendChild(toolbarIcon('collapse-all', 'Collapse all', () => setAllExpanded(false)));
      header.appendChild(toolbar);
      return header;
    }

    function renderTabs() {
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      tabs.appendChild(tabButton('active', 'Database'));
      tabs.appendChild(tabButton('history', 'History'));
      return tabs;
    }

    function tabButton(id, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab' + (activeTab === id ? ' active' : '');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', activeTab === id ? 'true' : 'false');
      button.textContent = label;
      button.onclick = () => {
        activeTab = id;
        saveState();
        render(currentState);
      };
      return button;
    }

    function hasActiveItems() {
      return (currentState.groups || []).some(group => (group.documents || []).length);
    }

    function hasHistoryItems() {
      return (currentState.historyGroups || []).some(group => (group.items || []).length);
    }

    function openNewest(id) {
      if (id === 'history') {
        const item = newestHistoryItem();
        if (item) vscode.postMessage({ type: 'openHistory', historyId: item.id });
        return;
      }
      const item = newestActiveItem();
      if (item) vscode.postMessage({ type: 'openConsole', consoleId: item.id, documentUri: item.documentUri });
    }

    function renderActive() {
      const groups = currentState.groups || [];
      if (!groups.length) return empty('No active or recent query consoles.');
      const layout = document.createElement('div');
      layout.className = 'panel-layout';
      const list = document.createElement('div');
      list.className = 'services-tree';
      list.setAttribute('aria-label', 'Database query sessions');
      for (const group of groups) {
        const key = groupKey('active', group);
        list.appendChild(connectionHeader(group, key));
        if (isExpanded(key)) {
          for (const documentGroup of group.documents) {
            list.appendChild(consoleRow(documentGroup));
          }
        }
      }
      layout.appendChild(list);
      return layout;
    }

    function renderHistory() {
      const groups = currentState.historyGroups || [];
      if (!groups.length) return empty('Older query console executions will appear here.');
      const layout = document.createElement('div');
      layout.className = 'panel-layout';
      const list = document.createElement('div');
      list.className = 'services-tree';
      list.setAttribute('aria-label', 'Query session history');
      for (const group of groups) {
        const key = groupKey('history', group);
        list.appendChild(connectionHeader(group, key));
        if (isExpanded(key)) {
          for (const item of group.items) {
            list.appendChild(historyRow(item));
          }
        }
      }
      layout.appendChild(list);
      return layout;
    }

    function consoleRow(item) {
      const row = sessionRow(item.documentTitle, item.running ? 'running...' : durationText(item.durationMs, item.status), item.running ? 'running' : item.status, selected && selected.type === 'active' && selected.id === item.id);
      row.onclick = () => {
        selected = { type: 'active', id: item.id };
        saveState();
        render(currentState);
        vscode.postMessage({ type: 'openConsole', consoleId: item.id, documentUri: item.documentUri });
      };
      row.oncontextmenu = (event) => openMenu(event, consoleActions(item));
      row.appendChild(icon('⋯', 'Console actions', (event) => openMenu(event, consoleActions(item)), item.pinned ? 'row-action pin' : 'row-action'));
      return row;
    }

    function historyRow(item) {
      const row = sessionRow(item.preview || item.sql, historyMeta(item), item.status, selected && selected.type === 'history' && selected.id === item.id);
      row.onclick = () => {
        selected = { type: 'history', id: item.id };
        saveState();
        render(currentState);
        vscode.postMessage({ type: 'openHistory', historyId: item.id });
      };
      row.oncontextmenu = (event) => openMenu(event, historyActions(item));
      row.appendChild(icon('⋯', 'Console history actions', (event) => openMenu(event, historyActions(item)), item.favorite ? 'row-action pin' : 'row-action'));
      return row;
    }

    function treeHeader(chevron, label, count) {
      const node = document.createElement('div');
      node.className = 'tree-group';
      node.innerHTML = '<span>' + chevron + '</span><span>' + escapeHtml(label) + '</span><span class="tree-count">' + escapeHtml(count) + '</span>';
      return node;
    }

    function connectionHeader(group, key) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'connection-header';
      const count = group.documents ? group.documents.length : (group.items ? group.items.length : 0);
      const open = isExpanded(key);
      node.setAttribute('aria-expanded', open ? 'true' : 'false');
      node.title = open ? 'Collapse connection' : 'Expand connection';
      node.onclick = () => toggleExpanded(key);
      node.appendChild(treeToggle(open));
      const label = document.createElement('span');
      label.textContent = group.connectionName + (group.databaseName ? ' / ' + group.databaseName : '');
      node.appendChild(label);
      const countNode = document.createElement('span');
      countNode.className = 'tree-count';
      countNode.textContent = String(count);
      node.appendChild(countNode);
      return node;
    }

    function groupKey(scope, group) {
      return scope + ':' + (group.id || group.connectionName + '/' + (group.databaseName || ''));
    }

    function isExpanded(key) {
      return expanded[key] !== false;
    }

    function toggleExpanded(key) {
      expanded = { ...expanded, [key]: !isExpanded(key) };
      saveState();
      render(currentState);
    }

    function setAllExpanded(value) {
      const scope = activeTab === 'history' ? 'history' : 'active';
      const groups = activeTab === 'history' ? (currentState.historyGroups || []) : (currentState.groups || []);
      const next = { ...expanded };
      for (const group of groups) {
        next[groupKey(scope, group)] = value;
      }
      expanded = next;
      saveState();
      render(currentState);
    }

    function treeToggle(open) {
      const node = document.createElement('span');
      node.className = 'tree-toggle' + (open ? ' expanded' : '');
      node.setAttribute('aria-hidden', 'true');
      return node;
    }

    function sessionRow(name, duration, status, isSelected) {
      const row = document.createElement('div');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.className = 'session-row' + (isSelected ? ' selected' : '');
      row.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      };
      row.appendChild(status === 'running' ? loader() : statusDot(status || 'completed'));
      const iconNode = document.createElement('span');
      iconNode.className = 'session-icon';
      iconNode.textContent = '▣';
      row.appendChild(iconNode);
      const nameNode = document.createElement('span');
      nameNode.className = 'session-name';
      nameNode.textContent = name;
      row.appendChild(nameNode);
      const durationNode = document.createElement('span');
      durationNode.className = 'duration';
      durationNode.textContent = duration || '';
      row.appendChild(durationNode);
      return row;
    }

    function consoleActions(item) {
      if (item.projectFile) {
        return [
          { icon: '×', label: 'Remove from active session', run: () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id }) }
        ];
      }
      return [
        { icon: '⌖', label: item.pinned ? 'Unpin console' : 'Pin console', run: () => vscode.postMessage({ type: 'togglePin', consoleId: item.id, pinned: !item.pinned }) },
        { icon: '↑', label: 'Move up', run: () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'up' }) },
        { icon: '↓', label: 'Move down', run: () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'down' }) },
        { icon: '×', label: 'Untrack console', shortcut: 'Delete', run: () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id }) }
      ];
    }

    function historyActions(item) {
      return [
        { icon: '⌖', label: item.favorite ? 'Remove favorite' : 'Favorite', run: () => vscode.postMessage({ type: 'toggleFavoriteHistory', historyId: item.id, favorite: !item.favorite }) },
        { icon: '⧉', label: 'Copy SQL', shortcut: 'Ctrl+C', run: () => vscode.postMessage({ type: 'copyHistory', historyId: item.id }) },
        { icon: '×', label: 'Delete history item', shortcut: 'Delete', run: () => vscode.postMessage({ type: 'deleteHistory', historyId: item.id }) }
      ];
    }

    function openMenu(event, actions) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      const menu = document.createElement('div');
      menu.className = 'menu';
      for (const action of actions) {
        const item = document.createElement('button');
        item.type = 'button';
        item.innerHTML = '<span>' + escapeHtml(action.icon || '') + '</span><span>' + escapeHtml(action.label) + '</span><kbd>' + escapeHtml(action.shortcut || '') + '</kbd>';
        item.disabled = action.disabled === true;
        item.onclick = () => {
          if (action.disabled === true) return;
          closeMenu();
          action.run();
        };
        menu.appendChild(item);
      }
      document.body.appendChild(menu);
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      menu.style.left = Math.max(4, Math.min(event.clientX, window.innerWidth - width - 4)) + 'px';
      menu.style.top = Math.max(4, Math.min(event.clientY, window.innerHeight - height - 4)) + 'px';
      openMenuNode = menu;
      const first = menu.querySelector('button');
      if (first) first.focus();
    }

    function closeMenu() {
      if (openMenuNode) {
        openMenuNode.remove();
        openMenuNode = undefined;
      }
    }

    function icon(text, title, onclick, extraClass) {
      const button = document.createElement('button');
      button.className = 'icon' + (extraClass ? ' ' + extraClass : '');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.textContent = text;
      button.onclick = (event) => {
        event.stopPropagation();
        onclick(event);
      };
      return button;
    }

    function toolbarIcon(kind, title, onclick) {
      const button = icon('', title, onclick);
      const glyph = document.createElement('span');
      glyph.className = 'toolbar-glyph ' + kind;
      glyph.setAttribute('aria-hidden', 'true');
      button.appendChild(glyph);
      return button;
    }

    function statusDot(status) {
      const dot = document.createElement('span');
      dot.className = 'status status-' + status;
      dot.title = status;
      return dot;
    }

    function loader() {
      const spinner = document.createElement('span');
      spinner.className = 'loader';
      spinner.title = 'running';
      return spinner;
    }

    function selectedActiveItem() {
      if (!selected || selected.type !== 'active') return undefined;
      return (currentState.groups || []).flatMap(group => group.documents || []).find(item => item.id === selected.id);
    }

    function newestActiveItem() {
      return (currentState.groups || []).flatMap(group => group.documents || []).sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)[0];
    }

    function selectedHistoryItem() {
      if (!selected || selected.type !== 'history') return undefined;
      return (currentState.historyGroups || []).flatMap(group => group.items || []).find(item => item.id === selected.id);
    }

    function newestHistoryItem() {
      return (currentState.historyGroups || []).flatMap(group => group.items || []).sort((a, b) => b.executedAt - a.executedAt)[0];
    }

    function renderOutput(item) {
      const output = document.createElement('section');
      output.className = 'output';
      const header = document.createElement('div');
      header.className = 'output-tabs';
      const label = document.createElement('span');
      label.textContent = 'Output';
      const title = document.createElement('span');
      title.className = 'output-title';
      title.textContent = item ? (item.documentTitle || item.preview || item.sql || 'Session') : 'No session selected';
      header.appendChild(label);
      header.appendChild(title);
      output.appendChild(header);
      const log = document.createElement('pre');
      log.className = 'output-log';
      if (!item) {
        log.textContent = 'Select a session to inspect its latest state.';
      } else if (item.documentTitle) {
        log.innerHTML = activeLog(item);
      } else {
        log.innerHTML = historyLog(item);
      }
      output.appendChild(log);
      return output;
    }

    function activeLog(item) {
      const rows = [];
      rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> Session ' + escapeHtml(item.documentTitle));
      if (item.running) rows.push('<span class="log-time">[' + shortTime(Date.now()) + ']</span> running...');
      if (item.status) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> status: ' + statusClassText(item.status));
      if (item.rowCount !== undefined) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> ' + item.rowCount + ' rows retrieved');
      if (item.durationMs !== undefined) rows.push('<span class="log-time">[' + shortTime(item.lastTouchedAt) + ']</span> execution: ' + formatDuration(item.durationMs));
      return rows.join('\\n');
    }

    function historyLog(item) {
      const rows = [];
      rows.push('<span class="log-time">[' + shortTime(item.executedAt) + ']</span> ' + statusClassText(item.status));
      if (item.rowCount !== undefined) rows.push('<span class="log-time">[' + shortTime(item.executedAt) + ']</span> ' + item.rowCount + ' rows retrieved');
      rows.push('');
      rows.push(escapeHtml(item.sql || item.preview || ''));
      return rows.join('\\n');
    }

    function statusClassText(status) {
      if (status === 'failed') return '<span class="log-error">' + escapeHtml(status) + '</span>';
      if (status === 'completed') return '<span class="log-success">' + escapeHtml(status) + '</span>';
      return escapeHtml(status || 'unknown');
    }

    function historyMeta(item) {
      return shortDate(item.executedAt);
    }

    function durationText(durationMs, status) {
      if (status === 'failed') return 'failed';
      if (durationMs === undefined || durationMs === null) return '';
      return formatDuration(durationMs);
    }

    function formatDuration(ms) {
      if (ms < 1000) return ms + ' ms';
      const seconds = Math.floor(ms / 1000);
      return seconds + ' s ' + (ms % 1000) + ' ms';
    }

    function shortDate(value) {
      if (!value) return '';
      const date = new Date(value);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return day + '/' + month + '/' + date.getFullYear();
    }

    function shortTime(value) {
      const date = new Date(value || Date.now());
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function empty(text) {
      const node = document.createElement('div');
      node.className = 'empty';
      node.textContent = text;
      return node;
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'state') render(event.data);
    });
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
