import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { QueryResultTab, ResultSet } from '../../../../types';
import { formatValue } from '../format';
import { vscode } from '../vscode';

const ROW_HEIGHT = 24;
const BUFFER = 12;
const GRID_COLUMNS = '56px repeat(var(--column-count), minmax(128px, 240px))';
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

export function ResultGrid({ tab, resultSet }: { tab: QueryResultTab; resultSet?: ResultSet }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | undefined>(tab.sort[0]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [openFilterColumn, setOpenFilterColumn] = useState<string>();
  const [selected, setSelected] = useState<SelectedCell>();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const rows = resultSet?.rows ?? [];
  const fields = resultSet?.fields ?? [];
  const gridColumnStyle = { '--column-count': fields.length, gridTemplateColumns: GRID_COLUMNS } as CSSProperties & Record<string, number | string>;

  const visibleRows = useMemo(() => {
    let filtered = globalFilter
      ? rows.filter((row) => Object.values(row).some((value) => formatValue(value).toLowerCase().includes(globalFilter.toLowerCase())))
      : rows;
    filtered = filtered.filter((row) => filters.every((filter) => matchesFilter(row[filter.column], filter)));
    if (!sort) {
      return filtered;
    }
    return [...filtered].sort((a, b) => {
      const av = formatValue(a[sort.column]);
      const bv = formatValue(b[sort.column]);
      return sort.direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [rows, sort, globalFilter, filters]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const end = Math.min(visibleRows.length, start + 80);
  const slice = visibleRows.slice(start, end);

  if (!resultSet) {
    return <section className="grid-empty">No result set.</section>;
  }

  return (
    <section className="grid-shell">
      <div className="filter-row">
        <input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Filter fetched rows" />
        <span>{visibleRows.length} visible</span>
        {filters.length > 0 && <button className="tool" onClick={() => setFilters([])}>Clear column filters</button>}
        <span className="toolbar-spacer" />
        <button className="tool" disabled={!selected} onClick={() => selected && vscode.postMessage({ type: 'copy', text: formatValue(selected.value) })}>Copy Cell</button>
        <button className="tool" disabled={!selected} onClick={() => setInspectorOpen((open) => !open)}>Inspector</button>
      </div>
      <div className={`grid-layout ${inspectorOpen ? 'with-inspector' : ''}`}>
        <div className="grid" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
          <div className="grid-header" style={gridColumnStyle}>
            <div className="cell rownum">#</div>
            {fields.map((field) => {
              const activeFilter = filters.find((filter) => filter.column === field.name);
              return (
                <div key={field.name} className={`cell header-cell ${activeFilter ? 'filtered' : ''}`}>
                  <button
                    className="header-title"
                    onClick={() => setSort((current) => current?.column === field.name && current.direction === 'asc' ? { column: field.name, direction: 'desc' } : { column: field.name, direction: 'asc' })}
                  >
                    <span>{field.name}</span>
                    {field.dataTypeName && <small>{field.dataTypeName}</small>}
                    {sort?.column === field.name && <span className="sort-mark">{sort.direction}</span>}
                  </button>
                  <button className="filter-button" title="Filter column" onClick={() => setOpenFilterColumn(openFilterColumn === field.name ? undefined : field.name)}>Filter</button>
                  {openFilterColumn === field.name && (
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
          <div className="grid-body" style={{ height: visibleRows.length * ROW_HEIGHT }}>
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {slice.map((row, index) => (
                <div className="grid-row" key={start + index} style={gridColumnStyle}>
                  <div className="cell rownum">{start + index + 1}</div>
                  {fields.map((field) => {
                    const rowIndex = start + index;
                    const value = row[field.name];
                    const isSelected = selected?.rowIndex === rowIndex && selected.column === field.name;
                    return (
                      <div
                        className={`cell data-cell ${value === null ? 'null' : ''} ${isSelected ? 'selected' : ''}`}
                        key={field.name}
                        title={formatValue(value) || 'NULL'}
                        onClick={() => setSelected({ rowIndex, column: field.name, value })}
                        onDoubleClick={() => {
                          setSelected({ rowIndex, column: field.name, value });
                          setInspectorOpen(true);
                        }}
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
              <strong>{selected?.column ?? 'Cell'}</strong>
              <button className="tool" onClick={() => setInspectorOpen(false)}>Close</button>
            </div>
            <pre>{selected ? prettyValue(selected.value) : 'No cell selected'}</pre>
          </aside>
        )}
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
