import { create } from 'zustand';
import { QueryResultTab } from '../../../types';
import { vscode } from './vscode';

export type ResultViewMode = 'grid' | 'chart';

interface ResultsState {
  tabs: QueryResultTab[];
  activeTabId?: string;
  viewModes: Record<string, ResultViewMode>;
  setTabs: (tabs: QueryResultTab[], activeTabId?: string) => void;
  upsertTab: (tab: QueryResultTab, active: boolean) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  pinTab: (tabId: string, pinned: boolean) => void;
  renameTab: (tabId: string, title: string) => void;
  setViewMode: (tabId: string, mode: ResultViewMode) => void;
}

export const useResultsStore = create<ResultsState>((set) => ({
  tabs: [],
  activeTabId: undefined,
  viewModes: {},
  setTabs: (tabs, activeTabId) => set({ tabs, activeTabId: activeTabId ?? tabs[0]?.id }),
  upsertTab: (tab, active) => set((state) => {
    const exists = state.tabs.some((item) => item.id === tab.id);
    return {
      tabs: exists ? state.tabs.map((item) => item.id === tab.id ? tab : item) : [...state.tabs, tab],
      activeTabId: active ? tab.id : state.activeTabId
    };
  }),
  activateTab: (tabId) => {
    vscode.postMessage({ type: 'activateTab', tabId });
    set({ activeTabId: tabId });
  },
  closeTab: (tabId) => {
    vscode.postMessage({ type: 'closeTab', tabId });
    set((state) => {
      const { [tabId]: _closed, ...viewModes } = state.viewModes;
      return {
        tabs: state.tabs.filter((tab) => tab.id !== tabId),
        activeTabId: state.tabs.find((tab) => tab.id !== tabId)?.id,
        viewModes
      };
    });
  },
  pinTab: (tabId, pinned) => {
    vscode.postMessage({ type: 'pinTab', tabId, pinned });
    set((state) => ({ tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, pinned } : tab) }));
  },
  renameTab: (tabId, title) => {
    vscode.postMessage({ type: 'renameTab', tabId, title });
    set((state) => ({ tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, customTitle: title } : tab) }));
  },
  setViewMode: (tabId, mode) => {
    set((state) => ({ viewModes: { ...state.viewModes, [tabId]: mode } }));
  }
}));
