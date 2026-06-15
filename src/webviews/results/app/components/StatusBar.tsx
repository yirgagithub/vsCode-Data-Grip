import { QueryResultTab, ResultSet } from '../../../../types';

export function StatusBar({ tab, resultSet }: { tab: QueryResultTab; resultSet?: ResultSet }) {
  const isRunning = tab.executionStatus === 'queued' || tab.executionStatus === 'running';
  const isPlan = !!tab.plan;
  const txMode = tab.transaction?.mode ?? 'auto';
  const txOpen = tab.transaction?.open ?? false;
  return (
    <footer className="statusbar">
      <span className="statusbar-item strong">{tab.databaseType}</span>
      <span className="statusbar-item">{tab.databaseName ?? 'database'}</span>
      <span className="statusbar-item">{tab.schemaName ?? 'schema'}</span>
      <span className="statusbar-spacer" />
      <span className="statusbar-item">{isRunning ? 'loading rows' : isPlan ? `${tab.plan?.format ?? 'plan'} plan` : `${(resultSet?.rowCount ?? tab.rowCount ?? 0).toLocaleString()} rows`}</span>
      <span className="statusbar-item">{isPlan ? (tab.plan?.analyze ? 'analyze' : 'estimate') : tab.maxRows ? `limit ${tab.maxRows.toLocaleString()} @ ${tab.rowOffset ?? 0}` : 'all rows'}</span>
      <span className="statusbar-item">{txMode === 'manual' ? (txOpen ? 'tx open' : 'tx idle') : 'auto-commit'}</span>
      <span className="statusbar-item">execution: {isRunning ? 'running' : `${(tab.executionTimeMs ?? resultSet?.durationMs ?? 0).toLocaleString()} ms`}</span>
      <span className={`statusbar-item status-text ${tab.executionStatus}`}>{tab.executionStatus}</span>
    </footer>
  );
}
