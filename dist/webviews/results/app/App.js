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
exports.App = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("./store");
const vscode_1 = require("./vscode");
const ResultsTabs_1 = require("./components/ResultsTabs");
const ResultToolbar_1 = require("./components/ResultToolbar");
const ResultGrid_1 = require("./components/ResultGrid");
const PlanView_1 = require("./components/PlanView");
const MessagesPanel_1 = require("./components/MessagesPanel");
const StatusBar_1 = require("./components/StatusBar");
const ChartView = (0, react_1.lazy)(() => Promise.resolve().then(() => __importStar(require('./components/ChartView'))).then((module) => ({ default: module.ChartView })));
function App() {
    const { tabs, activeTabId, viewModes, setTabs, upsertTab, setViewMode } = (0, store_1.useResultsStore)();
    const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
    const [activeResultSetIndex, setActiveResultSetIndex] = (0, react_1.useState)(0);
    const [columnFiltersVisible, setColumnFiltersVisible] = (0, react_1.useState)(true);
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
    const viewMode = viewModes[active.id] ?? 'grid';
    const isPlanTab = !!active.plan;
    const canChart = !isPlanTab && !!resultSet?.rows.length && (resultSet.fields.length >= 2);
    return ((0, jsx_runtime_1.jsxs)("main", { className: `app ${active.resultSets.length > 1 ? 'with-resultset-tabs' : ''}`, children: [(0, jsx_runtime_1.jsx)(ResultsTabs_1.ResultsTabs, { tabs: tabs, activeTabId: active.id }), (0, jsx_runtime_1.jsx)(ResultToolbar_1.ResultToolbar, { tab: active, resultSet: resultSet, resultSetIndex: activeResultSetIndex, viewMode: viewMode, canChart: canChart, isPlanTab: isPlanTab, columnFiltersVisible: columnFiltersVisible, onSetViewMode: (mode) => setViewMode(active.id, mode), onToggleColumnFilters: () => setColumnFiltersVisible((visible) => !visible) }), active.resultSets.length > 1 && ((0, jsx_runtime_1.jsx)("div", { className: "resultset-tabs", children: active.resultSets.map((set, index) => ((0, jsx_runtime_1.jsxs)("button", { className: index === activeResultSetIndex ? 'active' : '', onClick: () => setActiveResultSetIndex(index), title: `${set.command ?? 'Result'} - ${set.rowCount} rows`, children: [(0, jsx_runtime_1.jsx)("span", { className: "resultset-icon", children: "\u25A6" }), (0, jsx_runtime_1.jsx)("span", { children: set.command ?? 'Result' }), (0, jsx_runtime_1.jsxs)("span", { className: "resultset-count", children: [set.rowCount.toLocaleString(), " rows"] })] }, set.id))) })), isRunning
                ? (0, jsx_runtime_1.jsx)(RunningPanel, {})
                : active.executionStatus === 'failed'
                    ? (0, jsx_runtime_1.jsx)(MessagesPanel_1.MessagesPanel, { tab: active })
                    : active.plan
                        ? (0, jsx_runtime_1.jsx)(PlanView_1.PlanView, { plan: active.plan })
                        : viewMode === 'chart'
                            ? ((0, jsx_runtime_1.jsx)(react_1.Suspense, { fallback: (0, jsx_runtime_1.jsx)(ChartLoadingPanel, {}), children: (0, jsx_runtime_1.jsx)(ChartView, { resultSet: resultSet }) }))
                            : (0, jsx_runtime_1.jsx)(ResultGrid_1.ResultGrid, { tab: active, resultSet: resultSet, columnFiltersVisible: columnFiltersVisible }), (0, jsx_runtime_1.jsx)(StatusBar_1.StatusBar, { tab: active, resultSet: resultSet })] }));
}
function ChartLoadingPanel() {
    return ((0, jsx_runtime_1.jsxs)("section", { className: "grid-empty result-loading", "aria-live": "polite", children: [(0, jsx_runtime_1.jsx)("span", { className: "loading-spinner", "aria-hidden": "true" }), (0, jsx_runtime_1.jsx)("span", { children: "Loading chart..." })] }));
}
function RunningPanel() {
    return ((0, jsx_runtime_1.jsxs)("section", { className: "grid-empty result-loading", "aria-live": "polite", children: [(0, jsx_runtime_1.jsx)("span", { className: "loading-spinner", "aria-hidden": "true" }), (0, jsx_runtime_1.jsx)("span", { children: "Running query..." })] }));
}
//# sourceMappingURL=App.js.map