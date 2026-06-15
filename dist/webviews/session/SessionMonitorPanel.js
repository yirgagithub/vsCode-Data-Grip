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
exports.SessionMonitorPanel = void 0;
const vscode = __importStar(require("vscode"));
class SessionMonitorPanel {
    static async open(context, connectionManager, connection) {
        const panel = vscode.window.createWebviewPanel('databaseSessionMonitor', `Sessions: ${connection.name}`, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
        panel.webview.html = this.html(panel.webview, connection);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'ready' || message.type === 'refresh') {
                await this.postState(panel, connectionManager, connection);
                return;
            }
            if (message.type === 'cancel' && typeof message.pid === 'number') {
                await connectionManager.getDriver(connection.type).cancelSession(connection.id, message.pid);
                await this.postState(panel, connectionManager, connection);
                return;
            }
            if (message.type === 'terminate' && typeof message.pid === 'number') {
                const confirmed = await vscode.window.showWarningMessage(`Terminate session ${message.pid} on ${connection.name}?`, { modal: true }, 'Terminate');
                if (confirmed === 'Terminate') {
                    await connectionManager.getDriver(connection.type).terminateSession(connection.id, message.pid);
                    await this.postState(panel, connectionManager, connection);
                }
            }
        });
    }
    static async postState(panel, connectionManager, connection) {
        try {
            if (!connectionManager.isConnected(connection.id)) {
                await connectionManager.connect(connection.id);
            }
            const sessions = await connectionManager.getDriver(connection.type).getActiveSessions(connection.id);
            await panel.webview.postMessage({
                type: 'state',
                sessions,
                connection: {
                    name: connection.name,
                    type: connection.type,
                    host: connection.host,
                    database: connection.database
                }
            });
        }
        catch (error) {
            await panel.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
    static html(webview, connection) {
        const nonce = Date.now().toString();
        const title = `${connection.name} sessions`;
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg-main: var(--vscode-editor-background);
      --bg-panel: var(--vscode-sideBar-background);
      --bg-row: var(--vscode-editorWidget-background);
      --border: var(--vscode-panel-border);
      --text-main: var(--vscode-editor-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text-main);
      background: var(--bg-main);
      font-family: var(--vscode-font-family);
    }
    .shell {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      height: 100vh;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
    }
    .toolbar button {
      border: 1px solid var(--border);
      background: var(--bg-row);
      color: var(--text-main);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .toolbar button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .meta {
      padding: 8px 12px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead th, tbody td {
      border-bottom: 1px solid var(--border);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    thead th {
      position: sticky;
      top: 0;
      background: var(--bg-panel);
      z-index: 1;
    }
    tbody tr:hover {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 80%, transparent);
    }
    .muted { color: var(--text-muted); }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-row);
      border: 1px solid var(--border);
      font-size: 11px;
    }
    .error {
      padding: 12px;
      color: var(--vscode-errorForeground);
    }
    .query {
      font-family: var(--vscode-editor-font-family);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button id="refresh">Refresh</button>
      <span class="pill">${connection.name}</span>
      <span class="muted">${connection.type} • ${connection.host}</span>
    </div>
    <div id="meta" class="meta">Loading sessions...</div>
    <div id="body"></div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const body = document.getElementById('body');
    const meta = document.getElementById('meta');
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }
    function render(sessions) {
      if (!sessions.length) {
        body.innerHTML = '<div class="error">No active sessions were returned.</div>';
        meta.textContent = '0 sessions';
        return;
      }
      meta.textContent = sessions.length + ' sessions';
      body.innerHTML = '<table>'
        + '<thead><tr><th>PID</th><th>User</th><th>State</th><th>Client</th><th>Age</th><th>Query</th><th>Actions</th></tr></thead>'
        + '<tbody>'
        + sessions.map(function(session) {
          return '<tr>'
            + '<td>' + session.pid + (session.isCurrent ? ' <span class="pill">current</span>' : '') + '</td>'
            + '<td>' + escapeHtml(session.user || '') + '<div class="muted">' + escapeHtml(session.application || '') + '</div></td>'
            + '<td>' + escapeHtml(session.state || '') + (session.isIdleInTransaction ? '<div class="pill">idle in tx</div>' : '') + '</td>'
            + '<td>' + escapeHtml(session.client || '') + '</td>'
            + '<td>' + escapeHtml(relativeTime(session.startedAt)) + '</td>'
            + '<td><div class="query">' + escapeHtml(session.query || '') + '</div></td>'
            + '<td>'
            + '<button data-cancel="' + session.pid + '" ' + (session.isCurrent ? 'disabled' : '') + '>Cancel</button>'
            + ' <button data-terminate="' + session.pid + '" ' + (session.isCurrent ? 'disabled' : '') + '>Terminate</button>'
            + '</td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';
      body.querySelectorAll('[data-cancel]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({ type: 'cancel', pid: Number(button.getAttribute('data-cancel')) }));
      });
      body.querySelectorAll('[data-terminate]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({ type: 'terminate', pid: Number(button.getAttribute('data-terminate')) }));
      });
    }
    function relativeTime(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      const diff = Date.now() - date.getTime();
      const minutes = Math.round(diff / 60000);
      if (Math.abs(minutes) < 1) return 'now';
      if (Math.abs(minutes) < 60) return minutes + 'm ago';
      const hours = Math.round(minutes / 60);
      if (Math.abs(hours) < 24) return hours + 'h ago';
      const days = Math.round(hours / 24);
      return days + 'd ago';
    }
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'error') {
        body.innerHTML = '<div class="error">' + escapeHtml(event.data.message || 'Failed to load sessions') + '</div>';
        meta.textContent = 'error';
        return;
      }
      if (event.data?.type === 'state') {
        render(event.data.sessions || []);
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
}
exports.SessionMonitorPanel = SessionMonitorPanel;
//# sourceMappingURL=SessionMonitorPanel.js.map