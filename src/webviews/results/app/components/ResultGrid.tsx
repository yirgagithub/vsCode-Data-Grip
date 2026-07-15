import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { GridFilter, QueryField, QueryResultTab, ResultSet, SortSpec } from '../../../../types';
import { formatFieldValue, formatValue } from '../format';
import { analyzeFilterCardinality, buildColumnFilterOptions, filterKey, matchesColumnFilter as matchesFilter, rowsForColumnOptions, selectionState, toggleAllValues } from '../resultFilters';
import { vscode } from '../vscode';
import { rowsToCsv, rowsToTsv } from '../format';
import { Icon } from './Icon';

const ROW_HEIGHT = 32;
const BUFFER = 12;
const DEFAULT_COLUMN_WIDTH = 220;
const MIN_COLUMN_WIDTH = 112;
const FILTER_OPTION_HEIGHT = 28;
const FILTER_OPTION_WINDOW = 16;
const FILTER_POPOVER_WIDTH = 448;
const VIEWPORT_PADDING = 8;
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
  row?: Record<string, unknown>;
}

interface OpenColumnFilter {
  column: string;
  style: CSSProperties;
}

export function ResultGrid({
  tab,
  resultSet,
  columnFiltersVisible
}: {
  tab: QueryResultTab;
  resultSet?: ResultSet;
  columnFiltersVisible: boolean;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [sort, setSort] = useState<SortSpec | undefined>(tab.sort[0]);
  const [filters, setFilters] = useState<GridFilter[]>(tab.filters);
  const [openFilter, setOpenFilter] = useState<OpenColumnFilter>();
  const [selection, setSelection] = useState<Selection>();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number | 'all'>(100);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [contextMenu, setContextMenu] = useState<GridContextMenu>();
  const rows = resultSet?.rows ?? [];
  const fields = resultSet?.fields ?? [];
  const currentOffset = tab.rowOffset ?? 0;
  const hasMore = !!resultSet?.hasMore;
  const gridColumnStyle = {
    gridTemplateColumns: `var(--row-number-width) ${fields.map((field) => `${columnWidths[field.name] ?? DEFAULT_COLUMN_WIDTH}px`).join(' ')}`
  } as CSSProperties;

  const visibleRows = useMemo(() => {
    const fieldMap = new Map(fields.map((field) => [field.name, field]));
    const filtered = rows.filter((row) => filters.every((filter) => matchesFilter(row[filter.column], filter, fieldMap.get(filter.column))));
    if (!sort) {
      return filtered;
    }
    return [...filtered].sort((a, b) => {
      const sortField = fields.find((field) => field.name === sort.column);
      const av = formatFieldValue(a[sort.column], sortField);
      const bv = formatFieldValue(b[sort.column], sortField);
      return sort.direction === 'asc'
        ? av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
        : bv.localeCompare(av, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [rows, filters, sort]);
  const selectedColumnStats = useMemo(() => {
    if (selection?.type !== 'column') {
      return undefined;
    }
    const field = fields.find((item) => item.name === selection.column);
    return field ? calculateColumnStats(field, visibleRows) : undefined;
  }, [selection, fields, visibleRows]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const end = Math.min(visibleRows.length, start + 80);
  const slice = visibleRows.slice(start, end);
  const selectedCell = selection?.type === 'cell' ? selection : undefined;
  const selectedRow = selection?.type === 'row' ? selection.rowIndex : undefined;
  const selectedColumn = selection?.type === 'column' ? selection.column : selectedCell?.column;
  const visibleColumnNames = fields.map((field) => field.name);

  useEffect(() => {
    if (!columnFiltersVisible) {
      setOpenFilter(undefined);
    }
  }, [columnFiltersVisible]);

  useEffect(() => {
    setPageSize(tab.maxRows ?? 'all');
  }, [tab.id, tab.maxRows]);

  useEffect(() => {
    setFilters(tab.filters);
    setSort(tab.sort[0]);
  }, [tab.id]);

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
        : 0;
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
  const toggleColumnFilter = (event: ReactMouseEvent<HTMLButtonElement>, column: string) => {
    event.stopPropagation();
    if (openFilter?.column === column) {
      setOpenFilter(undefined);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(FILTER_POPOVER_WIDTH, window.innerWidth * 0.82);
    const below = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const above = rect.top - VIEWPORT_PADDING;
    const openBelow = below >= 240 || below >= above;
    const availableHeight = Math.max(96, openBelow ? below - 4 : above - 4);
    const maxHeight = Math.min(544, availableHeight);
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_PADDING));
    const top = openBelow
      ? rect.bottom + 4
      : Math.max(VIEWPORT_PADDING, rect.top - maxHeight - 4);
    setOpenFilter({
      column,
      style: {
        left,
        top,
        width,
        maxHeight
      }
    });
  };
  const changePageSize = (value: string) => {
    if (value === 'all') {
      setPageSize('all');
      postRerun(null, 0);
      return;
    }
    const nextSize = Number(value);
    setPageSize(nextSize);
    postRerun(nextSize, 0);
  };
  const persistGridState = (nextFilters: GridFilter[], nextSort: SortSpec | undefined) => {
    vscode.postMessage({ type: 'updateGridState', tabId: tab.id, filters: nextFilters, sort: nextSort ? [nextSort] : [] });
  };
  const updateFilters = (updater: (current: GridFilter[]) => GridFilter[]) => {
    setFilters((current) => {
      const next = updater(current);
      persistGridState(next, sort);
      return next;
    });
  };
  const updateSort = (nextSort: SortSpec) => {
    setSort(nextSort);
    persistGridState(filters, nextSort);
  };
  const postRerun = (maxRows: number | null, offset: number) => {
    vscode.postMessage({ type: 'rerunTab', tabId: tab.id, maxRows, offset, filters, sort: sort ? [sort] : [] });
  };

  return (
    <section className="grid-shell" onKeyDown={onGridKeyDown}>
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
                      updateSort(nextSort);
                      setSelection({ type: 'column', column: field.name });
                    }}
                  >
                    {sort?.column === field.name
                      ? <Icon name={sort.direction === 'asc' ? 'arrow-up' : 'arrow-down'} />
                      : <Icon name="fold" className="sort-neutral" />}
                  </button>
                  {columnFiltersVisible && (
                    <button className={`filter-button ${activeFilter ? 'active' : ''}`} title="Filter column" aria-label={`Filter ${field.name}`} onClick={(event) => toggleColumnFilter(event, field.name)}>
                      <Icon name="filter" />
                    </button>
                  )}
                  <span className="resize-handle" title="Resize column" onMouseDown={(event) => startColumnResize(event, field.name)} />
                </div>
              );
            })}
          </div>
          <div className="grid-body" style={{ height: visibleRows.length * ROW_HEIGHT }}>
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {slice.map((row, index) => (
                <div className={`grid-row ${selectedRow === start + index ? 'selected-row' : ''}`} key={start + index} style={gridColumnStyle} role="row">
                  <div
                    className="cell rownum"
                    role="rowheader"
                    onClick={() => setSelection({ type: 'row', rowIndex: start + index })}
                    onContextMenu={(event) => openContextMenu(event, { rowIndex: start + index, row })}
                  >
                    {currentOffset + start + index + 1}
                  </div>
                  {fields.map((field) => {
                    const rowIndex = start + index;
                    const value = row[field.name];
                    const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell.column === field.name;
                    return (
                      <div
                        className={`cell data-cell ${value === null ? 'null' : ''} ${selectedColumn === field.name ? 'selected-column' : ''} ${isSelected ? 'selected' : ''}`}
                        key={field.name}
                        title={formatFieldValue(value, field) || 'NULL'}
                        onClick={() => setSelection({ type: 'cell', rowIndex, column: field.name, value })}
                        onContextMenu={(event) => {
                          setSelection({ type: 'cell', rowIndex, column: field.name, value });
                          openContextMenu(event, { rowIndex, column: field.name, value, row });
                        }}
                        role="gridcell"
                        aria-selected={isSelected}
                      >
                        {value === null ? 'NULL' : formatFieldValue(value, field)}
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
            <Icon name="copy" /><span>Copy</span><kbd>Ctrl+C</kbd>
          </button>
          <button role="menuitem" disabled={contextMenu.rowIndex === undefined} onClick={() => {
            const row = contextMenu.rowIndex !== undefined ? rowForIndex(contextMenu.rowIndex) : undefined;
            if (row) vscode.postMessage({ type: 'copy', text: rowsToTsv([row]) });
            setContextMenu(undefined);
          }}>
            <Icon name="list-flat" /><span>Copy Row</span>
          </button>
          <button role="menuitem" disabled={!contextMenu.column} onClick={() => {
            if (contextMenu.column) {
              const columnRows = visibleRows.map((row) => ({ [contextMenu.column as string]: row[contextMenu.column as string] }));
              vscode.postMessage({ type: 'copy', text: rowsToTsv(columnRows) });
            }
            setContextMenu(undefined);
          }}>
            <Icon name="symbol-field" /><span>Copy Column</span>
          </button>
          <button role="menuitem" onClick={() => {
            vscode.postMessage({ type: 'copy', text: rowsToCsv(visibleRows) });
            setContextMenu(undefined);
          }}>
            <Icon name="desktop-download" /><span>Copy Visible as CSV</span>
          </button>
        </div>
      )}
      {columnFiltersVisible && openFilter && (
        <ColumnFilterPopover
          key={openFilter.column}
          column={openFilter.column}
          rows={rowsForColumnOptions(rows, filters, openFilter.column, fields)}
          field={fields.find((field) => field.name === openFilter.column) ?? { name: openFilter.column }}
          filter={filters.find((filter) => filter.column === openFilter.column)}
          style={openFilter.style}
          onApply={(filter) => {
            updateFilters((current) => [...current.filter((item) => item.column !== openFilter.column), filter]);
          }}
          onClear={() => {
            updateFilters((current) => current.filter((item) => item.column !== openFilter.column));
          }}
          onFilterInSql={() => setOpenFilter(undefined)}
        />
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
          <button className="pager-button" title="First page" aria-label="First page" disabled={currentOffset === 0 || pageSize === 'all'} onClick={() => postRerun(pageSize === 'all' ? null : pageSize, 0)}><Icon name="debug-step-back" /></button>
          <button className="pager-button" title="Previous page" aria-label="Previous page" disabled={currentOffset === 0 || pageSize === 'all'} onClick={() => postRerun(pageSize === 'all' ? null : pageSize, Math.max(0, currentOffset - Number(pageSize)))}><Icon name="chevron-left" /></button>
          <select
            value={pageSize === 'all' ? 'all' : String(pageSize)}
            onChange={(event) => changePageSize(event.target.value)}
            aria-label="Rows per page"
            title="Rows per page"
          >
            {[20, 50, 100, 250, 500].map((count) => (
              <option key={count} value={String(count)}>{`${count} rows`}</option>
            ))}
            <option value="all">All rows</option>
          </select>
          <span>of {hasMore ? `${(currentOffset + visibleRows.length + 1).toLocaleString()}+` : (currentOffset + visibleRows.length).toLocaleString()}</span>
          <button className="pager-button" title="Next page" aria-label="Next page" disabled={!hasMore || pageSize === 'all'} onClick={() => postRerun(pageSize === 'all' ? null : pageSize, currentOffset + Number(pageSize))}><Icon name="chevron-right" /></button>
        </span>
      </div>
    </section>
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
  field,
  filter,
  style,
  onApply,
  onClear,
  onFilterInSql
}: {
  column: string;
  rows: Record<string, unknown>[];
  field: QueryField;
  filter?: GridFilter;
  style: CSSProperties;
  onApply: (filter: GridFilter) => void;
  onClear: () => void;
  onFilterInSql: () => void;
}) {
  const analysis = useMemo(() => analyzeFilterCardinality(rows, field), [rows, field]);
  const [allowLargeList, setAllowLargeList] = useState(false);
  const options = useMemo(() => {
    if (analysis.warned && !allowLargeList) return [];
    const available = buildColumnFilterOptions(rows, field);
    const keys = new Set(available.map((option) => option.key));
    const unavailableSelections = (filter?.values ?? [])
      .filter((key) => !keys.has(key))
      .map((key) => ({ key, label: key, count: 0 }));
    return [...available, ...unavailableSelections];
  }, [rows, field, filter, analysis.warned, allowLargeList]);
  const allKeys = useMemo(() => options.map((option) => option.key), [options]);
  const initialSelection = analysis.warned && !allowLargeList ? (filter?.values ?? []) : initialColumnFilterSelection(filter, allKeys);
  const [search, setSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState(() => new Set(initialSelection));
  const [listScrollTop, setListScrollTop] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const matchingOptions = options.filter((option) => option.label.toLowerCase().includes(normalizedSearch));
  const listStart = Math.max(0, Math.floor(listScrollTop / FILTER_OPTION_HEIGHT) - 2);
  const visibleOptions = matchingOptions.slice(listStart, listStart + FILTER_OPTION_WINDOW);
  const state = selectionState(selectedValues, allKeys);
  const activeCount = selectedValues.size;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = state === 'partial';
  }, [state]);

  const commitSelection = (next: Set<string>) => {
    if (next.size === allKeys.length) {
      onClear();
      return;
    }
    onApply({ column, operator: 'values', value: '', values: [...next] });
  };

  const toggleVisible = () => {
    const next = toggleAllValues(selectedValues, allKeys);
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
    <div className="filter-popover value-filter-popover" style={style} onClick={(event) => event.stopPropagation()}>
      <div className="filter-title">Local Filter For '{column}'</div>
      {analysis.warned && !allowLargeList ? (
        <div className="filter-cardinality-warning">
          <strong>Large value list</strong>
          <span>{analysis.truncated ? 'At least ' : ''}{analysis.uniqueCount.toLocaleString()} unique values may use about {(analysis.estimatedBytes / 1024 / 1024).toFixed(1)} MB.</span>
          <span>Filter in SQL with a WHERE condition, or continue anyway.</span>
          <div><button type="button" onClick={onFilterInSql}>Filter in SQL</button><button type="button" onClick={() => setAllowLargeList(true)}>Continue anyway</button></div>
        </div>
      ) : <>
      <label className="filter-search">
        <Icon name="search" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
      </label>
      <label className="filter-option filter-option-heading">
        <input ref={selectAllRef} type="checkbox" checked={state === 'all'} onChange={toggleVisible} disabled={allKeys.length === 0} />
        <span>Value</span>
        <span className="filter-count">Count</span>
      </label>
      <div className="filter-option-list" onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
        <div style={{ height: matchingOptions.length * FILTER_OPTION_HEIGHT, position: 'relative' }}>
        <div style={{ transform: `translateY(${listStart * FILTER_OPTION_HEIGHT}px)` }}>
        {visibleOptions.length > 0 ? visibleOptions.map((option) => (
          <label className="filter-option" key={option.key} style={{ height: FILTER_OPTION_HEIGHT }}>
            <input type="checkbox" checked={selectedValues.has(option.key)} onChange={() => toggleValue(option.key)} />
            <span title={option.label}>{option.label}</span>
            <span className="filter-count">{option.count.toLocaleString()}</span>
          </label>
        )) : <div className="filter-empty">No values in fetched rows.</div>}
        </div></div>
      </div>
      <div className="filter-live-status">{activeCount.toLocaleString()} selected</div>
      </>}
    </div>
  );
}

export function initialColumnFilterSelection(filter: GridFilter | undefined, allKeys: string[]): string[] {
  if (filter?.operator !== 'values' || !filter.values) {
    return [];
  }
  const available = new Set(allKeys);
  return filter.values.filter((value) => available.has(value));
}

export function matchesColumnFilter(value: unknown, filter: GridFilter): boolean {
  return matchesFilter(value, filter);
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
