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
        const configuredMaxRows = vscode.workspace.getConfiguration('database').get('defaultMaxRows', 500);
        const maxRows = Number.isFinite(configuredMaxRows) && configuredMaxRows && configuredMaxRows > 0 ? Math.floor(configuredMaxRows) : 500;
        const panel = vscode.window.createWebviewPanel('databaseTableData', node.table.name, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
        panel.webview.html = this.html(panel.webview, node, [], [], 0, maxRows, false, true);
        let initialFetchStarted = false;
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'ready') {
                if (!initialFetchStarted) {
                    initialFetchStarted = true;
                    void this.postTableState(panel, connectionManager, node, maxRows);
                }
                return;
            }
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
                await this.postTableState(panel, connectionManager, node, limit, {
                    where: message.where,
                    offset,
                    orderBySql: message.orderBySql,
                    orderBy: message.orderBy
                });
            }
        });
    }
    static async openPerformanceAdvisor(context, node, report, openSql) {
        const panel = vscode.window.createWebviewPanel('databaseTablePerformance', `Advisor: ${node.table.name}`, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
        panel.webview.html = this.advisorHtml(node, report);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'copy' && typeof message.text === 'string') {
                await vscode.env.clipboard.writeText(message.text);
            }
            if (message.type === 'openSql' && typeof message.sql === 'string') {
                await openSql(message.title || `Advisor DDL ${node.table.name}`, `${message.sql.trim()}\n`);
            }
        });
    }
    static async openDataProfile(context, node, report) {
        const panel = vscode.window.createWebviewPanel('databaseTableProfile', `Profile: ${node.table.name}`, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
        panel.webview.html = this.profileHtml(node, report);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'copy' && typeof message.text === 'string') {
                await vscode.env.clipboard.writeText(message.text);
            }
        });
    }
    static async postTableState(panel, connectionManager, node, limit, options = {}) {
        try {
            if (!connectionManager.isConnected(node.connection.id)) {
                await connectionManager.connect(node.connection.id);
            }
            const nextResult = await connectionManager
                .getDriver(node.connection.type)
                .getTablePreview(node.connection.id, node.table.schema, node.table.name, limit, options);
            const hasMore = limit > 0 && nextResult.rows.length > limit;
            await panel.webview.postMessage({
                type: 'state',
                rows: hasMore ? nextResult.rows.slice(0, limit) : nextResult.rows,
                columns: nextResult.fields.map((field) => field.name),
                columnTypes: Object.fromEntries(nextResult.fields.map((field) => [field.name, { dataTypeId: field.dataTypeId, dataTypeName: field.dataTypeName }])),
                durationMs: nextResult.durationMs,
                limit,
                offset: options.offset ?? 0,
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
    static html(webview, node, rows, columns, durationMs, maxRows, hasMore, initialLoading = false) {
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
      --icon-size: clamp(1.05rem, 0.98rem + 0.25vw, 1.25rem);
      --toolbar-button-size: clamp(1.85rem, 1.65rem + 0.55vw, 2.25rem);
      --row-height: 32px;
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: clamp(0.88rem, 0.84rem + 0.15vw, 1rem);
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
      display: inline-grid;
      place-items: center;
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
    .column-suggest {
      position: fixed;
      z-index: 30;
      width: min(26rem, calc(100vw - 1rem));
      max-height: min(18rem, 46vh);
      overflow: auto;
      padding: var(--space-xxs) 0;
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      scrollbar-width: thin;
    }
    .column-suggest[hidden] {
      display: none;
    }
    .column-suggest button {
      width: 100%;
      min-height: 1.8rem;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 0;
      border-radius: 0;
      color: inherit;
      text-align: left;
    }
    .column-suggest button:hover,
    .column-suggest button.active {
      background: var(--vscode-list-hoverBackground);
    }
    .column-suggest-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
    }
    .column-suggest-type {
      color: var(--text-muted);
      font-size: .9em;
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
      max-width: none;
      padding: 0.18rem var(--space-sm);
      border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 56%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family);
      font-size: clamp(0.94rem, 0.9rem + 0.12vw, 1.05rem);
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
      font-size: 0.98rem;
      font-weight: 600;
    }
    .header-cell-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xxs);
      width: 100%;
      min-width: 0;
    }
    .header-cell-actions .header-button {
      flex: 1 1 auto;
      width: auto;
    }
    .header-button span:nth-child(2) {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .column-type-icon {
      width: calc(var(--icon-size) * 0.9);
      height: calc(var(--icon-size) * 0.9);
      flex: 0 0 auto;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 0.18rem;
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
      left: -0.28rem;
      top: 0.25rem;
      width: 0.35rem;
      height: 0.35rem;
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
    .sort-button,
    .filter-button {
      width: var(--toolbar-button-size);
      height: var(--toolbar-button-size);
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      padding: 0;
      color: var(--vscode-icon-foreground, var(--text-main));
      border: 0;
      opacity: .92;
    }
    .sort-button.active,
    .filter-button.active {
      color: var(--accent);
      background: color-mix(in srgb, var(--bg-active) 32%, transparent);
      opacity: 1;
    }
    .filter-icon {
      width: calc(var(--icon-size) * 1.05);
      height: calc(var(--icon-size) * 1.05);
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      right: -0.28rem;
      bottom: 0;
      z-index: 4;
      width: 0.55rem;
      cursor: col-resize;
    }
    .resize-handle:hover,
    .resize-handle.resizing {
      background: var(--accent);
    }
    .resize-handle::after {
      content: "↔";
      position: absolute;
      top: 50%;
      right: -0.65rem;
      z-index: 5;
      width: 1.2rem;
      height: 1.2rem;
      display: none;
      place-items: center;
      transform: translateY(-50%);
      color: var(--vscode-button-foreground);
      background: var(--accent);
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      line-height: 1;
      pointer-events: none;
    }
    .resize-handle:hover::after,
    .resize-handle.resizing::after {
      display: grid;
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
    .filter-popover {
      position: fixed;
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      width: min(28rem, 82vw);
      max-height: min(34rem, 72vh);
      padding: var(--space-md);
      border: 1px solid var(--accent);
      background: var(--vscode-dropdown-background);
      border-radius: var(--radius-sm);
      box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      overflow: hidden;
      box-sizing: border-box;
    }
    .filter-popover[hidden] {
      display: none;
    }
    .filter-title {
      color: var(--text-main);
      font-size: 1.05rem;
      font-weight: 600;
    }
    .filter-search {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: calc(var(--toolbar-button-size) * 1.25);
      padding: 0 var(--space-sm);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--vscode-input-background);
    }
    .filter-search span {
      color: var(--text-muted);
      font-size: 1.15rem;
    }
    .filter-search input {
      width: 100%;
      min-width: 0;
      height: var(--toolbar-button-size);
      padding: 0;
      color: var(--vscode-input-foreground);
      background: transparent;
      border: 0;
      outline: 0;
      font: inherit;
    }
    .filter-option-list {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    .filter-option {
      min-height: calc(var(--row-height) * 1.25);
      display: grid;
      grid-template-columns: 1.45rem minmax(0, 1fr) 5rem;
      align-items: center;
      gap: var(--space-sm);
      color: var(--text-main);
    }
    .filter-option input {
      width: 1rem;
      height: 1rem;
    }
    .filter-option span:not(.filter-count) {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .filter-option-heading {
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
    }
    .filter-count {
      color: var(--text-muted);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .filter-live-status {
      color: var(--text-muted);
      text-align: right;
      font-weight: 600;
    }
    .selection-summary {
      position: absolute;
      right: var(--space-sm);
      bottom: var(--space-sm);
      z-index: 6;
      max-width: min(48rem, calc(50vw - 2rem));
      min-height: clamp(2.15rem, 1.9rem + 0.45vw, 2.65rem);
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      padding: 0 var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
      color: var(--text-muted);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.98rem;
    }
    .selection-summary[hidden] {
      display: none;
    }
    .selection-summary span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .summary-column {
      color: var(--text-main);
      font-weight: 600;
    }
    .loading-overlay {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: grid;
      place-items: center;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-main) 70%, transparent);
    }
    .loading-overlay[hidden] {
      display: none;
    }
    .loading-panel {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: var(--toolbar-button-size);
      padding: 0 var(--space-md);
      color: var(--text-main);
      background: var(--bg-header);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24);
    }
    .loading-spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid color-mix(in srgb, var(--vscode-charts-yellow) 35%, transparent);
      border-top-color: var(--vscode-charts-yellow);
      border-radius: 50%;
      animation: spin 0.85s linear infinite;
    }
    .loading-spinner[hidden] {
      display: none;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
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
      <button id="showDdl" title="Show DDL">DDL</button>
      <button class="icon-button" id="applyWhere" data-tone="green" title="Apply WHERE">▶</button>
      <button class="icon-button" id="toggleFilters" data-tone="blue" title="Show or hide per-column filters"><svg class="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z"></path></svg></button>
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
        <span class="criteria-icon"><svg class="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z"></path></svg></span>
        <strong>WHERE</strong>
        <input id="where" aria-label="Filter rows">
      </div>
      <div class="criteria">
        <span class="criteria-icon">≡</span>
        <strong>ORDER BY</strong>
        <input id="orderBy" aria-label="Order rows">
      </div>
    </div>
    <div id="columnSuggest" class="column-suggest" hidden></div>
    <div id="gridWrap" class="grid-wrap">
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
          <span id="fetchInfo" class="muted"></span>
        </span>
      </div>
      <div id="selectionSummary" class="selection-summary" hidden></div>
      <div id="filterPopover" class="filter-popover" hidden></div>
      <div id="loadingOverlay" class="loading-overlay" aria-live="polite">
        <span class="loading-panel">
          <span id="loadingSpinner" class="loading-spinner" aria-hidden="true"></span>
          <span id="loadingText">Loading table data...</span>
        </span>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DEFAULT_COLUMN_WIDTH = 220;
    const MIN_COLUMN_WIDTH = 112;
    const MAX_FILTER_OPTIONS = 250;
    let rows = ${JSON.stringify(rows).replace(/</g, '\\u003c')};
    let columns = ${JSON.stringify(columns)};
    let columnTypes = {};
    let columnWidths = {};
    let durationMs = ${JSON.stringify(durationMs)};
    let currentLimit = ${JSON.stringify(maxRows)};
    let currentOffset = 0;
    let hasMore = ${JSON.stringify(hasMore)};
    let sort = null;
    let loading = ${JSON.stringify(initialLoading)};
    let errorMessage = '';
    let selectedCell = null;
    let selectedRow = null;
    let selectedColumn = null;
    let columnFiltersVisible = true;
    const columnFilters = new Map();
    let activeFilterColumn = null;
    let filterDraft = new Set();
    let filterSearch = '';
    let suggestInput = null;
    let suggestContext = null;
    let suggestItems = [];
    let suggestIndex = 0;
    const NUMERIC_TYPE_IDS = new Set([20, 21, 23, 700, 701, 790, 1700]);
    const NUMERIC_TYPE_NAMES = [
      'bigint',
      'bigserial',
      'decimal',
      'double precision',
      'float',
      'float4',
      'float8',
      'int',
      'int2',
      'int4',
      'int8',
      'integer',
      'money',
      'numeric',
      'real',
      'serial',
      'serial2',
      'serial4',
      'serial8',
      'smallint'
    ];
    const where = document.getElementById('where');
    const tbody = document.getElementById('tbody');
    const thead = document.getElementById('thead');
    const colgroup = document.getElementById('colgroup');
    const rowCount = document.getElementById('rowCount');
    const fetchInfo = document.getElementById('fetchInfo');
    const orderBy = document.getElementById('orderBy');
    const columnSuggest = document.getElementById('columnSuggest');
    const pageSize = document.getElementById('pageSize');
    const toggleFilters = document.getElementById('toggleFilters');
    const firstPage = document.getElementById('firstPage');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const gridWrap = document.getElementById('gridWrap');
    const filterPopover = document.getElementById('filterPopover');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    const selectionSummary = document.getElementById('selectionSummary');
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
    function filterKey(value) {
      if (value === null || value === undefined) return '<NULL>';
      return cell(value);
    }
    function filterLabel(value) {
      if (value === null || value === undefined) return 'NULL';
      const next = cell(value);
      return next === '' ? '(empty)' : next;
    }
    function sqlIdentifier(column) {
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(column)
        ? column
        : '"' + column.replaceAll('"', '""') + '"';
    }
    function suggestColumnContext(input) {
      const cursor = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, cursor);
      const match = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
      const partial = match ? match[0] : '';
      return {
        start: cursor - partial.length,
        end: cursor,
        partial
      };
    }
    function matchingColumns(partial) {
      const lower = partial.toLowerCase();
      return columns
        .filter((column) => !lower || column.toLowerCase().startsWith(lower))
        .slice(0, 30);
    }
    function positionColumnSuggest(input) {
      const rect = input.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
      columnSuggest.style.width = width + 'px';
      columnSuggest.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
      columnSuggest.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 80)) + 'px';
    }
    function renderColumnSuggest(input) {
      if (!columns.length) {
        closeColumnSuggest();
        return;
      }
      suggestInput = input;
      suggestContext = suggestColumnContext(input);
      suggestItems = matchingColumns(suggestContext.partial);
      suggestIndex = Math.min(suggestIndex, Math.max(0, suggestItems.length - 1));
      if (!suggestItems.length) {
        closeColumnSuggest();
        return;
      }
      positionColumnSuggest(input);
      columnSuggest.hidden = false;
      columnSuggest.innerHTML = suggestItems.map((column, index) => {
        const type = columnTypes[column]?.dataTypeName || '';
        return '<button type="button" class="' + (index === suggestIndex ? 'active' : '') + '" data-suggest-index="' + index + '"><span class="column-suggest-name">' + html(column) + '</span><span class="column-suggest-type">' + html(type) + '</span></button>';
      }).join('');
      columnSuggest.querySelectorAll('[data-suggest-index]').forEach((button) => {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          applyColumnSuggest(Number(button.getAttribute('data-suggest-index')));
        });
      });
    }
    function closeColumnSuggest() {
      suggestInput = null;
      suggestContext = null;
      suggestItems = [];
      suggestIndex = 0;
      columnSuggest.hidden = true;
      columnSuggest.innerHTML = '';
    }
    function applyColumnSuggest(index = suggestIndex) {
      if (!suggestInput || !suggestContext || !suggestItems[index]) return;
      const column = sqlIdentifier(suggestItems[index]);
      const before = suggestInput.value.slice(0, suggestContext.start);
      const after = suggestInput.value.slice(suggestContext.end);
      suggestInput.value = before + column + after;
      const nextCursor = before.length + column.length;
      suggestInput.focus();
      suggestInput.setSelectionRange(nextCursor, nextCursor);
      closeColumnSuggest();
    }
    function moveColumnSuggest(delta) {
      if (columnSuggest.hidden || !suggestItems.length) return;
      suggestIndex = (suggestIndex + delta + suggestItems.length) % suggestItems.length;
      renderColumnSuggest(suggestInput);
    }
    function handleCriteriaSuggestKeydown(event, input, onSubmit, onClear) {
      if (!columnSuggest.hidden && suggestInput === input) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveColumnSuggest(1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveColumnSuggest(-1);
          return;
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault();
          applyColumnSuggest();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeColumnSuggest();
          return;
        }
      }
      if (event.key === 'Enter') {
        onSubmit();
      }
      if (event.key === 'Escape') {
        onClear();
      }
    }
    function columnFilterOptions(column) {
      const counts = new Map();
      rows.forEach((row) => {
        const key = filterKey(row[column]);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { key, label: filterLabel(row[column]), count: 1 });
        }
      });
      return [...counts.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
    }
    function filteredRows() {
      let nextRows = rows.filter((row) => {
        return columns.every((column) => {
          const selected = columnFilters.get(column);
          return !selected || selected.has(filterKey(row[column]));
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
    function isIdentifierColumn(column) {
      return column.toLowerCase() === 'id'
        || /^id[_\\-\\s]/i.test(column)
        || /[_\\-\\s]id$/i.test(column)
        || /Id$/.test(column)
        || /ID$/.test(column);
    }
    function isNumericAggregateColumn(column) {
      if (isIdentifierColumn(column)) return false;
      const field = columnTypes[column] || {};
      if (typeof field.dataTypeId === 'number' && NUMERIC_TYPE_IDS.has(field.dataTypeId)) return true;
      const typeName = typeof field.dataTypeName === 'string' ? field.dataTypeName.toLowerCase().replace(/\\s+/g, ' ').trim() : '';
      return !!typeName && NUMERIC_TYPE_NAMES.some((numericType) => typeName === numericType || typeName.startsWith(numericType + '(') || typeName.startsWith(numericType + ' '));
    }
    function numericValue(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      if (typeof value === 'bigint') {
        const next = Number(value);
        return Number.isFinite(next) ? next : undefined;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || !/^-?(?:\\d+|\\d*\\.\\d+)(?:e[+-]?\\d+)?$/i.test(trimmed)) return undefined;
        const next = Number(trimmed);
        return Number.isFinite(next) ? next : undefined;
      }
      return undefined;
    }
    function formatNumber(value) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
    }
    function selectedColumnStats() {
      if (!selectedColumn || !isNumericAggregateColumn(selectedColumn)) return null;
      const values = filteredRows()
        .map((row) => numericValue(row[selectedColumn]))
        .filter((value) => value !== undefined);
      if (!values.length) return null;
      const sum = values.reduce((total, value) => total + value, 0);
      return {
        sum,
        average: sum / values.length,
        count: values.length
      };
    }
    function updateSelectionSummary() {
      if (!selectedColumn) {
        selectionSummary.hidden = true;
        selectionSummary.innerHTML = '';
        return;
      }
      const stats = selectedColumnStats();
      selectionSummary.hidden = false;
      selectionSummary.title = stats
        ? selectedColumn + ': sum ' + formatNumber(stats.sum) + ', average ' + formatNumber(stats.average)
        : selectedColumn + ': ' + filteredRows().length.toLocaleString() + ' rows selected';
      selectionSummary.innerHTML = '<span class="summary-column">' + html(selectedColumn) + '</span>' + (
        stats
          ? '<span>' + stats.count.toLocaleString() + ' values</span><span>Sum ' + html(formatNumber(stats.sum)) + '</span><span>Avg ' + html(formatNumber(stats.average)) + '</span>'
          : '<span>' + filteredRows().length.toLocaleString() + ' rows selected</span>'
      );
    }
    function positionFilterPopover(anchor) {
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const width = Math.min(448, Math.max(260, window.innerWidth - viewportPadding * 2));
      const below = window.innerHeight - rect.bottom - viewportPadding;
      const above = rect.top - viewportPadding;
      const openBelow = below >= 240 || below >= above;
      const availableHeight = Math.max(96, openBelow ? below - 4 : above - 4);
      const maxHeight = Math.min(544, availableHeight);
      const top = openBelow
        ? rect.bottom + 4
        : Math.max(viewportPadding, rect.top - maxHeight - 4);
      filterPopover.style.width = width + 'px';
      filterPopover.style.maxHeight = maxHeight + 'px';
      filterPopover.style.left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding)) + 'px';
      filterPopover.style.top = top + 'px';
    }
    function openColumnFilter(column, anchor) {
      activeFilterColumn = column;
      filterSearch = '';
      const allKeys = columnFilterOptions(column).map((option) => option.key);
      filterDraft = new Set(columnFilters.get(column) || allKeys);
      positionFilterPopover(anchor);
      renderFilterPopover();
    }
    function closeColumnFilter() {
      activeFilterColumn = null;
      filterPopover.hidden = true;
      filterPopover.innerHTML = '';
    }
    function commitFilterDraft() {
      if (!activeFilterColumn) return;
      const allKeys = columnFilterOptions(activeFilterColumn).map((option) => option.key);
      if (filterDraft.size === allKeys.length) {
        columnFilters.delete(activeFilterColumn);
      } else {
        columnFilters.set(activeFilterColumn, new Set(filterDraft));
      }
      renderHeader();
      renderBody();
    }
    function renderFilterPopover(restoreSearchFocus = false) {
      if (!activeFilterColumn) {
        closeColumnFilter();
        return;
      }
      const options = columnFilterOptions(activeFilterColumn);
      const allKeys = options.map((option) => option.key);
      const visibleOptions = options
        .filter((option) => option.label.toLowerCase().includes(filterSearch.trim().toLowerCase()))
        .slice(0, MAX_FILTER_OPTIONS);
      const visibleKeys = visibleOptions.map((option) => option.key);
      const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => filterDraft.has(key));
      filterPopover.hidden = false;
      filterPopover.innerHTML =
        '<div class="filter-title">Local Filter For \\'' + html(activeFilterColumn) + '\\'</div>' +
        '<label class="filter-search"><span>⌕</span><input id="filterSearchInput" value="' + html(filterSearch) + '"></label>' +
        '<label class="filter-option filter-option-heading"><input id="filterSelectVisible" type="checkbox" ' + (allVisibleSelected ? 'checked' : '') + '><span>Value</span><span class="filter-count">Count</span></label>' +
        '<div class="filter-option-list">' + visibleOptions.map((option) => {
          return '<label class="filter-option"><input type="checkbox" data-filter-value="' + html(option.key) + '" ' + (filterDraft.has(option.key) ? 'checked' : '') + '><span title="' + html(option.label) + '">' + html(option.label) + '</span><span class="filter-count">' + option.count.toLocaleString() + '</span></label>';
        }).join('') + '</div>' +
        '<div class="filter-live-status">' + filterDraft.size.toLocaleString() + ' selected</div>';

      const searchInput = document.getElementById('filterSearchInput');
      searchInput.addEventListener('input', () => {
        filterSearch = searchInput.value;
        renderFilterPopover(true);
      });
      if (restoreSearchFocus) {
        const nextSearchInput = document.getElementById('filterSearchInput');
        nextSearchInput.focus();
        nextSearchInput.setSelectionRange(nextSearchInput.value.length, nextSearchInput.value.length);
      }
      document.getElementById('filterSelectVisible').addEventListener('change', () => {
        if (allVisibleSelected) {
          visibleKeys.forEach((key) => filterDraft.delete(key));
        } else {
          visibleKeys.forEach((key) => filterDraft.add(key));
        }
        commitFilterDraft();
        renderFilterPopover();
      });
      filterPopover.querySelectorAll('[data-filter-value]').forEach((input) => {
        input.addEventListener('change', () => {
          const key = input.getAttribute('data-filter-value');
          if (input.checked) {
            filterDraft.add(key);
          } else {
            filterDraft.delete(key);
          }
          commitFilterDraft();
          renderFilterPopover();
        });
      });
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
    }
    function updateLoadingOverlay() {
      const visible = loading || errorMessage;
      loadingOverlay.hidden = !visible;
      loadingSpinner.hidden = !loading;
      loadingText.textContent = loading ? 'Loading table data...' : errorMessage;
    }
    const filterIconMarkup = '<svg class="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z"></path></svg>';
    function renderHeader() {
      colgroup.innerHTML = '<col class="rownum-col">' + columns.map((column) => '<col class="data-col" style="width: ' + (columnWidths[column] || DEFAULT_COLUMN_WIDTH) + 'px">').join('');
      thead.innerHTML = '<tr><th>#</th>' + columns.map((column) => {
        const mark = sort?.column === column ? (sort.direction === 'asc' ? '▲' : '▼') : '↕';
        const filterButton = columnFiltersVisible ? '<button class="filter-button ' + (columnFilters.has(column) ? 'active' : '') + '" data-filter-button="' + html(column) + '" title="Filter ' + html(column) + '">' + filterIconMarkup + '</button>' : '';
        return '<th class="' + (selectedColumn === column ? 'selected-column' : '') + '"><div class="header-cell-actions"><button class="header-button" data-select-column="' + html(column) + '" title="Select column ' + html(column) + '"><span class="column-type-icon"></span><span>' + html(column) + '</span></button><button class="sort-button ' + (sort?.column === column ? 'active' : '') + '" data-sort="' + html(column) + '" title="Order by ' + html(column) + '">' + mark + '</button>' + filterButton + '</div><span class="resize-handle" data-resize-column="' + html(column) + '" title="Resize column"></span></th>';
      }).join('') + '</tr>';
      toggleFilters.classList.toggle('active', columnFiltersVisible);
      document.querySelectorAll('[data-select-column]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedColumn = button.getAttribute('data-select-column');
          selectedCell = null;
          selectedRow = null;
          render();
        });
      });
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
      document.querySelectorAll('[data-filter-button]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const column = button.getAttribute('data-filter-button');
          if (activeFilterColumn === column) {
            closeColumnFilter();
          } else {
            openColumnFilter(column, button);
          }
        });
      });
      document.querySelectorAll('[data-resize-column]').forEach((handle) => {
        handle.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const column = handle.getAttribute('data-resize-column');
          const startX = event.clientX;
          const startWidth = columnWidths[column] || DEFAULT_COLUMN_WIDTH;
          handle.classList.add('resizing');
          const onMove = (moveEvent) => {
            columnWidths[column] = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
            renderHeader();
          };
          const onUp = () => {
            handle.classList.remove('resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
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
      updateLoadingOverlay();
      updateSelectionSummary();
    }
    function render() {
      renderHeader();
      renderBody();
    }
    function fetchRows(nextOffset = currentOffset) {
      currentOffset = Math.max(0, nextOffset);
      loading = true;
      errorMessage = '';
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
      handleCriteriaSuggestKeydown(event, where, () => fetchRows(0), () => {
        where.value = '';
        fetchRows(0);
      });
    });
    where.addEventListener('input', () => renderColumnSuggest(where));
    where.addEventListener('focus', () => renderColumnSuggest(where));
    orderBy.addEventListener('keydown', (event) => {
      handleCriteriaSuggestKeydown(event, orderBy, () => {
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      }, () => {
        orderBy.value = '';
        sort = null;
        selectedColumn = null;
        fetchRows(0);
      });
    });
    orderBy.addEventListener('input', () => renderColumnSuggest(orderBy));
    orderBy.addEventListener('focus', () => renderColumnSuggest(orderBy));
    toggleFilters.addEventListener('click', () => {
      columnFiltersVisible = !columnFiltersVisible;
      if (!columnFiltersVisible) {
        closeColumnFilter();
      }
      render();
    });
    filterPopover.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    document.addEventListener('click', (event) => {
      if (activeFilterColumn && !filterPopover.contains(event.target) && !event.target.closest('[data-filter-button]')) {
        closeColumnFilter();
      }
      if (!columnSuggest.contains(event.target) && event.target !== where && event.target !== orderBy) {
        closeColumnSuggest();
      }
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
    document.getElementById('applyWhere').addEventListener('click', () => fetchRows(0));
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
      closeColumnFilter();
      fetchRows(0);
    });
    document.getElementById('clearFilters').addEventListener('click', () => {
      columnFilters.clear();
      closeColumnFilter();
      render();
    });
    document.getElementById('resetRows').addEventListener('click', () => {
      pageSize.value = '500';
      where.value = '';
      orderBy.value = '';
      sort = null;
      selectedColumn = null;
      columnFilters.clear();
      closeColumnFilter();
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
        errorMessage = event.data.message || 'Query failed';
        renderBody();
        return;
      }
      if (event.data?.type !== 'state') return;
      rows = event.data.rows || [];
      columns = event.data.columns || [];
      columnTypes = event.data.columnTypes || {};
      durationMs = event.data.durationMs || 0;
      currentLimit = event.data.limit || 0;
      currentOffset = event.data.offset || 0;
      hasMore = !!event.data.hasMore;
      pageSize.value = String(currentLimit);
      loading = false;
      errorMessage = '';
      selectedCell = null;
      selectedRow = null;
      if (selectedColumn && !columns.includes(selectedColumn)) {
        selectedColumn = null;
      }
      columnFilters.clear();
      closeColumnFilter();
      render();
    });
    render();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
    static advisorHtml(node, report) {
        const nonce = Date.now().toString();
        const table = (0, identifiers_1.qualifiedName)(node.table.schema, node.table.name);
        const recommendations = report.advice.recommendations;
        const data = JSON.stringify({
            recommendations: recommendations.map((item, index) => ({
                index,
                title: `${item.kind.toUpperCase()} (${item.impact})`,
                ddl: item.ddl
            }))
        }).replace(/</g, '\\u003c');
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Advisor ${escapeHtml(table)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --success: var(--vscode-testing-iconPassed);
      --warning: var(--vscode-charts-yellow);
      --danger: var(--vscode-errorForeground);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
    }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    h1 {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 15px;
      font-weight: 600;
    }
    .meta {
      color: var(--text-muted);
      white-space: nowrap;
    }
    main {
      min-width: 0;
      overflow: auto;
      padding: 12px;
    }
    section {
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .list {
      margin: 0;
      padding-left: 18px;
    }
    .list li {
      margin: 0 0 6px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
    }
    .stat,
    .recommendation,
    .note {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
    }
    .stat {
      padding: 8px;
    }
    .stat strong {
      display: block;
      margin-bottom: 3px;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .stat span {
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }
    .recommendation {
      margin-bottom: 10px;
      overflow: hidden;
    }
    .recommendation-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg-header) 82%, var(--bg-main));
    }
    .recommendation-header strong {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .impact {
      color: var(--warning);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .impact.high { color: var(--danger); }
    .impact.low { color: var(--success); }
    .recommendation p {
      margin: 0;
      padding: 10px;
    }
    pre {
      margin: 0;
      padding: 10px;
      overflow: auto;
      border-top: 1px solid var(--border);
      background: var(--vscode-textCodeBlock-background, var(--bg-main));
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
    }
    button {
      height: 26px;
      padding: 0 8px;
      color: var(--text-main);
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: var(--bg-hover);
    }
    .empty,
    .note {
      padding: 10px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>${escapeHtml(table)} Performance Advisor</h1>
      <span class="meta">${escapeHtml(node.connection.name)} | ${escapeHtml(node.connection.type)}</span>
    </header>
    <main>
      ${report.aiError ? `<section><div class="note">AI advisor unavailable: ${escapeHtml(report.aiError)}. Showing deterministic findings.</div></section>` : ''}
      <section>
        <h2>Workload</h2>
        <div class="stats">
          <div class="stat"><strong>Queries</strong><span>${report.request.workload.queryCount.toLocaleString()}</span></div>
          <div class="stat"><strong>Runs</strong><span>${report.request.workload.totalRunCount.toLocaleString()}</span></div>
          <div class="stat"><strong>Duration</strong><span>${report.request.workload.totalDurationMs.toLocaleString()}ms</span></div>
          <div class="stat"><strong>Rows</strong><span>${formatOptionalNumber(report.request.stats.redshift?.rowCount ?? report.request.stats.liveRows ?? report.request.stats.rowEstimate)}</span></div>
        </div>
      </section>
      <section>
        <h2>Findings</h2>
        ${report.advice.findings.length
            ? `<ul class="list">${report.advice.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('')}</ul>`
            : '<div class="empty">No findings returned.</div>'}
      </section>
      <section>
        <h2>Deterministic Flags</h2>
        ${report.request.prepassFlags.length
            ? `<ul class="list">${report.request.prepassFlags.map((flag) => `<li><strong>${escapeHtml(flag.impact)}</strong> ${escapeHtml(flag.message)} <span class="meta">${escapeHtml(flag.evidence)}</span></li>`).join('')}</ul>`
            : '<div class="empty">No deterministic flags crossed thresholds.</div>'}
      </section>
      <section>
        <h2>Recommendations</h2>
        ${recommendations.length ? recommendations.map((item, index) => `
          <article class="recommendation">
            <div class="recommendation-header">
              <strong>${escapeHtml(item.kind)}</strong>
              <span class="impact ${escapeHtml(item.impact)}">${escapeHtml(item.impact)}</span>
              <button data-copy="${index}">Copy DDL</button>
              <button data-open="${index}">Open In Console</button>
            </div>
            <p>${escapeHtml(item.rationale)}</p>
            <pre>${escapeHtml(item.ddl)}</pre>
          </article>
        `).join('') : '<div class="empty">No ready-to-run recommendations returned.</div>'}
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${data};
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = data.recommendations[Number(button.getAttribute('data-copy'))];
        if (item) vscode.postMessage({ type: 'copy', text: item.ddl });
      });
    });
    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = data.recommendations[Number(button.getAttribute('data-open'))];
        if (item) vscode.postMessage({ type: 'openSql', title: item.title, sql: item.ddl });
      });
    });
  </script>
</body>
</html>`;
    }
    static profileHtml(node, report) {
        const nonce = Date.now().toString();
        const table = (0, identifiers_1.qualifiedName)(node.table.schema, node.table.name);
        const json = JSON.stringify(report, null, 2);
        const scriptData = JSON.stringify({ json }).replace(/</g, '\\u003c');
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profile ${escapeHtml(table)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-header: var(--vscode-editorWidget-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --danger: var(--vscode-errorForeground);
      --radius-sm: 0.25rem;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.4;
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--text-main); background: var(--bg-main); }
    .shell { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    h1 {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 15px;
      font-weight: 600;
    }
    button {
      height: 26px;
      padding: 0 8px;
      color: var(--text-main);
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font: inherit;
      cursor: pointer;
    }
    button:hover { background: var(--bg-hover); }
    main { min-width: 0; overflow: auto; padding: 12px; }
    section { margin-bottom: 16px; }
    h2 {
      margin: 0 0 8px;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .summary, .note {
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-header);
    }
    .note { color: var(--text-muted); }
    .anomalies { margin: 8px 0 0; padding-left: 18px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      padding: 6px 8px;
      border: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--bg-header);
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      z-index: 1;
    }
    td code, .mono {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .hist {
      display: grid;
      gap: 3px;
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(5rem, 1fr) minmax(2rem, auto);
      gap: 6px;
      align-items: center;
    }
    .bar-track {
      height: 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 18%, transparent);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--accent);
    }
    .danger { color: var(--danger); }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>${escapeHtml(table)} Data Profile</h1>
      <span class="note">${report.sampleRows.toLocaleString()} sampled rows</span>
      <button id="copyJson">Copy JSON</button>
    </header>
    <main>
      ${report.aiError ? `<section><div class="note">AI narrative unavailable: ${escapeHtml(report.aiError)}. Showing deterministic narrative.</div></section>` : ''}
      <section>
        <h2>Narrative</h2>
        <div class="summary">
          <div>${escapeHtml(report.narrative?.summary ?? `Profiled ${report.columns.length} columns.`)}</div>
          ${report.narrative?.anomalies?.length ? `<ul class="anomalies">${report.narrative.anomalies.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        </div>
      </section>
      <section>
        <h2>Columns</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 16%">Column</th>
              <th style="width: 12%">Type</th>
              <th style="width: 9%">Null</th>
              <th style="width: 9%">Distinct</th>
              <th style="width: 16%">Min / Max</th>
              <th style="width: 18%">Top Values</th>
              <th style="width: 20%">Histogram</th>
            </tr>
          </thead>
          <tbody>
            ${report.columns.map((column) => `
              <tr>
                <td><code>${escapeHtml(column.name)}</code></td>
                <td>${escapeHtml(column.dataType ?? '')}</td>
                <td class="${column.nullPct >= 50 ? 'danger' : ''}">${column.nullPct}%</td>
                <td>${column.distinctCount.toLocaleString()}</td>
                <td class="mono">${escapeHtml(column.min ?? '')}<br>${escapeHtml(column.max ?? '')}</td>
                <td>${column.topValues.map((item) => `<div><span class="mono">${escapeHtml(item.value)}</span> <span class="note">${item.count}</span></div>`).join('')}</td>
                <td><div class="hist">${histogramHtml(column.histogram)}</div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${scriptData};
    document.getElementById('copyJson').addEventListener('click', () => {
      vscode.postMessage({ type: 'copy', text: data.json });
    });
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
function formatOptionalNumber(value) {
    return value === undefined ? 'unknown' : value.toLocaleString();
}
function histogramHtml(histogram) {
    const max = Math.max(...histogram.map((bucket) => bucket.count), 1);
    return histogram.map((bucket) => {
        const pct = Math.max(3, Math.round((bucket.count / max) * 100));
        return `<div class="bar"><span class="mono" title="${escapeHtml(bucket.label)}">${escapeHtml(bucket.label)}</span><span>${bucket.count}</span><span class="bar-track" style="grid-column: 1 / -1"><span class="bar-fill" style="width: ${pct}%"></span></span></div>`;
    }).join('');
}
//# sourceMappingURL=TableDataPanel.js.map