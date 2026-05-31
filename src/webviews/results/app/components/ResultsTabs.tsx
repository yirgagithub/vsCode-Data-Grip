import { QueryResultTab } from '../../../../types';
import { useResultsStore } from '../store';

export function ResultsTabs({ tabs, activeTabId }: { tabs: QueryResultTab[]; activeTabId?: string }) {
  const { activateTab, closeTab, pinTab, renameTab } = useResultsStore();

  return (
    <div className="tabs result-tabs" role="tablist" aria-label="SQL result tabs">
      <div className="tab-strip-leading" aria-hidden="true">
        <span className="codicon-lite console-icon">▣</span>
        <span>Output</span>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''} status-${tab.executionStatus}`}
          title={[
            tab.customTitle ?? tab.title,
            tab.executionTimeMs !== undefined ? `${tab.executionTimeMs}ms` : undefined,
            tab.rowCount !== undefined ? `${tab.rowCount} rows` : undefined,
            tab.executionStatus
          ].filter(Boolean).join(' - ')}
        >
          <button
            className="tab-main"
            onClick={() => activateTab(tab.id)}
            onDoubleClick={() => {
              const title = prompt('Tab title', tab.customTitle ?? tab.title);
              if (title) {
                renameTab(tab.id, title);
              }
            }}
            role="tab"
            aria-selected={tab.id === activeTabId}
            aria-label={`${tab.customTitle ?? tab.title}, ${tab.executionStatus}`}
          >
            <span className={`connection-dot ${tab.databaseType} status-${tab.executionStatus}`} />
            <span className="tab-object-icon" aria-hidden="true">▦</span>
            <span className="tab-title">{tab.customTitle ?? tab.title}</span>
          </button>
          <button
            type="button"
            className={`icon tab-icon-action ${tab.pinned ? 'on' : ''}`}
            title={tab.pinned ? 'Unpin result tab' : 'Pin result tab'}
            aria-label={tab.pinned ? 'Unpin result tab' : 'Pin result tab'}
            onClick={(event) => {
              event.stopPropagation();
              pinTab(tab.id, !tab.pinned);
            }}
          >
            ⌖
          </button>
          <button
            type="button"
            className="icon tab-icon-action close-action"
            title="Close"
            aria-label="Close result tab"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div className="tabs-overflow-shadow" aria-hidden="true" />
    </div>
  );
}
