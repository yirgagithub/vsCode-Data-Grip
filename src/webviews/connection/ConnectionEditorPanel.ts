import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionConfigWithPassword, DatabaseType } from '../../types';
import { ConnectionManager } from '../../database/connectionManager';
import { createId } from '../../utils/id';

type EditorMessage =
  | { type: 'ready' }
  | { type: 'test'; config: FormConnection }
  | { type: 'save'; config: FormConnection }
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
      } catch (error) {
        await this.postState('error', error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (message.type === 'save') {
      try {
        const config = this.fromForm(message.config);
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
      queryTimeoutMs: connection?.queryTimeoutMs ? String(connection.queryTimeoutMs) : String(vscode.workspace.getConfiguration('database').get<number>('query.timeoutMs', 300000)),
      production: connection?.production ?? false,
      readOnlyDefault: connection?.readOnlyDefault ?? false
    };
  }

  private html(webview: vscode.Webview, form: FormConnection): string {
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
