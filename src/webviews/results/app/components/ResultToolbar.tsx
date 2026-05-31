import { useEffect, useMemo, useState } from 'react';
import { QueryResultTab, ResultSet } from '../../../../types';
import { vscode } from '../vscode';
import { rowsToCsv, rowsToTsv } from '../format';
import { useResultsStore } from '../store';

export function ResultToolbar({ tab, resultSet }: { tab: QueryResultTab; resultSet?: ResultSet }) {
  const { pinTab } = useResultsStore();
  const rows = resultSet?.rows ?? [];
  const [maxRows, setMaxRows] = useState<number | undefined>(tab.maxRows);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'tsv'>('csv');
  const limitValue = useMemo(() => {
    if (!maxRows) {
      return 'all';
    }
    return ['500', '1000', '5000'].includes(String(maxRows)) ? String(maxRows) : 'custom';
  }, [maxRows]);

  useEffect(() => {
    setMaxRows(tab.maxRows);
  }, [tab.id, tab.maxRows]);

  const rerun = () => vscode.postMessage({ type: 'rerunTab', tabId: tab.id, maxRows: maxRows ?? null });
  const changeLimit = (value: string) => {
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
    return exportFormat === 'tsv' ? rowsToTsv(rows) : rowsToCsv(rows);
  };

  return (
    <div className="toolbar result-toolbar" role="toolbar" aria-label="Result actions">
      <div className="toolbar-group">
        <button className="tool icon-tool tone-green active" title="Grid view" aria-label="Grid view">▦</button>
        <button className="tool icon-tool" title="Chart view" aria-label="Chart view" disabled>◌</button>
      </div>
      <span className="separator" />
      <div className="toolbar-group">
        <button className="tool icon-tool tone-green" title="Rerun query" aria-label="Rerun query" onClick={rerun}>▶</button>
        <button className="tool icon-tool tone-red" title="Stop query" aria-label="Stop query" disabled>■</button>
        <button className={`tool icon-tool ${tab.pinned ? 'tone-orange active' : ''}`} title={tab.pinned ? 'Unpin tab' : 'Pin tab'} aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'} onClick={() => pinTab(tab.id, !tab.pinned)}>⌖</button>
      </div>
      <span className="separator" />
      <label className="limit-control" title="Rows fetched by the next run">
        <span>Rows</span>
        <select value={limitValue} onChange={(event) => changeLimit(event.target.value)}>
          <option value="500">500</option>
          <option value="1000">1,000</option>
          <option value="5000">5,000</option>
          <option value="all">All</option>
          <option value="custom">{maxRows && !['500', '1000', '5000'].includes(String(maxRows)) ? maxRows.toLocaleString() : 'Custom...'}</option>
        </select>
      </label>
      <span className="separator" />
      <div className="toolbar-group">
        <button className="tool icon-tool" title="Search in result" aria-label="Search in result" disabled>⌕</button>
        <button className="tool icon-tool" title="Filter columns" aria-label="Filter columns" disabled>▽</button>
        <button className="tool icon-tool tone-purple" title="Copy fetched rows as TSV" aria-label="Copy fetched rows as TSV" onClick={() => vscode.postMessage({ type: 'copy', text: rowsToTsv(rows) })}>⧉</button>
        <select className="toolbar-select" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'csv' | 'json' | 'tsv')} title="Export format" aria-label="Export format">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="tsv">TSV</option>
        </select>
        <button className="tool icon-tool tone-green" title={`Copy fetched rows as ${exportFormat.toUpperCase()}`} aria-label={`Copy fetched rows as ${exportFormat.toUpperCase()}`} onClick={() => vscode.postMessage({ type: 'copy', text: exportText() })}>⇩</button>
      </div>
      <span className="toolbar-spacer" />
      <span className="execution-pill" title={`${tab.executionStatus}${tab.executionTimeMs !== undefined ? ` - ${tab.executionTimeMs}ms` : ''}`}>
        <span className={`status-dot ${tab.executionStatus}`} />
        <span>{tab.executionStatus}</span>
      </span>
      <span className="muted command-label">{resultSet?.command ?? ''}</span>
    </div>
  );
}
