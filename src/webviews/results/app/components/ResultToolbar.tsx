import { useState } from 'react';
import { QueryResultTab, ResultSet } from '../../../../types';
import { vscode } from '../vscode';
import { rowsToCsv, rowsToMarkdown, rowsToTsv } from '../format';
import { ResultViewMode, useResultsStore } from '../store';
import { Icon } from './Icon';

export function ResultToolbar({
  tab,
  resultSet,
  resultSetIndex,
  viewMode,
  canChart,
  isPlanTab,
  columnFiltersVisible,
  onSetViewMode,
  onToggleColumnFilters
}: {
  tab: QueryResultTab;
  resultSet?: ResultSet;
  resultSetIndex: number;
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
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'tsv' | 'markdown'>('csv');
  const rerun = () => vscode.postMessage({ type: 'rerunTab', tabId: tab.id, maxRows: tab.maxRows ?? null, offset: tab.rowOffset ?? 0 });
  const compare = () => vscode.postMessage({ type: 'compareTabs', resultSetIndex });
  const txMode = tab.transaction?.mode ?? 'auto';
  const txOpen = tab.transaction?.open ?? false;
  const exportText = () => {
    if (exportFormat === 'json') {
      return JSON.stringify(rows, null, 2);
    }
    if (exportFormat === 'tsv') {
      return rowsToTsv(rows);
    }
    if (exportFormat === 'markdown') {
      return rowsToMarkdown(rows);
    }
    return rowsToCsv(rows);
  };

  return (
    <div className="toolbar result-toolbar" role="toolbar" aria-label="Result actions">
      <div className="toolbar-group">
        <button className="tool icon-tool tone-green" title={isPlanTab ? 'Plan tabs are rerun from the editor' : 'Rerun query'} aria-label="Rerun query" onClick={rerun} disabled={isRunning || isPlanTab}><Icon name="play" /></button>
        <button className={`tool icon-tool ${tab.pinned ? 'tone-orange active' : ''}`} title={tab.pinned ? 'Unpin tab' : 'Pin tab'} aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'} onClick={() => pinTab(tab.id, !tab.pinned)}><Icon name={tab.pinned ? 'pinned' : 'pin'} /></button>
        <button className="tool icon-tool tone-purple" title="Compare result tabs" aria-label="Compare result tabs" onClick={compare} disabled={isRunning || isPlanTab || !resultSet}><Icon name="git-compare" /></button>
      </div>
      <span className="separator" />
      <div className="toolbar-group">
        <button
          className={`tool icon-tool ${txMode === 'manual' ? 'tone-red active' : 'tone-green'}`}
          title={txMode === 'manual' ? 'Switch to auto-commit' : 'Switch to manual commit'}
          aria-label={txMode === 'manual' ? 'Switch to auto-commit' : 'Switch to manual commit'}
          onClick={() => vscode.postMessage({ type: 'setTransactionMode', tabId: tab.id, mode: txMode === 'manual' ? 'auto' : 'manual' })}
          disabled={isRunning || isPlanTab}
        >
          {txMode === 'manual' ? 'Tx' : 'Tx'}
        </button>
        <button
          className={`tool icon-tool tone-green ${txOpen ? 'active' : ''}`}
          title="Commit transaction"
          aria-label="Commit transaction"
          onClick={() => vscode.postMessage({ type: 'commitTransaction', tabId: tab.id })}
          disabled={isRunning || isPlanTab || !txOpen}
        >
          <Icon name="check" />
        </button>
        <button
          className={`tool icon-tool tone-red ${txOpen ? 'active' : ''}`}
          title="Rollback transaction"
          aria-label="Rollback transaction"
          onClick={() => vscode.postMessage({ type: 'rollbackTransaction', tabId: tab.id })}
          disabled={isRunning || isPlanTab || !txOpen}
        >
          <Icon name="discard" />
        </button>
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
          <Icon name="table" />
        </button>
        <button
          className={`tool icon-tool tone-purple ${viewMode === 'chart' ? 'active' : ''}`}
          title="Chart view"
          aria-label="Chart view"
          aria-pressed={viewMode === 'chart'}
          onClick={() => onSetViewMode('chart')}
          disabled={isRunning || !canChart || isPlanTab}
        >
          <Icon name="graph-line" />
        </button>
        <button
          className={`tool icon-tool ${columnFiltersVisible ? 'active' : ''}`}
          title="Show or hide column filters"
          aria-label="Show or hide column filters"
          aria-pressed={columnFiltersVisible}
          onClick={onToggleColumnFilters}
          disabled={viewMode !== 'grid' || isPlanTab}
        >
          <Icon name="filter" />
        </button>
        <button className="tool icon-tool tone-purple" title="Copy fetched rows as TSV" aria-label="Copy fetched rows as TSV" onClick={() => vscode.postMessage({ type: 'copy', text: rowsToTsv(rows) })} disabled={isRunning}><Icon name="copy" /></button>
        <select className="toolbar-select" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'csv' | 'json' | 'tsv' | 'markdown')} title="Export format" aria-label="Export format">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="tsv">TSV</option>
          <option value="markdown">Markdown</option>
        </select>
        <button className="tool icon-tool tone-green" title={`Copy fetched rows as ${exportFormat.toUpperCase()}`} aria-label={`Copy fetched rows as ${exportFormat.toUpperCase()}`} onClick={() => vscode.postMessage({ type: 'copy', text: exportText() })} disabled={isRunning}><Icon name="desktop-download" /></button>
      </div>
      <span className="toolbar-spacer" />
      <span className="execution-pill" title={`${tab.executionStatus}${tab.executionTimeMs !== undefined ? ` - ${tab.executionTimeMs}ms` : ''}`}>
        <span className={`status-dot ${tab.executionStatus}`} />
        <span>{tab.executionStatus}</span>
        <span className={`tx-pill ${txMode === 'manual' ? 'manual' : 'auto'} ${txOpen ? 'open' : 'closed'}`}>{txMode === 'manual' ? (txOpen ? 'tx open' : 'tx idle') : 'auto'}</span>
      </span>
      <span className="muted command-label">{resultSet?.command ?? (isRunning ? 'Running query' : '')}</span>
    </div>
  );
}
