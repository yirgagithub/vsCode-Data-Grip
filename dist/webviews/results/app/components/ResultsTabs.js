"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultsTabs = ResultsTabs;
const jsx_runtime_1 = require("react/jsx-runtime");
const store_1 = require("../store");
const Icon_1 = require("./Icon");
function ResultsTabs({ tabs, activeTabId }) {
    const { activateTab, closeTab, pinTab, renameTab } = (0, store_1.useResultsStore)();
    return ((0, jsx_runtime_1.jsxs)("div", { className: "tabs result-tabs", role: "tablist", "aria-label": "SQL result tabs", children: [(0, jsx_runtime_1.jsxs)("div", { className: "tab-strip-leading", "aria-hidden": "true", children: [(0, jsx_runtime_1.jsx)(Icon_1.Icon, { name: "output", className: "console-icon" }), (0, jsx_runtime_1.jsx)("span", { children: "Output" })] }), tabs.map((tab) => ((0, jsx_runtime_1.jsxs)("div", { className: `tab ${tab.id === activeTabId ? 'active' : ''} status-${tab.executionStatus}`, title: [
                    tab.customTitle ?? tab.title,
                    tab.executionTimeMs !== undefined ? `${tab.executionTimeMs}ms` : undefined,
                    tab.rowCount !== undefined ? `${tab.rowCount} rows` : undefined,
                    tab.executionStatus
                ].filter(Boolean).join(' - '), children: [(0, jsx_runtime_1.jsxs)("button", { className: "tab-main", onClick: () => activateTab(tab.id), onDoubleClick: () => {
                            const title = prompt('Tab title', tab.customTitle ?? tab.title);
                            if (title) {
                                renameTab(tab.id, title);
                            }
                        }, role: "tab", "aria-selected": tab.id === activeTabId, "aria-label": `${tab.customTitle ?? tab.title}, ${tab.executionStatus}`, children: [(0, jsx_runtime_1.jsx)("span", { className: `connection-dot ${tab.databaseType} status-${tab.executionStatus}` }), (0, jsx_runtime_1.jsx)(Icon_1.Icon, { name: "table", className: "tab-object-icon" }), (0, jsx_runtime_1.jsx)("span", { className: "tab-title", children: tab.customTitle ?? tab.title })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: `icon tab-icon-action ${tab.pinned ? 'on' : ''}`, title: tab.pinned ? 'Unpin result tab' : 'Pin result tab', "aria-label": tab.pinned ? 'Unpin result tab' : 'Pin result tab', onClick: (event) => {
                            event.stopPropagation();
                            pinTab(tab.id, !tab.pinned);
                        }, children: (0, jsx_runtime_1.jsx)(Icon_1.Icon, { name: tab.pinned ? 'pinned' : 'pin' }) }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "icon tab-icon-action close-action", title: "Close", "aria-label": "Close result tab", onClick: (event) => {
                            event.stopPropagation();
                            closeTab(tab.id);
                        }, children: (0, jsx_runtime_1.jsx)(Icon_1.Icon, { name: "close" }) })] }, tab.id))), (0, jsx_runtime_1.jsx)("div", { className: "tabs-overflow-shadow", "aria-hidden": "true" })] }));
}
//# sourceMappingURL=ResultsTabs.js.map