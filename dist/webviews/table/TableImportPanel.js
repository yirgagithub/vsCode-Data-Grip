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
exports.TableImportPanel = void 0;
const vscode = __importStar(require("vscode"));
const identifiers_1 = require("../../utils/identifiers");
class TableImportPanel {
    static async open(context, request, onImport) {
        return new Promise((resolve) => {
            let settled = false;
            const panel = vscode.window.createWebviewPanel('databaseTableImport', `Import ${request.table}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
            context.subscriptions.push(panel);
            panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
            panel.webview.html = this.html(panel.webview, context.extensionUri, request);
            const settle = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };
            panel.onDidDispose(settle);
            panel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === 'cancel') {
                    panel.dispose();
                    return;
                }
                if (message.type !== 'import') {
                    return;
                }
                try {
                    await panel.webview.postMessage({ type: 'state', state: 'running', message: 'Importing data...' });
                    const result = await onImport(message.mapping ?? []);
                    await panel.webview.postMessage({
                        type: 'state',
                        state: 'success',
                        message: `Imported ${result.rowCount.toLocaleString()} rows into ${(0, identifiers_1.qualifiedName)(request.schema, request.table)}.`
                    });
                    settle();
                }
                catch (error) {
                    await panel.webview.postMessage({
                        type: 'state',
                        state: 'error',
                        message: error instanceof Error ? error.message : String(error)
                    });
                }
            });
        });
    }
    static html(webview, extensionUri, request) {
        const nonce = Date.now().toString();
        const codicon = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'codicons', 'codicon.css'));
        const stateJson = JSON.stringify({
            connectionName: request.connectionName,
            databaseType: request.databaseType,
            schema: request.schema,
            table: request.table,
            filePath: request.filePath,
            preview: request.preview
        }).replace(/</g, '\\u003c');
        const title = `Import ${(0, identifiers_1.qualifiedName)(request.schema, request.table)}`;
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${codicon}" rel="stylesheet">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-sideBar-background);
      --header: var(--vscode-editorWidget-background);
      --border: var(--vscode-panel-border);
      --text: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-text: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
    }
    .shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      height: 100vh;
      min-width: 760px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      padding: 12px 16px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 600;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      color: var(--muted);
      min-width: 0;
    }
    .meta span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 360px;
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      white-space: nowrap;
    }
    main {
      display: grid;
      grid-template-columns: 42% 58%;
      min-height: 0;
    }
    section {
      min-width: 0;
      min-height: 0;
      border-right: 1px solid var(--border);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    section:last-child { border-right: 0; }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
      padding: 0 12px;
      background: var(--header);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .scroll {
      overflow: auto;
      min-height: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 6px 8px;
      text-align: left;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--header);
      color: var(--muted);
      font-weight: 500;
    }
    .mapping-table th:nth-child(1), .mapping-table td:nth-child(1) { width: 34%; }
    .mapping-table th:nth-child(2), .mapping-table td:nth-child(2) { width: 24%; }
    .mapping-table th:nth-child(3), .mapping-table td:nth-child(3) { width: 42%; }
    select {
      width: 100%;
      height: 26px;
      color: var(--text);
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
      padding: 2px 22px 2px 6px;
      font-family: inherit;
      font-size: inherit;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font-size: 11px;
    }
    .warnings {
      display: none;
      padding: 8px 12px;
      color: var(--vscode-editorWarning-foreground);
      border-bottom: 1px solid var(--border);
      background: var(--vscode-inputValidation-warningBackground);
    }
    .warnings.visible { display: block; }
    .warnings div + div { margin-top: 4px; }
    footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: var(--panel);
      border-top: 1px solid var(--border);
    }
    .status {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status.error { color: var(--danger); }
    .status.success { color: var(--success); }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 84px;
      height: 30px;
      padding: 0 12px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 0;
      border-radius: 3px;
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
    }
    button.primary {
      color: var(--accent-text);
      background: var(--accent);
    }
    button:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .empty {
      padding: 24px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          <span id="sourceMeta"></span>
          <span id="targetMeta"></span>
          <span id="connectionMeta"></span>
        </div>
      </div>
      <div class="summary">
        <span class="codicon codicon-table"></span>
        <span id="rowSummary"></span>
      </div>
    </header>
    <main>
      <section>
        <div class="section-title">
          <span>Mapping</span>
          <span class="badge" id="mappingSummary"></span>
        </div>
        <div class="warnings" id="warnings"></div>
        <div class="scroll">
          <table class="mapping-table">
            <thead>
              <tr>
                <th>to: Column</th>
                <th>to: Type</th>
                <th>from: Column</th>
              </tr>
            </thead>
            <tbody id="mappingRows"></tbody>
          </table>
        </div>
      </section>
      <section>
        <div class="section-title">
          <span>Data Preview</span>
          <span class="badge" id="previewSummary"></span>
        </div>
        <div class="scroll" id="previewHost"></div>
      </section>
    </main>
    <footer>
      <div class="status" id="status"></div>
      <div class="actions">
        <button id="cancelButton">Cancel</button>
        <button class="primary" id="importButton"><span class="codicon codicon-cloud-upload"></span>Import</button>
      </div>
    </footer>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    const mapping = state.preview.mapping.map((item) => ({ ...item }));
    const sourceColumns = state.preview.sourceColumns;
    const targetByName = new Map(state.preview.targetColumns.map((column) => [column.name, column]));

    const sourceMeta = document.getElementById('sourceMeta');
    const targetMeta = document.getElementById('targetMeta');
    const connectionMeta = document.getElementById('connectionMeta');
    const rowSummary = document.getElementById('rowSummary');
    const mappingSummary = document.getElementById('mappingSummary');
    const previewSummary = document.getElementById('previewSummary');
    const mappingRows = document.getElementById('mappingRows');
    const previewHost = document.getElementById('previewHost');
    const warnings = document.getElementById('warnings');
    const status = document.getElementById('status');
    const importButton = document.getElementById('importButton');
    const cancelButton = document.getElementById('cancelButton');

    sourceMeta.textContent = 'from: ' + state.filePath;
    targetMeta.textContent = 'to: ' + state.schema + '.' + state.table;
    connectionMeta.textContent = state.connectionName + ' (' + state.databaseType + ')';
    rowSummary.textContent = state.preview.rowCount.toLocaleString() + ' rows';
    previewSummary.textContent = Math.min(state.preview.sampleRows.length, 50) + ' shown';
    status.textContent = 'Review mappings, then import directly into the table.';

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]);
    }

    function formatCell(value) {
      if (value === null || value === undefined) {
        return '<span style="color: var(--muted)">null</span>';
      }
      if (typeof value === 'object') {
        return escapeHtml(JSON.stringify(value));
      }
      return escapeHtml(value);
    }

    function optionHtml(selected) {
      const options = ['<option value="">Not mapped</option>'];
      for (const column of sourceColumns) {
        options.push('<option value="' + escapeHtml(column) + '"' + (column === selected ? ' selected' : '') + '>' + escapeHtml(column) + '</option>');
      }
      return options.join('');
    }

    function renderMapping() {
      mappingRows.innerHTML = mapping.map((item, index) => {
        const target = targetByName.get(item.target) ?? {};
        const badge = item.source && item.auto ? ' <span class="badge">Auto</span>' : '';
        return '<tr>' +
          '<td title="' + escapeHtml(item.target) + '">' + escapeHtml(item.target) + badge + '</td>' +
          '<td title="' + escapeHtml(target.dataType ?? '') + '">' + escapeHtml(target.dataType ?? '') + '</td>' +
          '<td><select data-index="' + index + '">' + optionHtml(item.source) + '</select></td>' +
          '</tr>';
      }).join('');
      mappingRows.querySelectorAll('select').forEach((select) => {
        select.addEventListener('change', (event) => {
          const index = Number(event.currentTarget.dataset.index);
          mapping[index].source = event.currentTarget.value || null;
          mapping[index].auto = false;
          renderMapping();
        });
      });
      const mapped = mapping.filter((item) => item.source).length;
      mappingSummary.textContent = mapped + ' of ' + mapping.length + ' mapped';
      importButton.disabled = mapped === 0;
    }

    function renderWarnings() {
      const items = state.preview.warnings ?? [];
      warnings.className = items.length ? 'warnings visible' : 'warnings';
      warnings.innerHTML = items.map((item) => '<div>' + escapeHtml(item) + '</div>').join('');
    }

    function renderPreview() {
      if (!state.preview.sampleRows.length || !sourceColumns.length) {
        previewHost.innerHTML = '<div class="empty">No preview rows.</div>';
        return;
      }
      const head = '<thead><tr>' + sourceColumns.map((column) => '<th title="' + escapeHtml(column) + '">' + escapeHtml(column) + '</th>').join('') + '</tr></thead>';
      const body = '<tbody>' + state.preview.sampleRows.map((row) => (
        '<tr>' + sourceColumns.map((column) => '<td title="' + escapeHtml(row[column] ?? '') + '">' + formatCell(row[column]) + '</td>').join('') + '</tr>'
      )).join('') + '</tbody>';
      previewHost.innerHTML = '<table>' + head + body + '</table>';
    }

    importButton.addEventListener('click', () => {
      importButton.disabled = true;
      cancelButton.disabled = true;
      status.className = 'status';
      status.textContent = 'Importing data...';
      vscode.postMessage({
        type: 'import',
        mapping: mapping.map((item) => ({ target: item.target, source: item.source }))
      });
    });

    cancelButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data ?? {};
      if (message.type !== 'state') {
        return;
      }
      status.className = 'status ' + (message.state === 'error' || message.state === 'success' ? message.state : '');
      status.textContent = message.message ?? '';
      if (message.state === 'error') {
        importButton.disabled = mapping.filter((item) => item.source).length === 0;
        cancelButton.disabled = false;
      }
      if (message.state === 'success') {
        importButton.disabled = true;
        cancelButton.textContent = 'Close';
        cancelButton.disabled = false;
      }
    });

    renderWarnings();
    renderMapping();
    renderPreview();
  </script>
</body>
</html>`;
    }
}
exports.TableImportPanel = TableImportPanel;
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char] ?? char));
}
//# sourceMappingURL=TableImportPanel.js.map