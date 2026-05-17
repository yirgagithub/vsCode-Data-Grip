import * as vscode from 'vscode';
import { ConnectionConfig, QueryConsoleRecord, QueryResultTab } from '../../types';
import { SqlQueryNode } from '../../services/sqlQueryTreeService';
import { SqlSection, SqlSectionService } from '../../services/sqlSectionService';

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
  documentTitle: string;
  items: QueryMapItem[];
}

interface QueryMapGroup {
  id: string;
  connectionName: string;
  databaseName?: string;
  documents: QueryMapDocumentGroup[];
}

type QueryMapMessage =
  | { type: 'ready' }
  | { type: 'open'; documentUri: string }
  | { type: 'reveal'; documentUri: string; nodeId: string }
  | { type: 'run'; documentUri: string; nodeId: string };

export class QueryMapProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'databaseQueryMap';
  private view?: vscode.WebviewView;
  private groups: QueryMapGroup[] = [];
  private consoleRecords: QueryConsoleRecord[] = [];
  private connections: ConnectionConfig[] = [];
  private resultTabs: QueryResultTab[] = [];

  constructor(
    private readonly sectionService: SqlSectionService,
    private readonly revealSection: (documentUri: string, section: SqlSection) => Promise<void>,
    private readonly runSection: (documentUri: string, section: SqlSection) => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: QueryMapMessage) => void this.onMessage(message));
    this.postState();
  }

  updateConsoles(records: QueryConsoleRecord[], connections: ConnectionConfig[]): void {
    this.consoleRecords = records;
    this.connections = connections;
    this.refreshGroups();
  }

  updateFromEditor(_editor: vscode.TextEditor | undefined): void {
    this.refreshGroups();
  }

  refreshGroups(): void {
    const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
    const groupsByConnection = new Map<string, QueryMapGroup>();

    for (const record of this.consoleRecords) {
      const connection = connectionById.get(record.connectionId);
      const connectionId = record.connectionId;
      const connectionName = connection?.name ?? 'Unknown connection';
      const databaseName = connection?.database;
      const group = groupsByConnection.get(connectionId) ?? {
        id: connectionId,
        connectionName,
        databaseName,
        documents: []
      };
      const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === record.documentUri);
      group.documents.push({
        id: record.documentUri,
        documentTitle: this.documentTitle(record.documentUri),
        items: document ? this.sectionService.getTree(document).map((section) => this.toItem(record.documentUri, section)) : []
      });
      groupsByConnection.set(connectionId, group);
    }

    this.groups = [...groupsByConnection.values()]
      .map((group) => ({
        ...group,
        documents: group.documents.sort((a, b) => a.documentTitle.localeCompare(b.documentTitle))
      }))
      .sort((a, b) => `${a.connectionName}:${a.databaseName ?? ''}`.localeCompare(`${b.connectionName}:${b.databaseName ?? ''}`));
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
    if (!message.documentUri) {
      return;
    }
    const editor = await this.openDocument(message.documentUri);
    if (message.type === 'open') {
      return;
    }
    if (!editor) {
      return;
    }
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

  private async openDocument(documentUri: string): Promise<vscode.TextEditor | undefined> {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
      return vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
    } catch {
      void vscode.window.showWarningMessage('Source SQL file no longer exists.');
      return undefined;
    }
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
    const keyword = section.sql.replace(/^\s*(?:--.*\r?\n\s*)*/g, '').match(/^\w+/)?.[0]?.toUpperCase();
    const table = section.sql.replace(/\s+/g, ' ').match(/\bfrom\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/i)?.[1]?.replace(/"/g, '');
    if (section.kind === 'cte') {
      return section.name ? `CTE ${section.name}` : `CTE ${section.index + 1}`;
    }
    if (section.kind === 'subquery') {
      return `Subquery ${section.index + 1}`;
    }
    return keyword && table ? `${keyword} ${table}` : `Query ${section.index + 1}`;
  }

  private postState(): void {
    void this.view?.webview.postMessage({
      type: 'state',
      groups: this.groups
    });
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
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: 13px; }
    .summary { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 10px; border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); box-sizing: border-box; }
    .summary strong { color: var(--vscode-foreground); font-weight: 600; }
    .summary-icon { color: var(--vscode-charts-blue); }
    .empty { min-height: 140px; display: grid; place-items: center; padding: 18px; color: var(--vscode-descriptionForeground); text-align: center; line-height: 1.35; }
    .list { display: grid; gap: 1px; padding: 4px 0 8px; }
    .tree-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; min-height: 32px; padding-right: 8px; border-left: 2px solid transparent; }
    .tree-row:hover { background: var(--vscode-list-hoverBackground); }
    .tree-row:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .tree-row.active { background: var(--vscode-list-activeSelectionBackground); border-left-color: var(--vscode-focusBorder); }
    .twisty, .spacer { width: 22px; height: 28px; display: grid; place-items: center; flex: 0 0 auto; }
    .twisty { border: 0; background: transparent; color: var(--vscode-icon-foreground); padding: 0; }
    .spacer { color: transparent; }
    .node-main { min-width: 0; background: transparent; color: var(--vscode-foreground); border: 0; padding: 2px 0; text-align: left; height: auto; }
    .node-label { display: flex; align-items: center; gap: 7px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; line-height: 1.25; }
    .node-title { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .node-meta { display: block; margin-top: 1px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .node-icon { width: 15px; height: 15px; display: inline-grid; place-items: center; flex: 0 0 auto; color: var(--vscode-descriptionForeground); }
    .group-row .node-label { font-weight: 600; }
    .group-row .node-icon { color: var(--vscode-charts-pink); }
    .document-row .node-icon { color: var(--vscode-charts-blue); }
    .query-row .node-icon { color: var(--vscode-charts-green); }
    .cte-row .node-icon { color: var(--vscode-charts-purple); }
    .subquery-row .node-icon { color: var(--vscode-charts-orange); }
    .document-row { color: var(--vscode-foreground); }
    .document-row .node-label { font-weight: 400; }
    .actions { display: inline-flex; align-items: center; gap: 2px; opacity: .72; }
    .tree-row:hover .actions, .tree-row:focus-within .actions { opacity: 1; }
    .action { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--vscode-descriptionForeground); }
    .action.run { color: var(--vscode-charts-green); }
    .action:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
    .status { display: inline-flex; align-items: center; gap: 5px; color: var(--vscode-descriptionForeground); }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
    .status-dot.completed { background: var(--vscode-testing-iconPassed); }
    .status-dot.failed { background: var(--vscode-errorForeground); }
    .status-dot.running { background: var(--vscode-charts-yellow); }
    .unparsed { color: var(--vscode-descriptionForeground); font-style: italic; }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    let currentState = { groups: [] };
    let collapsed = (vscode.getState() && vscode.getState().collapsed) || {};

    function saveCollapsed() {
      vscode.setState({ collapsed });
    }

    function isCollapsed(id) {
      return collapsed[id] === true;
    }

    function toggle(id) {
      collapsed[id] = !isCollapsed(id);
      saveCollapsed();
      render(currentState);
    }

    function appendTwisty(row, id, hasChildren) {
      if (!hasChildren) {
        const spacer = document.createElement('span');
        spacer.className = 'spacer';
        row.appendChild(spacer);
        return;
      }
      const twisty = document.createElement('button');
      twisty.className = 'twisty';
      twisty.title = isCollapsed(id) ? 'Expand' : 'Collapse';
      twisty.textContent = isCollapsed(id) ? '▸' : '▾';
      twisty.onclick = (event) => {
        event.stopPropagation();
        toggle(id);
      };
      row.appendChild(twisty);
    }

    function iconFor(kind) {
      if (kind === 'connection') return '●';
      if (kind === 'document') return '▣';
      if (kind === 'cte') return '◇';
      if (kind === 'subquery') return '◌';
      return '▶';
    }

    function appendNodeMain(row, labelText, metaText, titleText, onclick, kind) {
      const main = document.createElement('button');
      main.className = 'node-main';
      main.title = titleText || labelText;
      main.onclick = onclick;
      const label = document.createElement('span');
      label.className = 'node-label';
      const icon = document.createElement('span');
      icon.className = 'node-icon';
      icon.textContent = iconFor(kind);
      const title = document.createElement('span');
      title.className = 'node-title';
      title.textContent = labelText;
      label.appendChild(icon);
      label.appendChild(title);
      main.appendChild(label);
      if (metaText) {
        const meta = document.createElement('span');
        meta.className = 'node-meta';
        meta.textContent = metaText;
        main.appendChild(meta);
      }
      row.appendChild(main);
    }

    function appendActions(row, item) {
      const actions = document.createElement('span');
      actions.className = 'actions';
      if (item.status) {
        const status = document.createElement('span');
        status.className = 'status';
        status.title = item.status + (item.durationMs !== undefined ? ' · ' + item.durationMs + 'ms' : '') + (item.rowCount !== undefined ? ' · ' + item.rowCount + ' rows' : '');
        const dot = document.createElement('span');
        dot.className = 'status-dot ' + item.status;
        status.appendChild(dot);
        actions.appendChild(status);
      }
      const reveal = document.createElement('button');
      reveal.className = 'action';
      reveal.title = 'Reveal in editor';
      reveal.textContent = '⌖';
      reveal.onclick = (event) => {
        event.stopPropagation();
        vscode.postMessage({ type: 'reveal', documentUri: item.documentUri, nodeId: item.id });
      };
      const run = document.createElement('button');
      run.className = 'action run';
      run.title = 'Run query';
      run.textContent = '▶';
      run.disabled = item.disabled;
      run.onclick = (event) => {
        event.stopPropagation();
        vscode.postMessage({ type: 'run', documentUri: item.documentUri, nodeId: item.id });
      };
      actions.appendChild(reveal);
      actions.appendChild(run);
      row.appendChild(actions);
    }

    function renderItem(list, item, depth) {
      const itemId = 'item:' + item.documentUri + ':' + item.id;
      const row = document.createElement('div');
      row.className = 'tree-row ' + (item.kind === 'cte' ? 'cte-row' : item.kind === 'subquery' ? 'subquery-row' : 'query-row');
      row.style.paddingLeft = (28 + depth * 16) + 'px';
      appendTwisty(row, itemId, item.children && item.children.length > 0);
      appendNodeMain(
        row,
        item.title,
        'Line ' + item.line + (item.preview ? ' · ' + item.preview : ''),
        item.preview || item.title,
        () => vscode.postMessage({ type: 'reveal', documentUri: item.documentUri, nodeId: item.id }),
        item.kind
      );
      appendActions(row, item);
      list.appendChild(row);
      if (!isCollapsed(itemId)) {
        for (const child of item.children || []) {
          renderItem(list, child, depth + 1);
        }
      }
    }

    function render(state) {
      currentState = state || { groups: [] };
      const groups = currentState.groups || [];
      root.innerHTML = '';
      if (!groups.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Open a SQL query console to see its queries.';
        root.appendChild(empty);
        return;
      }
      const list = document.createElement('div');
      list.className = 'list';
      const summary = document.createElement('div');
      summary.className = 'summary';
      const documentCount = groups.reduce((total, group) => total + group.documents.length, 0);
      const queryCount = groups.reduce((total, group) => total + group.documents.reduce((sum, documentGroup) => sum + documentGroup.items.length, 0), 0);
      summary.innerHTML = '<span class="summary-icon">⌁</span><strong>Query Map</strong><span>' + documentCount + ' docs · ' + queryCount + ' queries</span>';
      root.appendChild(summary);
      for (const group of groups) {
        const groupId = 'group:' + group.id;
        const groupRow = document.createElement('div');
        groupRow.className = 'tree-row group-row';
        appendTwisty(groupRow, groupId, group.documents.length > 0);
        appendNodeMain(
          groupRow,
          group.connectionName + (group.databaseName ? ' / ' + group.databaseName : ''),
          group.documents.length + ' document' + (group.documents.length === 1 ? '' : 's'),
          'Toggle connection',
          () => toggle(groupId),
          'connection'
        );
        groupRow.appendChild(document.createElement('span'));
        list.appendChild(groupRow);
        if (isCollapsed(groupId)) {
          continue;
        }
        for (const documentGroup of group.documents) {
          const docRow = document.createElement('div');
          docRow.className = 'tree-row document-row';
          docRow.style.paddingLeft = '28px';
          appendTwisty(docRow, '', false);
          appendNodeMain(
            docRow,
            documentGroup.documentTitle,
            documentGroup.items.length ? documentGroup.items.length + ' quer' + (documentGroup.items.length === 1 ? 'y' : 'ies') : 'Open to parse queries',
            'Open console',
            () => vscode.postMessage({ type: 'open', documentUri: documentGroup.id }),
            'document'
          );
          docRow.appendChild(document.createElement('span'));
          list.appendChild(docRow);
          if (documentGroup.items.length) {
            for (const item of documentGroup.items) {
              renderItem(list, item, 0);
            }
          } else {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'tree-row unparsed';
            emptyRow.style.paddingLeft = '72px';
            appendTwisty(emptyRow, '', false);
            appendNodeMain(emptyRow, 'No parsed queries', 'Open the console document to populate this map.', 'Open console', () => vscode.postMessage({ type: 'open', documentUri: documentGroup.id }), 'subquery');
            emptyRow.appendChild(document.createElement('span'));
            list.appendChild(emptyRow);
          }
        }
      }
      root.appendChild(list);
    }
    window.addEventListener('message', (event) => {
      if (event.data.type === 'state') render(event.data);
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
