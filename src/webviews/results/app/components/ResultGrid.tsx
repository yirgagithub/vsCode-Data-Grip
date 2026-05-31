import { useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { QueryResultTab, ResultSet } from '../../../../types';
import { formatValue } from '../format';
import { vscode } from '../vscode';
import { rowsToCsv, rowsToTsv } from '../format';

const ROW_HEIGHT = 24;
const BUFFER = 12;
const DEFAULT_COLUMN_WIDTH = 188;
const MIN_COLUMN_WIDTH = 96;
const OPERATORS = ['contains', 'equals', 'not equals', 'starts with', 'ends with', 'is null', 'is not null'];

interface ColumnFilter {
  column: string;
  operator: string;
  value: string;
}

interface SelectedCell {
  rowIndex: number;
  column: string;
  value: unknown;
}

type Selection =
  | { type: 'cell'; rowIndex: number; column: string; value: unknown }
  | { type: 'row'; rowIndex: number }
  | { type: 'column'; column: string };

interface GridContextMenu {
  x: number;
  y: number;
  rowIndex?: number;
  column?: string;
  value?: unknown;
}

export function ResultGrid({ tab, resultSet }: { tab: QueryResultTab; resultSet?: ResultSet }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | undefined>(tab.sort[0]);
  const [whereFilter, setWhereFilter] = useState('');
  const [orderBy, setOrderBy] = useState(tab.sort[0] ? `${tab.sort[0].column} ${tab.sort[0].direction}` : '');
  const [columnFiltersVisible, setColumnFiltersVisible] = useState(false);
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [openFilterColumn, setOpenFilterColumn] = useState<string>();
  const [selection, setSelection] = useState<Selection>();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [contextMenu, setContextMenu] = useState<GridContextMenu>();
  const rows = resultSet?.rows ?? [];
  const fields = resultSet?.fields ?? [];
  const pageLimit = tab.maxRows && tab.maxRows > 0 ? tab.maxRows : Math.max(rows.length, 1);
  const gridColumnStyle = {
    gridTemplateColumns: `var(--row-number-width) ${fields.map((field) => `${columnWidths[field.name] ?? DEFAULT_COLUMN_WIDTH}px`).join(' ')}`
  } as CSSProperties;

  const visibleRows = useMemo(() => {
    let filtered = whereFilter
      ? rows.filter((row) => Object.values(row).some((value) => formatValue(value).toLowerCase().includes(whereFilter.toLowerCase())))
      : rows;
    filtered = filtered.filter((row) => filters.every((filter) => matchesFilter(row[filter.column], filter)));
    const order = parseOrderBy(orderBy, fields.map((field) => field.name)) ?? sort;
    if (!order) {
      return filtered;
    }
    return [...filtered].sort((a, b) => {
      const av = formatValue(a[order.column]);
      const bv = formatValue(b[order.column]);
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
    return <section className="grid-empty">No result set.</section>;
  }

  const rowForIndex = (rowIndex: number): Record<string, unknown> | undefined => visibleRows[rowIndex];
  const selectedText = () => {
    if (!selection) {
      return '';
    }
    if (selection.type === 'cell') {
      return formatValue(selection.value);
    }
    if (selection.type === 'row') {
      const row = rowForIndex(selection.rowIndex);
      return row ? rowsToTsv([row]) : '';
    }
    const columnRows = visibleRows.map((row) => ({ [selection.column]: row[selection.column] }));
    return rowsToTsv(columnRows);
  };
  const copySelection = () => {
    const text = selectedText();
    if (text) {
      vscode.postMessage({ type: 'copy', text });
    }
  };
  const moveSelection = (key: string, extend: boolean) => {
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
  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
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
  const openContextMenu = (event: ReactMouseEvent, menu: Omit<GridContextMenu, 'x' | 'y'>) => {
    event.preventDefault();
    setContextMenu({ ...menu, x: event.clientX, y: event.clientY });
  };
  const startColumnResize = (event: ReactMouseEvent, column: string) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column] ?? DEFAULT_COLUMN_WIDTH;
    const onMove = (moveEvent: MouseEvent) => {
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

  return (
    <section className="grid-shell" onKeyDown={onGridKeyDown}>
      <div className="criteria-row">
        <label className="criteria">
          <span className="criteria-icon">▽</span>
          <strong>WHERE</strong>
          <input
            value={whereFilter}
            onChange={(event) => {
              setWhereFilter(event.target.value);
              setPageOffset(0);
            }}
          />
        </label>
        <label className="criteria">
          <span className="criteria-icon order">≡</span>
          <strong>ORDER BY</strong>
          <input
            value={orderBy}
            onChange={(event) => {
              setOrderBy(event.target.value);
              setPageOffset(0);
            }}
          />
        </label>
      </div>
      <div className={`grid-layout ${inspectorOpen ? 'with-inspector' : ''}`}>
        <div
          className="grid result-grid"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onClick={() => setContextMenu(undefined)}
          role="grid"
          aria-rowcount={visibleRows.length}
          aria-colcount={fields.length}
          tabIndex={0}
        >
          <div className="grid-header" style={gridColumnStyle}>
            <div className="cell rownum" role="columnheader">#</div>
            {fields.map((field) => {
              const activeFilter = filters.find((filter) => filter.column === field.name);
              return (
                <div
                  key={field.name}
                  className={`cell header-cell ${activeFilter ? 'filtered' : ''} ${selectedColumn === field.name ? 'selected-column' : ''}`}
                  role="columnheader"
                  aria-sort={sort?.column === field.name ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onContextMenu={(event) => openContextMenu(event, { column: field.name })}
                >
                  <button
                    className="header-title"
                    aria-label={`Sort by ${field.name}`}
                    onClick={() => {
                      const nextSort = sort?.column === field.name && sort.direction === 'asc' ? { column: field.name, direction: 'desc' as const } : { column: field.name, direction: 'asc' as const };
                      setSort(nextSort);
                      setOrderBy(`${nextSort.column} ${nextSort.direction}`);
                      setSelection({ type: 'column', column: field.name });
                      setPageOffset(0);
                    }}
                  >
                    <span className="column-type-icon" />
                    <span>{field.name}</span>
                    {field.dataTypeName && <small>{field.dataTypeName}</small>}
                    {sort?.column === field.name && <span className="sort-mark">{sort.direction}</span>}
                  </button>
                  <button className="filter-button" title="Filter column" aria-label={`Filter ${field.name}`} onClick={() => {
                    setColumnFiltersVisible(true);
                    setOpenFilterColumn(openFilterColumn === field.name ? undefined : field.name);
                  }}>⌄</button>
                  <span className="resize-handle" title="Resize column" onMouseDown={(event) => startColumnResize(event, field.name)} />
                  {columnFiltersVisible && openFilterColumn === field.name && (
                    <ColumnFilterPopover
                      filter={activeFilter ?? { column: field.name, operator: 'contains', value: '' }}
                      onApply={(filter) => {
                        setFilters((current) => [...current.filter((item) => item.column !== field.name), filter]);
                        setOpenFilterColumn(undefined);
                      }}
                      onClear={() => {
                        setFilters((current) => current.filter((item) => item.column !== field.name));
                        setOpenFilterColumn(undefined);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {columnFiltersVisible && (
            <div className="grid-row column-filter-row" style={gridColumnStyle}>
              <div className="cell rownum" />
              {fields.map((field) => {
                const activeFilter = filters.find((filter) => filter.column === field.name);
                return (
                  <div className="cell" key={field.name}>
                    <input
                      value={activeFilter?.value ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFilters((current) => [
                          ...current.filter((item) => item.column !== field.name),
                          ...(value ? [{ column: field.name, operator: 'contains', value }] : [])
                        ]);
                        setPageOffset(0);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid-body" style={{ height: pageRows.length * ROW_HEIGHT }}>
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {slice.map((row, index) => (
                <div className={`grid-row ${selectedRow === pageStart + start + index ? 'selected-row' : ''}`} key={start + index} style={gridColumnStyle} role="row">
                  <div
                    className="cell rownum"
                    role="rowheader"
                    onClick={() => setSelection({ type: 'row', rowIndex: pageStart + start + index })}
                    onContextMenu={(event) => openContextMenu(event, { rowIndex: pageStart + start + index })}
                  >
                    {pageStart + start + index + 1}
                  </div>
                  {fields.map((field) => {
                    const rowIndex = pageStart + start + index;
                    const value = row[field.name];
                    const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell.column === field.name;
                    return (
                      <div
                        className={`cell data-cell ${value === null ? 'null' : ''} ${selectedColumn === field.name ? 'selected-column' : ''} ${isSelected ? 'selected' : ''}`}
                        key={field.name}
                        title={formatValue(value) || 'NULL'}
                        onClick={() => setSelection({ type: 'cell', rowIndex, column: field.name, value })}
                        onContextMenu={(event) => {
                          setSelection({ type: 'cell', rowIndex, column: field.name, value });
                          openContextMenu(event, { rowIndex, column: field.name, value });
                        }}
                        onDoubleClick={() => {
                          setSelection({ type: 'cell', rowIndex, column: field.name, value });
                          setInspectorOpen(true);
                        }}
                        role="gridcell"
                        aria-selected={isSelected}
                      >
                        {value === null ? 'NULL' : formatValue(value)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        {inspectorOpen && (
          <aside className="cell-inspector">
            <div className="inspector-title">
              <strong>{selectedCell?.column ?? 'Cell'}</strong>
              <button className="tool" aria-label="Close cell inspector" onClick={() => setInspectorOpen(false)}>Close</button>
            </div>
            <pre>{selectedCell ? prettyValue(selectedCell.value) : 'No cell selected'}</pre>
          </aside>
        )}
      </div>
      {contextMenu && (
        <div
          className="context-menu grid-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button role="menuitem" onClick={() => {
            const text = contextMenu.value !== undefined ? formatValue(contextMenu.value) : selectedText();
            vscode.postMessage({ type: 'copy', text });
            setContextMenu(undefined);
          }}>
            <span>⧉</span><span>Copy</span><kbd>Ctrl+C</kbd>
          </button>
          <button role="menuitem" disabled={contextMenu.rowIndex === undefined} onClick={() => {
            const row = contextMenu.rowIndex !== undefined ? rowForIndex(contextMenu.rowIndex) : undefined;
            if (row) vscode.postMessage({ type: 'copy', text: rowsToTsv([row]) });
            setContextMenu(undefined);
          }}>
            <span>▤</span><span>Copy Row</span>
          </button>
          <button role="menuitem" disabled={!contextMenu.column} onClick={() => {
            if (contextMenu.column) {
              const columnRows = visibleRows.map((row) => ({ [contextMenu.column as string]: row[contextMenu.column as string] }));
              vscode.postMessage({ type: 'copy', text: rowsToTsv(columnRows) });
            }
            setContextMenu(undefined);
          }}>
            <span>▥</span><span>Copy Column</span>
          </button>
          <button role="menuitem" onClick={() => {
            vscode.postMessage({ type: 'copy', text: rowsToCsv(visibleRows) });
            setContextMenu(undefined);
          }}>
            <span>⇩</span><span>Copy Visible as CSV</span>
          </button>
        </div>
      )}
      <div className="result-pager">
        <span className="pager-group">
          <button className="pager-button" disabled={pageStart === 0} onClick={() => setPageOffset(0)}>|‹</button>
          <button className="pager-button" disabled={pageStart === 0} onClick={() => setPageOffset(Math.max(0, pageStart - pageLimit))}>‹</button>
          <select value={String(pageLimit)} onChange={(event) => setPageOffset(0)}>
            <option value={String(pageLimit)}>{pageRows.length ? `${(pageStart + 1).toLocaleString()}-${pageEnd.toLocaleString()}` : '0'}</option>
          </select>
          <span>of {hasNextPage ? `${(pageEnd + 1).toLocaleString()}+` : pageEnd.toLocaleString()}</span>
          <button className="pager-button" disabled={!hasNextPage} onClick={() => setPageOffset(pageStart + pageLimit)}>›</button>
          <button className="pager-button" disabled>›|</button>
          <span className="pager-separator" />
          <button className="pager-button" onClick={() => setColumnFiltersVisible((visible) => !visible)}>⋮</button>
        </span>
      </div>
    </section>
  );
}

function ColumnFilterPopover({
  filter,
  onApply,
  onClear
}: {
  filter: ColumnFilter;
  onApply: (filter: ColumnFilter) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(filter);

  return (
    <div className="filter-popover">
      <select value={draft.operator} onChange={(event) => setDraft({ ...draft, operator: event.target.value })}>
        {OPERATORS.map((operator) => <option key={operator}>{operator}</option>)}
      </select>
      {!draft.operator.includes('null') && (
        <input value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} autoFocus />
      )}
      <div className="popover-actions">
        <button className="tool primary" onClick={() => onApply(draft)}>Apply</button>
        <button className="tool" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

function matchesFilter(value: unknown, filter: ColumnFilter): boolean {
  const text = formatValue(value).toLowerCase();
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

function parseOrderBy(value: string, columns: string[]): { column: string; direction: 'asc' | 'desc' } | undefined {
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

function prettyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}
