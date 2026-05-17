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
    static viewType = 'databaseQueryMap';
    view;
    groups = [];
    consoleRecords = [];
    connections = [];
    resultTabs = [];
    constructor(sectionService, revealSection, runSection) {
        this.sectionService = sectionService;
        this.revealSection = revealSection;
        this.runSection = runSection;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.html(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => void this.onMessage(message));
        this.postState();
    }
    updateConsoles(records, connections) {
        this.consoleRecords = records;
        this.connections = connections;
        this.refreshGroups();
    }
    updateFromEditor(_editor) {
        this.refreshGroups();
    }
    refreshGroups() {
        const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
        const groupsByConnection = new Map();
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
            group.documents.push({
                id: record.documentUri,
                documentTitle: this.documentTitle(record.documentUri),
                items: []
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
            groups: this.groups
        });
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
    .empty { min-height: 140px; display: grid; place-items: center; padding: 18px; color: var(--vscode-descriptionForeground); text-align: center; }
    .list { display: grid; gap: 1px; padding: 6px 0 8px; }
    .tree-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; min-height: 32px; padding-right: 8px; }
    .tree-row:hover { background: var(--vscode-list-hoverBackground); }
    .tree-row:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .twisty, .spacer { width: 22px; height: 28px; display: grid; place-items: center; flex: 0 0 auto; }
    .twisty { border: 0; background: transparent; color: var(--vscode-icon-foreground); padding: 0; }
    .spacer { color: transparent; }
    .node-main { min-width: 0; background: transparent; color: var(--vscode-foreground); border: 0; padding: 2px 0; text-align: left; height: auto; }
    .node-label { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; line-height: 1.25; }
    .node-meta { display: block; margin-top: 1px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .group-row .node-label { font-weight: 600; }
    .document-row { color: var(--vscode-foreground); }
    .document-row .node-label { font-weight: 400; }
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

    function appendNodeMain(row, labelText, metaText, titleText, onclick) {
      const main = document.createElement('button');
      main.className = 'node-main';
      main.title = titleText || labelText;
      main.onclick = onclick;
      const label = document.createElement('span');
      label.className = 'node-label';
      label.textContent = labelText;
      main.appendChild(label);
      if (metaText) {
        const meta = document.createElement('span');
        meta.className = 'node-meta';
        meta.textContent = metaText;
        main.appendChild(meta);
      }
      row.appendChild(main);
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
          () => toggle(groupId)
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
            '',
            'Open console',
            () => vscode.postMessage({ type: 'open', documentUri: documentGroup.id })
          );
          docRow.appendChild(document.createElement('span'));
          list.appendChild(docRow);
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
exports.QueryMapProvider = QueryMapProvider;
//# sourceMappingURL=QueryMapProvider.js.map