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
exports.QueryMemoryStore = void 0;
const vscode = __importStar(require("vscode"));
const MEMORY_KEY = 'database.queryMemory';
class QueryMemoryStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.workspaceState.get(MEMORY_KEY, []);
    }
    get(id) {
        return this.getAll().find((item) => item.id === id);
    }
    async upsert(item) {
        const maxItems = vscode.workspace.getConfiguration('database').get('queryMemory.maxItems', 2000);
        const next = [item, ...this.getAll().filter((existing) => existing.id !== item.id)]
            .sort((a, b) => (b.executedAt ?? b.updatedAt) - (a.executedAt ?? a.updatedAt))
            .slice(0, Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 2000);
        await this.context.workspaceState.update(MEMORY_KEY, next);
    }
    async update(id, patch) {
        const now = Date.now();
        await this.context.workspaceState.update(MEMORY_KEY, this.getAll().map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item)));
    }
    async delete(id) {
        await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => item.id !== id));
    }
    async deleteMany(ids) {
        const idSet = new Set(ids);
        if (!idSet.size) {
            return;
        }
        await this.context.workspaceState.update(MEMORY_KEY, this.getAll().filter((item) => !idSet.has(item.id)));
    }
}
exports.QueryMemoryStore = QueryMemoryStore;
//# sourceMappingURL=queryMemoryStore.js.map