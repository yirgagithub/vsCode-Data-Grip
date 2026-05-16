"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultsTabs = ResultsTabs;
const jsx_runtime_1 = require("react/jsx-runtime");
const store_1 = require("../store");
function ResultsTabs({ tabs, activeTabId }) {
    const { activateTab, closeTab, pinTab, renameTab } = (0, store_1.useResultsStore)();
    return ((0, jsx_runtime_1.jsx)("div", { className: "tabs", role: "tablist", children: tabs.map((tab) => ((0, jsx_runtime_1.jsxs)("button", { className: `tab ${tab.id === activeTabId ? 'active' : ''} status-${tab.executionStatus}`, onClick: () => activateTab(tab.id), onDoubleClick: () => {
                const title = prompt('Tab title', tab.customTitle ?? tab.title);
                if (title) {
                    renameTab(tab.id, title);
                }
            }, role: "tab", children: [(0, jsx_runtime_1.jsx)("span", { className: `connection-dot ${tab.databaseType}` }), (0, jsx_runtime_1.jsx)("span", { className: "tab-title", children: tab.customTitle ?? tab.title }), tab.executionTimeMs !== undefined && (0, jsx_runtime_1.jsxs)("span", { className: "muted", children: [tab.executionTimeMs, "ms"] }), tab.rowCount !== undefined && (0, jsx_runtime_1.jsxs)("span", { className: "muted", children: [tab.rowCount, " rows"] }), (0, jsx_runtime_1.jsx)("span", { className: `icon ${tab.pinned ? 'on' : ''}`, title: tab.pinned ? 'Unpin' : 'Pin', onClick: (event) => {
                        event.stopPropagation();
                        pinTab(tab.id, !tab.pinned);
                    }, children: tab.pinned ? 'Pinned' : 'Pin' }), (0, jsx_runtime_1.jsx)("span", { className: "icon", title: "Close", onClick: (event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                    }, children: "x" })] }, tab.id))) }));
}
//# sourceMappingURL=ResultsTabs.js.map