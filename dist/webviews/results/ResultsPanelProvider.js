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
exports.ResultsPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
class ResultsPanelProvider {
    context;
    connectionManager;
    sessionStore;
    executor;
    revealSource;
    onTabsChanged;
    runActiveEditorSelection;
    onMutationRequest;
    onCompareRequest;
    static viewType = 'sqlResults';
    view;
    tabs;
    activeTabId;
    activeConnectionId;
    constructor(context, connectionManager, sessionStore, executor, revealSource, onTabsChanged, runActiveEditorSelection, onMutationRequest, onCompareRequest) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.sessionStore = sessionStore;
        this.executor = executor;
        this.revealSource = revealSource;
        this.onTabsChanged = onTabsChanged;
        this.runActiveEditorSelection = runActiveEditorSelection;
        this.onMutationRequest = onMutationRequest;
        this.onCompareRequest = onCompareRequest;
        this.tabs = this.sessionStore.getTabs();
        this.activeTabId = this.tabs[0]?.id;
        this.activeConnectionId = this.tabs.find((tab) => tab.id === this.activeTabId)?.connectionId;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        };
        webviewView.webview.html = this.html(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => this.onMessage(message));
    }
    async show(connectionId) {
        if (connectionId) {
            this.selectConnection(connectionId);
        }
        await vscode.commands.executeCommand(`${ResultsPanelProvider.viewType}.focus`);
        this.postHydrate();
    }
    setActiveConnection(connectionId) {
        this.selectConnection(connectionId);
        this.postHydrate();
    }
    async addTab(tab, options = {}) {
        this.activeConnectionId = tab.connectionId;
        let storedTab = tab;
        if (options.replaceTabId) {
            const existing = this.tabs.find((item) => item.id === options.replaceTabId);
            storedTab = { ...tab, id: existing?.id ?? options.replaceTabId };
            this.tabs = existing
                ? this.tabs.map((item) => item.id === storedTab.id ? storedTab : item)
                : [...this.tabs, storedTab];
            this.activeTabId = storedTab.id;
        }
        else {
            const active = options.forceNew ? undefined : this.reusableTabFor(tab);
            if (active && !active.pinned) {
                storedTab = { ...tab, id: active.id };
                this.tabs = this.tabs.map((item) => item.id === active.id ? storedTab : item);
                this.activeTabId = active.id;
            }
            else {
                this.tabs.push(tab);
                this.activeTabId = tab.id;
            }
        }
        await this.sessionStore.saveTabs(this.tabs);
        this.onTabsChanged?.(this.tabs);
        await this.show();
        return storedTab;
    }
    getTabs() {
        return this.tabs;
    }
    getTab(id) {
        return this.tabs.find((tab) => tab.id === id);
    }
    getActiveTab() {
        return this.getTab(this.activeTabId ?? '');
    }
    async onMessage(message) {
        if (message.type === 'ready') {
            this.postHydrate();
            return;
        }
        if (message.type === 'activateTab') {
            this.activeTabId = message.tabId;
            const tab = this.getTab(message.tabId);
            if (tab) {
                this.activeConnectionId = tab.connectionId;
                await this.revealSource?.(tab);
            }
            return;
        }
        if (message.type === 'pinTab') {
            this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, pinned: message.pinned, updatedAt: Date.now() } : tab);
            await this.sessionStore.saveTabs(this.tabs);
            this.onTabsChanged?.(this.tabs);
            return;
        }
        if (message.type === 'closeTab') {
            this.tabs = this.tabs.filter((tab) => tab.id !== message.tabId);
            this.activeTabId = this.visibleTabs()[0]?.id;
            await this.sessionStore.saveTabs(this.tabs);
            this.onTabsChanged?.(this.tabs);
            this.postHydrate();
            return;
        }
        if (message.type === 'renameTab') {
            this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, customTitle: message.title, updatedAt: Date.now() } : tab);
            await this.sessionStore.saveTabs(this.tabs);
            this.onTabsChanged?.(this.tabs);
            this.postHydrate();
            return;
        }
        if (message.type === 'rerunTab') {
            const tab = this.getTab(message.tabId);
            if (tab) {
                const maxRows = typeof message.maxRows === 'number' ? message.maxRows : message.maxRows === null ? undefined : tab.maxRows;
                const offset = typeof message.offset === 'number' ? message.offset : message.offset === null ? 0 : tab.rowOffset ?? 0;
                if (await this.runActiveEditorSelection?.(maxRows)) {
                    return;
                }
                const started = Date.now();
                await this.addTab({
                    ...tab,
                    executionStatus: 'running',
                    executionStartedAt: started,
                    executionFinishedAt: undefined,
                    executionTimeMs: undefined,
                    rowCount: undefined,
                    maxRows,
                    rowOffset: offset,
                    error: undefined,
                    resultSets: [],
                    activeResultSetIndex: 0,
                    updatedAt: started
                }, { replaceTabId: tab.id });
                const next = await this.executor.execute({
                    connectionId: tab.connectionId,
                    sql: tab.queryText,
                    maxRows,
                    offset,
                    source: {
                        origin: tab.sourceOrigin,
                        fileName: tab.sourceFile,
                        documentUri: tab.sourceDocumentUri,
                        sectionIndex: tab.sourceSectionIndex,
                        range: tab.sourceRange
                    }
                });
                await this.addTab({ ...next, id: tab.id, pinned: tab.pinned, customTitle: tab.customTitle }, { replaceTabId: tab.id });
            }
            return;
        }
        if (message.type === 'setTransactionMode') {
            const tab = this.getTab(message.tabId);
            if (tab) {
                await this.applyTransactionMode(tab.connectionId, message.mode);
            }
            return;
        }
        if (message.type === 'commitTransaction') {
            const tab = this.getTab(message.tabId);
            if (tab) {
                await this.connectionManager.commitTransaction(tab.connectionId);
                await this.syncTransactionState(tab.connectionId);
            }
            return;
        }
        if (message.type === 'rollbackTransaction') {
            const tab = this.getTab(message.tabId);
            if (tab) {
                await this.connectionManager.rollbackTransaction(tab.connectionId);
                await this.syncTransactionState(tab.connectionId);
            }
            return;
        }
        if (message.type === 'copy') {
            await vscode.env.clipboard.writeText(message.text);
            return;
        }
        if (message.type === 'mutation') {
            const tab = this.getTab(this.activeTabId ?? '');
            if (tab) {
                await this.onMutationRequest?.(tab, message);
            }
            return;
        }
        if (message.type === 'compareTabs') {
            const tab = this.getTab(this.activeTabId ?? '');
            if (tab) {
                await this.onCompareRequest?.(tab, message.resultSetIndex);
            }
            return;
        }
    }
    post(message) {
        void this.view?.webview.postMessage(message);
    }
    postHydrate() {
        const tabs = this.visibleTabs().map((tab) => this.withTransactionState(tab));
        this.post({ type: 'hydrate', tabs, activeTabId: this.activeTabId && tabs.some((tab) => tab.id === this.activeTabId) ? this.activeTabId : tabs[0]?.id });
    }
    selectConnection(connectionId) {
        this.activeConnectionId = connectionId;
        const tabs = this.visibleTabs();
        this.activeTabId = tabs.some((tab) => tab.id === this.activeTabId)
            ? this.activeTabId
            : [...tabs].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
    }
    visibleTabs() {
        if (!this.activeConnectionId) {
            return this.tabs;
        }
        return this.tabs.filter((tab) => tab.connectionId === this.activeConnectionId);
    }
    withTransactionState(tab) {
        return {
            ...tab,
            transaction: {
                mode: this.connectionManager.getTransactionMode(tab.connectionId),
                open: this.connectionManager.isTransactionOpen(tab.connectionId)
            }
        };
    }
    async applyTransactionMode(connectionId, mode) {
        this.connectionManager.setTransactionMode(connectionId, mode);
        if (mode === 'manual') {
            if (!this.connectionManager.isTransactionOpen(connectionId)) {
                await this.connectionManager.beginTransaction(connectionId);
            }
        }
        else if (this.connectionManager.isTransactionOpen(connectionId)) {
            const answer = await vscode.window.showWarningMessage('Switching to auto-commit will close the current transaction.', { modal: true }, 'Commit', 'Rollback', 'Cancel');
            if (answer === 'Cancel' || !answer) {
                this.connectionManager.setTransactionMode(connectionId, 'manual');
                return;
            }
            if (answer === 'Commit') {
                await this.connectionManager.commitTransaction(connectionId);
            }
            else {
                await this.connectionManager.rollbackTransaction(connectionId);
            }
        }
        await this.syncTransactionState(connectionId);
    }
    async syncTransactionState(connectionId) {
        this.tabs = this.tabs.map((tab) => tab.connectionId === connectionId ? this.withTransactionState(tab) : tab);
        await this.sessionStore.saveTabs(this.tabs);
        this.onTabsChanged?.(this.tabs);
        this.postHydrate();
    }
    reusableTabFor(tab) {
        if (tab.pinned) {
            return undefined;
        }
        const sameConnectionTabs = this.tabs.filter((item) => item.connectionId === tab.connectionId);
        const active = sameConnectionTabs.find((item) => item.id === this.activeTabId);
        if (active && !active.pinned) {
            return active;
        }
        return sameConnectionTabs
            .filter((item) => !item.pinned)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    html(webview) {
        const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'results', 'results.js'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'results', 'results.css'));
        const codicons = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'codicons', 'codicon.css'));
        const nonce = Date.now().toString();
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codicons}" rel="stylesheet">
  <link href="${style}" rel="stylesheet">
  <title>SQL Results</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
    }
}
exports.ResultsPanelProvider = ResultsPanelProvider;
//# sourceMappingURL=ResultsPanelProvider.js.map