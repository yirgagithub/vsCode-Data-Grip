import * as vscode from 'vscode';
import { ConnectionManager } from '../../database/connectionManager';
import { TableNode } from '../../explorer/nodes';
import { qualifiedName } from '../../utils/identifiers';
import { formatCellValue } from './formatCellValue';

export class TableDataPanel {
  static async open(context: vscode.ExtensionContext, connectionManager: ConnectionManager, node: TableNode): Promise<void> {
    if (!connectionManager.isConnected(node.connection.id)) {
      await connectionManager.connect(node.connection.id);
    }

    const configuredMaxRows = vscode.workspace.getConfiguration('database').get<number>('defaultMaxRows', 500);
    const maxRows = Number.isFinite(configuredMaxRows) && configuredMaxRows && configuredMaxRows > 0 ? Math.floor(configuredMaxRows) : 0;
    const result = await connectionManager
      .getDriver(node.connection.type)
      .getTablePreview(node.connection.id, node.table.schema, node.table.name, maxRows);

    const panel = vscode.window.createWebviewPanel(
      'databaseTableData',
      node.table.name,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
    panel.webview.html = this.html(panel.webview, node, result.rows, result.fields.map((field) => field.name), result.durationMs);
    panel.webview.onDidReceiveMessage((message: { type?: string; text?: string }) => {
      if (message.type === 'copy' && typeof message.text === 'string') {
        void vscode.env.clipboard.writeText(message.text);
      }
    });
  }

  private static html(
    webview: vscode.Webview,
    node: TableNode,
    rows: Record<string, unknown>[],
    columns: string[],
    durationMs: number
  ): string {
    const nonce = Date.now().toString();
    const safeTitle = escapeHtml(qualifiedName(node.table.schema, node.table.name));
    const rowHtml = rows.map((row, rowIndex) => `
      <tr>
        <th>${rowIndex + 1}</th>
        ${columns.map((column) => {
          const value = row[column];
          return `<td class="${value === null ? 'null' : ''}" title="${escapeHtml(formatCellValue(value))}">${value === null ? 'NULL' : escapeHtml(formatCellValue(value))}</td>`;
        }).join('')}
      </tr>
    `).join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body {
      margin: 0;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      overflow: hidden;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: 34px 34px 1fr 26px;
    }
    .titlebar,
    .toolbar,
    .statusbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      box-sizing: border-box;
    }
    .titlebar strong {
      font-weight: 600;
      min-width: 0;
      max-width: min(520px, 50vw);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .toolbar input {
      width: min(520px, 50vw);
      height: 26px;
      padding: 0 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      font: inherit;
    }
    .toolbar button {
      height: 26px;
      color: var(--vscode-editor-foreground);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      font: inherit;
      padding: 0 8px;
    }
    .toolbar button:hover {
      background: var(--vscode-toolbar-hoverBackground);
      border-color: var(--vscode-panel-border);
    }
    .grid {
      overflow: auto;
    }
    table {
      border-collapse: collapse;
      width: max-content;
      min-width: 100%;
      table-layout: fixed;
    }
    col.rownum-col {
      width: 52px;
    }
    col.data-col {
      width: 220px;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editor-foreground);
      font-weight: 500;
      text-align: left;
    }
    th,
    td {
      height: 24px;
      box-sizing: border-box;
      max-width: 220px;
      padding: 3px 8px;
      border-right: 1px solid var(--vscode-panel-border);
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th:first-child {
      position: sticky;
      left: 0;
      z-index: 3;
      min-width: 52px;
      width: 52px;
      color: var(--vscode-descriptionForeground);
      text-align: right;
      background: var(--vscode-editorWidget-background);
    }
    tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-editor-foreground));
    }
    td.null {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .spacer {
      flex: 1;
    }
    .statusbar {
      border-top: 1px solid var(--vscode-panel-border);
      border-bottom: 0;
      color: var(--vscode-statusBar-foreground);
      background: var(--vscode-statusBar-background);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="titlebar">
      <strong>${safeTitle}</strong>
      <span>${rows.length} fetched rows</span>
      <span class="spacer"></span>
      <span>${node.connection.name}</span>
    </div>
    <div class="toolbar">
      <button id="copy">Copy</button>
      <button id="csv">CSV</button>
      <input id="filter" placeholder="Filter fetched rows">
    </div>
    <div class="grid">
      <table id="table">
        <colgroup>
          <col class="rownum-col">
          ${columns.map(() => '<col class="data-col">').join('')}
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>
    <div class="statusbar">${node.connection.database} ${node.table.schema} ${rows.length} rows ${durationMs}ms</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rows = ${JSON.stringify(rows).replace(/</g, '\\u003c')};
    const columns = ${JSON.stringify(columns)};
    const filter = document.getElementById('filter');
    const tbody = document.querySelector('tbody');
    function cell(value) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
    function render(nextRows) {
      tbody.innerHTML = nextRows.map((row, index) => '<tr><th>' + (index + 1) + '</th>' + columns.map((column) => {
        const value = row[column];
        const text = cell(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
        return '<td class="' + (value === null ? 'null' : '') + '" title="' + text + '">' + (value === null ? 'NULL' : text) + '</td>';
      }).join('') + '</tr>').join('');
    }
    filter.addEventListener('input', () => {
      const needle = filter.value.toLowerCase();
      render(needle ? rows.filter((row) => Object.values(row).some((value) => cell(value).toLowerCase().includes(needle))) : rows);
    });
    document.getElementById('copy').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: [columns.join('\\t'), ...rows.map((row) => columns.map((column) => cell(row[column])).join('\\t'))].join('\\n') });
    });
    document.getElementById('csv').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: [columns.join(','), ...rows.map((row) => columns.map((column) => '"' + cell(row[column]).replaceAll('"', '""') + '"').join(','))].join('\\n') });
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
