"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesPanel = MessagesPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const vscode_1 = require("../vscode");
function MessagesPanel({ tab }) {
    const error = tab.error;
    return ((0, jsx_runtime_1.jsxs)("section", { className: "messages", children: [(0, jsx_runtime_1.jsxs)("div", { className: "messages-toolbar", children: [(0, jsx_runtime_1.jsx)("span", { className: "status-dot failed" }), (0, jsx_runtime_1.jsx)("strong", { children: error?.message ?? 'Query failed' }), (0, jsx_runtime_1.jsx)("span", { className: "toolbar-spacer" }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool", title: "Copy error", "aria-label": "Copy error", onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: JSON.stringify(error, null, 2) }), children: "\u29C9" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "message-log", role: "log", children: [(0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("span", { className: "log-time", children: "status" }), (0, jsx_runtime_1.jsx)("span", { className: "log-error", children: tab.executionStatus })] }), error?.code && (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("span", { className: "log-time", children: "sqlstate" }), (0, jsx_runtime_1.jsx)("span", { children: error.code })] }), error?.position && (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("span", { className: "log-time", children: "position" }), (0, jsx_runtime_1.jsx)("span", { children: error.position })] }), error?.detail && (0, jsx_runtime_1.jsx)("pre", { children: error.detail }), error?.hint && (0, jsx_runtime_1.jsx)("pre", { children: error.hint })] })] }));
}
//# sourceMappingURL=MessagesPanel.js.map