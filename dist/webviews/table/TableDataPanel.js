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
exports.TableDataPanel = void 0;
const vscode = __importStar(require("vscode"));
const identifiers_1 = require("../../utils/identifiers");
class TableDataPanel {
    static async open(context, connectionManager, node) {
        if (!connectionManager.isConnected(node.connection.id)) {
            await connectionManager.connect(node.connection.id);
        }
        const configuredMaxRows = vscode.workspace.getConfiguration('database').get('defaultMaxRows', 500);
        const maxRows = Number.isFinite(configuredMaxRows) && configuredMaxRows && configuredMaxRows > 0 ? Math.floor(configuredMaxRows) : 500;
        const result = await connectionManager
            .getDriver(node.connection.type)
            .getTablePreview(node.connection.id, node.table.schema, node.table.name, maxRows);
        const initialHasMore = maxRows > 0 && result.rows.length > maxRows;
        const initialRows = initialHasMore ? result.rows.slice(0, maxRows) : result.rows;
        const panel = vscode.window.createWebviewPanel('databaseTableData', node.table.name, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
        panel.webview.html = this.html(panel.webview, node, initialRows, result.fields.map((field) => field.name), result.durationMs, maxRows, initialHasMore);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'copy' && typeof message.text === 'string') {
                await vscode.env.clipboard.writeText(message.text);
                return;
            }
            if (message.type === 'export' && typeof message.text === 'string' && message.format) {
                const target = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(`${node.table.name}.${message.format}`),
                    filters: { 'Data files': [message.format] }
                });
                if (target) {
                    await vscode.workspace.fs.writeFile(target, Buffer.from(message.text, 'utf8'));
                }
                return;
            }
            if (message.type === 'command') {
                if (message.command === 'ddl') {
                    await vscode.commands.executeCommand('database.showObjectDdl', node);
                }
                if (message.command === 'select') {
                    await vscode.commands.executeCommand('database.generateSelect', node);
                }
                return;
            }
            if (message.type === 'fetch') {
                const limit = Number.isFinite(message.limit) && message.limit && message.limit > 0 ? Math.floor(message.limit) : 0;
                const offset = Number.isFinite(message.offset) && message.offset && message.offset > 0 ? Math.floor(message.offset) : 0;
                try {
                    const nextResult = await connectionManager
                        .getDriver(node.connection.type)
                        .getTablePreview(node.connection.id, node.table.schema, node.table.name, limit, {
                        where: message.where,
                        offset,
                        orderBySql: message.orderBySql,
                        orderBy: message.orderBy
                    });
                    const hasMore = limit > 0 && nextResult.rows.length > limit;
                    await panel.webview.postMessage({
                        type: 'state',
                        rows: hasMore ? nextResult.rows.slice(0, limit) : nextResult.rows,
                        columns: nextResult.fields.map((field) => field.name),
                        durationMs: nextResult.durationMs,
                        limit,
                        offset,
                        hasMore
                    });
                }
                catch (error) {
                    await panel.webview.postMessage({
                        type: 'error',
                        message: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        });
    }
    static html(webview, node, rows, columns, durationMs, maxRows, hasMore) {
        const nonce = Date.now().toString();
        const safeTable = escapeHtml((0, identifiers_1.qualifiedName)(node.table.schema, node.table.name));
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTable}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --bg-selected: var(--vscode-list-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --space-xxs: clamp(0.125rem, 0.1rem + 0.1vw, 0.25rem);
      --space-xs: clamp(0.25rem, 0.2rem + 0.15vw, 0.375rem);
      --space-sm: clamp(0.375rem, 0.3rem + 0.2vw, 0.5rem);
      --space-md: clamp(0.5rem, 0.45rem + 0.3vw, 0.75rem);
      --icon-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.1rem);
      --toolbar-button-size: clamp(1.55rem, 1.35rem + 0.55vw, 1.95rem);
      --row-height: clamp(1.35rem, 1.25rem + 0.25vw, 1.55rem);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.75rem, 0.72rem + 0.15vw, 0.9rem);
      line-height: 1.35;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      min-width: 0;
      padding: var(--space-xs) var(--space-sm);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .toolbar-separator {
      width: 1px;
      height: 1.15rem;
      margin: 0 var(--space-xs);
      background: var(--border);
    }
    .toolbar-spacer {
      flex: 1;
    }
    .criteria-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      border-bottom: 1px solid var(--border);
      background: var(--bg-header);
    }
    .criteria {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
      min-height: clamp(1.8rem, 1.6rem + 0.45vw, 2.2rem);
      padding: var(--space-xxs) var(--space-sm);
      color: var(--text-muted);
      background: var(--bg-header);
      border-right: 1px solid var(--border);
    }
    .criteria strong {
      color: var(--vscode-editor-foreground);
      font-weight: 500;
      letter-spacing: .04em;
      white-space: nowrap;
    }
    .criteria-icon {
      color: var(--vscode-descriptionForeground);
      font-size: 19px;
      line-height: 1;
    }
    .criteria:first-child .criteria-icon {
      color: var(--vscode-charts-blue);
    }
    .criteria:nth-child(2) .criteria-icon {
      color: var(--vscode-charts-purple);
    }
    .criteria input {
      flex: 1;
      min-width: 120px;
      height: var(--toolbar-button-size);
      padding: 0 var(--space-sm);
      color: var(--vscode-input-foreground);
      background: transparent;
      border: 0;
      font: inherit;
      outline: 0;
    }
    .criteria input:focus {
      background: var(--vscode-input-background);
      box-shadow: inset 0 -1px 0 var(--vscode-focusBorder);
    }
    button,
    select {
      height: var(--toolbar-button-size);
      align-self: center;
      color: var(--text-main);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      font: inherit;
      padding: 0 var(--space-sm);
    }
    .icon-button {
      width: var(--toolbar-button-size);
      padding: 0;
      color: var(--text-muted);
      font-size: var(--icon-size);
      line-height: 1;
    }
    .icon-button[data-tone="blue"] {
      color: var(--vscode-charts-blue);
    }
    .icon-button[data-tone="green"] {
      color: var(--vscode-charts-green);
    }
    .icon-button[data-tone="orange"] {
      color: var(--vscode-charts-orange);
    }
    .icon-button[data-tone="purple"] {
      color: var(--vscode-charts-purple);
    }
    .icon-button[data-tone="red"] {
      color: var(--vscode-charts-red);
    }
    .icon-button.active {
      color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .tool-select {
      width: auto;
      min-width: 78px;
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border);
    }
    button:hover {
      background: var(--vscode-toolbar-hoverBackground);
      border-color: var(--vscode-panel-border);
    }
    .grid-wrap {
      position: relative;
      min-height: 0;
      overflow: hidden;
      background: var(--bg-main);
    }
    .grid {
      height: 100%;
      overflow: auto;
      padding-bottom: 44px;
      box-sizing: border-box;
    }
    table {
      border-collapse: collapse;
      width: max-content;
      min-width: 100%;
      table-layout: fixed;
    }
    col.rownum-col {
      width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
    }
    col.data-col {
      width: clamp(10rem, 18vw, 15rem);
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--bg-header);
      color: var(--text-main);
      font-weight: 600;
      text-align: left;
      vertical-align: top;
    }
    th,
    td {
      height: var(--row-height);
      box-sizing: border-box;
      max-width: clamp(10rem, 18vw, 15rem);
      padding: 0.18rem var(--space-sm);
      border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 56%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.72rem, 0.7rem + 0.12vw, 0.86rem);
    }
    .header-button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: 0;
      text-align: left;
      border: 0;
    }
    .header-button span:nth-child(2) {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .column-type-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 3px;
      box-sizing: border-box;
      opacity: .85;
      position: relative;
    }
    thead th:nth-child(4n + 2) .column-type-icon {
      border-color: var(--vscode-charts-blue);
    }
    thead th:nth-child(4n + 3) .column-type-icon {
      border-color: var(--vscode-charts-purple);
    }
    thead th:nth-child(4n + 4) .column-type-icon {
      border-color: var(--vscode-charts-green);
    }
    thead th:nth-child(4n + 5) .column-type-icon {
      border-color: var(--vscode-charts-orange);
    }
    .column-type-icon::before {
      content: "";
      position: absolute;
      left: -4px;
      top: 4px;
      width: 6px;
      height: 6px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 50%;
      background: var(--vscode-editorWidget-background);
    }
    thead th:nth-child(4n + 2) .column-type-icon::before {
      border-color: var(--vscode-charts-blue);
    }
    thead th:nth-child(4n + 3) .column-type-icon::before {
      border-color: var(--vscode-charts-purple);
    }
    thead th:nth-child(4n + 4) .column-type-icon::before {
      border-color: var(--vscode-charts-green);
    }
    thead th:nth-child(4n + 5) .column-type-icon::before {
      border-color: var(--vscode-charts-orange);
    }
    .sort-mark {
      margin-left: auto;
      padding-left: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .column-filter-row {
      display: none;
    }
    .column-filter-row.visible {
      display: table-row;
    }
    .column-filter-row th {
      top: var(--row-height);
    }
    .column-filter-row input {
      width: 100%;
      height: calc(var(--row-height) - 0.2rem);
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      font: inherit;
      padding: 0 6px;
    }
    .column-filter-row input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    th:first-child {
      position: sticky;
      left: 0;
      z-index: 3;
      min-width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
      width: clamp(2.65rem, 2.35rem + 0.6vw, 3.5rem);
      color: var(--text-muted);
      text-align: right;
      background: var(--bg-header);
    }
    tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-editor-foreground));
    }
    tbody tr.selected-row td,
    tbody tr.selected-row th {
      background: var(--bg-selected);
    }
    th.selected-column,
    td.selected-column {
      background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 55%, transparent);
    }
    td.selected-cell {
      background: var(--bg-active);
      color: var(--vscode-list-activeSelectionForeground);
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    td.null {
      color: var(--text-muted);
      font-style: italic;
    }
    .pager {
      position: absolute;
      left: 50%;
      bottom: var(--space-sm);
      z-index: 5;
      transform: translateX(-50%);
      font-size: .86em;
    }
    .pager-group {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      height: clamp(1.9rem, 1.65rem + 0.45vw, 2.35rem);
      padding: 0 var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .28);
    }
    .page-size {
      min-width: 86px;
      border: 0;
      background: transparent;
    }
    .pager-button {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      padding: 0;
      color: var(--text-muted);
      font-size: var(--icon-size);
    }
    .pager-button:disabled {
      opacity: .38;
    }
    .pager-separator {
      width: 1px;
      height: 24px;
      background: var(--vscode-panel-border);
    }
    #fetchInfo {
      display: none;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button class="icon-button" id="refresh" data-tone="blue" title="Refresh data">↻</button>
      <button class="icon-button" id="copyRows" data-tone="purple" title="Copy visible rows as TSV">⧉</button>
      <button class="icon-button" id="focusWhere" data-tone="blue" title="Focus WHERE">⌕</button>
      <span class="toolbar-separator"></span>
      <button class="icon-button" id="generateSelect" data-tone="green" title="Generate SELECT">＋</button>
      <button class="icon-button" id="clearCriteria" data-tone="red" title="Clear WHERE, ORDER BY, and column filters">−</button>
      <button class="icon-button" id="resetRows" data-tone="orange" title="Reset to 500 rows">↶</button>
      <span class="toolbar-separator"></span>
      <select class="tool-select" title="Transaction mode">
        <option>Tx: Auto</option>
      </select>
      <button id="showDdl" title="Show DDL">DDL</button>
      <button class="icon-button" id="applyWhere" data-tone="green" title="Apply WHERE">▶</button>
      <button class="icon-button" id="toggleFilters" data-tone="blue" title="Show or hide per-column filters">▾</button>
      <button class="icon-button" id="clearFilters" data-tone="orange" title="Clear column filters">◇</button>
      <span class="toolbar-spacer"></span>
      <select id="exportFormat" class="tool-select" title="Export visible rows">
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
        <option value="tsv">TSV</option>
      </select>
      <button class="icon-button" id="export" data-tone="green" title="Export">⇩</button>
    </div>
    <div class="criteria-row">
      <div class="criteria">
        <span class="criteria-icon">▽</span>
        <strong>WHERE</strong>
        <input id="where" aria-label="Filter rows">
      </div>
      <div class="criteria">
        <span class="criteria-icon">≡</span>
        <strong>ORDER BY</strong>
        <input id="orderBy" aria-label="Order rows">
      </div>
    </div>
    <div class="grid-wrap">
      <div class="grid">
        <table id="table">
          <colgroup id="colgroup"></colgroup>
          <thead id="thead"></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
      <div class="pager">
        <span class="pager-group">
          <button id="firstPage" class="pager-button" title="First page">|‹</button>
          <button id="prevPage" class="pager-button" title="Previous page">‹</button>
          <select id="pageSize" class="page-size" title="Rows requested from the database">
            <option value="500">1-500</option>
            <option value="1000">1-1,000</option>
            <option value="5000">1-5,000</option>
            <option value="0">All</option>
          </select>
          <span id="rowCount">of 0</span>
          <button id="nextPage" class="pager-button" title="Next page">›</button>
          <button id="lastPage" class="pager-button" title="Last loaded page">›|</button>
          <span class="pager-separator"></span>
          <button class="pager-button" id="pagerMenu" title="More">⋮</button>
          <span id="fetchInfo" class="muted"></span>
        </span>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let rows = ${JSON.stringify(rows).replace(/</g, '\\u003c')};
    let columns = ${JSON.stringify(columns)};
    let durationMs = ${JSON.stringify(durationMs)};
    let currentLimit = ${JSON.stringify(maxRows)};
    let currentOffset = 0;
    let hasMore = ${JSON.stringify(hasMore)};
    let sort = null;
    let loading = false;
    let selectedCell = null;
    let selectedRow = null;
    let selectedColumn = null;
    let columnFiltersVisible = false;
    const columnFilters = new Map();
    const where = document.getElementById('where');
    const tbody = document.getElementById('tbody');
    const thead = document.getElementById('thead');
    const colgroup = document.getElementById('colgroup');
    const rowCount = document.getElementById('rowCount');
    const fetchInfo = document.getElementById('fetchInfo');
    const orderBy = document.getElementById('orderBy');
    const pageSize = document.getElementById('pageSize');
    const toggleFilters = document.getElementById('toggleFilters');
    const firstPage = document.getElementById('firstPage');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const lastPage = document.getElementById('lastPage');
    pageSize.value = String(currentLimit || 0);

    function cell(value) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
    function html(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }
    function csvValue(value) {
      return '"' + cell(value).replaceAll('"', '""') + '"';
    }
    function filteredRows() {
      let nextRows = rows.filter((row) => {
        return columns.every((column) => {
          const filter = (columnFilters.get(column) || '').trim().toLowerCase();
          return !filter || cell(row[column]).toLowerCase().includes(filter);
        });
      });
      return nextRows;
    }
    function exportRows(format) {
      const visibleRows = filteredRows();
      if (format === 'json') {
        return JSON.stringify(visibleRows, null, 2);
      }
      const separator = format === 'tsv' ? '\\t' : ',';
      const encode = format === 'tsv' ? cell : csvValue;
      return [columns.join(separator), ...visibleRows.map((row) => columns.map((column) => encode(row[column])).join(separator))].join('\\n');
    }
    function pageSizeValue() {
      return Number(pageSize.value) || 0;
    }
    function pageEnd() {
      return currentOffset + filteredRows().length;
    }
    function updatePager() {
      const visibleCount = filteredRows().length;
      const start = visibleCount ? currentOffset + 1 : currentOffset;
      const end = currentOffset + visibleCount;
      const totalHint = hasMore ? end + 1 + '+' : String(end);
      rowCount.textContent = loading ? 'Loading...' : 'of ' + totalHint;
      const label = currentLimit ? start.toLocaleString() + '-' + end.toLocaleString() : 'All';
      const option = pageSize.querySelector('option[value="' + String(currentLimit || 0) + '"]');
      if (option) {
        option.textContent = label;
      }
      firstPage.disabled = loading || currentOffset === 0;
      prevPage.disabled = loading || currentOffset === 0 || !currentLimit;
      nextPage.disabled = loading || !hasMore || !currentLimit;
      lastPage.disabled = true;
    }
    function renderHeader() {
      colgroup.innerHTML = '<col class="rownum-col">' + columns.map(() => '<col class="data-col">').join('');
      thead.innerHTML = '<tr><th>#</th>' + columns.map((column) => {
        const mark = sort?.column === column ? (sort.direction === 'asc' ? '▲' : '▼') : '↕';
        return '<th class="' + (selectedColumn === column ? 'selected-column' : '') + '"><button class="header-button" data-sort="' + html(column) + '" data-column="' + html(column) + '" title="Order by ' + html(column) + '"><span class="column-type-icon"></span><span>' + html(column) + '</span><span class="sort-mark">' + mark + '</span></button></th>';
      }).join('') + '</tr><tr class="column-filter-row ' + (columnFiltersVisible ? 'visible' : '') + '"><th></th>' + columns.map((column) => {
        return '<th><input data-filter="' + html(column) + '" value="' + html(columnFilters.get(column) || '') + '" placeholder="Filter"></th>';
      }).join('') + '</tr>';
      toggleFilters.classList.toggle('active', columnFiltersVisible);
      document.querySelectorAll('[data-sort]').forEach((button) => {
        button.addEventListener('click', () => {
          const column = button.getAttribute('data-sort');
          selectedColumn = column;
          selectedCell = null;
          selectedRow = null;
          sort = sort?.column === column && sort.direction === 'asc' ? { column, direction: 'desc' } : { column, direction: 'asc' };
          orderBy.value = sort.column + ' ' + sort.direction;
          fetchRows();
        });
      });
      document.querySelectorAll('[data-filter]').forEach((input) => {
        input.addEventListener('input', () => {
          columnFilters.set(input.getAttribute('data-filter'), input.value);
          renderBody();
        });
      });
    }
    function renderBody() {
      const nextRows = filteredRows();
      tbody.innerHTML = nextRows.map((row, index) => '<tr class="' + (selectedRow === index ? 'selected-row' : '') + '"><th data-row="' + index + '">' + (currentOffset + index + 1) + '</th>' + columns.map((column) => {
        const value = row[column];
        const text = html(cell(value));
        const classes = [
          value === null ? 'null' : '',
          selectedColumn === column ? 'selected-column' : '',
          selectedCell?.row === index && selectedCell?.column === column ? 'selected-cell' : ''
        ].filter(Boolean).join(' ');
        return '<td class="' + classes + '" data-row="' + index + '" data-column="' + html(column) + '" title="' + text + '">' + (value === null ? 'NULL' : text) + '</td>';
      }).join('') + '</tr>').join('');
      fetchInfo.textContent = loading ? 'Loading...' : durationMs + 'ms';
      updatePager();
    }
    function render() {
      renderHeader();
      renderBody();
    }
    function fetchRows(nextOffset = currentOffset) {
      currentOffset = Math.max(0, nextOffset);
      loading = true;
      renderBody();
      vscode.postMessage({
        type: 'fetch',
        limit: pageSizeValue(),
        offset: currentOffset,
        where: where.value.trim(),
        orderBySql: orderBy.value.trim(),
        orderBy: orderBy.value.trim() ? [] : sort ? [sort] : []
      });
    }
    where.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        fetchRows(0);
      }
      if (event.key === 'Escape') {
        where.value = '';
        fetchRows(0);
      }
    });
    orderBy.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      }
      if (event.key === 'Escape') {
        orderBy.value = '';
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      }
    });
    toggleFilters.addEventListener('click', () => {
      columnFiltersVisible = !columnFiltersVisible;
      renderHeader();
    });
    document.getElementById('export').addEventListener('click', () => {
      const format = document.getElementById('exportFormat').value;
      vscode.postMessage({ type: 'export', format, text: exportRows(format) });
    });
    document.getElementById('copyRows').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: exportRows('tsv') });
    });
    document.getElementById('focusWhere').addEventListener('click', () => {
      where.focus();
    });
    document.getElementById('applyWhere').addEventListener('click', fetchRows);
    document.getElementById('showDdl').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'ddl' });
    });
    document.getElementById('generateSelect').addEventListener('click', () => {
      vscode.postMessage({ type: 'command', command: 'select' });
    });
    document.getElementById('clearCriteria').addEventListener('click', () => {
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      fetchRows(0);
    });
    document.getElementById('clearFilters').addEventListener('click', () => {
      columnFilters.clear();
      render();
    });
    document.getElementById('resetRows').addEventListener('click', () => {
      pageSize.value = '500';
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      fetchRows(0);
    });
    pageSize.addEventListener('change', () => {
      fetchRows(0);
    });
    document.getElementById('refresh').addEventListener('click', () => {
      fetchRows();
    });
    firstPage.addEventListener('click', () => fetchRows(0));
    prevPage.addEventListener('click', () => fetchRows(Math.max(0, currentOffset - pageSizeValue())));
    nextPage.addEventListener('click', () => fetchRows(currentOffset + pageSizeValue()));
    tbody.addEventListener('click', (event) => {
      const target = event.target;
      const cellElement = target.closest('td');
      const rowHeader = target.closest('th[data-row]');
      if (cellElement) {
        selectedCell = { row: Number(cellElement.dataset.row), column: cellElement.dataset.column };
        selectedRow = null;
        selectedColumn = null;
        render();
      } else if (rowHeader) {
        selectedRow = Number(rowHeader.dataset.row);
        selectedCell = null;
        selectedColumn = null;
        render();
      }
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'error') {
        loading = false;
        fetchInfo.textContent = event.data.message || 'Query failed';
        return;
      }
      if (event.data?.type !== 'state') return;
      rows = event.data.rows || [];
      columns = event.data.columns || [];
      durationMs = event.data.durationMs || 0;
      currentLimit = event.data.limit || 0;
      currentOffset = event.data.offset || 0;
      hasMore = !!event.data.hasMore;
      pageSize.value = String(currentLimit);
      loading = false;
      selectedCell = null;
      selectedRow = null;
      columnFilters.clear();
      render();
    });
    render();
  </script>
</body>
</html>`;
    }
}
exports.TableDataPanel = TableDataPanel;
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
//# sourceMappingURL=TableDataPanel.js.map