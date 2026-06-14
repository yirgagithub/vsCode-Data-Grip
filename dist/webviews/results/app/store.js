"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useResultsStore = void 0;
const zustand_1 = require("zustand");
const vscode_1 = require("./vscode");
exports.useResultsStore = (0, zustand_1.create)((set) => ({
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
        vscode_1.vscode.postMessage({ type: 'activateTab', tabId });
        set({ activeTabId: tabId });
    },
    closeTab: (tabId) => {
        vscode_1.vscode.postMessage({ type: 'closeTab', tabId });
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
        vscode_1.vscode.postMessage({ type: 'pinTab', tabId, pinned });
        set((state) => ({ tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, pinned } : tab) }));
    },
    renameTab: (tabId, title) => {
        vscode_1.vscode.postMessage({ type: 'renameTab', tabId, title });
        set((state) => ({ tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, customTitle: title } : tab) }));
    },
    setViewMode: (tabId, mode) => {
        set((state) => ({ viewModes: { ...state.viewModes, [tabId]: mode } }));
    }
}));
//# sourceMappingURL=store.js.map