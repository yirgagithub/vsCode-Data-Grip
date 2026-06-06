import { useEffect, useState } from 'react';
import { useResultsStore } from './store';
import { vscode } from './vscode';
import { ResultsTabs } from './components/ResultsTabs';
import { ResultToolbar } from './components/ResultToolbar';
import { ResultGrid } from './components/ResultGrid';
import { MessagesPanel } from './components/MessagesPanel';
import { StatusBar } from './components/StatusBar';
import { QueryResultTab } from '../../../types';

export function App() {
  const { tabs, activeTabId, setTabs, upsertTab } = useResultsStore();
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const [activeResultSetIndex, setActiveResultSetIndex] = useState(0);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data as { type: string; tabs?: QueryResultTab[]; activeTabId?: string; tab?: QueryResultTab; active?: boolean };
      if (message.type === 'hydrate') {
        setTabs(message.tabs ?? [], message.activeTabId);
      }
      if (message.type === 'upsertTab' && message.tab) {
        upsertTab(message.tab, message.active ?? false);
      }
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, [setTabs, upsertTab]);

  if (!active) {
    return (
      <main className="empty app-empty">
        <div className="empty-panel">
          <span className="empty-icon">▦</span>
          <span>Run a query to see results</span>
        </div>
      </main>
    );
  }

  const resultSet = active.resultSets[activeResultSetIndex] ?? active.resultSets[active.activeResultSetIndex] ?? active.resultSets[0];
  const isRunning = active.executionStatus === 'queued' || active.executionStatus === 'running';

  return (
    <main className="app">
      <ResultsTabs tabs={tabs} activeTabId={active.id} />
      <ResultToolbar tab={active} resultSet={resultSet} />
      <div className="resultset-tabs">
        {active.resultSets.length > 0 ? active.resultSets.map((set, index) => (
          <button
            key={set.id}
            className={index === activeResultSetIndex ? 'active' : ''}
            onClick={() => setActiveResultSetIndex(index)}
            title={`${set.command ?? 'Result'} - ${set.rowCount} rows`}
          >
            <span className="resultset-icon">▦</span>
            <span>{set.command ?? 'Result'}</span>
            <span className="resultset-count">{set.rowCount.toLocaleString()} rows</span>
          </button>
        )) : <span className="muted resultset-empty-label">{isRunning ? 'Running' : 'Messages'}</span>}
      </div>
      {isRunning ? <RunningPanel /> : active.executionStatus === 'failed' ? <MessagesPanel tab={active} /> : <ResultGrid tab={active} resultSet={resultSet} />}
      <StatusBar tab={active} resultSet={resultSet} />
    </main>
  );
}

function RunningPanel() {
  return (
    <section className="grid-empty result-loading" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>Running query...</span>
    </section>
  );
}
