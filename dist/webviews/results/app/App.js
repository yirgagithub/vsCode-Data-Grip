"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("./store");
const vscode_1 = require("./vscode");
const ResultsTabs_1 = require("./components/ResultsTabs");
const ResultToolbar_1 = require("./components/ResultToolbar");
const ResultGrid_1 = require("./components/ResultGrid");
const MessagesPanel_1 = require("./components/MessagesPanel");
const StatusBar_1 = require("./components/StatusBar");
function App() {
    const { tabs, activeTabId, setTabs, upsertTab } = (0, store_1.useResultsStore)();
    const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
    const [activeResultSetIndex, setActiveResultSetIndex] = (0, react_1.useState)(0);
    (0, react_1.useEffect)(() => {
        const listener = (event) => {
            const message = event.data;
            if (message.type === 'hydrate') {
                setTabs(message.tabs ?? [], message.activeTabId);
            }
            if (message.type === 'upsertTab' && message.tab) {
                upsertTab(message.tab, message.active ?? false);
            }
        };
        window.addEventListener('message', listener);
        vscode_1.vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', listener);
    }, [setTabs, upsertTab]);
    if (!active) {
        return ((0, jsx_runtime_1.jsx)("main", { className: "empty app-empty", children: (0, jsx_runtime_1.jsxs)("div", { className: "empty-panel", children: [(0, jsx_runtime_1.jsx)("span", { className: "empty-icon", children: "\u25A6" }), (0, jsx_runtime_1.jsx)("span", { children: "Run a query to see results" })] }) }));
    }
    const resultSet = active.resultSets[activeResultSetIndex] ?? active.resultSets[active.activeResultSetIndex] ?? active.resultSets[0];
    const isRunning = active.executionStatus === 'queued' || active.executionStatus === 'running';
    return ((0, jsx_runtime_1.jsxs)("main", { className: "app", children: [(0, jsx_runtime_1.jsx)(ResultsTabs_1.ResultsTabs, { tabs: tabs, activeTabId: active.id }), (0, jsx_runtime_1.jsx)(ResultToolbar_1.ResultToolbar, { tab: active, resultSet: resultSet }), (0, jsx_runtime_1.jsx)("div", { className: "resultset-tabs", children: active.resultSets.length > 0 ? active.resultSets.map((set, index) => ((0, jsx_runtime_1.jsxs)("button", { className: index === activeResultSetIndex ? 'active' : '', onClick: () => setActiveResultSetIndex(index), title: `${set.command ?? 'Result'} - ${set.rowCount} rows`, children: [(0, jsx_runtime_1.jsx)("span", { className: "resultset-icon", children: "\u25A6" }), (0, jsx_runtime_1.jsx)("span", { children: set.command ?? 'Result' }), (0, jsx_runtime_1.jsxs)("span", { className: "resultset-count", children: [set.rowCount.toLocaleString(), " rows"] })] }, set.id))) : (0, jsx_runtime_1.jsx)("span", { className: "muted resultset-empty-label", children: isRunning ? 'Running' : 'Messages' }) }), isRunning ? (0, jsx_runtime_1.jsx)(RunningPanel, {}) : active.executionStatus === 'failed' ? (0, jsx_runtime_1.jsx)(MessagesPanel_1.MessagesPanel, { tab: active }) : (0, jsx_runtime_1.jsx)(ResultGrid_1.ResultGrid, { tab: active, resultSet: resultSet }), (0, jsx_runtime_1.jsx)(StatusBar_1.StatusBar, { tab: active, resultSet: resultSet })] }));
}
function RunningPanel() {
    return ((0, jsx_runtime_1.jsxs)("section", { className: "grid-empty result-loading", "aria-live": "polite", children: [(0, jsx_runtime_1.jsx)("span", { className: "loading-spinner", "aria-hidden": "true" }), (0, jsx_runtime_1.jsx)("span", { children: "Running query..." })] }));
}
//# sourceMappingURL=App.js.map