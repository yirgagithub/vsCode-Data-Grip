const { createReadStream, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const Module = require('node:module');

const root = resolve(__dirname, '..');
const mediaDir = join(root, 'media', 'marketplace');
const outDir = join(root, '.tmp-marketplace');

mkdirSync(mediaDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      Uri: {
        file: (fsPath) => ({ fsPath }),
        joinPath: (base, ...parts) => ({ fsPath: join(base.fsPath ?? root, ...parts) }),
        parse: (value) => ({ fsPath: value.replace(/^file:\/+/, '') })
      },
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback })
      },
      ViewColumn: { Active: 1 },
      window: {},
      commands: {},
      env: { clipboard: { writeText: async () => undefined } }
    };
  }
  return originalLoad(request, parent, isMain);
};

const { ConnectionEditorPanel } = require('../dist/webviews/connection/ConnectionEditorPanel');
const { ResultsPanelProvider } = require('../dist/webviews/results/ResultsPanelProvider');
const { QueryMapProvider } = require('../dist/webviews/queryMap/QueryMapProvider');

const webview = {
  cspSource: "'self'",
  asWebviewUri: (uri) => pathToServerPath(uri.fsPath),
  onDidReceiveMessage: () => ({ dispose: () => undefined }),
  postMessage: async () => true
};

const extensionUri = { fsPath: root };
const connectionManager = {
  getConnections: () => [
    {
      id: 'postgres-local',
      name: 'Local PostgreSQL',
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'analytics',
      username: 'readonly',
      sslMode: 'disable',
      color: '#0e7490'
    },
    {
      id: 'mysql-reporting',
      name: 'Reporting MySQL',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'commerce',
      username: 'reporting',
      sslMode: 'prefer',
      color: '#f59e0b'
    },
    {
      id: 'sqlserver-dw',
      name: 'Warehouse SQL Server',
      type: 'sqlserver',
      host: 'localhost',
      port: 1433,
      database: 'warehouse',
      username: 'readonly',
      sslMode: 'require',
      color: '#8b5cf6'
    }
  ]
};

const theme = `
<style>
  :root {
    --vscode-font-family: "Segoe UI", Arial, sans-serif;
    --vscode-editor-font-family: Consolas, "Cascadia Code", monospace;
    --vscode-editor-background: #1e1e1e;
    --vscode-sideBar-background: #181818;
    --vscode-editorWidget-background: #252526;
    --vscode-dropdown-background: #252526;
    --vscode-input-background: #313131;
    --vscode-button-background: #0e639c;
    --vscode-button-foreground: #ffffff;
    --vscode-button-hoverBackground: #1177bb;
    --vscode-panel-border: #3c3c3c;
    --vscode-editor-foreground: #d4d4d4;
    --vscode-foreground: #d4d4d4;
    --vscode-descriptionForeground: #9d9d9d;
    --vscode-disabledForeground: #777777;
    --vscode-focusBorder: #007fd4;
    --vscode-inputOption-activeBorder: #007fd4;
    --vscode-list-hoverBackground: #2a2d2e;
    --vscode-list-activeSelectionBackground: #04395e;
    --vscode-list-inactiveSelectionBackground: #37373d;
    --vscode-icon-foreground: #c5c5c5;
    --vscode-errorForeground: #f48771;
    --vscode-testing-iconPassed: #73c991;
    --vscode-editorGroupHeader-tabsBackground: #181818;
    --vscode-tab-activeBackground: #1e1e1e;
    --vscode-tab-inactiveBackground: #2d2d2d;
    --vscode-tab-border: #252526;
    --vscode-badge-background: #4d4d4d;
    --vscode-badge-foreground: #ffffff;
  }
</style>`;

function createConnectionHtml() {
  const panel = { webview, onDidDispose: () => undefined, dispose: () => undefined };
  const existing = {
    id: 'sqlserver-dw',
    name: 'Warehouse SQL Server',
    type: 'sqlserver',
    host: 'localhost',
    port: 1433,
    database: 'warehouse',
    username: 'readonly',
    sslMode: 'require',
    color: '#8b5cf6',
    production: true,
    readOnlyDefault: true
  };
  const editor = new ConnectionEditorPanel(panel, extensionUri, connectionManager, existing, () => undefined);
  let html = editor.html(webview, editor.toForm(existing));
  html = stripCsp(html);
  html = html.replace('</head>', `${theme}</head>`);
  html = html.replace('const vscode = acquireVsCodeApi();', 'const vscode = window.acquireVsCodeApi();');
  html = html.replace('<body>', `<body><script>window.acquireVsCodeApi = () => ({ postMessage: (message) => { window.__lastMessage = message; }, getState: () => ({}), setState: () => {} });</script>`);
  return html;
}

function createResultsHtml() {
  const provider = new ResultsPanelProvider(
    { extensionUri },
    { getTransactionMode: () => 'manual', isTransactionOpen: () => true },
    { getTabs: () => [], saveTabs: async () => undefined },
    {},
  );
  let html = provider.html(webview);
  html = stripCsp(html);
  html = html.replace('</head>', `${theme}</head>`);
  const hydrateScript = `<script>
    const sampleTabs = ${JSON.stringify(sampleResultTabs())};
    window.acquireVsCodeApi = () => ({
      postMessage: (message) => {
        if (message && message.type === 'ready') {
          let count = 0;
          const send = () => {
            window.postMessage({ type: 'hydrate', tabs: sampleTabs, activeTabId: sampleTabs[0].id }, '*');
            count += 1;
            if (count >= 8) clearInterval(timer);
          };
          const timer = setInterval(send, 100);
          send();
        }
      },
      getState: () => ({}),
      setState: () => {}
    });
  </script>`;
  html = html.replace('<body>', `<body>${hydrateScript}`);
  return html;
}

function createHistoryHtml() {
  const provider = new QueryMapProvider(
    extensionUri,
    {},
    async () => undefined,
    async () => undefined,
    () => [],
    async () => undefined,
    async () => undefined,
    async () => undefined,
    async () => undefined,
    async () => undefined,
    async () => undefined,
    async () => undefined,
    () => undefined
  );
  let html = provider.html(webview);
  html = stripCsp(html);
  html = html.replace('</head>', `${theme}</head>`);
  const state = {
    groups: sampleQueryGroups(),
    historyGroups: sampleHistoryGroups()
  };
  const bootstrap = `<script>
    const state = ${JSON.stringify(state)};
    window.acquireVsCodeApi = () => ({
      postMessage: (message) => {
        if (message && message.type === 'ready') {
          let count = 0;
          const send = () => {
            window.postMessage({ type: 'state', groups: state.groups, historyGroups: state.historyGroups }, '*');
            count += 1;
            if (count >= 8) clearInterval(timer);
          };
          const timer = setInterval(send, 100);
          send();
        }
      },
      getState: () => ({ activeTab: 'history', selected: { type: 'history', id: 'hist-1' }, expanded: {} }),
      setState: () => {}
    });
  </script>`;
  html = html.replace('<body>', `<body>${bootstrap}`);
  return html;
}

function stripCsp(html) {
  return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
}

function sampleResultTabs() {
  const now = Date.now();
  return [
    {
      id: 'orders-result',
      connectionId: 'postgres-local',
      connectionName: 'Local PostgreSQL',
      connectionType: 'postgres',
      title: 'analytics.orders',
      queryText: 'select order_date, status, order_count, gross_revenue from analytics.daily_orders order by order_date desc;',
      executionStatus: 'completed',
      executionTimeMs: 86,
      rowCount: 6,
      maxRows: 500,
      rowOffset: 0,
      sort: [],
      sourceOrigin: 'console',
      sourceFile: 'daily-orders.sql',
      activeResultSetIndex: 0,
      updatedAt: now,
      transaction: { mode: 'manual', open: true },
      resultSets: [
        {
          id: 'rs-1',
          command: 'SELECT',
          rowCount: 6,
          fields: [
            { name: 'order_date', dataType: 'date' },
            { name: 'status', dataType: 'text' },
            { name: 'order_count', dataType: 'integer' },
            { name: 'gross_revenue', dataType: 'numeric' }
          ],
          rows: [
            { order_date: '2026-06-28', status: 'paid', order_count: 184, gross_revenue: 42891.54 },
            { order_date: '2026-06-28', status: 'refunded', order_count: 7, gross_revenue: -612.2 },
            { order_date: '2026-06-27', status: 'paid', order_count: 172, gross_revenue: 40122.01 },
            { order_date: '2026-06-27', status: 'pending', order_count: 31, gross_revenue: 7820.33 },
            { order_date: '2026-06-26', status: 'paid', order_count: 191, gross_revenue: 45610.77 },
            { order_date: '2026-06-26', status: 'failed', order_count: 13, gross_revenue: 0 }
          ]
        }
      ]
    },
    {
      id: 'customers-result',
      connectionId: 'mysql-reporting',
      connectionName: 'Reporting MySQL',
      connectionType: 'mysql',
      title: 'customer cohorts',
      queryText: 'select cohort_month, plan, active_customers from mart.customer_cohorts;',
      executionStatus: 'completed',
      executionTimeMs: 142,
      rowCount: 48,
      maxRows: 500,
      rowOffset: 0,
      sort: [],
      sourceOrigin: 'file',
      sourceFile: 'cohorts.sql',
      activeResultSetIndex: 0,
      updatedAt: now - 120000,
      resultSets: [{ id: 'rs-2', command: 'SELECT', rowCount: 48, fields: [{ name: 'cohort_month' }, { name: 'plan' }, { name: 'active_customers' }], rows: [] }]
    }
  ];
}

function sampleQueryGroups() {
  const now = Date.now();
  return [
    {
      id: 'postgres-local',
      connectionName: 'Local PostgreSQL',
      databaseName: 'analytics',
      documents: [
        {
          id: 'console-1',
          documentUri: 'file:///workspace/querydeck/daily-orders.sql',
          documentTitle: 'daily-orders.sql',
          pinned: true,
          sortOrder: 1,
          lastTouchedAt: now,
          isActiveConnection: true,
          isToday: true,
          running: false,
          projectFile: false,
          status: 'completed',
          durationMs: 86,
          rowCount: 6,
          items: []
        }
      ]
    }
  ];
}

function sampleHistoryGroups() {
  const now = Date.now();
  return [
    {
      id: 'postgres-local',
      connectionName: 'Local PostgreSQL',
      databaseName: 'analytics',
      items: [
        {
          id: 'hist-1',
          connectionId: 'postgres-local',
          sql: "select order_date, status, count(*) as order_count, sum(total_amount) as gross_revenue from analytics.orders where order_date >= current_date - interval '7 days' group by 1, 2 order by 1 desc;",
          preview: 'Revenue by order status over the last seven days',
          status: 'completed',
          favorite: true,
          rowCount: 6,
          executedAt: now - 300000,
          sourceFile: 'daily-orders.sql'
        },
        {
          id: 'hist-2',
          connectionId: 'postgres-local',
          sql: 'explain analyze select * from public.customers where email ilike $1;',
          preview: 'Explain customer lookup by email domain',
          status: 'completed',
          favorite: false,
          rowCount: 1,
          executedAt: now - 1200000,
          sourceFile: 'customer-debug.sql'
        },
        {
          id: 'hist-3',
          connectionId: 'mysql-reporting',
          sql: 'select cohort_month, plan, active_customers from mart.customer_cohorts order by 1 desc;',
          preview: 'Customer cohorts by month and plan',
          status: 'failed',
          favorite: false,
          rowCount: 0,
          executedAt: now - 3600000,
          sourceFile: 'cohorts.sql'
        }
      ]
    }
  ];
}

function writeHtml(name, html) {
  const file = join(outDir, `${name}.html`);
  writeFileSync(file, html);
  return file;
}

function pathToServerPath(filePath) {
  const relative = resolve(filePath).slice(root.length).replace(/\\/g, '/');
  return encodeURI(relative.startsWith('/') ? relative : `/${relative}`);
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Could not find Chrome or Edge for Marketplace screenshot generation.');
  }
  return found;
}

function screenshot(url, output, width = 1600, height = 900) {
  const child = spawn(chromeExecutable(), [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=2000',
    `--window-size=${width},${height}`,
    `--screenshot=${output}`,
    url
  ], { stdio: 'inherit' });
  return new Promise((resolveScreenshot, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Chrome timed out while capturing ${url}`));
    }, 30000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveScreenshot();
        return;
      }
      reject(new Error(`Chrome exited with code ${code} while capturing ${url}`));
    });
  });
}

function startServer() {
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const requested = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const file = resolve(root, requested || 'index.html');
      if (!file.startsWith(root) || !existsSync(file)) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(file) });
      createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not start Marketplace asset server.'));
        return;
      }
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.ttf')) return 'font/ttf';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function main() {
  const files = {
    connections: writeHtml('connections', createConnectionHtml()),
    results: writeHtml('results', createResultsHtml()),
    history: writeHtml('history', createHistoryHtml())
  };
  const { server, baseUrl } = await startServer();
  try {
    await screenshot(`${baseUrl}/.tmp-marketplace/connections.html`, join(mediaDir, 'querydeck-connections.png'));
    await screenshot(`${baseUrl}/.tmp-marketplace/results.html`, join(mediaDir, 'querydeck-results.png'));
    await screenshot(`${baseUrl}/.tmp-marketplace/history.html`, join(mediaDir, 'querydeck-history-ai.png'));
    console.log('Generated Marketplace screenshots in media/marketplace.');
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
