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
exports.QueryHistoryStore = void 0;
const vscode = __importStar(require("vscode"));
const HISTORY_KEY = 'database.queryHistory';
class QueryHistoryStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.workspaceState.get(HISTORY_KEY, []);
    }
    async add(item) {
        const maxItems = vscode.workspace.getConfiguration('database').get('history.maxItems', 1000);
        const history = [item, ...this.getAll().filter((existing) => existing.id !== item.id)].slice(0, maxItems);
        await this.context.workspaceState.update(HISTORY_KEY, history);
    }
    async update(item) {
        await this.context.workspaceState.update(HISTORY_KEY, this.getAll().map((existing) => existing.id === item.id ? item : existing));
    }
    async delete(id) {
        await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => item.id !== id));
    }
    async deleteMany(ids) {
        const idSet = new Set(ids);
        if (!idSet.size) {
            return;
        }
        await this.context.workspaceState.update(HISTORY_KEY, this.getAll().filter((item) => !idSet.has(item.id)));
    }
}
exports.QueryHistoryStore = QueryHistoryStore;
//# sourceMappingURL=queryHistoryStore.js.map