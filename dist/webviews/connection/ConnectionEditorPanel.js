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
exports.ConnectionEditorPanel = void 0;
const vscode = __importStar(require("vscode"));
const id_1 = require("../../utils/id");
const connectionDefaults_1 = require("../../services/connectionDefaults");
class ConnectionEditorPanel {
    panel;
    extensionUri;
    connectionManager;
    existing;
    resolve;
    static async open(context, connectionManager, existing) {
        return new Promise((resolve) => {
            const panel = vscode.window.createWebviewPanel('databaseConnectionEditor', existing ? `Edit ${existing.name}` : 'Add Database Connection', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
            const editor = new ConnectionEditorPanel(panel, context.extensionUri, connectionManager, existing, resolve);
            context.subscriptions.push(panel);
            editor.render();
        });
    }
    constructor(panel, extensionUri, connectionManager, existing, resolve) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.connectionManager = connectionManager;
        this.existing = existing;
        this.resolve = resolve;
        this.panel.onDidDispose(() => this.resolve(undefined));
        this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
    }
    render() {
        this.panel.webview.html = this.html(this.panel.webview, this.toForm(this.existing));
    }
    async handleMessage(message) {
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
        if (message.type === 'pickSqliteFile') {
            const files = await vscode.window.showOpenDialog({
                title: 'Choose SQLite database file',
                openLabel: 'Use Database File',
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'SQLite databases': ['db', 'sqlite', 'sqlite3'],
                    'All files': ['*']
                }
            });
            const file = files?.[0];
            if (file) {
                await this.panel.webview.postMessage({ type: 'sqliteFile', path: file.fsPath });
            }
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
                await this.postState('success', `Connected to ${engineDisplayName(config.type)}: ${detail}`);
            }
            catch (error) {
                await this.postState('error', friendlyConnectionError(error, message.config.type));
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
            }
            catch (error) {
                await this.postState('error', error instanceof Error ? error.message : String(error));
            }
        }
    }
    async postState(state, message) {
        await this.panel.webview.postMessage({ type: 'state', state, message });
    }
    fromForm(form) {
        const defaults = (0, connectionDefaults_1.connectionDefaultsForType)(form.type);
        const port = Number(form.port);
        const hostRequired = form.type !== 'sqlite';
        const usernameRequired = form.type !== 'sqlite' && form.type !== 'redis';
        const missing = [];
        if (!form.name.trim()) {
            missing.push('connection name');
        }
        if (!form.database.trim()) {
            missing.push(databaseFieldLabel(form.type).toLowerCase());
        }
        if (hostRequired && !form.host.trim()) {
            missing.push(hostFieldLabel(form.type).toLowerCase());
        }
        if (usernameRequired && !form.username.trim()) {
            missing.push('username');
        }
        if (missing.length > 0) {
            throw new Error(`Required ${missing.length === 1 ? 'field is' : 'fields are'} missing: ${missing.join(', ')}.`);
        }
        if (form.type !== 'sqlite' && (!Number.isInteger(port) || port <= 0)) {
            throw new Error(`${engineDisplayName(form.type)} port must be a positive whole number.`);
        }
        if (form.type === 'redis') {
            const index = Number(form.database.trim());
            if (!Number.isInteger(index) || index < 0) {
                throw new Error('Redis database index must be a zero-based whole number, for example 0.');
            }
        }
        return {
            id: form.id ?? this.existing?.id ?? (0, id_1.createId)('conn'),
            name: form.name.trim(),
            type: form.type,
            host: form.host.trim() || defaults.host,
            port: form.type === 'sqlite' ? 0 : port,
            database: form.database.trim(),
            username: form.username.trim(),
            password: form.password === '' ? undefined : form.password,
            sslMode: toSslMode(form.sslMode, defaults.sslMode),
            defaultSchema: form.defaultSchema?.trim() || defaults.defaultSchema,
            color: form.color,
            connectTimeoutMs: toOptionalNumber(form.connectTimeoutMs),
            queryTimeoutMs: toOptionalNumber(form.queryTimeoutMs),
            production: form.production === true,
            readOnlyDefault: form.readOnlyDefault === true,
            sshTunnel: this.sshTunnelFromForm(form)
        };
    }
    sshTunnelFromForm(form) {
        if (form.sshTunnelEnabled !== true) {
            return undefined;
        }
        const host = form.sshTunnelHost?.trim() || '';
        const username = form.sshTunnelUser?.trim() || '';
        if (!host || !username) {
            throw new Error('SSH tunnel requires a bastion host and username.');
        }
        return {
            enabled: true,
            host,
            port: toOptionalNumber(form.sshTunnelPort),
            username,
            privateKeyPath: form.sshTunnelKeyPath?.trim() || undefined,
            localHost: form.sshTunnelLocalHost?.trim() || undefined,
            localPort: toOptionalNumber(form.sshTunnelLocalPort)
        };
    }
    toForm(connection) {
        const defaults = (0, connectionDefaults_1.connectionDefaultsForType)(connection?.type ?? 'postgres');
        return {
            id: connection?.id,
            name: connection?.name ?? defaults.name,
            type: connection?.type ?? 'postgres',
            host: connection?.host ?? defaults.host,
            port: String(connection?.port ?? defaults.port),
            database: connection?.database ?? defaults.database,
            username: connection?.username ?? defaults.username,
            password: '',
            sslMode: connection?.sslMode ?? defaults.sslMode,
            defaultSchema: connection?.defaultSchema ?? defaults.defaultSchema,
            color: connection?.color ?? defaults.color,
            connectTimeoutMs: connection?.connectTimeoutMs ? String(connection.connectTimeoutMs) : '',
            queryTimeoutMs: connection?.queryTimeoutMs ? String(connection.queryTimeoutMs) : String(vscode.workspace.getConfiguration('database').get('query.timeoutMs', 300000)),
            production: connection?.production ?? false,
            readOnlyDefault: connection?.readOnlyDefault ?? false,
            sshTunnelEnabled: connection?.sshTunnel?.enabled ?? false,
            sshTunnelHost: connection?.sshTunnel?.host ?? '',
            sshTunnelPort: connection?.sshTunnel?.port ? String(connection.sshTunnel.port) : '22',
            sshTunnelUser: connection?.sshTunnel?.username ?? '',
            sshTunnelKeyPath: connection?.sshTunnel?.privateKeyPath ?? '',
            sshTunnelLocalHost: connection?.sshTunnel?.localHost ?? '127.0.0.1',
            sshTunnelLocalPort: connection?.sshTunnel?.localPort ? String(connection.sshTunnel.localPort) : ''
        };
    }
    html(webview, form) {
        const nonce = getNonce();
        const data = JSON.stringify(form).replace(/</g, '\\u003c');
        const connections = JSON.stringify(this.connectionManager.getConnections()).replace(/</g, '\\u003c');
        const defaults = JSON.stringify(connectionDefaults_1.DEFAULTS_BY_DATABASE_TYPE).replace(/</g, '\\u003c');
        const codicons = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css'));
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${codicons}" rel="stylesheet">
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
    .codicon[class*='codicon-'] { font-size: var(--icon-size); line-height: 1; color: inherit; vertical-align: middle; }
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
      transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, opacity 0.12s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation-duration: 0.001ms !important; }
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
    .rail-toolbar {
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
    .field-label.required::after {
      content: " *";
      color: var(--danger);
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
    .field-stack {
      display: grid;
      gap: var(--space-xs);
      min-width: 0;
    }
    .path-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-sm);
      align-items: center;
      min-width: 0;
    }
    .path-row .icon-button {
      border-color: var(--vscode-button-border, var(--border));
      background: var(--bg-elevated);
    }
    .field-help {
      min-height: 1.15em;
      color: var(--text-muted);
      font-size: .88em;
      line-height: 1.3;
    }
    .field-help:empty {
      display: none;
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
      overflow: auto;
      white-space: normal;
      line-height: 1.25;
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
        <button type="button" id="cancelTop" class="close" aria-label="Close"><i class="codicon codicon-close"></i></button>
      </div>
      <div class="dialog-body">
        <aside class="sidebar" aria-label="Data sources">
          <div class="sidebar-header">
            <span class="section-label">Data Sources</span>
            <div class="rail-toolbar" role="toolbar" aria-label="Data source actions">
              <button type="button" class="icon-button" title="Add data source" aria-label="Add data source"><i class="codicon codicon-add"></i></button>
              <button type="button" class="icon-button" title="Remove data source" aria-label="Remove data source"><i class="codicon codicon-remove"></i></button>
            </div>
          </div>
          <div class="data-source-list">
            <button type="button" class="source-row active">
              <span class="db-icon"><i class="codicon codicon-database"></i></span>
              <span class="source-name" id="sourceName">Connection</span>
              <span class="status-dot" title="Configured"></span>
            </button>
          </div>
        </aside>
        <section class="content">
          <div class="top-fields">
            <span class="field-label" data-field-label="name">Name:</span>
            <input name="name" autocomplete="off" aria-label="Connection name" data-field="name">
            <span class="field-label">Driver:</span>
            <select name="type" id="typeField" aria-label="Database type">
              <option value="postgres">PostgreSQL</option>
              <option value="redshift">Amazon Redshift</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
              <option value="sqlserver">Microsoft SQL Server</option>
              <option value="oracle">Oracle</option>
              <option value="redis">Redis</option>
              <option value="snowflake">Snowflake</option>
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
                <button type="button" data-db-type="postgres">PostgreSQL</button>
                <button type="button" data-db-type="redshift">Redshift</button>
                <button type="button" data-db-type="mysql">MySQL</button>
                <button type="button" data-db-type="sqlite">SQLite</button>
                <button type="button" data-db-type="sqlserver">SQL Server</button>
                <button type="button" data-db-type="oracle">Oracle</button>
                <button type="button" data-db-type="redis">Redis</button>
                <button type="button" data-db-type="snowflake">Snowflake</button>
              </div>
              <span class="field-label" data-field-label="host">Host:</span>
              <div class="field-stack full-row">
                <div class="inline-row">
                  <input name="host" autocomplete="off" aria-label="Host" data-field="host">
                  <input name="port" inputmode="numeric" aria-label="Port" data-field="port">
                </div>
                <div class="field-help" data-help="host"></div>
              </div>
              <span class="field-label" data-field-label="username">User:</span>
              <div class="field-stack full-row">
                <input name="username" autocomplete="off" aria-label="Username" data-field="username">
                <div class="field-help" data-help="username"></div>
              </div>
              <span class="field-label" data-field-label="password">Password:</span>
              <div class="field-stack full-row">
                <div class="password-row">
                  <input name="password" type="password" placeholder="${form.id ? 'Leave blank to keep existing password' : ''}" aria-label="Password" data-field="password">
                </div>
                <div class="field-help" data-help="auth"></div>
              </div>
              <span class="field-label" data-field-label="database">Database:</span>
              <div class="field-stack full-row">
                <div class="path-row">
                  <input name="database" autocomplete="off" aria-label="Database" data-field="database">
                  <button type="button" id="sqlitePick" class="icon-button" title="Choose SQLite database file" aria-label="Choose SQLite database file"><i class="codicon codicon-folder-opened"></i></button>
                </div>
                <div class="field-help" data-help="database"></div>
              </div>
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
              <span class="field-label">SSH tunnel:</span>
              <label class="check"><input name="sshTunnelEnabled" type="checkbox">Use SSH tunnel</label>
              <span class="field-label">Bastion host:</span>
              <div class="inline-row full-row">
                <input name="sshTunnelHost" autocomplete="off" aria-label="SSH tunnel host">
                <input name="sshTunnelPort" inputmode="numeric" aria-label="SSH tunnel port">
              </div>
              <span class="field-label">Bastion user:</span>
              <input class="full-row" name="sshTunnelUser" autocomplete="off" aria-label="SSH tunnel username">
              <span class="field-label">Private key:</span>
              <input class="full-row" name="sshTunnelKeyPath" autocomplete="off" aria-label="SSH private key path">
              <span class="field-label">Local bind:</span>
              <div class="inline-row full-row">
                <input name="sshTunnelLocalHost" autocomplete="off" aria-label="SSH tunnel local host">
                <input name="sshTunnelLocalPort" inputmode="numeric" aria-label="SSH tunnel local port">
              </div>
              <span class="field-label">SSL mode:</span>
              <div class="field-stack">
                <select name="sslMode" aria-label="SSL mode" data-field="sslMode"><option>disable</option><option>prefer</option><option>require</option></select>
                <div class="field-help" data-help="ssl"></div>
              </div>
            </div>
          </div>
          <div class="tab-panel" data-panel="schemas">
            <div class="advanced-grid">
              <span class="field-label" data-field-label="defaultSchema">Default schema:</span>
              <div class="field-stack">
                <input name="defaultSchema" autocomplete="off" aria-label="Default schema" data-field="defaultSchema">
                <div class="field-help" data-help="defaultSchema"></div>
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
    const engineGuidance = {
      postgres: {
        hostLabel: 'Host:',
        databaseLabel: 'Database:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Default schema:',
        hostPlaceholder: 'localhost',
        databasePlaceholder: 'postgres',
        usernamePlaceholder: 'postgres',
        databaseHelp: 'Database name to open after login.',
        usernameHelp: 'Required unless the server is configured for passwordless local auth.',
        authHelp: 'Password auth is common. Leave blank only for trust or socket-based local auth.',
        sslHelp: 'Use require for managed cloud databases that enforce TLS; disable is fine for local Docker.',
        defaultSchemaHelp: 'Usually public.',
        required: { host: true, username: true, database: true }
      },
      redshift: {
        hostLabel: 'Cluster endpoint:',
        databaseLabel: 'Database:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Default schema:',
        hostPlaceholder: 'example-cluster.abc123.us-east-1.redshift.amazonaws.com',
        databasePlaceholder: 'dev',
        usernamePlaceholder: 'awsuser',
        databaseHelp: 'Redshift defaults to dev unless your cluster was created with another database.',
        usernameHelp: 'Use the database user or temporary IAM-generated user.',
        authHelp: 'Use the generated database password/token when connecting through IAM tooling.',
        sslHelp: 'Redshift normally requires TLS, so require is the default.',
        defaultSchemaHelp: 'Usually public.',
        required: { host: true, username: true, database: true }
      },
      mysql: {
        hostLabel: 'Host:',
        databaseLabel: 'Database:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Default schema:',
        hostPlaceholder: 'localhost',
        databasePlaceholder: 'mysql',
        usernamePlaceholder: 'root',
        databaseHelp: 'Schema/database to use after login.',
        usernameHelp: 'Required for MySQL accounts.',
        authHelp: 'Password can be blank for local accounts configured without a password.',
        sslHelp: 'Use require when your MySQL server enforces TLS.',
        defaultSchemaHelp: 'MySQL uses the database field as the active schema.',
        required: { host: true, username: true, database: true }
      },
      sqlite: {
        hostLabel: 'Host:',
        databaseLabel: 'SQLite file:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Default schema:',
        hostPlaceholder: '',
        databasePlaceholder: '/path/to/app.db',
        usernamePlaceholder: '',
        hostHelp: 'SQLite is file-based; host and port are not used.',
        databaseHelp: 'Choose a .db/.sqlite file, or use :memory: for a temporary database.',
        usernameHelp: 'SQLite does not use username or password fields.',
        authHelp: 'No network auth is used for SQLite files.',
        sslHelp: 'SQLite is file-based, so SSL mode is ignored.',
        defaultSchemaHelp: 'SQLite usually uses main.',
        required: { host: false, username: false, database: true },
        disabled: { host: true, port: true, username: true, password: true, sslMode: true }
      },
      sqlserver: {
        hostLabel: 'Server:',
        databaseLabel: 'Database:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Default schema:',
        hostPlaceholder: 'localhost',
        databasePlaceholder: 'master',
        usernamePlaceholder: 'sa',
        databaseHelp: 'Initial catalog, for example master or your app database.',
        usernameHelp: 'Required for SQL authentication.',
        authHelp: 'Use SQL authentication credentials. Windows auth is not configured from this form yet.',
        sslHelp: 'prefer encrypts and trusts the server certificate; require validates the certificate chain.',
        defaultSchemaHelp: 'Usually dbo.',
        required: { host: true, username: true, database: true }
      },
      oracle: {
        hostLabel: 'Host:',
        databaseLabel: 'Service name:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Default schema:',
        hostPlaceholder: 'localhost',
        databasePlaceholder: 'ORCLPDB1',
        usernamePlaceholder: 'system',
        databaseHelp: 'Service name used in host:port/service, for example ORCLPDB1.',
        usernameHelp: 'Oracle user/schema name.',
        authHelp: 'Use the password for the Oracle user above.',
        sslHelp: 'Use require only when your Oracle listener is configured for TLS.',
        defaultSchemaHelp: 'Leave blank to use the login user, or enter another schema to browse first.',
        required: { host: true, username: true, database: true }
      },
      redis: {
        hostLabel: 'Host:',
        databaseLabel: 'Database index:',
        usernameLabel: 'ACL user:',
        defaultSchemaLabel: 'Logical schema:',
        hostPlaceholder: 'localhost',
        databasePlaceholder: '0',
        usernamePlaceholder: 'default',
        databaseHelp: 'Zero-based Redis database index. Most deployments use 0.',
        usernameHelp: 'Optional unless Redis ACL users are enabled.',
        authHelp: 'Use the Redis password or ACL user password when authentication is enabled.',
        sslHelp: 'Use require for rediss/TLS endpoints.',
        defaultSchemaHelp: 'Shown as db0, db1, and so on in the explorer.',
        required: { host: true, username: false, database: true }
      },
      snowflake: {
        hostLabel: 'Account:',
        databaseLabel: 'Database:',
        usernameLabel: 'User:',
        defaultSchemaLabel: 'Schema:',
        hostPlaceholder: 'org-account or account.region',
        databasePlaceholder: 'SNOWFLAKE',
        usernamePlaceholder: 'user@example.com',
        hostHelp: 'Enter the Snowflake account identifier, not a full URL.',
        databaseHelp: 'Default Snowflake database.',
        usernameHelp: 'Snowflake username.',
        authHelp: 'Password authentication is used by this connection form.',
        sslHelp: 'Snowflake requires TLS, so require is the default.',
        defaultSchemaHelp: 'Default Snowflake schema, commonly PUBLIC.',
        required: { host: true, username: true, database: true }
      }
    };
    const form = document.getElementById('form');
    const connectionList = allConnections.map((connection) => ({ ...connection }));
    let selectedId = formData.id ?? (connectionList[0]?.id || 'new');
    let draftActive = !formData.id;
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
    const typeButtons = Array.from(document.querySelectorAll('[data-db-type]'));
    const tabs = Array.from(document.querySelectorAll('[data-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-panel]'));
    const fieldLabels = Object.fromEntries(Array.from(document.querySelectorAll('[data-field-label]')).map((label) => [label.dataset.fieldLabel, label]));
    const fieldHelp = Object.fromEntries(Array.from(document.querySelectorAll('[data-help]')).map((help) => [help.dataset.help, help]));
    const sqlitePickButton = document.getElementById('sqlitePick');
    const addButton = document.querySelector('.rail-toolbar button[title="Add data source"]');
    const removeButton = document.querySelector('.rail-toolbar button[title="Remove data source"]');
    const sourceRows = document.querySelector('.data-source-list');
    function connectionLabel(connection) {
      return connection.name || defaultsByType[connection.type || 'postgres'].name;
    }
    function guidanceFor(type) {
      return engineGuidance[type] || engineGuidance.postgres;
    }
    function defaultsFor(type) {
      return defaultsByType[type] || defaultsByType.postgres;
    }
    function setLabel(name, text) {
      if (fieldLabels[name]) {
        fieldLabels[name].textContent = text;
      }
    }
    function setHelp(name, text) {
      if (fieldHelp[name]) {
        fieldHelp[name].textContent = text || '';
      }
    }
    function setRequired(name, required) {
      const label = fieldLabels[name];
      const field = form.elements.namedItem(name);
      if (label) {
        label.classList.toggle('required', required);
      }
      if (field) {
        field.toggleAttribute('required', required);
        field.setAttribute('aria-required', required ? 'true' : 'false');
      }
    }
    function setDisabled(name, disabled) {
      const field = form.elements.namedItem(name);
      if (field) {
        field.disabled = disabled;
      }
    }
    function applyEngineGuidance() {
      const type = typeField.value || 'postgres';
      const guidance = guidanceFor(type);
      const defaults = defaultsFor(type);
      setLabel('host', guidance.hostLabel);
      setLabel('database', guidance.databaseLabel);
      setLabel('username', guidance.usernameLabel);
      setLabel('defaultSchema', guidance.defaultSchemaLabel);
      setRequired('name', true);
      setRequired('host', guidance.required.host === true);
      setRequired('username', guidance.required.username === true);
      setRequired('database', guidance.required.database === true);
      setHelp('host', guidance.hostHelp || '');
      setHelp('username', guidance.usernameHelp);
      setHelp('auth', guidance.authHelp);
      setHelp('database', guidance.databaseHelp);
      setHelp('ssl', guidance.sslHelp);
      setHelp('defaultSchema', guidance.defaultSchemaHelp);
      const hostField = form.elements.namedItem('host');
      const portField = form.elements.namedItem('port');
      const databaseField = form.elements.namedItem('database');
      const usernameField = form.elements.namedItem('username');
      if (hostField) {
        hostField.placeholder = guidance.hostPlaceholder || defaults.host || '';
        hostField.setAttribute('aria-label', guidance.hostLabel.replace(/:$/, ''));
      }
      if (portField) {
        portField.placeholder = defaults.port || '';
      }
      if (databaseField) {
        databaseField.placeholder = guidance.databasePlaceholder || defaults.database || '';
        databaseField.inputMode = type === 'redis' ? 'numeric' : 'text';
        databaseField.setAttribute('aria-label', guidance.databaseLabel.replace(/:$/, ''));
      }
      if (usernameField) {
        usernameField.placeholder = guidance.usernamePlaceholder || defaults.username || '';
        usernameField.setAttribute('aria-label', guidance.usernameLabel.replace(/:$/, ''));
      }
      for (const field of ['host', 'port', 'username', 'password', 'sslMode']) {
        setDisabled(field, guidance.disabled?.[field] === true);
      }
      sqlitePickButton.hidden = type !== 'sqlite';
    }
    function renderSourceList() {
      const selected = selectedId;
      sourceRows.innerHTML = '';
      const draftRow = document.createElement('button');
      draftRow.type = 'button';
      draftRow.className = 'source-row' + (selected === 'new' ? ' active' : '');
      draftRow.innerHTML = '<span class="db-icon"><i class="codicon codicon-add"></i></span><span class="source-name">New connection</span><span class="status-dot" title="Draft"></span>';
      draftRow.addEventListener('click', () => selectConnection('new'));
      sourceRows.appendChild(draftRow);
      for (const connection of connectionList) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'source-row' + (selected === connection.id ? ' active' : '');
        row.innerHTML = '<span class="db-icon"><i class="codicon codicon-database"></i></span><span class="source-name"></span><span class="status-dot" title="Configured"></span>';
        row.querySelector('.source-name').textContent = connectionLabel(connection);
        row.addEventListener('click', () => selectConnection(connection.id));
        sourceRows.appendChild(row);
      }
    }
    function loadConnection(connection) {
      const selectedType = form.elements.namedItem('type').value || 'postgres';
      const selectedDefaults = defaultsFor(selectedType);
      const next = connection || {
        id: undefined,
        name: selectedDefaults.name,
        type: selectedType,
        host: selectedDefaults.host,
        port: selectedDefaults.port,
        database: selectedDefaults.database,
        username: selectedDefaults.username,
        password: '',
        sslMode: selectedDefaults.sslMode,
        defaultSchema: selectedDefaults.defaultSchema,
        color: selectedDefaults.color,
        sshTunnelEnabled: false,
        sshTunnelHost: '',
        sshTunnelPort: '22',
        sshTunnelUser: '',
        sshTunnelKeyPath: '',
        sshTunnelLocalHost: '127.0.0.1',
        sshTunnelLocalPort: ''
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
      applyEngineGuidance();
      syncDerivedFields();
      renderSourceList();
    }
    function selectConnection(id) {
      selectedId = id;
      if (id === 'new') {
        const type = typeField.value || 'postgres';
        const defaults = defaultsFor(type);
        loadConnection({
          type,
          name: defaults.name,
          host: defaults.host,
          port: defaults.port,
          database: defaults.database,
          username: defaults.username,
          password: '',
          sslMode: defaults.sslMode,
          defaultSchema: defaults.defaultSchema,
          color: defaults.color,
          sshTunnelEnabled: false,
          sshTunnelHost: '',
          sshTunnelPort: '22',
          sshTunnelUser: '',
          sshTunnelKeyPath: '',
          sshTunnelLocalHost: '127.0.0.1',
          sshTunnelLocalPort: ''
        });
        return;
      }
      const existing = connectionList.find((connection) => connection.id === id);
      if (existing) {
        loadConnection({
          ...existing,
          password: '',
          sshTunnelEnabled: existing.sshTunnel?.enabled ?? false,
          sshTunnelHost: existing.sshTunnel?.host ?? '',
          sshTunnelPort: existing.sshTunnel?.port ? String(existing.sshTunnel.port) : '22',
          sshTunnelUser: existing.sshTunnel?.username ?? '',
          sshTunnelKeyPath: existing.sshTunnel?.privateKeyPath ?? '',
          sshTunnelLocalHost: existing.sshTunnel?.localHost ?? '127.0.0.1',
          sshTunnelLocalPort: existing.sshTunnel?.localPort ? String(existing.sshTunnel.localPort) : ''
        });
      }
    }
    function syncDerivedFields() {
      applyEngineGuidance();
      const name = form.elements.namedItem('name').value || 'Connection';
      const type = typeField.value;
      const host = form.elements.namedItem('host').value || 'host';
      const port = form.elements.namedItem('port').value || '';
      const database = form.elements.namedItem('database').value || 'database';
      sourceName.textContent = name;
      const scheme = {
        postgres: 'postgresql',
        redshift: 'redshift',
        mysql: 'mysql',
        sqlite: 'sqlite',
        sqlserver: 'sqlserver',
        oracle: 'oracle',
        redis: 'redis',
        snowflake: 'snowflake'
      }[type] || type;
      urlPreview.value = type === 'sqlite'
        ? 'sqlite:' + database
        : scheme + '://' + host + (port ? ':' + port : '') + '/' + database;
      typeButtons.forEach((button) => button.classList.toggle('active', button.dataset.dbType === type));
      renderSourceList();
    }
    function applyDefaultsForType(nextType) {
      const previousDefaults = defaultsFor(previousType);
      const nextDefaults = defaultsFor(nextType);
      for (const name of ['name', 'host', 'port', 'database', 'sslMode', 'color', 'defaultSchema']) {
        const field = form.elements.namedItem(name);
        if (!field) continue;
        if (!field.value || field.value === previousDefaults[name]) {
          field.value = nextDefaults[name];
        }
      }
      previousType = nextType;
      applyEngineGuidance();
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
    sqlitePickButton.addEventListener('click', () => vscode.postMessage({ type: 'pickSqliteFile' }));
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
    function collect() {
      const data = {};
      for (const element of form.elements) {
        if (!element.name) continue;
        if (element.disabled) {
          data[element.name] = element.type === 'checkbox' ? false : '';
          continue;
        }
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
      if (event.data?.type === 'sqliteFile') {
        const databaseField = form.elements.namedItem('database');
        if (databaseField && typeof event.data.path === 'string') {
          databaseField.value = event.data.path;
          syncDerivedFields();
        }
        return;
      }
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
exports.ConnectionEditorPanel = ConnectionEditorPanel;
function toOptionalNumber(value) {
    if (!value) {
        return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : undefined;
}
function toSslMode(value, fallback) {
    return value === 'disable' || value === 'prefer' || value === 'require' ? value : fallback;
}
function engineDisplayName(type) {
    return {
        postgres: 'PostgreSQL',
        redshift: 'Amazon Redshift',
        mysql: 'MySQL',
        sqlite: 'SQLite',
        sqlserver: 'Microsoft SQL Server',
        oracle: 'Oracle',
        redis: 'Redis',
        snowflake: 'Snowflake'
    }[type];
}
function databaseFieldLabel(type) {
    return {
        postgres: 'Database',
        redshift: 'Database',
        mysql: 'Database',
        sqlite: 'SQLite database file',
        sqlserver: 'Database',
        oracle: 'Oracle service name',
        redis: 'Redis database index',
        snowflake: 'Database'
    }[type];
}
function hostFieldLabel(type) {
    return type === 'snowflake' ? 'Snowflake account' : type === 'redshift' ? 'cluster endpoint' : 'host';
}
function friendlyConnectionError(error, type) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = connectionTestHint(type);
    return hint ? `${message} ${hint}` : message;
}
function connectionTestHint(type) {
    return {
        postgres: 'Hint: check host, port, database, username, password, and whether SSL should be require for managed providers.',
        redshift: 'Hint: use the cluster endpoint, port 5439, database name, and SSL mode require.',
        mysql: 'Hint: check that the MySQL user can access this database from your client host, and use SSL require when the server enforces TLS.',
        sqlite: 'Hint: choose a readable .db/.sqlite file, or use :memory: for a temporary in-memory database.',
        sqlserver: 'Hint: SSL mode prefer encrypts while trusting the server certificate; use require only when the certificate chain is trusted.',
        oracle: 'Hint: the database field is the Oracle service name in host:port/service, for example ORCLPDB1.',
        redis: 'Hint: Redis database must be a zero-based number such as 0; username is optional unless ACLs are enabled.',
        snowflake: 'Hint: enter the Snowflake account identifier rather than a full URL, and keep SSL mode require.'
    }[type];
}
function getNonce() {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}
//# sourceMappingURL=ConnectionEditorPanel.js.map