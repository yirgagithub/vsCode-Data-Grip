"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultGrid = ResultGrid;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const format_1 = require("../format");
const vscode_1 = require("../vscode");
const ROW_HEIGHT = 24;
const BUFFER = 12;
const GRID_COLUMNS = '56px repeat(var(--column-count), minmax(128px, 240px))';
const OPERATORS = ['contains', 'equals', 'not equals', 'starts with', 'ends with', 'is null', 'is not null'];
function ResultGrid({ tab, resultSet }) {
    const [scrollTop, setScrollTop] = (0, react_1.useState)(0);
    const [sort, setSort] = (0, react_1.useState)(tab.sort[0]);
    const [globalFilter, setGlobalFilter] = (0, react_1.useState)('');
    const [filters, setFilters] = (0, react_1.useState)([]);
    const [openFilterColumn, setOpenFilterColumn] = (0, react_1.useState)();
    const [selected, setSelected] = (0, react_1.useState)();
    const [inspectorOpen, setInspectorOpen] = (0, react_1.useState)(false);
    const rows = resultSet?.rows ?? [];
    const fields = resultSet?.fields ?? [];
    const gridColumnStyle = { '--column-count': fields.length, gridTemplateColumns: GRID_COLUMNS };
    const visibleRows = (0, react_1.useMemo)(() => {
        let filtered = globalFilter
            ? rows.filter((row) => Object.values(row).some((value) => (0, format_1.formatValue)(value).toLowerCase().includes(globalFilter.toLowerCase())))
            : rows;
        filtered = filtered.filter((row) => filters.every((filter) => matchesFilter(row[filter.column], filter)));
        if (!sort) {
            return filtered;
        }
        return [...filtered].sort((a, b) => {
            const av = (0, format_1.formatValue)(a[sort.column]);
            const bv = (0, format_1.formatValue)(b[sort.column]);
            return sort.direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [rows, sort, globalFilter, filters]);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
    const end = Math.min(visibleRows.length, start + 80);
    const slice = visibleRows.slice(start, end);
    if (!resultSet) {
        return (0, jsx_runtime_1.jsx)("section", { className: "grid-empty", children: "No result set." });
    }
    return ((0, jsx_runtime_1.jsxs)("section", { className: "grid-shell", children: [(0, jsx_runtime_1.jsxs)("div", { className: "filter-row", children: [(0, jsx_runtime_1.jsx)("input", { value: globalFilter, onChange: (event) => setGlobalFilter(event.target.value), placeholder: "Filter fetched rows" }), (0, jsx_runtime_1.jsxs)("span", { children: [visibleRows.length, " visible"] }), filters.length > 0 && (0, jsx_runtime_1.jsx)("button", { className: "tool", onClick: () => setFilters([]), children: "Clear column filters" }), (0, jsx_runtime_1.jsx)("span", { className: "toolbar-spacer" }), (0, jsx_runtime_1.jsx)("button", { className: "tool", disabled: !selected, onClick: () => selected && vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_1.formatValue)(selected.value) }), children: "Copy Cell" }), (0, jsx_runtime_1.jsx)("button", { className: "tool", disabled: !selected, onClick: () => setInspectorOpen((open) => !open), children: "Inspector" })] }), (0, jsx_runtime_1.jsxs)("div", { className: `grid-layout ${inspectorOpen ? 'with-inspector' : ''}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid", onScroll: (event) => setScrollTop(event.currentTarget.scrollTop), children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid-header", style: gridColumnStyle, children: [(0, jsx_runtime_1.jsx)("div", { className: "cell rownum", children: "#" }), fields.map((field) => {
                                        const activeFilter = filters.find((filter) => filter.column === field.name);
                                        return ((0, jsx_runtime_1.jsxs)("div", { className: `cell header-cell ${activeFilter ? 'filtered' : ''}`, children: [(0, jsx_runtime_1.jsxs)("button", { className: "header-title", onClick: () => setSort((current) => current?.column === field.name && current.direction === 'asc' ? { column: field.name, direction: 'desc' } : { column: field.name, direction: 'asc' }), children: [(0, jsx_runtime_1.jsx)("span", { children: field.name }), field.dataTypeName && (0, jsx_runtime_1.jsx)("small", { children: field.dataTypeName }), sort?.column === field.name && (0, jsx_runtime_1.jsx)("span", { className: "sort-mark", children: sort.direction })] }), (0, jsx_runtime_1.jsx)("button", { className: "filter-button", title: "Filter column", onClick: () => setOpenFilterColumn(openFilterColumn === field.name ? undefined : field.name), children: "Filter" }), openFilterColumn === field.name && ((0, jsx_runtime_1.jsx)(ColumnFilterPopover, { filter: activeFilter ?? { column: field.name, operator: 'contains', value: '' }, onApply: (filter) => {
                                                        setFilters((current) => [...current.filter((item) => item.column !== field.name), filter]);
                                                        setOpenFilterColumn(undefined);
                                                    }, onClear: () => {
                                                        setFilters((current) => current.filter((item) => item.column !== field.name));
                                                        setOpenFilterColumn(undefined);
                                                    } }))] }, field.name));
                                    })] }), (0, jsx_runtime_1.jsx)("div", { className: "grid-body", style: { height: visibleRows.length * ROW_HEIGHT }, children: (0, jsx_runtime_1.jsx)("div", { style: { transform: `translateY(${start * ROW_HEIGHT}px)` }, children: slice.map((row, index) => ((0, jsx_runtime_1.jsxs)("div", { className: "grid-row", style: gridColumnStyle, children: [(0, jsx_runtime_1.jsx)("div", { className: "cell rownum", children: start + index + 1 }), fields.map((field) => {
                                                const rowIndex = start + index;
                                                const value = row[field.name];
                                                const isSelected = selected?.rowIndex === rowIndex && selected.column === field.name;
                                                return ((0, jsx_runtime_1.jsx)("div", { className: `cell data-cell ${value === null ? 'null' : ''} ${isSelected ? 'selected' : ''}`, title: (0, format_1.formatValue)(value) || 'NULL', onClick: () => setSelected({ rowIndex, column: field.name, value }), onDoubleClick: () => {
                                                        setSelected({ rowIndex, column: field.name, value });
                                                        setInspectorOpen(true);
                                                    }, children: value === null ? 'NULL' : (0, format_1.formatValue)(value) }, field.name));
                                            })] }, start + index))) }) })] }), inspectorOpen && ((0, jsx_runtime_1.jsxs)("aside", { className: "cell-inspector", children: [(0, jsx_runtime_1.jsxs)("div", { className: "inspector-title", children: [(0, jsx_runtime_1.jsx)("strong", { children: selected?.column ?? 'Cell' }), (0, jsx_runtime_1.jsx)("button", { className: "tool", onClick: () => setInspectorOpen(false), children: "Close" })] }), (0, jsx_runtime_1.jsx)("pre", { children: selected ? prettyValue(selected.value) : 'No cell selected' })] }))] })] }));
}
function ColumnFilterPopover({ filter, onApply, onClear }) {
    const [draft, setDraft] = (0, react_1.useState)(filter);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "filter-popover", children: [(0, jsx_runtime_1.jsx)("select", { value: draft.operator, onChange: (event) => setDraft({ ...draft, operator: event.target.value }), children: OPERATORS.map((operator) => (0, jsx_runtime_1.jsx)("option", { children: operator }, operator)) }), !draft.operator.includes('null') && ((0, jsx_runtime_1.jsx)("input", { value: draft.value, onChange: (event) => setDraft({ ...draft, value: event.target.value }), autoFocus: true })), (0, jsx_runtime_1.jsxs)("div", { className: "popover-actions", children: [(0, jsx_runtime_1.jsx)("button", { className: "tool primary", onClick: () => onApply(draft), children: "Apply" }), (0, jsx_runtime_1.jsx)("button", { className: "tool", onClick: onClear, children: "Clear" })] })] }));
}
function matchesFilter(value, filter) {
    const text = (0, format_1.formatValue)(value).toLowerCase();
    const expected = filter.value.toLowerCase();
    if (filter.operator === 'is null') {
        return value === null || value === undefined;
    }
    if (filter.operator === 'is not null') {
        return value !== null && value !== undefined;
    }
    if (filter.operator === 'equals') {
        return text === expected;
    }
    if (filter.operator === 'not equals') {
        return text !== expected;
    }
    if (filter.operator === 'starts with') {
        return text.startsWith(expected);
    }
    if (filter.operator === 'ends with') {
        return text.endsWith(expected);
    }
    return text.includes(expected);
}
function prettyValue(value) {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'string') {
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        }
        catch {
            return value;
        }
    }
    if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }
    return String(value);
}
//# sourceMappingURL=ResultGrid.js.map