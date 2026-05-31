"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultGrid = ResultGrid;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const format_1 = require("../format");
const vscode_1 = require("../vscode");
const format_2 = require("../format");
const ROW_HEIGHT = 24;
const BUFFER = 12;
const DEFAULT_COLUMN_WIDTH = 188;
const MIN_COLUMN_WIDTH = 96;
const OPERATORS = ['contains', 'equals', 'not equals', 'starts with', 'ends with', 'is null', 'is not null'];
function ResultGrid({ tab, resultSet }) {
    const [scrollTop, setScrollTop] = (0, react_1.useState)(0);
    const [sort, setSort] = (0, react_1.useState)(tab.sort[0]);
    const [whereFilter, setWhereFilter] = (0, react_1.useState)('');
    const [orderBy, setOrderBy] = (0, react_1.useState)(tab.sort[0] ? `${tab.sort[0].column} ${tab.sort[0].direction}` : '');
    const [columnFiltersVisible, setColumnFiltersVisible] = (0, react_1.useState)(false);
    const [filters, setFilters] = (0, react_1.useState)([]);
    const [openFilterColumn, setOpenFilterColumn] = (0, react_1.useState)();
    const [selection, setSelection] = (0, react_1.useState)();
    const [inspectorOpen, setInspectorOpen] = (0, react_1.useState)(false);
    const [pageOffset, setPageOffset] = (0, react_1.useState)(0);
    const [columnWidths, setColumnWidths] = (0, react_1.useState)({});
    const [contextMenu, setContextMenu] = (0, react_1.useState)();
    const rows = resultSet?.rows ?? [];
    const fields = resultSet?.fields ?? [];
    const pageLimit = tab.maxRows && tab.maxRows > 0 ? tab.maxRows : Math.max(rows.length, 1);
    const gridColumnStyle = {
        gridTemplateColumns: `var(--row-number-width) ${fields.map((field) => `${columnWidths[field.name] ?? DEFAULT_COLUMN_WIDTH}px`).join(' ')}`
    };
    const visibleRows = (0, react_1.useMemo)(() => {
        let filtered = whereFilter
            ? rows.filter((row) => Object.values(row).some((value) => (0, format_1.formatValue)(value).toLowerCase().includes(whereFilter.toLowerCase())))
            : rows;
        filtered = filtered.filter((row) => filters.every((filter) => matchesFilter(row[filter.column], filter)));
        const order = parseOrderBy(orderBy, fields.map((field) => field.name)) ?? sort;
        if (!order) {
            return filtered;
        }
        return [...filtered].sort((a, b) => {
            const av = (0, format_1.formatValue)(a[order.column]);
            const bv = (0, format_1.formatValue)(b[order.column]);
            return order.direction === 'asc' ? av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) : bv.localeCompare(av, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [rows, sort, whereFilter, filters, orderBy, fields]);
    const pageStart = Math.min(pageOffset, Math.max(0, Math.floor((visibleRows.length - 1) / pageLimit) * pageLimit));
    const pageRows = visibleRows.slice(pageStart, pageStart + pageLimit);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
    const end = Math.min(pageRows.length, start + 80);
    const slice = pageRows.slice(start, end);
    const selectedCell = selection?.type === 'cell' ? selection : undefined;
    const selectedRow = selection?.type === 'row' ? selection.rowIndex : undefined;
    const selectedColumn = selection?.type === 'column' ? selection.column : selectedCell?.column;
    const pageEnd = pageStart + pageRows.length;
    const hasNextPage = pageEnd < visibleRows.length;
    const visibleColumnNames = fields.map((field) => field.name);
    if (!resultSet) {
        return (0, jsx_runtime_1.jsx)("section", { className: "grid-empty", children: "No result set." });
    }
    const rowForIndex = (rowIndex) => visibleRows[rowIndex];
    const selectedText = () => {
        if (!selection) {
            return '';
        }
        if (selection.type === 'cell') {
            return (0, format_1.formatValue)(selection.value);
        }
        if (selection.type === 'row') {
            const row = rowForIndex(selection.rowIndex);
            return row ? (0, format_2.rowsToTsv)([row]) : '';
        }
        const columnRows = visibleRows.map((row) => ({ [selection.column]: row[selection.column] }));
        return (0, format_2.rowsToTsv)(columnRows);
    };
    const copySelection = () => {
        const text = selectedText();
        if (text) {
            vscode_1.vscode.postMessage({ type: 'copy', text });
        }
    };
    const moveSelection = (key, extend) => {
        const rowIndex = selection?.type === 'cell'
            ? selection.rowIndex
            : selection?.type === 'row'
                ? selection.rowIndex
                : pageStart;
        const columnIndex = selection?.type === 'cell'
            ? Math.max(0, visibleColumnNames.indexOf(selection.column))
            : selection?.type === 'column'
                ? Math.max(0, visibleColumnNames.indexOf(selection.column))
                : 0;
        const nextRow = key === 'ArrowUp'
            ? Math.max(0, rowIndex - 1)
            : key === 'ArrowDown'
                ? Math.min(Math.max(visibleRows.length - 1, 0), rowIndex + 1)
                : rowIndex;
        const nextColumnIndex = key === 'ArrowLeft'
            ? Math.max(0, columnIndex - 1)
            : key === 'ArrowRight'
                ? Math.min(Math.max(visibleColumnNames.length - 1, 0), columnIndex + 1)
                : columnIndex;
        const nextColumn = visibleColumnNames[nextColumnIndex];
        if (!nextColumn) {
            return;
        }
        const nextValue = rowForIndex(nextRow)?.[nextColumn];
        if (extend && key === 'ArrowDown') {
            setSelection({ type: 'row', rowIndex: nextRow });
            return;
        }
        setSelection({ type: 'cell', rowIndex: nextRow, column: nextColumn, value: nextValue });
    };
    const onGridKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
            event.preventDefault();
            copySelection();
            return;
        }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            moveSelection(event.key, event.shiftKey);
            return;
        }
        if (event.key === 'Enter' && selection?.type === 'cell') {
            setInspectorOpen(true);
        }
    };
    const openContextMenu = (event, menu) => {
        event.preventDefault();
        setContextMenu({ ...menu, x: event.clientX, y: event.clientY });
    };
    const startColumnResize = (event, column) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = columnWidths[column] ?? DEFAULT_COLUMN_WIDTH;
        const onMove = (moveEvent) => {
            const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
            setColumnWidths((current) => ({ ...current, [column]: nextWidth }));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "grid-shell", onKeyDown: onGridKeyDown, children: [(0, jsx_runtime_1.jsxs)("div", { className: "criteria-row", children: [(0, jsx_runtime_1.jsxs)("label", { className: "criteria", children: [(0, jsx_runtime_1.jsx)("span", { className: "criteria-icon", children: "\u25BD" }), (0, jsx_runtime_1.jsx)("strong", { children: "WHERE" }), (0, jsx_runtime_1.jsx)("input", { value: whereFilter, onChange: (event) => {
                                    setWhereFilter(event.target.value);
                                    setPageOffset(0);
                                } })] }), (0, jsx_runtime_1.jsxs)("label", { className: "criteria", children: [(0, jsx_runtime_1.jsx)("span", { className: "criteria-icon order", children: "\u2261" }), (0, jsx_runtime_1.jsx)("strong", { children: "ORDER BY" }), (0, jsx_runtime_1.jsx)("input", { value: orderBy, onChange: (event) => {
                                    setOrderBy(event.target.value);
                                    setPageOffset(0);
                                } })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: `grid-layout ${inspectorOpen ? 'with-inspector' : ''}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid result-grid", onScroll: (event) => setScrollTop(event.currentTarget.scrollTop), onClick: () => setContextMenu(undefined), role: "grid", "aria-rowcount": visibleRows.length, "aria-colcount": fields.length, tabIndex: 0, children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid-header", style: gridColumnStyle, children: [(0, jsx_runtime_1.jsx)("div", { className: "cell rownum", role: "columnheader", children: "#" }), fields.map((field) => {
                                        const activeFilter = filters.find((filter) => filter.column === field.name);
                                        return ((0, jsx_runtime_1.jsxs)("div", { className: `cell header-cell ${activeFilter ? 'filtered' : ''} ${selectedColumn === field.name ? 'selected-column' : ''}`, role: "columnheader", "aria-sort": sort?.column === field.name ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none', onContextMenu: (event) => openContextMenu(event, { column: field.name }), children: [(0, jsx_runtime_1.jsxs)("button", { className: "header-title", "aria-label": `Sort by ${field.name}`, onClick: () => {
                                                        const nextSort = sort?.column === field.name && sort.direction === 'asc' ? { column: field.name, direction: 'desc' } : { column: field.name, direction: 'asc' };
                                                        setSort(nextSort);
                                                        setOrderBy(`${nextSort.column} ${nextSort.direction}`);
                                                        setSelection({ type: 'column', column: field.name });
                                                        setPageOffset(0);
                                                    }, children: [(0, jsx_runtime_1.jsx)("span", { className: "column-type-icon" }), (0, jsx_runtime_1.jsx)("span", { children: field.name }), field.dataTypeName && (0, jsx_runtime_1.jsx)("small", { children: field.dataTypeName }), sort?.column === field.name && (0, jsx_runtime_1.jsx)("span", { className: "sort-mark", children: sort.direction })] }), (0, jsx_runtime_1.jsx)("button", { className: "filter-button", title: "Filter column", "aria-label": `Filter ${field.name}`, onClick: () => {
                                                        setColumnFiltersVisible(true);
                                                        setOpenFilterColumn(openFilterColumn === field.name ? undefined : field.name);
                                                    }, children: "\u2304" }), (0, jsx_runtime_1.jsx)("span", { className: "resize-handle", title: "Resize column", onMouseDown: (event) => startColumnResize(event, field.name) }), columnFiltersVisible && openFilterColumn === field.name && ((0, jsx_runtime_1.jsx)(ColumnFilterPopover, { filter: activeFilter ?? { column: field.name, operator: 'contains', value: '' }, onApply: (filter) => {
                                                        setFilters((current) => [...current.filter((item) => item.column !== field.name), filter]);
                                                        setOpenFilterColumn(undefined);
                                                    }, onClear: () => {
                                                        setFilters((current) => current.filter((item) => item.column !== field.name));
                                                        setOpenFilterColumn(undefined);
                                                    } }))] }, field.name));
                                    })] }), columnFiltersVisible && ((0, jsx_runtime_1.jsxs)("div", { className: "grid-row column-filter-row", style: gridColumnStyle, children: [(0, jsx_runtime_1.jsx)("div", { className: "cell rownum" }), fields.map((field) => {
                                        const activeFilter = filters.find((filter) => filter.column === field.name);
                                        return ((0, jsx_runtime_1.jsx)("div", { className: "cell", children: (0, jsx_runtime_1.jsx)("input", { value: activeFilter?.value ?? '', onChange: (event) => {
                                                    const value = event.target.value;
                                                    setFilters((current) => [
                                                        ...current.filter((item) => item.column !== field.name),
                                                        ...(value ? [{ column: field.name, operator: 'contains', value }] : [])
                                                    ]);
                                                    setPageOffset(0);
                                                } }) }, field.name));
                                    })] })), (0, jsx_runtime_1.jsx)("div", { className: "grid-body", style: { height: pageRows.length * ROW_HEIGHT }, children: (0, jsx_runtime_1.jsx)("div", { style: { transform: `translateY(${start * ROW_HEIGHT}px)` }, children: slice.map((row, index) => ((0, jsx_runtime_1.jsxs)("div", { className: `grid-row ${selectedRow === pageStart + start + index ? 'selected-row' : ''}`, style: gridColumnStyle, role: "row", children: [(0, jsx_runtime_1.jsx)("div", { className: "cell rownum", role: "rowheader", onClick: () => setSelection({ type: 'row', rowIndex: pageStart + start + index }), onContextMenu: (event) => openContextMenu(event, { rowIndex: pageStart + start + index }), children: pageStart + start + index + 1 }), fields.map((field) => {
                                                const rowIndex = pageStart + start + index;
                                                const value = row[field.name];
                                                const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell.column === field.name;
                                                return ((0, jsx_runtime_1.jsx)("div", { className: `cell data-cell ${value === null ? 'null' : ''} ${selectedColumn === field.name ? 'selected-column' : ''} ${isSelected ? 'selected' : ''}`, title: (0, format_1.formatValue)(value) || 'NULL', onClick: () => setSelection({ type: 'cell', rowIndex, column: field.name, value }), onContextMenu: (event) => {
                                                        setSelection({ type: 'cell', rowIndex, column: field.name, value });
                                                        openContextMenu(event, { rowIndex, column: field.name, value });
                                                    }, onDoubleClick: () => {
                                                        setSelection({ type: 'cell', rowIndex, column: field.name, value });
                                                        setInspectorOpen(true);
                                                    }, role: "gridcell", "aria-selected": isSelected, children: value === null ? 'NULL' : (0, format_1.formatValue)(value) }, field.name));
                                            })] }, start + index))) }) })] }), inspectorOpen && ((0, jsx_runtime_1.jsxs)("aside", { className: "cell-inspector", children: [(0, jsx_runtime_1.jsxs)("div", { className: "inspector-title", children: [(0, jsx_runtime_1.jsx)("strong", { children: selectedCell?.column ?? 'Cell' }), (0, jsx_runtime_1.jsx)("button", { className: "tool", "aria-label": "Close cell inspector", onClick: () => setInspectorOpen(false), children: "Close" })] }), (0, jsx_runtime_1.jsx)("pre", { children: selectedCell ? prettyValue(selectedCell.value) : 'No cell selected' })] }))] }), contextMenu && ((0, jsx_runtime_1.jsxs)("div", { className: "context-menu grid-context-menu", style: { left: contextMenu.x, top: contextMenu.y }, role: "menu", onClick: (event) => event.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("button", { role: "menuitem", onClick: () => {
                            const text = contextMenu.value !== undefined ? (0, format_1.formatValue)(contextMenu.value) : selectedText();
                            vscode_1.vscode.postMessage({ type: 'copy', text });
                            setContextMenu(undefined);
                        }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u29C9" }), (0, jsx_runtime_1.jsx)("span", { children: "Copy" }), (0, jsx_runtime_1.jsx)("kbd", { children: "Ctrl+C" })] }), (0, jsx_runtime_1.jsxs)("button", { role: "menuitem", disabled: contextMenu.rowIndex === undefined, onClick: () => {
                            const row = contextMenu.rowIndex !== undefined ? rowForIndex(contextMenu.rowIndex) : undefined;
                            if (row)
                                vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_2.rowsToTsv)([row]) });
                            setContextMenu(undefined);
                        }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u25A4" }), (0, jsx_runtime_1.jsx)("span", { children: "Copy Row" })] }), (0, jsx_runtime_1.jsxs)("button", { role: "menuitem", disabled: !contextMenu.column, onClick: () => {
                            if (contextMenu.column) {
                                const columnRows = visibleRows.map((row) => ({ [contextMenu.column]: row[contextMenu.column] }));
                                vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_2.rowsToTsv)(columnRows) });
                            }
                            setContextMenu(undefined);
                        }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u25A5" }), (0, jsx_runtime_1.jsx)("span", { children: "Copy Column" })] }), (0, jsx_runtime_1.jsxs)("button", { role: "menuitem", onClick: () => {
                            vscode_1.vscode.postMessage({ type: 'copy', text: (0, format_2.rowsToCsv)(visibleRows) });
                            setContextMenu(undefined);
                        }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u21E9" }), (0, jsx_runtime_1.jsx)("span", { children: "Copy Visible as CSV" })] })] })), (0, jsx_runtime_1.jsx)("div", { className: "result-pager", children: (0, jsx_runtime_1.jsxs)("span", { className: "pager-group", children: [(0, jsx_runtime_1.jsx)("button", { className: "pager-button", disabled: pageStart === 0, onClick: () => setPageOffset(0), children: "|\u2039" }), (0, jsx_runtime_1.jsx)("button", { className: "pager-button", disabled: pageStart === 0, onClick: () => setPageOffset(Math.max(0, pageStart - pageLimit)), children: "\u2039" }), (0, jsx_runtime_1.jsx)("select", { value: String(pageLimit), onChange: (event) => setPageOffset(0), children: (0, jsx_runtime_1.jsx)("option", { value: String(pageLimit), children: pageRows.length ? `${(pageStart + 1).toLocaleString()}-${pageEnd.toLocaleString()}` : '0' }) }), (0, jsx_runtime_1.jsxs)("span", { children: ["of ", hasNextPage ? `${(pageEnd + 1).toLocaleString()}+` : pageEnd.toLocaleString()] }), (0, jsx_runtime_1.jsx)("button", { className: "pager-button", disabled: !hasNextPage, onClick: () => setPageOffset(pageStart + pageLimit), children: "\u203A" }), (0, jsx_runtime_1.jsx)("button", { className: "pager-button", disabled: true, children: "\u203A|" }), (0, jsx_runtime_1.jsx)("span", { className: "pager-separator" }), (0, jsx_runtime_1.jsx)("button", { className: "pager-button", onClick: () => setColumnFiltersVisible((visible) => !visible), children: "\u22EE" })] }) })] }));
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
function parseOrderBy(value, columns) {
    const [first] = value.split(',');
    const parts = first.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return undefined;
    }
    const direction = parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    const normalized = parts[0].replace(/^"|"$/g, '');
    const column = columns.find((item) => item === normalized);
    return column ? { column, direction } : undefined;
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