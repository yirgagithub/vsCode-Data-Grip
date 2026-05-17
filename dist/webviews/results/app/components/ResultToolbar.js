"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultToolbar = ResultToolbar;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const vscode_1 = require("../vscode");
const format_1 = require("../format");
const store_1 = require("../store");
function ResultToolbar({ tab, resultSet }) {
    const { pinTab } = (0, store_1.useResultsStore)();
    const rows = resultSet?.rows ?? [];
    const [maxRows, setMaxRows] = (0, react_1.useState)(tab.maxRows);
    const limitValue = (0, react_1.useMemo)(() => {
        if (!maxRows) {
            return 'all';
        }
        return ['500', '1000', '5000'].includes(String(maxRows)) ? String(maxRows) : 'custom';
    }, [maxRows]);
    (0, react_1.useEffect)(() => {
        setMaxRows(tab.maxRows);
    }, [tab.id, tab.maxRows]);
    const rerun = () => vscode_1.vscode.postMessage({ type: 'rerunTab', tabId: tab.id, maxRows: maxRows ?? null });
    const changeLimit = (value) => {
        if (value === 'all') {
            setMaxRows(undefined);
            return;
        }
        if (value === 'custom') {
            const answer = prompt('Fetch row count. Leave blank for all rows.', maxRows ? String(maxRows) : '');
            const parsed = answer === null || answer.trim() === '' ? undefined : Number(answer);
            if (parsed === undefined || Number.isFinite(parsed) && parsed >= 0) {
                setMaxRows(parsed && parsed > 0 ? Math.floor(parsed) : undefined);
            }
            return;
        }
        setMaxRows(Number(value));
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "toolbar result-toolbar", children: [(0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-green", title: "Rerun query", onClick: rerun, children: "\u25B6" }), (0, jsx_runtime_1.jsxs)("label", { className: "limit-control", title: "Rows fetched by the next run", children: [(0, jsx_runtime_1.jsx)("span", { children: "Rows" }), (0, jsx_runtime_1.jsxs)("select", { value: limitValue, onChange: (event) => changeLimit(event.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "500", children: "500" }), (0, jsx_runtime_1.jsx)("option", { value: "1000", children: "1,000" }), (0, jsx_runtime_1.jsx)("option", { value: "5000", children: "5,000" }), (0, jsx_runtime_1.jsx)("option", { value: "all", children: "All" }), (0, jsx_runtime_1.jsx)("option", { value: "custom", children: maxRows && !['500', '1000', '5000'].includes(String(maxRows)) ? maxRows.toLocaleString() : 'Custom...' })] })] }), (0, jsx_runtime_1.jsx)("button", { className: `tool icon-tool ${tab.pinned ? 'tone-orange' : ''}`, title: tab.pinned ? 'Unpin tab' : 'Pin tab', onClick: () => pinTab(tab.id, !tab.pinned), children: "\u2316" }), (0, jsx_runtime_1.jsx)("span", { className: "separator" }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-purple", title: "Copy fetched rows as TSV", onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_1.rowsToTsv)(rows) }), children: "\u29C9" }), (0, jsx_runtime_1.jsx)("button", { className: "tool", title: "Copy fetched rows as CSV", onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_1.rowsToCsv)(rows) }), children: "CSV" }), (0, jsx_runtime_1.jsx)("button", { className: "tool", title: "Copy fetched rows as JSON", onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: JSON.stringify(rows, null, 2) }), children: "JSON" }), (0, jsx_runtime_1.jsx)("span", { className: "toolbar-spacer" }), (0, jsx_runtime_1.jsx)("span", { className: `execution-badge ${tab.executionStatus}`, children: tab.executionStatus }), (0, jsx_runtime_1.jsx)("span", { className: "muted", children: resultSet?.command ?? '' })] }));
}
//# sourceMappingURL=ResultToolbar.js.map