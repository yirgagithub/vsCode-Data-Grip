import * as vscode from 'vscode';
import { applySqlParameterValues, findSqlParameters, SqlParameter, uniqueSqlParameterNames } from './sqlParameters';

interface ParameterDialogMessage {
  type?: 'execute' | 'cancel';
  values?: Record<string, string>;
}

interface SqlParameterResolveOptions {
  sessionKey?: string;
}

interface ParameterRow {
  name: string;
  placeholder: string;
  context: string;
  value: string;
}

export class SqlParameterPrompt {
  private readonly valuesBySession = new Map<string, Record<string, string>>();

  async resolve(sql: string, options: SqlParameterResolveOptions = {}): Promise<string | undefined> {
    const parameters = findSqlParameters(sql);
    const names = uniqueSqlParameterNames(parameters);
    if (!names.length) {
      return sql;
    }
    const sessionKey = options.sessionKey ?? sql;
    const values = await this.collectValues(sql, this.parameterRows(sql, parameters, names, this.valuesBySession.get(sessionKey)));
    if (values) {
      this.valuesBySession.set(sessionKey, pickParameterValues(names, values));
    }
    return values ? applySqlParameterValues(sql, values) : undefined;
  }

  private collectValues(sql: string, rows: ParameterRow[]): Promise<Record<string, string> | undefined> {
    const panel = vscode.window.createWebviewPanel(
      'databaseSqlParameters',
      'Parameters',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false
      }
    );
    panel.webview.html = this.html(panel.webview, sql, rows);

    return new Promise((resolve) => {
      let settled = false;
      const subscriptions: vscode.Disposable[] = [];
      const finish = (values: Record<string, string> | undefined) => {
        if (settled) {
          return;
        }
        settled = true;
        for (const subscription of subscriptions) {
          subscription.dispose();
        }
        resolve(values);
        panel.dispose();
      };

      subscriptions.push(panel.webview.onDidReceiveMessage((message: ParameterDialogMessage) => {
        if (message.type === 'cancel') {
          finish(undefined);
          return;
        }
        if (message.type === 'execute') {
          const values = message.values ?? {};
          const missing = rows.find((row) => values[row.name] === undefined || values[row.name].trim() === '');
          if (!missing) {
            finish(values);
          }
        }
      }));
      subscriptions.push(panel.onDidDispose(() => finish(undefined)));
    });
  }

  private parameterRows(sql: string, parameters: SqlParameter[], names: string[], previousValues: Record<string, string> = {}): ParameterRow[] {
    return names.map((name) => {
      const parameter = parameters.find((item) => item.name === name);
      return {
        name,
        placeholder: parameter?.placeholder ?? `:${name}`,
        context: parameter ? this.contextPreview(sql, parameter) : '',
        value: previousValues[name] ?? ''
      };
    });
  }

  private html(webview: vscode.Webview, sql: string, rows: ParameterRow[]): string {
    const nonce = Date.now().toString();
    const data = jsonForScript({ preview: this.sqlPreview(sql), rows });
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parameters</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: var(--vscode-editor-background, #1f1f1f);
      --panel: var(--vscode-quickInput-background, #252526);
      --border: var(--vscode-panel-border, #3c3c3c);
      --text: var(--vscode-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #9d9d9d);
      --accent: var(--vscode-focusBorder, #007fd4);
      --button: var(--vscode-button-background, #0e639c);
      --button-text: var(--vscode-button-foreground, #ffffff);
      --button-secondary: var(--vscode-button-secondaryBackground, #3a3d41);
      --input: var(--vscode-input-background, #1b1b1b);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 12px;
    }
    .dialog {
      width: min(560px, calc(100vw - 48px));
      border: 1px solid var(--border);
      background: var(--panel);
      box-shadow: 0 14px 36px rgb(0 0 0 / 0.42);
    }
    .titlebar {
      height: 28px;
      display: grid;
      grid-template-columns: 28px 1fr 28px;
      align-items: center;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 88%, white 12%);
    }
    .titlebar strong {
      text-align: center;
      font-size: 12px;
      font-weight: 600;
    }
    .close {
      width: 28px;
      height: 28px;
      border: 0;
      color: var(--muted);
      background: transparent;
      cursor: pointer;
    }
    .close:hover {
      color: var(--text);
      background: var(--button-secondary);
    }
    .content {
      padding: 10px;
    }
    .preview {
      margin-bottom: 8px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      table-layout: fixed;
    }
    th, td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
      text-align: left;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      background: color-mix(in srgb, var(--panel) 82%, black 18%);
    }
    th:first-child,
    td:first-child {
      width: 34%;
    }
    th:nth-child(2),
    td:nth-child(2) {
      width: 42%;
    }
    th:last-child,
    td:last-child {
      width: 24%;
    }
    .name {
      color: var(--text);
      font-family: var(--vscode-editor-font-family, monospace);
      font-weight: 600;
    }
    .context {
      color: var(--muted);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    input {
      width: 100%;
      height: 24px;
      border: 1px solid var(--border);
      outline: 0;
      color: var(--text);
      background: var(--input);
      padding: 3px 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    input:focus {
      border-color: var(--accent);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 10px;
    }
    button.action {
      min-width: 74px;
      height: 26px;
      border: 1px solid transparent;
      color: var(--button-text);
      background: var(--button);
      cursor: pointer;
      font-size: 12px;
    }
    button.secondary {
      color: var(--text);
      background: var(--button-secondary);
    }
    button:disabled {
      cursor: default;
      opacity: 0.45;
    }
  </style>
</head>
<body>
  <section class="dialog" role="dialog" aria-labelledby="parameter-title">
    <div class="titlebar">
      <span></span>
      <strong id="parameter-title">Parameters</strong>
      <button class="close" id="closeTop" title="Close" aria-label="Close">x</button>
    </div>
    <div class="content">
      <div class="preview" id="preview"></div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>SQL context</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="actions">
        <button class="action" id="execute" disabled>Execute</button>
        <button class="action secondary" id="closeBottom">Close</button>
      </div>
    </div>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${data};
    const preview = document.getElementById('preview');
    const tbody = document.getElementById('rows');
    const execute = document.getElementById('execute');
    preview.textContent = state.preview;
    tbody.innerHTML = state.rows.map((row) => (
      '<tr>' +
      '<td><span class="name">' + html(row.name) + '</span></td>' +
      '<td><div class="context" title="' + html(row.context) + '">' + html(row.context) + '</div></td>' +
      '<td><input data-name="' + html(row.name) + '" value="' + html(row.value) + '" placeholder="&lt;null&gt;" autocomplete="off"></td>' +
      '</tr>'
    )).join('');
    const inputs = Array.from(tbody.querySelectorAll('input'));
    function html(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }
    function values() {
      return Object.fromEntries(inputs.map((input) => [input.dataset.name, input.value]));
    }
    function refresh() {
      execute.disabled = inputs.some((input) => input.value.trim() === '');
    }
    function cancel() {
      vscode.postMessage({ type: 'cancel' });
    }
    for (const input of inputs) {
      input.addEventListener('input', refresh);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !execute.disabled) {
          vscode.postMessage({ type: 'execute', values: values() });
        }
      });
    }
    execute.addEventListener('click', () => {
      if (!execute.disabled) {
        vscode.postMessage({ type: 'execute', values: values() });
      }
    });
    document.getElementById('closeTop').addEventListener('click', cancel);
    document.getElementById('closeBottom').addEventListener('click', cancel);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        cancel();
      }
    });
    inputs[0]?.focus();
    refresh();
  </script>
</body>
</html>`;
  }

  private contextPreview(sql: string, parameter: SqlParameter): string {
    const before = sql.slice(Math.max(0, parameter.start - 42), parameter.start).replace(/\s+/g, ' ').trim();
    const after = sql.slice(parameter.end, Math.min(sql.length, parameter.end + 34)).replace(/\s+/g, ' ').trim();
    return [before, parameter.placeholder, after].filter(Boolean).join(' ');
  }

  private sqlPreview(sql: string): string {
    const compact = sql.replace(/\s+/g, ' ').trim();
    return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
  }
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function pickParameterValues(names: string[], values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, values[name] ?? '']));
}
