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
          title={[
            tab.customTitle ?? tab.title,
            tab.executionTimeMs !== undefined ? `${tab.executionTimeMs}ms` : undefined,
            tab.rowCount !== undefined ? `${tab.rowCount} rows` : undefined,
            tab.executionStatus
          ].filter(Boolean).join(' - ')}
        >
          <span className={`connection-dot ${tab.databaseType}`} />
          <span className="tab-title">{tab.customTitle ?? tab.title}</span>
          <span
            className={`icon ${tab.pinned ? 'on' : ''}`}
            title={tab.pinned ? 'Unpin' : 'Pin'}
            onClick={(event) => {
              event.stopPropagation();
              pinTab(tab.id, !tab.pinned);
            }}
          >
            ⌖
          </span>
          <span
            className="icon"
            title="Close"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
