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
exports.QueryMapProvider = void 0;
const vscode = __importStar(require("vscode"));
class QueryMapProvider {
    sectionService;
    revealSection;
    runSection;
    getHistoryItems;
    openHistoryItem;
    setConsolePinned;
    untrackConsole;
    moveConsole;
    touchConsoleDocument;
    updateHistoryItem;
    deleteHistoryItem;
    static viewType = 'databaseQueryMap';
    view;
    groups = [];
    historyItems = [];
    consoleRecords = [];
    connections = [];
    activeConnectionIds = new Set();
    resultTabs = [];
    constructor(sectionService, revealSection, runSection, getHistoryItems, openHistoryItem, setConsolePinned, untrackConsole, moveConsole, touchConsoleDocument, updateHistoryItem, deleteHistoryItem) {
        this.sectionService = sectionService;
        this.revealSection = revealSection;
        this.runSection = runSection;
        this.getHistoryItems = getHistoryItems;
        this.openHistoryItem = openHistoryItem;
        this.setConsolePinned = setConsolePinned;
        this.untrackConsole = untrackConsole;
        this.moveConsole = moveConsole;
        this.touchConsoleDocument = touchConsoleDocument;
        this.updateHistoryItem = updateHistoryItem;
        this.deleteHistoryItem = deleteHistoryItem;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.html(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => void this.onMessage(message));
        this.postState();
    }
    updateConsoles(records, connections, activeConnectionIds = []) {
        this.consoleRecords = records;
        this.connections = connections;
        this.activeConnectionIds = new Set(activeConnectionIds);
        this.refreshGroups();
    }
    updateFromEditor(_editor) {
        this.refreshGroups();
    }
    refreshGroups() {
        const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
        const groupsByConnection = new Map();
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
                status: latestResult?.executionStatus,
                durationMs: latestResult?.executionTimeMs,
                rowCount: latestResult?.rowCount,
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
        this.historyItems = this.toHistoryItems(this.getHistoryItems());
        this.postState();
    }
    documentTitle(documentUri) {
        try {
            const uri = vscode.Uri.parse(documentUri);
            return uri.fsPath.split(/[\\/]/).pop() || uri.toString();
        }
        catch {
            return documentUri.split(/[\\/]/).pop() || documentUri;
        }
    }
    updateResults(tabs) {
        this.resultTabs = tabs;
        this.refreshGroups();
    }
    async onMessage(message) {
        if (message.type === 'ready') {
            this.postState();
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
            await this.touchConsoleDocument(message.documentUri);
            await this.openDocument(message.documentUri);
            return;
        }
        if (!message.documentUri) {
            return;
        }
        const editor = await this.openDocument(message.documentUri);
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
    async openDocument(documentUri) {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
            return vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
        }
        catch {
            void vscode.window.showWarningMessage('Source SQL file no longer exists.');
            return undefined;
        }
    }
    toItem(documentUri, section) {
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
    resultFor(documentUri, section) {
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
    previewSql(sql, maxLength) {
        return sql
            .split(/\r?\n/)
            .map((line) => line.replace(/--.*$/, '').trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .slice(0, maxLength);
    }
    itemTitle(section) {
        if (section.kind === 'cte') {
            return section.name ? `CTE ${section.name}` : `CTE ${section.index + 1}`;
        }
        if (section.kind === 'subquery') {
            return `Subquery ${section.index + 1}`;
        }
        return `Query ${section.index + 1}`;
    }
    postState() {
        void this.view?.webview.postMessage({
            type: 'state',
            groups: this.groups,
            history: this.historyItems
        });
    }
    latestResultForDocument(documentUri) {
        return [...this.resultTabs]
            .filter((item) => item.sourceDocumentUri === documentUri)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    toHistoryItems(items) {
        const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
        return [...items]
            .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.executedAt - a.executedAt)
            .slice(0, 100)
            .map((item) => {
            const connection = connectionById.get(item.connectionId);
            return {
                id: item.id,
                connectionId: item.connectionId,
                connectionName: connection?.name ?? 'Unknown connection',
                databaseName: connection?.database,
                sql: item.sql,
                preview: this.previewSql(item.sql, 180),
                status: item.status,
                favorite: item.favorite === true,
                rowCount: item.rowCount,
                executedAt: item.executedAt,
                sourceFile: item.sourceFile
            };
        });
    }
    todayStart() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    consoleSortValue(record) {
        return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
    }
    findNodeById(nodes, nodeId) {
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
    toSectionNode(node) {
        return {
            ...node,
            aliases: this.sectionService.extractAliases(node.sql),
            tables: this.sectionService.extractTables(node.sql)
        };
    }
    html(webview) {
        const nonce = Date.now().toString();
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: 13px; }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .tabs { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); }
    .tab { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--vscode-descriptionForeground); min-height: 32px; }
    .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
    .empty { min-height: 140px; display: grid; place-items: center; padding: 18px; color: var(--vscode-descriptionForeground); text-align: center; }
    .list { display: grid; gap: 1px; padding: 6px 0 8px; }
    .group { padding: 7px 10px 4px; color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; min-height: 42px; padding: 4px 6px 4px 10px; }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .main { min-width: 0; border: 0; padding: 0; background: transparent; color: var(--vscode-foreground); text-align: left; }
    .label { display: flex; align-items: center; gap: 5px; min-width: 0; line-height: 1.25; }
    .title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .meta { display: block; margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { display: flex; gap: 1px; opacity: .72; }
    .row:hover .actions, .actions:focus-within { opacity: 1; }
    .icon { width: 22px; height: 22px; display: grid; place-items: center; border: 0; background: transparent; color: var(--vscode-icon-foreground); padding: 0; border-radius: 3px; }
    .icon:hover { background: var(--vscode-toolbar-hoverBackground); }
    .pin { color: var(--vscode-charts-yellow); }
    .status { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--vscode-descriptionForeground); }
    .status-completed { background: var(--vscode-testing-iconPassed); }
    .status-failed { background: var(--vscode-testing-iconFailed); }
    .status-running, .status-queued { background: var(--vscode-progressBar-background); }
    .status-cancelled { background: var(--vscode-testing-iconSkipped); }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    let saved = vscode.getState() || {};
    let currentState = { groups: [], history: [] };
    let activeTab = saved.activeTab || 'active';

    function saveState() {
      vscode.setState({ activeTab });
    }

    function render(state) {
      currentState = state || { groups: [], history: [] };
      root.innerHTML = '';
      root.appendChild(renderTabs());
      root.appendChild(activeTab === 'history' ? renderHistory() : renderActive());
    }

    function renderTabs() {
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      tabs.appendChild(tabButton('active', 'Active Session'));
      tabs.appendChild(tabButton('history', 'History'));
      return tabs;
    }

    function tabButton(id, label) {
      const button = document.createElement('button');
      button.className = 'tab' + (activeTab === id ? ' active' : '');
      button.textContent = label;
      button.onclick = () => {
        activeTab = id;
        saveState();
        render(currentState);
      };
      return button;
    }

    function renderActive() {
      const groups = currentState.groups || [];
      if (!groups.length) return empty('No active or recent query consoles.');
      const list = document.createElement('div');
      list.className = 'list';
      for (const group of groups) {
        const header = document.createElement('div');
        header.className = 'group';
        header.textContent = group.connectionName + (group.databaseName ? ' / ' + group.databaseName : '');
        list.appendChild(header);
        for (const documentGroup of group.documents) {
          list.appendChild(consoleRow(documentGroup));
        }
      }
      return list;
    }

    function renderHistory() {
      const history = currentState.history || [];
      if (!history.length) return empty('Executed queries will appear here.');
      const list = document.createElement('div');
      list.className = 'list';
      for (const item of history) {
        list.appendChild(historyRow(item));
      }
      return list;
    }

    function consoleRow(item) {
      const row = document.createElement('div');
      row.className = 'row';
      const main = mainButton(item.documentTitle, consoleMeta(item), 'Open console', () => vscode.postMessage({ type: 'openConsole', documentUri: item.documentUri }));
      if (item.status) main.querySelector('.label').prepend(statusDot(item.status));
      row.appendChild(main);
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(icon(item.pinned ? '*' : '+', item.pinned ? 'Unpin' : 'Pin', () => vscode.postMessage({ type: 'togglePin', consoleId: item.id, pinned: !item.pinned }), item.pinned ? 'pin' : ''));
      actions.appendChild(icon('^', 'Move up', () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'up' })));
      actions.appendChild(icon('v', 'Move down', () => vscode.postMessage({ type: 'moveConsole', consoleId: item.id, direction: 'down' })));
      actions.appendChild(icon('x', 'Untrack console', () => vscode.postMessage({ type: 'untrackConsole', consoleId: item.id })));
      row.appendChild(actions);
      return row;
    }

    function historyRow(item) {
      const row = document.createElement('div');
      row.className = 'row';
      const main = mainButton(item.preview || item.sql, historyMeta(item), 'Open history query', () => vscode.postMessage({ type: 'openHistory', historyId: item.id }));
      main.querySelector('.label').prepend(statusDot(item.status));
      row.appendChild(main);
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(icon(item.favorite ? '*' : '+', item.favorite ? 'Remove favorite' : 'Favorite', () => vscode.postMessage({ type: 'toggleFavoriteHistory', historyId: item.id, favorite: !item.favorite }), item.favorite ? 'pin' : ''));
      actions.appendChild(icon('c', 'Copy SQL', () => vscode.postMessage({ type: 'copyHistory', historyId: item.id })));
      actions.appendChild(icon('x', 'Delete history item', () => vscode.postMessage({ type: 'deleteHistory', historyId: item.id })));
      row.appendChild(actions);
      return row;
    }

    function mainButton(title, meta, tooltip, onclick) {
      const main = document.createElement('button');
      main.className = 'main';
      main.title = tooltip;
      main.onclick = onclick;
      const label = document.createElement('span');
      label.className = 'label';
      const text = document.createElement('span');
      text.className = 'title';
      text.textContent = title;
      label.appendChild(text);
      main.appendChild(label);
      const metaNode = document.createElement('span');
      metaNode.className = 'meta';
      metaNode.textContent = meta;
      main.appendChild(metaNode);
      return main;
    }

    function icon(text, title, onclick, extraClass) {
      const button = document.createElement('button');
      button.className = 'icon' + (extraClass ? ' ' + extraClass : '');
      button.type = 'button';
      button.title = title;
      button.textContent = text;
      button.onclick = (event) => {
        event.stopPropagation();
        onclick();
      };
      return button;
    }

    function statusDot(status) {
      const dot = document.createElement('span');
      dot.className = 'status status-' + status;
      dot.title = status;
      return dot;
    }

    function consoleMeta(item) {
      const tags = [];
      if (item.pinned) tags.push('pinned');
      if (item.isActiveConnection) tags.push('connected');
      if (item.isToday) tags.push('today');
      if (item.rowCount !== undefined) tags.push(item.rowCount + ' rows');
      if (item.durationMs !== undefined) tags.push(item.durationMs + 'ms');
      tags.push(relativeTime(item.lastTouchedAt));
      return tags.filter(Boolean).join(' | ');
    }

    function historyMeta(item) {
      const tags = [item.connectionName + (item.databaseName ? ' / ' + item.databaseName : ''), item.status];
      if (item.rowCount !== undefined) tags.push(item.rowCount + ' rows');
      tags.push(relativeTime(item.executedAt));
      return tags.filter(Boolean).join(' | ');
    }

    function relativeTime(value) {
      if (!value) return '';
      const seconds = Math.max(1, Math.round((Date.now() - value) / 1000));
      if (seconds < 60) return 'just now';
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return minutes + 'm ago';
      const hours = Math.round(minutes / 60);
      if (hours < 24) return hours + 'h ago';
      return new Date(value).toLocaleDateString();
    }

    function empty(text) {
      const node = document.createElement('div');
      node.className = 'empty';
      node.textContent = text;
      return node;
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
exports.QueryMapProvider = QueryMapProvider;
//# sourceMappingURL=QueryMapProvider.js.map