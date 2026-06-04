import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, DatabaseType } from '../../types';
import { ConnectionManager } from '../../database/connectionManager';
import { createId } from '../../utils/id';
import { connectionDefaultsForType, DEFAULTS_BY_DATABASE_TYPE } from '../../services/connectionDefaults';

type EditorMessage =
  | { type: 'ready' }
  | { type: 'test'; config: FormConnection }
  | { type: 'save'; config: FormConnection }
  | { type: 'delete'; id: string }
  | { type: 'select'; id: string | 'new' }
  | { type: 'cancel' };

interface FormConnection {
  id?: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: string;
  database: string;
  username: string;
  password?: string;
  sslMode: 'disable' | 'prefer' | 'require';
  defaultSchema?: string;
  color: ConnectionConfig['color'];
  connectTimeoutMs?: string;
  queryTimeoutMs?: string;
  production?: boolean;
  readOnlyDefault?: boolean;
}

export class ConnectionEditorPanel {
  static async open(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    existing?: ConnectionConfig
  ): Promise<ConnectionConfigWithPassword | undefined> {
    return new Promise((resolve) => {
      const panel = vscode.window.createWebviewPanel(
        'databaseConnectionEditor',
        existing ? `Edit ${existing.name}` : 'Add Database Connection',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      const editor = new ConnectionEditorPanel(panel, connectionManager, existing, resolve);
      context.subscriptions.push(panel);
      editor.render();
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly connectionManager: ConnectionManager,
    private readonly existing: ConnectionConfig | undefined,
    private readonly resolve: (value: ConnectionConfigWithPassword | undefined) => void
  ) {
    this.panel.onDidDispose(() => this.resolve(undefined));
    this.panel.webview.onDidReceiveMessage((message: EditorMessage) => void this.handleMessage(message));
  }

  render(): void {
    this.panel.webview.html = this.html(this.panel.webview, this.toForm(this.existing));
  }

  private async handleMessage(message: EditorMessage): Promise<void> {
    if (message.type === 'cancel') {
      this.panel.dispose();
      return;
    }
    if (message.type === 'delete') {
      await this.connectionManager.delete(message.id);
      const connections = this.connectionManager.getConnections();
      await this.connectionManager.setSelectedConnection(connections[0]?.id);
      await this.panel.webview.postMessage({
        type: 'connections',
        connections,
        selectedId: connections[0]?.id ?? 'new'
      });
      return;
    }
    if (message.type === 'test') {
      await this.postState('testing', 'Testing connection...');
      try {
        let config = this.fromForm(message.config);
        if (!config.password && config.id) {
          const existingWithPassword = await this.connectionManager.getConnectionWithPassword(config.id);
          config = { ...config, password: existingWithPassword.password };
        }
        const detail = await this.connectionManager.testConfig(config);
        await this.postState('success', `Connected: ${detail}`);
      } catch (error) {
        await this.postState('error', error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (message.type === 'save') {
      try {
        let config = this.fromForm(message.config);
        if (!config.password && config.id) {
          const existingWithPassword = await this.connectionManager.getConnectionWithPassword(config.id);
          config = { ...config, password: existingWithPassword.password };
        }
        this.resolve(config);
        this.panel.dispose();
      } catch (error) {
        await this.postState('error', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async postState(state: 'idle' | 'testing' | 'success' | 'error', message: string): Promise<void> {
    await this.panel.webview.postMessage({ type: 'state', state, message });
  }

  private fromForm(form: FormConnection): ConnectionConfigWithPassword {
    const port = Number(form.port);
    if (!form.name.trim() || !form.host.trim() || !form.database.trim() || !form.username.trim()) {
      throw new Error('Name, host, database, and username are required.');
    }
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('Port must be a positive number.');
    }
    return {
      id: form.id ?? this.existing?.id ?? createId('conn'),
      name: form.name.trim(),
      type: form.type,
      host: form.host.trim(),
      port,
      database: form.database.trim(),
      username: form.username.trim(),
      password: form.password === '' ? undefined : form.password,
      sslMode: form.sslMode,
      defaultSchema: form.defaultSchema?.trim() || 'public',
      color: form.color,
      connectTimeoutMs: toOptionalNumber(form.connectTimeoutMs),
      queryTimeoutMs: toOptionalNumber(form.queryTimeoutMs),
      production: form.production === true,
      readOnlyDefault: form.readOnlyDefault === true
    };
  }

  private toForm(connection: ConnectionConfig | undefined): FormConnection {
    const defaults = connectionDefaultsForType(connection?.type ?? 'postgres');
    return {
      id: connection?.id,
      name: connection?.name ?? defaults.name,
      type: connection?.type ?? 'postgres',
      host: connection?.host ?? 'localhost',
      port: String(connection?.port ?? defaults.port),
      database: connection?.database ?? defaults.database,
      username: connection?.username ?? '',
      password: '',
      sslMode: connection?.sslMode ?? defaults.sslMode,
      defaultSchema: connection?.defaultSchema ?? 'public',
      color: connection?.color ?? defaults.color,
      connectTimeoutMs: connection?.connectTimeoutMs ? String(connection.connectTimeoutMs) : '',
      queryTimeoutMs: connection?.queryTimeoutMs ? String(connection.queryTimeoutMs) : String(vscode.workspace.getConfiguration('database').get<number>('query.timeoutMs', 300000)),
      production: connection?.production ?? false,
      readOnlyDefault: connection?.readOnlyDefault ?? false
    };
  }

  private html(webview: vscode.Webview, form: FormConnection): string {
    const nonce = getNonce();
    const data = JSON.stringify(form).replace(/</g, '\\u003c');
    const connections = JSON.stringify(this.connectionManager.getConnections()).replace(/</g, '\\u003c');
    const defaults = JSON.stringify(DEFAULTS_BY_DATABASE_TYPE).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
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
      --space-lg: clamp(0.75rem, 0.65rem + 0.4vw, 1rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.45rem, 1.25rem + 0.45vw, 1.8rem);
      --tab-height: clamp(1.75rem, 1.55rem + 0.45vw, 2.15rem);
      --radius-sm: 0.25rem;
      --radius-md: 0.4rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    button, input, select { font: inherit; }
    button {
      height: var(--toolbar-button-size);
      padding: 0 var(--space-sm);
      color: var(--text-main);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border);
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    button:disabled {
      color: var(--text-disabled);
      cursor: default;
      opacity: .6;
    }
    .dialog-shell {
      height: 100vh;
      display: grid;
      place-items: center;
      padding: var(--space-lg);
      overflow: auto;
    }
    form.dialog {
      width: min(92vw, 68rem);
      max-height: min(90vh, 52rem);
      min-height: min(38rem, 90vh);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid var(--border);
      background: var(--bg-main);
      box-shadow: 0 1rem 2.6rem color-mix(in srgb, black 34%, transparent);
      overflow: hidden;
    }
    .dialog-titlebar {
      min-height: clamp(2.4rem, 2.15rem + .6vw, 3rem);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .dialog-titlebar h1 {
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 1.04rem;
      font-weight: 600;
    }
    .close {
      width: var(--toolbar-button-size);
      padding: 0;
      font-size: 1.05rem;
    }
    .dialog-body {
      min-height: 0;
      display: grid;
      grid-template-columns: clamp(12rem, 22vw, 17rem) minmax(0, 1fr);
      overflow: hidden;
    }
    .sidebar {
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border-right: 1px solid var(--border);
      background: var(--bg-panel);
      overflow: hidden;
    }
    .sidebar-header {
      padding: var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .section-label {
      display: block;
      margin-bottom: var(--space-xs);
      color: var(--text-muted);
      font-size: .86em;
      font-weight: 600;
      text-transform: uppercase;
    }
    .rail-toolbar,
    .dialog-toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .icon-button {
      width: var(--toolbar-button-size);
      padding: 0;
      display: inline-grid;
      place-items: center;
      color: var(--vscode-icon-foreground, var(--text-muted));
      flex: 0 0 auto;
    }
    .data-source-list {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
    }
    .source-row {
      width: 100%;
      height: var(--row-height);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      background: transparent;
      text-align: left;
    }
    .source-row.active {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground, var(--text-main));
    }
    .db-icon {
      color: var(--vscode-charts-blue);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .source-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .status-dot {
      width: .45rem;
      height: .45rem;
      border-radius: 50%;
      background: var(--success);
    }
    .problems {
      padding: var(--space-sm);
      border-top: 1px solid var(--border);
      color: var(--text-muted);
    }
    .content {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg-main);
    }
    .top-fields {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto minmax(11rem, 14rem) auto minmax(7rem, 10rem);
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-md);
      border-bottom: 1px solid var(--border);
    }
    .field-label {
      color: var(--text-muted);
      white-space: nowrap;
    }
    input,
    select {
      min-width: 0;
      height: var(--toolbar-button-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: var(--radius-sm);
      padding: 0 var(--space-sm);
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border, var(--border));
    }
    .comment-link {
      grid-column: 2 / 3;
      justify-self: start;
      height: auto;
      padding: 0;
      color: var(--accent);
      border: 0;
      background: transparent;
    }
    .tabs {
      display: flex;
      align-items: flex-end;
      gap: var(--space-xxs);
      min-width: 0;
      padding: var(--space-xs) var(--space-md) 0;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tab {
      height: var(--tab-height);
      padding: 0 var(--space-md);
      color: var(--text-muted);
      border-color: transparent;
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
    .tab-panel {
      min-height: 0;
      display: none;
      overflow: auto;
      padding: var(--space-md);
    }
    .tab-panel.active { display: block; }
    .form-grid {
      display: grid;
      grid-template-columns: minmax(8rem, 11rem) minmax(0, 1fr) minmax(5rem, 8rem);
      gap: var(--space-sm);
      align-items: center;
      max-width: 56rem;
    }
    .full-row {
      grid-column: 2 / -1;
      min-width: 0;
    }
    .segment {
      display: inline-flex;
      align-items: stretch;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .segment button {
      border: 0;
      border-right: 1px solid var(--border);
      border-radius: 0;
      color: var(--text-muted);
      background: var(--bg-elevated);
    }
    .segment button:last-child { border-right: 0; }
    .segment button.active {
      color: var(--text-main);
      background: var(--bg-selected);
    }
    .inline-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(5rem, 8rem);
      gap: var(--space-sm);
      min-width: 0;
    }
    .password-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(7rem, 10rem);
      gap: var(--space-sm);
      align-items: center;
      min-width: 0;
    }
    .url-field {
      font-family: var(--vscode-editor-font-family);
    }
    .schemas-layout {
      min-height: 20rem;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      border: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .schema-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 16rem);
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
    }
    .schema-tree {
      min-height: 0;
      overflow: auto;
      padding: var(--space-xs) 0;
    }
    .schema-row {
      min-height: var(--row-height);
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      text-align: left;
      width: 100%;
      border-radius: 0;
      border: 0;
      background: transparent;
      color: var(--text-main);
    }
    .schema-row.active {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground, var(--text-main));
    }
    .schema-row.child { padding-left: calc(var(--space-lg) * 1.6); }
    .schema-row input[type="checkbox"],
    .check input[type="checkbox"] {
      width: 1rem;
      height: 1rem;
      accent-color: var(--accent);
      padding: 0;
    }
    .schema-footer {
      display: grid;
      gap: var(--space-sm);
      padding: var(--space-sm);
      border-top: 1px solid var(--border);
      background: var(--bg-main);
    }
    .pattern {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-sm);
      align-items: center;
    }
    .pattern code {
      overflow: auto;
      padding: var(--space-xs);
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      font-family: var(--vscode-editor-font-family);
      white-space: nowrap;
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-md);
      align-items: center;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--text-main);
    }
    .advanced-grid {
      display: grid;
      grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
      gap: var(--space-sm);
      max-width: 42rem;
      align-items: center;
    }
    .empty-state {
      color: var(--text-muted);
      padding: var(--space-md);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .dialog-actions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: center;
      padding: var(--space-sm) var(--space-md);
      border-top: 1px solid var(--border);
      background: var(--bg-panel);
    }
    .button-row {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-xs);
    }
    .primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-border, transparent);
    }
    .primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-border, transparent);
    }
    #status {
      min-width: 0;
      min-height: var(--toolbar-button-size);
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #status.error { color: var(--danger); }
    #status.success { color: var(--success); }
    #status.testing::before {
      content: "";
      width: .75rem;
      height: .75rem;
      border-radius: 50%;
      border: 2px solid var(--accent);
      border-top-color: transparent;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 760px) {
      .dialog-shell { padding: 0; place-items: stretch; }
      form.dialog { width: 100vw; min-height: 100vh; max-height: 100vh; border: 0; }
      .dialog-body { grid-template-columns: minmax(0, 1fr); }
      .sidebar { display: none; }
      .top-fields,
      .form-grid,
      .advanced-grid,
      .schema-toolbar { grid-template-columns: minmax(0, 1fr); }
      .comment-link,
      .full-row { grid-column: 1 / -1; }
      .password-row,
      .inline-row { grid-template-columns: minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <div class="dialog-shell">
    <form id="form" class="dialog">
      <div class="dialog-titlebar">
        <h1>Data Sources and Drivers</h1>
        <button type="button" id="cancelTop" class="close" aria-label="Close">×</button>
      </div>
      <div class="dialog-body">
        <aside class="sidebar" aria-label="Data sources">
          <div class="sidebar-header">
            <span class="section-label">Data Sources</span>
            <div class="rail-toolbar" role="toolbar" aria-label="Data source actions">
              <button type="button" class="icon-button" title="Add data source" aria-label="Add data source">＋</button>
              <button type="button" class="icon-button" title="Remove data source" aria-label="Remove data source">−</button>
              <button type="button" class="icon-button" title="Duplicate data source" aria-label="Duplicate data source">⧉</button>
              <button type="button" class="icon-button" title="Settings" aria-label="Settings">⚙</button>
            </div>
          </div>
          <div class="data-source-list">
            <button type="button" class="source-row active">
              <span class="db-icon">▣</span>
              <span class="source-name" id="sourceName">Connection</span>
              <span class="status-dot" title="Configured"></span>
            </button>
          </div>
          <div class="problems">
            <span class="section-label">Problems</span>
            <span>No problems found</span>
          </div>
        </aside>
        <section class="content">
          <div class="top-fields">
            <span class="field-label">Name:</span>
            <input name="name" autocomplete="off" aria-label="Connection name">
            <span class="field-label">Driver:</span>
            <select name="type" id="typeField" aria-label="Database type">
              <option value="postgres">PostgreSQL</option>
              <option value="redshift">Amazon Redshift</option>
            </select>
            <span class="field-label">Color:</span>
            <select name="color" aria-label="Connection color">
              <option>green</option>
              <option>blue</option>
              <option>purple</option>
              <option>yellow</option>
              <option>red</option>
              <option>gray</option>
            </select>
            <button type="button" class="comment-link">Add comment</button>
          </div>
          <div class="tabs" role="tablist" aria-label="Connection settings">
            <button type="button" class="tab active" data-tab="general" role="tab" aria-selected="true">General</button>
            <button type="button" class="tab" data-tab="options" role="tab">Options</button>
            <button type="button" class="tab" data-tab="ssh" role="tab">SSH/SSL</button>
            <button type="button" class="tab" data-tab="schemas" role="tab">Schemas</button>
          </div>
          <div class="tab-panel active" data-panel="general">
            <div class="form-grid">
              <span class="field-label">Connection type:</span>
              <div class="segment full-row" role="group" aria-label="Connection type">
                <button type="button" data-db-type="postgres">default</button>
                <button type="button" data-db-type="redshift">IAM cluster/region</button>
                <button type="button">URL only</button>
              </div>
              <span class="field-label">Host:</span>
              <div class="inline-row full-row">
                <input name="host" autocomplete="off" aria-label="Host">
                <input name="port" inputmode="numeric" aria-label="Port">
              </div>
              <span class="field-label">Authentication:</span>
              <select class="full-row" aria-label="Authentication mode"><option>User & Password</option></select>
              <span class="field-label">User:</span>
              <input class="full-row" name="username" autocomplete="off" aria-label="Username">
              <span class="field-label">Password:</span>
              <div class="password-row full-row">
                <input name="password" type="password" placeholder="${form.id ? 'Leave blank to keep existing password' : ''}" aria-label="Password">
                <span class="field-label">Save:</span>
                <select aria-label="Password save mode"><option>Forever</option><option>Until restart</option></select>
              </div>
              <span class="field-label">Database:</span>
              <input class="full-row" name="database" autocomplete="off" aria-label="Database">
              <span class="field-label">URL:</span>
              <input class="full-row url-field" id="urlPreview" readonly aria-label="JDBC URL preview">
            </div>
          </div>
          <div class="tab-panel" data-panel="options">
            <div class="advanced-grid">
              <span class="field-label">Read mode:</span>
              <label class="check"><input name="readOnlyDefault" type="checkbox">Read-only by default</label>
              <span class="field-label">Environment:</span>
              <label class="check"><input name="production" type="checkbox">Production connection</label>
              <span class="field-label">Connect timeout ms:</span>
              <input name="connectTimeoutMs" inputmode="numeric" aria-label="Connect timeout milliseconds">
              <span class="field-label">Query timeout ms:</span>
              <input name="queryTimeoutMs" inputmode="numeric" aria-label="Query timeout milliseconds">
            </div>
          </div>
          <div class="tab-panel" data-panel="ssh">
            <div class="advanced-grid">
              <span class="field-label">SSL mode:</span>
              <select name="sslMode" aria-label="SSL mode"><option>disable</option><option>prefer</option><option>require</option></select>
            </div>
          </div>
          <div class="tab-panel" data-panel="schemas">
            <div class="schemas-layout">
              <div class="schema-toolbar">
                <div class="dialog-toolbar" role="toolbar" aria-label="Schema actions">
                  <button type="button" class="icon-button" title="Refresh schemas">↻</button>
                  <button type="button" class="icon-button" title="Expand all">▾</button>
                  <button type="button" class="icon-button" title="Collapse all">▸</button>
                  <button type="button" class="icon-button" title="Remove">−</button>
                </div>
                <input aria-label="Search schemas" placeholder="Search">
              </div>
              <div class="schema-tree" role="tree" aria-label="Schemas">
                <button type="button" class="schema-row" data-schema-pattern="*"><span>▾</span><span>All databases</span></button>
                <button type="button" class="schema-row" data-schema-pattern="external"><span>▸</span><span>All external databases</span></button>
                <button type="button" class="schema-row" data-schema-pattern="default"><span>▾</span><span>Default database</span></button>
                <button type="button" class="schema-row child" data-schema-pattern="database"><span>▾</span><span id="schemaDatabaseLabel">database</span></button>
                <button type="button" class="schema-row child" data-schema-pattern="awsdatacatalog"><span>▸</span><span>awsdatacatalog</span></button>
                <button type="button" class="schema-row child" data-schema-pattern="dev"><span>▸</span><span>dev</span></button>
                <button type="button" class="schema-row child" data-schema-pattern="padb_harvest"><span>▸</span><span>padb_harvest</span></button>
              </div>
              <div class="schema-footer">
                <label class="pattern"><span class="field-label">Schema pattern:</span><code id="schemaPattern">@:@|avow:public</code></label>
                <label class="pattern"><span class="field-label">Default schema:</span><input name="defaultSchema" autocomplete="off" aria-label="Default schema"></label>
                <div class="checks">
                  <label class="check"><input type="checkbox">Show internal system schemas</label>
                  <label class="check"><input type="checkbox">Show template databases</label>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="dialog-actions">
        <button type="button" id="test" class="secondary">Test Connection</button>
        <div id="status" aria-live="polite"></div>
        <div class="button-row">
          <button type="button" id="cancel" class="secondary">Cancel</button>
          <button type="button" id="save" class="primary">OK</button>
        </div>
      </div>
    </form>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const formData = ${data};
    const allConnections = ${connections};
    const defaultsByType = ${defaults};
    const form = document.getElementById('form');
    const connectionList = allConnections.map((connection) => ({ ...connection }));
    let selectedId = formData.id ?? (connectionList[0]?.id || 'new');
    let draftActive = !formData.id;
    const currentSchemaRows = Array.from(document.querySelectorAll('[data-schema-pattern]'));
    const schemaSearch = form.querySelector('input[aria-label="Search schemas"]');
    for (const [key, value] of Object.entries(formData)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value === true;
      else field.value = value ?? '';
    }
    let previousType = formData.type || 'postgres';
    const typeField = form.elements.namedItem('type');
    const sourceName = document.getElementById('sourceName');
    const urlPreview = document.getElementById('urlPreview');
    const schemaPattern = document.getElementById('schemaPattern');
    const schemaDatabaseLabel = document.getElementById('schemaDatabaseLabel');
    const typeButtons = Array.from(document.querySelectorAll('[data-db-type]'));
    const tabs = Array.from(document.querySelectorAll('[data-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-panel]'));
    const addButton = document.querySelector('.rail-toolbar button[title="Add data source"]');
    const removeButton = document.querySelector('.rail-toolbar button[title="Remove data source"]');
    const sourceRows = document.querySelector('.data-source-list');
    function connectionLabel(connection) {
      return connection.name || defaultsByType[connection.type || 'postgres'].name;
    }
    function renderSourceList() {
      const selected = selectedId;
      sourceRows.innerHTML = '';
      const draftRow = document.createElement('button');
      draftRow.type = 'button';
      draftRow.className = 'source-row' + (selected === 'new' ? ' active' : '');
      draftRow.innerHTML = '<span class="db-icon">＋</span><span class="source-name">New connection</span><span class="status-dot" title="Draft"></span>';
      draftRow.addEventListener('click', () => selectConnection('new'));
      sourceRows.appendChild(draftRow);
      for (const connection of connectionList) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'source-row' + (selected === connection.id ? ' active' : '');
        row.innerHTML = '<span class="db-icon">▣</span><span class="source-name"></span><span class="status-dot" title="Configured"></span>';
        row.querySelector('.source-name').textContent = connectionLabel(connection);
        row.addEventListener('click', () => selectConnection(connection.id));
        sourceRows.appendChild(row);
      }
    }
    function loadConnection(connection) {
      const next = connection || {
        id: undefined,
        name: defaultsByType[form.elements.namedItem('type').value || 'postgres'].name,
        type: form.elements.namedItem('type').value || 'postgres',
        host: 'localhost',
        port: defaultsByType[form.elements.namedItem('type').value || 'postgres'].port,
        database: defaultsByType[form.elements.namedItem('type').value || 'postgres'].database,
        username: '',
        password: '',
        sslMode: defaultsByType[form.elements.namedItem('type').value || 'postgres'].sslMode,
        defaultSchema: 'public',
        color: defaultsByType[form.elements.namedItem('type').value || 'postgres'].color
      };
      for (const [key, value] of Object.entries(next)) {
        const field = form.elements.namedItem(key);
        if (!field) continue;
        if (field.type === 'checkbox') field.checked = value === true;
        else field.value = value ?? '';
      }
      formData.id = next.id;
      previousType = form.elements.namedItem('type').value || 'postgres';
      draftActive = !next.id;
      syncDerivedFields();
      renderSourceList();
    }
    function selectConnection(id) {
      selectedId = id;
      if (id === 'new') {
        loadConnection({
          type: typeField.value || 'postgres',
          name: defaultsByType[typeField.value || 'postgres'].name,
          host: 'localhost',
          port: defaultsByType[typeField.value || 'postgres'].port,
          database: defaultsByType[typeField.value || 'postgres'].database,
          username: '',
          password: '',
          sslMode: defaultsByType[typeField.value || 'postgres'].sslMode,
          defaultSchema: 'public',
          color: defaultsByType[typeField.value || 'postgres'].color
        });
        return;
      }
      const existing = connectionList.find((connection) => connection.id === id);
      if (existing) {
        loadConnection({
          ...existing,
          password: ''
        });
      }
    }
    function syncDerivedFields() {
      const name = form.elements.namedItem('name').value || 'Connection';
      const type = typeField.value;
      const host = form.elements.namedItem('host').value || 'host';
      const port = form.elements.namedItem('port').value || '';
      const database = form.elements.namedItem('database').value || 'database';
      const schema = form.elements.namedItem('defaultSchema').value || 'public';
      sourceName.textContent = name;
      schemaDatabaseLabel.textContent = database + ' (Default database)';
      schemaPattern.textContent = '@:@|' + database + ':' + schema;
      urlPreview.value = 'jdbc:' + (type === 'redshift' ? 'redshift' : 'postgresql') + '://' + host + (port ? ':' + port : '') + '/' + database;
      typeButtons.forEach((button) => button.classList.toggle('active', button.dataset.dbType === type));
      renderSourceList();
    }
    function applyDefaultsForType(nextType) {
      const previousDefaults = defaultsByType[previousType] || defaultsByType.postgres;
      const nextDefaults = defaultsByType[nextType] || defaultsByType.postgres;
      for (const name of ['name', 'port', 'database', 'sslMode', 'color']) {
        const field = form.elements.namedItem(name);
        if (!field) continue;
        if (!field.value || field.value === previousDefaults[name]) {
          field.value = nextDefaults[name];
        }
      }
      previousType = nextType;
    }
    typeField.addEventListener('change', () => {
      const nextType = typeField.value;
      applyDefaultsForType(nextType);
      syncDerivedFields();
    });
    typeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        typeField.value = button.dataset.dbType;
        typeField.dispatchEvent(new Event('change'));
      });
    });
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        tabs.forEach((item) => {
          item.classList.toggle('active', item === tab);
          item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
        });
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === id));
      });
    });
    for (const name of ['name', 'host', 'port', 'database', 'defaultSchema']) {
      form.elements.namedItem(name)?.addEventListener('input', syncDerivedFields);
    }
    form.elements.namedItem('type')?.addEventListener('change', syncDerivedFields);
    addButton.addEventListener('click', () => selectConnection('new'));
    removeButton.addEventListener('click', () => {
      if (selectedId === 'new') {
        const fallback = connectionList[0];
        selectedId = fallback?.id || 'new';
        selectConnection(selectedId);
        return;
      }
      const id = selectedId;
      if (!id) return;
      vscode.postMessage({ type: 'delete', id });
    });
    schemaSearch?.addEventListener('input', () => {
      const term = schemaSearch.value.trim().toLowerCase();
      currentSchemaRows.forEach((row) => {
        const label = row.textContent?.toLowerCase() || '';
        row.hidden = !!term && !label.includes(term) && !(row.dataset.schemaPattern || '').includes(term);
      });
    });
    currentSchemaRows.forEach((row) => {
      row.addEventListener('click', () => {
        const pattern = row.dataset.schemaPattern;
        if (!pattern) return;
        const defaultSchema = pattern === '*' ? 'public' : pattern === 'default' ? (form.elements.namedItem('defaultSchema').value || 'public') : pattern;
        form.elements.namedItem('defaultSchema').value = defaultSchema;
        syncDerivedFields();
      });
    });
    function collect() {
      const data = {};
      for (const element of form.elements) {
        if (!element.name) continue;
        data[element.name] = element.type === 'checkbox' ? element.checked : element.value;
      }
      data.id = formData.id;
      return data;
    }
    document.getElementById('save').addEventListener('click', () => vscode.postMessage({ type: 'save', config: collect() }));
    document.getElementById('test').addEventListener('click', () => vscode.postMessage({ type: 'test', config: collect() }));
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('cancelTop').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    window.addEventListener('message', event => {
      if (event.data?.type === 'connections') {
        connectionList.splice(0, connectionList.length, ...(event.data.connections || []));
        if (event.data.selectedId) {
          selectedId = event.data.selectedId;
        }
        if (selectedId === 'new' || !connectionList.some((connection) => connection.id === selectedId)) {
          selectedId = connectionList[0]?.id || 'new';
        }
        renderSourceList();
        if (selectedId === 'new') {
          selectConnection('new');
        } else {
          const active = connectionList.find((connection) => connection.id === selectedId);
          if (active) {
            loadConnection({ ...active, password: '' });
          }
        }
        return;
      }
      const status = document.getElementById('status');
      status.className = event.data.state || '';
      status.textContent = event.data.message || '';
      const testing = event.data.state === 'testing';
      document.getElementById('save').disabled = testing;
      document.getElementById('test').disabled = testing;
    });
    renderSourceList();
    if (formData.id) {
      selectConnection(formData.id);
    } else {
      selectConnection('new');
    }
  </script>
</body>
</html>`;
  }
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : undefined;
}

function getNonce(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}
