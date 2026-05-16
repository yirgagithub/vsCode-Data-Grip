import { QueryResultTab } from '../../../../types';
import { useResultsStore } from '../store';

export function ResultsTabs({ tabs, activeTabId }: { tabs: QueryResultTab[]; activeTabId?: string }) {
  const { activateTab, closeTab, pinTab, renameTab } = useResultsStore();

  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''} status-${tab.executionStatus}`}
          onClick={() => activateTab(tab.id)}
          onDoubleClick={() => {
            const title = prompt('Tab title', tab.customTitle ?? tab.title);
            if (title) {
              renameTab(tab.id, title);
            }
          }}
          role="tab"
        >
          <span className={`connection-dot ${tab.databaseType}`} />
          <span className="tab-title">{tab.customTitle ?? tab.title}</span>
          {tab.executionTimeMs !== undefined && <span className="muted">{tab.executionTimeMs}ms</span>}
          {tab.rowCount !== undefined && <span className="muted">{tab.rowCount} rows</span>}
          <span
            className={`icon ${tab.pinned ? 'on' : ''}`}
            title={tab.pinned ? 'Unpin' : 'Pin'}
            onClick={(event) => {
              event.stopPropagation();
              pinTab(tab.id, !tab.pinned);
            }}
          >
            {tab.pinned ? 'Pinned' : 'Pin'}
          </span>
          <span
            className="icon"
            title="Close"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          >
            x
          </span>
        </button>
      ))}
    </div>
  );
}
