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
class ConnectionEditorPanel {
    panel;
    connectionManager;
    existing;
    resolve;
    static async open(context, connectionManager, existing) {
        return new Promise((resolve) => {
            const panel = vscode.window.createWebviewPanel('databaseConnectionEditor', existing ? `Edit ${existing.name}` : 'Add Database Connection', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
            const editor = new ConnectionEditorPanel(panel, connectionManager, existing, resolve);
            context.subscriptions.push(panel);
            editor.render();
        });
    }
    constructor(panel, connectionManager, existing, resolve) {
        this.panel = panel;
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
        if (message.type === 'test') {
            await this.postState('testing', 'Testing connection...');
            try {
                let config = this.fromForm(message.config);
                if (!config.password && this.existing?.id) {
                    const existingWithPassword = await this.connectionManager.getConnectionWithPassword(this.existing.id);
                    config = { ...config, password: existingWithPassword.password };
                }
                const detail = await this.connectionManager.testConfig(config);
                await this.postState('success', `Connected: ${detail}`);
            }
            catch (error) {
                await this.postState('error', error instanceof Error ? error.message : String(error));
            }
            return;
        }
        if (message.type === 'save') {
            try {
                const config = this.fromForm(message.config);
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
        const port = Number(form.port);
        if (!form.name.trim() || !form.host.trim() || !form.database.trim() || !form.username.trim()) {
            throw new Error('Name, host, database, and username are required.');
        }
        if (!Number.isInteger(port) || port <= 0) {
            throw new Error('Port must be a positive number.');
        }
        return {
            id: form.id ?? this.existing?.id ?? (0, id_1.createId)('conn'),
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
    toForm(connection) {
        return {
            id: connection?.id,
            name: connection?.name ?? 'PostgreSQL',
            type: connection?.type ?? 'postgres',
            host: connection?.host ?? 'localhost',
            port: String(connection?.port ?? 5432),
            database: connection?.database ?? 'postgres',
            username: connection?.username ?? '',
            password: '',
            sslMode: connection?.sslMode ?? 'prefer',
            defaultSchema: connection?.defaultSchema ?? 'public',
            color: connection?.color ?? 'green',
            connectTimeoutMs: connection?.connectTimeoutMs ? String(connection.connectTimeoutMs) : '',
            queryTimeoutMs: connection?.queryTimeoutMs ? String(connection.queryTimeoutMs) : String(vscode.workspace.getConfiguration('database').get('query.timeoutMs', 300000)),
            production: connection?.production ?? false,
            readOnlyDefault: connection?.readOnlyDefault ?? false
        };
    }
    html(webview, form) {
        const nonce = getNonce();
        const data = JSON.stringify(form).replace(/</g, '\\u003c');
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { padding: 18px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    form { max-width: 860px; display: grid; gap: 14px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px; }
    label { display: grid; gap: 5px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    input, select { height: 30px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 3px 8px; }
    .row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .check { display: flex; align-items: center; gap: 7px; color: var(--vscode-foreground); }
    .actions { display: flex; gap: 8px; padding-top: 4px; }
    button { height: 30px; padding: 0 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    #status { min-height: 22px; padding: 7px 9px; border: 1px solid transparent; }
    #status.error { border-color: var(--vscode-inputValidation-errorBorder); background: var(--vscode-inputValidation-errorBackground); }
    #status.success { border-color: var(--vscode-testing-iconPassed); }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <form id="form">
    <div class="grid">
      <label>Type<select name="type"><option value="postgres">PostgreSQL</option><option value="redshift">Amazon Redshift</option></select></label>
      <label>Name<input name="name" autocomplete="off"></label>
      <label>Host<input name="host" autocomplete="off"></label>
      <label>Port<input name="port" inputmode="numeric"></label>
      <label>Database<input name="database" autocomplete="off"></label>
      <label>Username<input name="username" autocomplete="off"></label>
      <label>Password<input name="password" type="password" placeholder="${form.id ? 'Leave blank to keep existing password' : ''}"></label>
      <label>SSL<select name="sslMode"><option>disable</option><option>prefer</option><option>require</option></select></label>
      <label>Default schema<input name="defaultSchema" autocomplete="off"></label>
      <label>Color<select name="color"><option>green</option><option>blue</option><option>purple</option><option>yellow</option><option>red</option><option>gray</option></select></label>
      <label>Connect timeout ms<input name="connectTimeoutMs" inputmode="numeric"></label>
      <label>Query timeout ms<input name="queryTimeoutMs" inputmode="numeric"></label>
    </div>
    <div class="row">
      <label class="check"><input name="production" type="checkbox">Production</label>
      <label class="check"><input name="readOnlyDefault" type="checkbox">Read-only by default</label>
    </div>
    <div id="status"></div>
    <div class="actions">
      <button type="button" id="save">Save</button>
      <button type="button" id="test" class="secondary">Test</button>
      <button type="button" id="cancel" class="secondary">Cancel</button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const formData = ${data};
    const form = document.getElementById('form');
    for (const [key, value] of Object.entries(formData)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value === true;
      else field.value = value ?? '';
    }
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
    window.addEventListener('message', event => {
      const status = document.getElementById('status');
      status.className = event.data.state || '';
      status.textContent = event.data.message || '';
    });
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
function getNonce() {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}
//# sourceMappingURL=ConnectionEditorPanel.js.map