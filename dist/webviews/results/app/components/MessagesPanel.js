"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesPanel = MessagesPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const vscode_1 = require("../vscode");
function MessagesPanel({ tab }) {
    const error = tab.error;
    return ((0, jsx_runtime_1.jsxs)("section", { className: "messages", children: [(0, jsx_runtime_1.jsx)("h2", { children: error?.message ?? 'Query failed' }), error?.code && (0, jsx_runtime_1.jsxs)("p", { children: ["SQLSTATE: ", error.code] }), error?.position && (0, jsx_runtime_1.jsxs)("p", { children: ["Position: ", error.position] }), error?.detail && (0, jsx_runtime_1.jsx)("pre", { children: error.detail }), error?.hint && (0, jsx_runtime_1.jsx)("pre", { children: error.hint }), (0, jsx_runtime_1.jsx)("button", { onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: JSON.stringify(error, null, 2) }), children: "Copy Error" })] }));
}
//# sourceMappingURL=MessagesPanel.js.map