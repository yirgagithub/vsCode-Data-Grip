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
    sessionStore;
    executor;
    revealSource;
    onTabsChanged;
    static viewType = 'sqlResults';
    view;
    tabs;
    activeTabId;
    constructor(context, sessionStore, executor, revealSource, onTabsChanged) {
        this.context = context;
        this.sessionStore = sessionStore;
        this.executor = executor;
        this.revealSource = revealSource;
        this.onTabsChanged = onTabsChanged;
        this.tabs = this.sessionStore.getTabs();
        this.activeTabId = this.tabs[0]?.id;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media', 'results')]
        };
        webviewView.webview.html = this.html(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => this.onMessage(message));
    }
    async show() {
        await vscode.commands.executeCommand(`${ResultsPanelProvider.viewType}.focus`);
        this.post({ type: 'hydrate', tabs: this.tabs, activeTabId: this.activeTabId });
    }
    async addTab(tab) {
        const active = this.tabs.find((item) => item.id === this.activeTabId);
        if (active && !active.pinned) {
            this.tabs = this.tabs.map((item) => item.id === active.id ? { ...tab, id: active.id } : item);
            this.activeTabId = active.id;
            this.post({ type: 'upsertTab', tab: { ...tab, id: active.id }, active: true });
        }
        else {
            this.tabs.push(tab);
            this.activeTabId = tab.id;
            this.post({ type: 'upsertTab', tab, active: true });
        }
        await this.sessionStore.saveTabs(this.tabs);
        this.onTabsChanged?.(this.tabs);
        await this.show();
    }
    getTabs() {
        return this.tabs;
    }
    getTab(id) {
        return this.tabs.find((tab) => tab.id === id);
    }
    async onMessage(message) {
        if (message.type === 'ready') {
            this.post({ type: 'hydrate', tabs: this.tabs, activeTabId: this.activeTabId });
            return;
        }
        if (message.type === 'activateTab') {
            this.activeTabId = message.tabId;
            const tab = this.getTab(message.tabId);
            if (tab) {
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
            this.activeTabId = this.tabs[0]?.id;
            await this.sessionStore.saveTabs(this.tabs);
            this.onTabsChanged?.(this.tabs);
            this.post({ type: 'hydrate', tabs: this.tabs, activeTabId: this.activeTabId });
            return;
        }
        if (message.type === 'renameTab') {
            this.tabs = this.tabs.map((tab) => tab.id === message.tabId ? { ...tab, customTitle: message.title, updatedAt: Date.now() } : tab);
            await this.sessionStore.saveTabs(this.tabs);
            this.onTabsChanged?.(this.tabs);
            this.post({ type: 'hydrate', tabs: this.tabs, activeTabId: this.activeTabId });
            return;
        }
        if (message.type === 'rerunTab') {
            const tab = this.getTab(message.tabId);
            if (tab) {
                const maxRows = typeof message.maxRows === 'number' ? message.maxRows : message.maxRows === null ? undefined : tab.maxRows;
                const next = await this.executor.execute({
                    connectionId: tab.connectionId,
                    sql: tab.queryText,
                    maxRows,
                    source: {
                        fileName: tab.sourceFile,
                        documentUri: tab.sourceDocumentUri,
                        sectionIndex: tab.sourceSectionIndex,
                        range: tab.sourceRange
                    }
                });
                await this.addTab({ ...next, pinned: tab.pinned, customTitle: tab.customTitle });
            }
            return;
        }
        if (message.type === 'copy') {
            await vscode.env.clipboard.writeText(message.text);
        }
    }
    post(message) {
        void this.view?.webview.postMessage(message);
    }
    html(webview) {
        const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'results', 'results.js'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'results', 'results.css'));
        const nonce = Date.now().toString();
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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