import { QueryResultTab } from '../../types';

export type ResultsToWebviewMessage =
  | { type: 'hydrate'; tabs: QueryResultTab[]; activeTabId?: string }
  | { type: 'upsertTab'; tab: QueryResultTab; active: boolean }
  | { type: 'setRunning'; running: boolean };

export type ResultsFromWebviewMessage =
  | { type: 'ready' }
  | { type: 'pinTab'; tabId: string; pinned: boolean }
  | { type: 'closeTab'; tabId: string }
  | { type: 'activateTab'; tabId: string }
  | { type: 'renameTab'; tabId: string; title: string }
  | { type: 'rerunTab'; tabId: string; maxRows?: number | null; offset?: number | null }
  | { type: 'setTransactionMode'; tabId: string; mode: 'auto' | 'manual' }
  | { type: 'commitTransaction'; tabId: string }
  | { type: 'rollbackTransaction'; tabId: string }
  | { type: 'compareTabs'; resultSetIndex: number }
  | {
      type: 'mutation';
      kind: 'edit-cell' | 'insert-row' | 'delete-row';
      row?: Record<string, unknown>;
      updatedRow?: Record<string, unknown>;
      column?: string;
      valueText?: string;
      rowText?: string;
    }
  | { type: 'copy'; text: string };
