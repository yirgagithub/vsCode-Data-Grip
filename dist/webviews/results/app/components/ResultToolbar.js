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
    const isRunning = tab.executionStatus === 'queued' || tab.executionStatus === 'running';
    const [maxRows, setMaxRows] = (0, react_1.useState)(tab.maxRows);
    const [exportFormat, setExportFormat] = (0, react_1.useState)('csv');
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
    const exportText = () => {
        if (exportFormat === 'json') {
            return JSON.stringify(rows, null, 2);
        }
        return exportFormat === 'tsv' ? (0, format_1.rowsToTsv)(rows) : (0, format_1.rowsToCsv)(rows);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "toolbar result-toolbar", role: "toolbar", "aria-label": "Result actions", children: [(0, jsx_runtime_1.jsxs)("div", { className: "toolbar-group", children: [(0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-green active", title: "Grid view", "aria-label": "Grid view", children: "\u25A6" }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool", title: "Chart view", "aria-label": "Chart view", disabled: true, children: "\u25CC" })] }), (0, jsx_runtime_1.jsx)("span", { className: "separator" }), (0, jsx_runtime_1.jsxs)("div", { className: "toolbar-group", children: [(0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-green", title: "Rerun query", "aria-label": "Rerun query", onClick: rerun, disabled: isRunning, children: "\u25B6" }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-red", title: "Stop query", "aria-label": "Stop query", disabled: true, children: "\u25A0" }), (0, jsx_runtime_1.jsx)("button", { className: `tool icon-tool ${tab.pinned ? 'tone-orange active' : ''}`, title: tab.pinned ? 'Unpin tab' : 'Pin tab', "aria-label": tab.pinned ? 'Unpin tab' : 'Pin tab', onClick: () => pinTab(tab.id, !tab.pinned), children: "\u2316" })] }), (0, jsx_runtime_1.jsx)("span", { className: "separator" }), (0, jsx_runtime_1.jsxs)("label", { className: "limit-control", title: "Rows fetched by the next run", children: [(0, jsx_runtime_1.jsx)("span", { children: "Rows" }), (0, jsx_runtime_1.jsxs)("select", { value: limitValue, onChange: (event) => changeLimit(event.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "500", children: "500" }), (0, jsx_runtime_1.jsx)("option", { value: "1000", children: "1,000" }), (0, jsx_runtime_1.jsx)("option", { value: "5000", children: "5,000" }), (0, jsx_runtime_1.jsx)("option", { value: "all", children: "All" }), (0, jsx_runtime_1.jsx)("option", { value: "custom", children: maxRows && !['500', '1000', '5000'].includes(String(maxRows)) ? maxRows.toLocaleString() : 'Custom...' })] })] }), (0, jsx_runtime_1.jsx)("span", { className: "separator" }), (0, jsx_runtime_1.jsxs)("div", { className: "toolbar-group", children: [(0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool", title: "Search in result", "aria-label": "Search in result", disabled: true, children: "\u2315" }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool", title: "Filter columns", "aria-label": "Filter columns", disabled: true, children: (0, jsx_runtime_1.jsx)(FilterIcon, {}) }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-purple", title: "Copy fetched rows as TSV", "aria-label": "Copy fetched rows as TSV", onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_1.rowsToTsv)(rows) }), disabled: isRunning, children: "\u29C9" }), (0, jsx_runtime_1.jsxs)("select", { className: "toolbar-select", value: exportFormat, onChange: (event) => setExportFormat(event.target.value), title: "Export format", "aria-label": "Export format", children: [(0, jsx_runtime_1.jsx)("option", { value: "csv", children: "CSV" }), (0, jsx_runtime_1.jsx)("option", { value: "json", children: "JSON" }), (0, jsx_runtime_1.jsx)("option", { value: "tsv", children: "TSV" })] }), (0, jsx_runtime_1.jsx)("button", { className: "tool icon-tool tone-green", title: `Copy fetched rows as ${exportFormat.toUpperCase()}`, "aria-label": `Copy fetched rows as ${exportFormat.toUpperCase()}`, onClick: () => vscode_1.vscode.postMessage({ type: 'copy', text: exportText() }), disabled: isRunning, children: "\u21E9" })] }), (0, jsx_runtime_1.jsx)("span", { className: "toolbar-spacer" }), (0, jsx_runtime_1.jsxs)("span", { className: "execution-pill", title: `${tab.executionStatus}${tab.executionTimeMs !== undefined ? ` - ${tab.executionTimeMs}ms` : ''}`, children: [(0, jsx_runtime_1.jsx)("span", { className: `status-dot ${tab.executionStatus}` }), (0, jsx_runtime_1.jsx)("span", { children: tab.executionStatus })] }), (0, jsx_runtime_1.jsx)("span", { className: "muted command-label", children: resultSet?.command ?? (isRunning ? 'Running query' : '') })] }));
}
function FilterIcon() {
    return ((0, jsx_runtime_1.jsx)("svg", { className: "filter-icon", viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false", children: (0, jsx_runtime_1.jsx)("path", { d: "M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z" }) }));
}
//# sourceMappingURL=ResultToolbar.js.map