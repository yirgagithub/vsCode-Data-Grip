import { useState } from 'react';
import { QueryResultTab, ResultSet } from '../../../../types';
import { vscode } from '../vscode';
import { rowsToCsv, rowsToTsv } from '../format';
import { ResultViewMode, useResultsStore } from '../store';

export function ResultToolbar({
  tab,
  resultSet,
  viewMode,
  canChart,
  isPlanTab,
  columnFiltersVisible,
  onSetViewMode,
  onToggleColumnFilters
}: {
  tab: QueryResultTab;
  resultSet?: ResultSet;
  viewMode: ResultViewMode;
  canChart: boolean;
  isPlanTab: boolean;
  columnFiltersVisible: boolean;
  onSetViewMode: (mode: ResultViewMode) => void;
  onToggleColumnFilters: () => void;
}) {
  const { pinTab } = useResultsStore();
  const rows = resultSet?.rows ?? [];
  const isRunning = tab.executionStatus === 'queued' || tab.executionStatus === 'running';
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'tsv'>('csv');
  const rerun = () => vscode.postMessage({ type: 'rerunTab', tabId: tab.id, maxRows: tab.maxRows ?? null });
  const exportText = () => {
    if (exportFormat === 'json') {
      return JSON.stringify(rows, null, 2);
    }
    return exportFormat === 'tsv' ? rowsToTsv(rows) : rowsToCsv(rows);
  };

  return (
    <div className="toolbar result-toolbar" role="toolbar" aria-label="Result actions">
      <div className="toolbar-group">
        <button className="tool icon-tool tone-green" title={isPlanTab ? 'Plan tabs are rerun from the editor' : 'Rerun query'} aria-label="Rerun query" onClick={rerun} disabled={isRunning || isPlanTab}>▶</button>
        <button className={`tool icon-tool ${tab.pinned ? 'tone-orange active' : ''}`} title={tab.pinned ? 'Unpin tab' : 'Pin tab'} aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'} onClick={() => pinTab(tab.id, !tab.pinned)}>⌖</button>
      </div>
      <span className="separator" />
      <div className="toolbar-group">
        <button
          className={`tool icon-tool ${viewMode === 'grid' ? 'active' : ''}`}
          title="Grid view"
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          onClick={() => onSetViewMode('grid')}
          disabled={isRunning || isPlanTab}
        >
          ▦
        </button>
        <button
          className={`tool icon-tool tone-purple ${viewMode === 'chart' ? 'active' : ''}`}
          title="Chart view"
          aria-label="Chart view"
          aria-pressed={viewMode === 'chart'}
          onClick={() => onSetViewMode('chart')}
          disabled={isRunning || !canChart || isPlanTab}
        >
          ⌁
        </button>
        <button
          className={`tool icon-tool ${columnFiltersVisible ? 'active' : ''}`}
          title="Show or hide column filters"
          aria-label="Show or hide column filters"
          aria-pressed={columnFiltersVisible}
          onClick={onToggleColumnFilters}
          disabled={viewMode !== 'grid' || isPlanTab}
        >
          <FilterIcon />
        </button>
        <button className="tool icon-tool tone-purple" title="Copy fetched rows as TSV" aria-label="Copy fetched rows as TSV" onClick={() => vscode.postMessage({ type: 'copy', text: rowsToTsv(rows) })} disabled={isRunning}>⧉</button>
        <select className="toolbar-select" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'csv' | 'json' | 'tsv')} title="Export format" aria-label="Export format">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="tsv">TSV</option>
        </select>
        <button className="tool icon-tool tone-green" title={`Copy fetched rows as ${exportFormat.toUpperCase()}`} aria-label={`Copy fetched rows as ${exportFormat.toUpperCase()}`} onClick={() => vscode.postMessage({ type: 'copy', text: exportText() })} disabled={isRunning}>⇩</button>
      </div>
      <span className="toolbar-spacer" />
      <span className="execution-pill" title={`${tab.executionStatus}${tab.executionTimeMs !== undefined ? ` - ${tab.executionTimeMs}ms` : ''}`}>
        <span className={`status-dot ${tab.executionStatus}`} />
        <span>{tab.executionStatus}</span>
      </span>
      <span className="muted command-label">{resultSet?.command ?? (isRunning ? 'Running query' : '')}</span>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg className="filter-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.5 3.5h11l-4.4 5v3.6l-2.2 1.1V8.5l-4.4-5Z" />
    </svg>
  );
}
