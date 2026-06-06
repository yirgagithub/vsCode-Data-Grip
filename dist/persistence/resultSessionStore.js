"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultSessionStore = void 0;
const vscode = __importStar(require("vscode"));
const TABS_KEY = 'database.resultTabs';
class ResultSessionStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getTabs() {
        return this.context.workspaceState.get(TABS_KEY, []);
    }
    async saveTabs(tabs) {
        const persistPinned = vscode.workspace.getConfiguration('database').get('resultTabs.persistPinned', true);
        const persisted = persistPinned
            ? tabs.filter((tab) => tab.pinned && !['queued', 'running'].includes(tab.executionStatus)).map((tab) => ({
                ...tab,
                resultSets: tab.resultSets.map((set) => set.rows.length <= 1000 ? set : { ...set, rows: [], rowCount: set.rowCount })
            }))
            : [];
        await this.context.workspaceState.update(TABS_KEY, persisted);
    }
}
exports.ResultSessionStore = ResultSessionStore;
//# sourceMappingURL=resultSessionStore.js.map