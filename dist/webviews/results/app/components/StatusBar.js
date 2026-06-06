"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBar = StatusBar;
const jsx_runtime_1 = require("react/jsx-runtime");
function StatusBar({ tab, resultSet }) {
    const isRunning = tab.executionStatus === 'queued' || tab.executionStatus === 'running';
    return ((0, jsx_runtime_1.jsxs)("footer", { className: "statusbar", children: [(0, jsx_runtime_1.jsx)("span", { className: "statusbar-item strong", children: tab.databaseType }), (0, jsx_runtime_1.jsx)("span", { className: "statusbar-item", children: tab.databaseName ?? 'database' }), (0, jsx_runtime_1.jsx)("span", { className: "statusbar-item", children: tab.schemaName ?? 'schema' }), (0, jsx_runtime_1.jsx)("span", { className: "statusbar-spacer" }), (0, jsx_runtime_1.jsx)("span", { className: "statusbar-item", children: isRunning ? 'loading rows' : `${(resultSet?.rowCount ?? tab.rowCount ?? 0).toLocaleString()} rows` }), (0, jsx_runtime_1.jsx)("span", { className: "statusbar-item", children: tab.maxRows ? `limit ${tab.maxRows.toLocaleString()}` : 'all rows' }), (0, jsx_runtime_1.jsxs)("span", { className: "statusbar-item", children: ["execution: ", isRunning ? 'running' : `${(tab.executionTimeMs ?? resultSet?.durationMs ?? 0).toLocaleString()} ms`] }), (0, jsx_runtime_1.jsx)("span", { className: `statusbar-item status-text ${tab.executionStatus}`, children: tab.executionStatus })] }));
}
//# sourceMappingURL=StatusBar.js.map