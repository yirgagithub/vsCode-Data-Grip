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
exports.ErDiagramPanel = void 0;
const vscode = __importStar(require("vscode"));
class ErDiagramPanel {
    static async open(context, report) {
        const panel = vscode.window.createWebviewPanel('databaseErDiagram', `ER Diagram: ${report.schemaName}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
        panel.webview.html = this.html(panel.webview, report);
    }
    static html(webview, report) {
        const nonce = Date.now().toString();
        const data = JSON.stringify(report).replace(/</g, '\\u003c');
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ER Diagram</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-elevated: var(--vscode-dropdown-background);
      --bg-hover: var(--vscode-list-hoverBackground);
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-focusBorder);
      --success: var(--vscode-testing-iconPassed);
      --warning: var(--vscode-charts-orange);
      --space-xs: .35rem;
      --space-sm: .5rem;
      --space-md: .75rem;
      --space-lg: 1rem;
      --radius-sm: .35rem;
      --radius-md: .5rem;
      --card-width: 18rem;
      --card-min-height: 9rem;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.35;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg-main);
      color: var(--text-main);
      overflow: hidden;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: var(--bg-panel);
    }
    h1 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      display: flex;
      gap: var(--space-sm);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .stats {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .pill {
      padding: .2rem .55rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--bg-elevated);
      color: var(--text-main);
    }
    .viewport {
      position: relative;
      min-height: 0;
      overflow: auto;
      padding: var(--space-lg);
    }
    .canvas {
      position: relative;
      min-width: max-content;
      min-height: max-content;
    }
    .diagram-grid {
      position: relative;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(var(--card-width), 1fr));
      gap: var(--space-md);
      align-items: start;
      width: max(100%, 56rem);
    }
    .table-card {
      position: relative;
      min-height: var(--card-min-height);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--bg-panel) 82%, transparent);
      box-shadow: 0 .35rem .9rem color-mix(in srgb, black 18%, transparent);
      overflow: hidden;
    }
    .table-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-sm);
      align-items: flex-start;
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
    }
    .table-name {
      min-width: 0;
    }
    .table-name strong {
      display: block;
      font-size: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .table-name span {
      display: block;
      color: var(--text-muted);
      font-size: .85em;
    }
    .pk-badge {
      flex: 0 0 auto;
      padding: .18rem .45rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--success) 15%, transparent);
      color: var(--success);
      border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
      font-size: .82em;
      white-space: nowrap;
    }
    .column-list {
      margin: 0;
      padding: var(--space-sm) var(--space-md) var(--space-md);
      list-style: none;
      display: grid;
      gap: .22rem;
    }
    .column {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-xs);
      align-items: center;
      padding: .12rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
    }
    .column:last-child { border-bottom: 0; }
    .column-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .column-meta {
      color: var(--text-muted);
      font-size: .82em;
      white-space: nowrap;
    }
    .column.primary .column-name::before {
      content: 'PK ';
      color: var(--success);
      font-weight: 600;
    }
    .relations {
      display: grid;
      gap: .3rem;
      padding: 0 var(--space-md) var(--space-md);
      color: var(--text-muted);
      font-size: .84em;
    }
    .relation {
      padding: .2rem .35rem;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--bg-main) 82%, transparent);
      border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    }
    .relation strong {
      color: var(--text-main);
    }
    svg.overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    }
    .legend {
      color: var(--text-muted);
      font-size: .85em;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>${escapeHtml(report.connectionName)} ER Diagram</h1>
        <div class="legend">${escapeHtml(report.schemaName)} schema</div>
      </div>
      <div class="stats">
        <span class="pill">${report.tables.length.toLocaleString()} tables</span>
        <span class="pill">${report.relations.length.toLocaleString()} relationships</span>
      </div>
    </header>
    <div class="viewport">
      <div class="canvas">
        <svg class="overlay" aria-hidden="true">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"></path>
            </marker>
          </defs>
        </svg>
        <div id="grid" class="diagram-grid"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const data = ${data};
    const grid = document.getElementById('grid');
    const overlay = document.querySelector('svg.overlay');
    grid.innerHTML = data.tables.map((table) => {
      const columns = table.columns.map((column) => '<li class="column ' + (column.primary ? 'primary' : '') + '"><span class="column-name">' + escapeHtml(column.name) + '</span><span class="column-meta">' + escapeHtml(column.dataType + (column.nullable ? '' : ' not null')) + '</span></li>').join('');
      const outgoing = table.outgoing.map((relation) => '<div class="relation"><strong>' + escapeHtml(relation.name) + '</strong> ' + escapeHtml(relation.fromColumns.join(', ')) + ' → ' + escapeHtml(relation.toTable) + '(' + escapeHtml(relation.toColumns.join(', ')) + ')</div>').join('');
      return '<article class="table-card" data-table="' + escapeHtml(table.schema + '.' + table.name) + '">' +
        '<div class="table-head">' +
          '<div class="table-name"><strong>' + escapeHtml(table.name) + '</strong><span>' + escapeHtml(table.schema) + ' • ' + escapeHtml(table.type) + (table.rowEstimate ? ' • ~' + table.rowEstimate : '') + '</span></div>' +
          (table.primaryKeys.length ? '<span class="pk-badge">PK ' + escapeHtml(table.primaryKeys.join(', ')) + '</span>' : '<span class="pk-badge" style="opacity:.7">No PK</span>') +
        '</div>' +
        '<ol class="column-list">' + columns + '</ol>' +
        (outgoing ? '<div class="relations">' + outgoing + '</div>' : '') +
      '</article>';
    }).join('');

    function draw() {
      overlay.setAttribute('viewBox', '0 0 ' + grid.scrollWidth + ' ' + grid.scrollHeight);
      overlay.innerHTML = '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"></path></marker></defs>';
      const cards = new Map([...document.querySelectorAll('.table-card')].map((element) => [element.getAttribute('data-table'), element]));
      for (const relation of data.relations) {
        const from = cards.get(relation.fromSchema + '.' + relation.fromTable);
        const to = cards.get(relation.toSchema + '.' + relation.toTable);
        if (!from || !to) continue;
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        const fromX = fromRect.right - gridRect.left + grid.scrollLeft;
        const toX = toRect.left - gridRect.left + grid.scrollLeft;
        const fromY = fromRect.top - gridRect.top + fromRect.height / 2 + grid.scrollTop;
        const toY = toRect.top - gridRect.top + toRect.height / 2 + grid.scrollTop;
        const startX = fromX < toX ? fromRect.right - gridRect.left + grid.scrollLeft : fromRect.left - gridRect.left + grid.scrollLeft;
        const endX = fromX < toX ? toRect.left - gridRect.left + grid.scrollLeft : toRect.right - gridRect.left + grid.scrollLeft;
        const midX = (startX + endX) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M ' + startX + ' ' + fromY + ' L ' + midX + ' ' + fromY + ' L ' + midX + ' ' + toY + ' L ' + endX + ' ' + toY);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--accent)');
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('stroke-opacity', '0.9');
        path.setAttribute('marker-end', 'url(#arrow)');
        overlay.appendChild(path);
      }
    }
    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    window.addEventListener('resize', draw);
    grid.addEventListener('scroll', draw, { passive: true });
    requestAnimationFrame(draw);
  </script>
</body>
</html>`;
    }
}
exports.ErDiagramPanel = ErDiagramPanel;
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=ErDiagramPanel.js.map