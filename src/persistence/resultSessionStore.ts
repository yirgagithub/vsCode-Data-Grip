import * as vscode from 'vscode';
import { QueryResultTab } from '../types';

const TABS_KEY = 'database.resultTabs';

export class ResultSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getTabs(): QueryResultTab[] {
    return this.context.workspaceState.get<QueryResultTab[]>(TABS_KEY, []);
  }

  async saveTabs(tabs: QueryResultTab[]): Promise<void> {
    const persistPinned = vscode.workspace.getConfiguration('database').get<boolean>('resultTabs.persistPinned', true);
    const persisted = persistPinned
      ? tabs.filter((tab) => tab.pinned && !['queued', 'running'].includes(tab.executionStatus)).map((tab) => ({
          ...tab,
          resultSets: tab.resultSets.map((set) => set.rows.length <= 1000 ? set : { ...set, rows: [], rowCount: set.rowCount })
        }))
      : [];
    await this.context.workspaceState.update(TABS_KEY, persisted);
  }
}
