import { QueryResultTab, ResultSet } from '../../../../types';

export function StatusBar({ tab, resultSet }: { tab: QueryResultTab; resultSet?: ResultSet }) {
  return (
    <footer className="statusbar">
      <span>{tab.databaseType}</span>
      <span>{tab.databaseName}</span>
      <span>{tab.schemaName}</span>
      <span>{resultSet?.rowCount ?? tab.rowCount ?? 0} fetched rows</span>
      <span>{tab.maxRows ? `limit ${tab.maxRows}` : 'all rows'}</span>
      <span>{tab.executionTimeMs ?? resultSet?.durationMs ?? 0}ms</span>
      <span>{tab.executionStatus}</span>
    </footer>
  );
}
