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
        const consoleByUri = new Map(this.consoleRecords.map((record) => [record.documentUri, record]));
        const connectionById = new Map(this.connections.map((connection) => [connection.id, connection]));
        const sqlDocuments = vscode.workspace.textDocuments.filter((document) => document.languageId === 'sql');
        const groupsByConnection = new Map();
        for (const document of sqlDocuments) {
            const documentUri = document.uri.toString();
            const record = consoleByUri.get(documentUri);
            const connection = record ? connectionById.get(record.connectionId) : undefined;
            const connectionId = record?.connectionId ?? 'no-connection';
            const connectionName = connection?.name ?? 'No connection';
            const databaseName = connection?.database;
            const tree = this.sectionService.getTree(document);
            if (!tree.length && !record) {
                continue;
            }
            const group = groupsByConnection.get(connectionId) ?? {
                id: connectionId,
                connectionName,
                databaseName,
                documents: []
            };
            group.documents.push({
                id: documentUri,
                documentTitle: document.fileName.split(/[\\/]/).pop() ?? document.uri.toString(),
                filePath: document.uri.fsPath || document.uri.toString(),
                items: tree.map((node) => this.toItem(documentUri, node))
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
            preview: section.name
                ? `${section.name} · ${section.sql.replace(/\s+/g, ' ').trim().slice(0, 100)}`
                : section.sql.replace(/\s+/g, ' ').trim().slice(0, 120) || `Section ${section.index + 1}`,
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
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    .header { padding: 8px 10px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .empty { min-height: 140px; display: grid; place-items: center; padding: 18px; color: var(--vscode-descriptionForeground); text-align: center; }
    .list { display: grid; gap: 1px; padding: 4px 0; }
    .group { display: grid; gap: 2px; padding: 9px 10px 5px; border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); background: var(--vscode-sideBarSectionHeader-background, transparent); }
    .group:first-child { border-top: 0; }
    .group strong { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .group small { min-width: 0; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .document { display: grid; gap: 2px; padding: 6px 10px 4px 18px; color: var(--vscode-foreground); }
    .document strong { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .document small { min-width: 0; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; padding: 7px 8px 7px 10px; border-left: 2px solid transparent; background: transparent; }
    .item:hover { background: var(--vscode-list-hoverBackground); }
    .item:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .item.completed { border-left-color: var(--vscode-testing-iconPassed); }
    .item.failed { border-left-color: var(--vscode-errorForeground); }
    .main { min-width: 0; background: transparent; color: var(--vscode-foreground); border: 0; padding: 0; text-align: left; height: auto; }
    .preview { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .meta { display: flex; gap: 6px; margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; overflow: hidden; }
    .run { width: 26px; height: 24px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: var(--vscode-foreground); }
    .run:hover { background: var(--vscode-toolbar-hoverBackground); border-color: var(--vscode-panel-border); }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    function render(state) {
      const groups = state.groups || [];
      root.innerHTML = '';
      const header = document.createElement('div');
      header.className = 'header';
      header.textContent = 'Query Map';
      root.appendChild(header);
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
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group';
        groupHeader.innerHTML = '<strong></strong><small></small>';
        groupHeader.querySelector('strong').textContent = group.connectionName + (group.databaseName ? ' / ' + group.databaseName : '');
        groupHeader.querySelector('small').textContent = group.documents.length + ' document' + (group.documents.length === 1 ? '' : 's');
        list.appendChild(groupHeader);
        for (const documentGroup of group.documents) {
          const docHeader = document.createElement('div');
          docHeader.className = 'document';
          docHeader.innerHTML = '<strong></strong><small></small>';
          docHeader.querySelector('strong').textContent = documentGroup.documentTitle;
          docHeader.querySelector('small').textContent = documentGroup.filePath;
          list.appendChild(docHeader);
          for (const item of documentGroup.items) {
            renderItem(item, 0, documentGroup.id);
          }
        }
      }
      root.appendChild(list);

      function renderItem(item, depth, documentUri) {
        const row = document.createElement('div');
        row.className = 'item ' + (item.status || '');
        row.style.paddingLeft = (10 + depth * 16) + 'px';
        const main = document.createElement('button');
        main.className = 'main';
        main.title = 'Reveal SQL section';
        main.onclick = () => vscode.postMessage({ type: 'reveal', documentUri, nodeId: item.id });
        const preview = document.createElement('span');
        preview.className = 'preview';
        preview.textContent = item.preview;
        const meta = document.createElement('span');
        meta.className = 'meta';
        const details = ['L' + item.line, item.status, item.rowCount !== undefined ? item.rowCount + ' rows' : undefined, item.durationMs !== undefined ? item.durationMs + 'ms' : undefined].filter(Boolean);
        meta.textContent = details.join(' · ');
        main.append(preview, meta);
        const run = document.createElement('button');
        run.className = 'run';
        run.title = 'Run this query node';
        run.textContent = '▶';
        run.onclick = () => vscode.postMessage({ type: 'run', documentUri, nodeId: item.id });
        row.append(main, run);
        list.appendChild(row);
        for (const child of item.children || []) {
          renderItem(child, depth + 1, documentUri);
        }
      }
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