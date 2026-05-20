import * as vscode from 'vscode';
import { QueryExecutor } from '../../database/queryExecutor';
import { ResultSessionStore } from '../../persistence/resultSessionStore';
import { QueryResultTab } from '../../types';
import { ResultsFromWebviewMessage, ResultsToWebviewMessage } from './messages';

export class ResultsPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'sqlResults';
  private view?: vscode.WebviewView;
  private tabs: QueryResultTab[];
  private activeTabId?: string;
  private activeConnectionId?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sessionStore: ResultSessionStore,
    private readonly executor: QueryExecutor,
    private readonly revealSource?: (tab: QueryResultTab) => Promise<void>,
    private readonly onTabsChanged?: (tabs: QueryResultTab[]) => void
  ) {
    this.tabs = this.sessionStore.getTabs();
    this.activeTabId = this.tabs[0]?.id;
    this.activeConnectionId = this.tabs.find((tab) => tab.id === this.activeTabId)?.connectionId;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media', 'results')]
    };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: ResultsFromWebviewMessage) => this.onMessage(message));
  }

  async show(connectionId?: string): Promise<void> {
    if (connectionId) {
      this.selectConnection(connectionId);
    }
    await vscode.commands.executeCommand(`${ResultsPanelProvider.viewType}.focus`);
    this.postHydrate();
  }

  setActiveConnection(connectionId: string | undefined): void {
    this.selectConnection(connectionId);
    this.postHydrate();
  }

  async addTab(tab: QueryResultTab): Promise<void> {
    this.activeConnectionId = tab.connectionId;
    const active = this.reusableTabFor(tab);
    if (active && !active.pinned) {
      this.tabs = this.tabs.map((item) => item.id === active.id ? { ...tab, id: active.id } : item);
      this.activeTabId = active.id;
    } else {
      this.tabs.push(tab);
      this.activeTabId = tab.id;
    }
    await this.sessionStore.saveTabs(this.tabs);
    this.onTabsChanged?.(this.tabs);
    await this.show();
  }

  getTabs(): QueryResultTab[] {
    return this.tabs;
  }

  getTab(id: string): QueryResultTab | undefined {
    return this.tabs.find((tab) => tab.id === id);
  }

  private async onMessage(message: ResultsFromWebviewMessage): Promise<void> {
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

  private post(message: ResultsToWebviewMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private postHydrate(): void {
    const tabs = this.visibleTabs();
    this.post({ type: 'hydrate', tabs, activeTabId: this.activeTabId && tabs.some((tab) => tab.id === this.activeTabId) ? this.activeTabId : tabs[0]?.id });
  }

  private selectConnection(connectionId: string | undefined): void {
    this.activeConnectionId = connectionId;
    const tabs = this.visibleTabs();
    this.activeTabId = tabs.some((tab) => tab.id === this.activeTabId)
      ? this.activeTabId
      : [...tabs].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
  }

  private visibleTabs(): QueryResultTab[] {
    if (!this.activeConnectionId) {
      return this.tabs;
    }
    return this.tabs.filter((tab) => tab.connectionId === this.activeConnectionId);
  }

  private reusableTabFor(tab: QueryResultTab): QueryResultTab | undefined {
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

  private html(webview: vscode.Webview): string {
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
