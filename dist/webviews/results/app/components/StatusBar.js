"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBar = StatusBar;
const jsx_runtime_1 = require("react/jsx-runtime");
function StatusBar({ tab, resultSet }) {
    return ((0, jsx_runtime_1.jsxs)("footer", { className: "statusbar", children: [(0, jsx_runtime_1.jsx)("span", { children: tab.databaseType }), (0, jsx_runtime_1.jsx)("span", { children: tab.databaseName }), (0, jsx_runtime_1.jsx)("span", { children: tab.schemaName }), (0, jsx_runtime_1.jsxs)("span", { children: [resultSet?.rowCount ?? tab.rowCount ?? 0, " fetched rows"] }), (0, jsx_runtime_1.jsx)("span", { children: tab.maxRows ? `limit ${tab.maxRows}` : 'all rows' }), (0, jsx_runtime_1.jsxs)("span", { children: [tab.executionTimeMs ?? resultSet?.durationMs ?? 0, "ms"] }), (0, jsx_runtime_1.jsx)("span", { children: tab.executionStatus })] }));
}
//# sourceMappingURL=StatusBar.js.map