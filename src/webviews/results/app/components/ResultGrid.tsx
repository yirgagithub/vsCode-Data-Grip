import { useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { QueryField, QueryResultTab, ResultSet } from '../../../../types';
import { formatValue } from '../format';
import { vscode } from '../vscode';
import { rowsToCsv, rowsToTsv } from '../format';

const ROW_HEIGHT = 32;
const BUFFER = 12;
const DEFAULT_COLUMN_WIDTH = 220;
const MIN_COLUMN_WIDTH = 112;
const MAX_FILTER_OPTIONS = 250;
const NUMERIC_TYPE_IDS = new Set([20, 21, 23, 700, 701, 790, 1700]);
const NUMERIC_TYPE_NAMES = [
  'bigint',
  'bigserial',
  'decimal',
  'double precision',
  'float',
  'float4',
  'float8',
  'int',
  'int2',
  'int4',
  'int8',
  'integer',
  'money',
  'numeric',
  'real',
  'serial',
  'serial2',
  'serial4',
  'serial8',
  'smallint'
];

interface ColumnFilter {
  column: string;
  operator: string;
  value: string;
  values?: string[];
}

interface SelectedCell {
  rowIndex: number;
  column: string;
  value: unknown;
}

interface ColumnStats {
  sum: number;
  average: number;
  numericCount: number;
}

interface FilterOption {
  key: string;
  label: string;
  count: number;
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
  const [columnFiltersVisible, setColumnFiltersVisible] = useState(true);
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

  const selectedColumnStats = useMemo(() => {
    if (selection?.type !== 'column') {
      return undefined;
    }
    const field = fields.find((item) => item.name === selection.column);
    return field ? calculateColumnStats(field, visibleRows) : undefined;
  }, [selection, fields, visibleRows]);

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
          <span className="criteria-icon"><FilterIcon /></span>
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
                    aria-label={`Select column ${field.name}`}
                    onClick={() => {
                      setSelection({ type: 'column', column: field.name });
                    }}
                  >
                    <span className="column-type-icon" />
                    <span>{field.name}</span>
                    {field.dataTypeName && <small>{field.dataTypeName}</small>}
                  </button>
                  <button
                    className={`sort-button ${sort?.column === field.name ? 'active' : ''}`}
                    title={`Sort ${field.name}`}
                    aria-label={`Sort ${field.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      const nextSort = sort?.column === field.name && sort.direction === 'asc' ? { column: field.name, direction: 'desc' as const } : { column: field.name, direction: 'asc' as const };
                      setSort(nextSort);
                      setOrderBy(`${nextSort.column} ${nextSort.direction}`);
                      setSelection({ type: 'column', column: field.name });
                      setPageOffset(0);
                    }}
                  >
                    {sort?.column === field.name ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                  {columnFiltersVisible && (
                    <button className={`filter-button ${activeFilter ? 'active' : ''}`} title="Filter column" aria-label={`Filter ${field.name}`} onClick={() => {
                      setOpenFilterColumn(openFilterColumn === field.name ? undefined : field.name);
                    }}>
                      <FilterIcon />
                    </button>
                  )}
                  <span className="resize-handle" title="Resize column" onMouseDown={(event) => startColumnResize(event, field.name)} />
                  {columnFiltersVisible && openFilterColumn === field.name && (
                    <ColumnFilterPopover
                      column={field.name}
                      rows={rows}
                      filter={activeFilter}
                      onApply={(filter) => {
                        setFilters((current) => [...current.filter((item) => item.column !== field.name), filter]);
                        setPageOffset(0);
                      }}
                      onClear={() => {
                        setFilters((current) => current.filter((item) => item.column !== field.name));
                        setPageOffset(0);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
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
      {selection?.type === 'column' && (
        <div className="selection-summary" title={selectedColumnStats ? `${selection.column}: sum ${formatNumber(selectedColumnStats.sum)}, average ${formatNumber(selectedColumnStats.average)}` : `${selection.column}: ${visibleRows.length.toLocaleString()} rows selected`}>
          <span className="summary-column">{selection.column}</span>
          {selectedColumnStats ? (
            <>
              <span>{selectedColumnStats.numericCount.toLocaleString()} values</span>
              <span>Sum {formatNumber(selectedColumnStats.sum)}</span>
              <span>Avg {formatNumber(selectedColumnStats.average)}</span>
            </>
          ) : (
            <span>{visibleRows.length.toLocaleString()} rows selected</span>
          )}
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
          <button className="pager-button" title="Show or hide column filters" aria-label="Show or hide column filters" onClick={() => setColumnFiltersVisible((visible) => !visible)}><FilterIcon /></button>
        </span>
      </div>
    </section>
  );
}

function FilterIcon() {
  return (
    <svg className="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z" />
    </svg>
  );
}

function calculateColumnStats(field: QueryField, rows: Record<string, unknown>[]): ColumnStats | undefined {
  if (!isNumericAggregateColumn(field)) {
    return undefined;
  }
  const values = rows
    .map((row) => numericValue(row[field.name]))
    .filter((value): value is number => value !== undefined);
  if (!values.length) {
    return undefined;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    sum,
    average: sum / values.length,
    numericCount: values.length
  };
}

function isNumericAggregateColumn(field: QueryField): boolean {
  if (isIdentifierColumn(field.name)) {
    return false;
  }
  if (typeof field.dataTypeId === 'number' && NUMERIC_TYPE_IDS.has(field.dataTypeId)) {
    return true;
  }
  const typeName = field.dataTypeName?.toLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(typeName && NUMERIC_TYPE_NAMES.some((numericType) => typeName === numericType || typeName.startsWith(`${numericType}(`) || typeName.startsWith(`${numericType} `)));
}

function isIdentifierColumn(column: string): boolean {
  return column.toLowerCase() === 'id'
    || /^id[_\-\s]/i.test(column)
    || /[_\-\s]id$/i.test(column)
    || /Id$/.test(column)
    || /ID$/.test(column);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'bigint') {
    const next = Number(value);
    return Number.isFinite(next) ? next : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
      return undefined;
    }
    const next = Number(trimmed);
    return Number.isFinite(next) ? next : undefined;
  }
  return undefined;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

function ColumnFilterPopover({
  column,
  rows,
  filter,
  onApply,
  onClear
}: {
  column: string;
  rows: Record<string, unknown>[];
  filter?: ColumnFilter;
  onApply: (filter: ColumnFilter) => void;
  onClear: () => void;
}) {
  const options = useMemo(() => columnFilterOptions(rows, column), [rows, column]);
  const allKeys = useMemo(() => options.map((option) => option.key), [options]);
  const initialSelection = filter?.operator === 'values' && filter.values ? filter.values : allKeys;
  const [search, setSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState(() => new Set(initialSelection));
  const visibleOptions = options
    .filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, MAX_FILTER_OPTIONS);
  const visibleKeys = visibleOptions.map((option) => option.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedValues.has(key));
  const activeCount = selectedValues.size;

  const commitSelection = (next: Set<string>) => {
    if (next.size === allKeys.length) {
      onClear();
      return;
    }
    onApply({ column, operator: 'values', value: '', values: [...next] });
  };

  const toggleVisible = () => {
    const next = new Set(selectedValues);
    if (allVisibleSelected) {
      visibleKeys.forEach((key) => next.delete(key));
    } else {
      visibleKeys.forEach((key) => next.add(key));
    }
    setSelectedValues(next);
    commitSelection(next);
  };

  const toggleValue = (key: string) => {
    const next = new Set(selectedValues);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedValues(next);
    commitSelection(next);
  };

  return (
    <div className="filter-popover value-filter-popover">
      <div className="filter-title">Local Filter For '{column}'</div>
      <label className="filter-search">
        <span>⌕</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
      </label>
      <label className="filter-option filter-option-heading">
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
        <span>Value</span>
        <span className="filter-count">Count</span>
      </label>
      <div className="filter-option-list">
        {visibleOptions.map((option) => (
          <label className="filter-option" key={option.key}>
            <input type="checkbox" checked={selectedValues.has(option.key)} onChange={() => toggleValue(option.key)} />
            <span title={option.label}>{option.label}</span>
            <span className="filter-count">{option.count.toLocaleString()}</span>
          </label>
        ))}
      </div>
      <div className="filter-live-status">{activeCount.toLocaleString()} selected</div>
    </div>
  );
}

function columnFilterOptions(rows: Record<string, unknown>[], column: string): FilterOption[] {
  const counts = new Map<string, FilterOption>();
  for (const row of rows) {
    const key = filterKey(row[column]);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { key, label: filterLabel(row[column]), count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
}

function filterKey(value: unknown): string {
  if (value === null || value === undefined) {
    return '<NULL>';
  }
  return formatValue(value);
}

function filterLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  const next = formatValue(value);
  return next === '' ? '(empty)' : next;
}

function matchesFilter(value: unknown, filter: ColumnFilter): boolean {
  if (filter.operator === 'values') {
    return filter.values ? filter.values.includes(filterKey(value)) : true;
  }
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
