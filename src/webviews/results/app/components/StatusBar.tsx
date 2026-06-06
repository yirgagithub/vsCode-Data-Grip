import { QueryResultTab, ResultSet } from '../../../../types';

export function StatusBar({ tab, resultSet }: { tab: QueryResultTab; resultSet?: ResultSet }) {
  const isRunning = tab.executionStatus === 'queued' || tab.executionStatus === 'running';
  return (
    <footer className="statusbar">
      <span className="statusbar-item strong">{tab.databaseType}</span>
      <span className="statusbar-item">{tab.databaseName ?? 'database'}</span>
      <span className="statusbar-item">{tab.schemaName ?? 'schema'}</span>
      <span className="statusbar-spacer" />
      <span className="statusbar-item">{isRunning ? 'loading rows' : `${(resultSet?.rowCount ?? tab.rowCount ?? 0).toLocaleString()} rows`}</span>
      <span className="statusbar-item">{tab.maxRows ? `limit ${tab.maxRows.toLocaleString()}` : 'all rows'}</span>
      <span className="statusbar-item">execution: {isRunning ? 'running' : `${(tab.executionTimeMs ?? resultSet?.durationMs ?? 0).toLocaleString()} ms`}</span>
      <span className={`statusbar-item status-text ${tab.executionStatus}`}>{tab.executionStatus}</span>
    </footer>
  );
}
