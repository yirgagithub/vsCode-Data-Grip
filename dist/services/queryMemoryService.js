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
exports.NoopQueryMemoryService = exports.QueryMemoryService = void 0;
const vscode = __importStar(require("vscode"));
const queryMemorySearch_1 = require("./queryMemorySearch");
const queryMemoryMetadata_1 = require("./queryMemoryMetadata");
const queryConsoleHistory_1 = require("./queryConsoleHistory");
class QueryMemoryService {
    historyStore;
    memoryStore;
    consoleStore;
    connectionManager;
    summarizer;
    searcher = new queryMemorySearch_1.QueryMemorySearch();
    constructor(historyStore, memoryStore, consoleStore, connectionManager, summarizer) {
        this.historyStore = historyStore;
        this.memoryStore = memoryStore;
        this.consoleStore = consoleStore;
        this.connectionManager = connectionManager;
        this.summarizer = summarizer;
    }
    getAll() {
        return this.memoryStore.getAll();
    }
    async recordHistoryItem(item) {
        const id = this.historyMemoryId(item);
        const existing = this.memoryStore.get(id);
        if (existing?.historyIds?.includes(item.id)) {
            return;
        }
        await this.memoryStore.upsert(this.fromHistory(item, existing));
        const legacyId = this.legacyHistoryMemoryId(item);
        if (legacyId !== id) {
            await this.memoryStore.delete(legacyId);
        }
    }
    async search(request) {
        await this.syncFromHistory();
        await this.syncKnownDocuments();
        return this.searcher.search(this.queryConsoleMemoryItems(), request);
    }
    async backfillSummaries(options = {}) {
        const limit = options.limit && options.limit > 0 ? options.limit : 25;
        const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
        if (!this.summarizer) {
            return { ...result, skipped: limit };
        }
        const candidates = this.memoryStore.getAll()
            .filter((item) => item.summaryStatus !== 'ready')
            .slice(0, limit);
        for (const item of candidates) {
            if (options.token?.isCancellationRequested) {
                break;
            }
            result.processed += 1;
            if (!item.sql.trim()) {
                result.skipped += 1;
                await this.memoryStore.update(item.id, { summaryStatus: 'skipped', summaryError: 'Empty SQL.' });
                continue;
            }
            try {
                await this.memoryStore.update(item.id, { summaryStatus: 'pending', summaryError: undefined });
                const summary = await this.summarizer.summarizeQueryMemory({
                    sql: item.sql,
                    connectionName: item.connectionName,
                    databaseName: item.databaseName,
                    databaseType: item.databaseType,
                    outputColumns: item.outputColumns,
                    errorMessage: item.errorMessage
                });
                await this.memoryStore.update(item.id, {
                    title: summary.title,
                    summary: summary.summary,
                    tables: summary.tables.length ? summary.tables : item.tables,
                    columns: summary.columns.length ? summary.columns : item.columns,
                    summaryStatus: 'ready',
                    summaryError: undefined
                });
                result.succeeded += 1;
            }
            catch (error) {
                await this.memoryStore.update(item.id, {
                    summaryStatus: 'failed',
                    summaryError: error instanceof Error ? error.message : String(error)
                });
                result.failed += 1;
            }
        }
        return result;
    }
    async syncFromHistory() {
        for (const item of this.queryConsoleHistoryItems()) {
            await this.recordHistoryItem(item);
        }
    }
    async syncKnownDocuments() {
        const documentUris = new Set();
        for (const record of this.consoleStore.getAll()) {
            documentUris.add(record.documentUri);
        }
        for (const documentUri of documentUris) {
            await this.indexDocument(documentUri);
        }
    }
    async indexDocument(documentUri) {
        let sql = '';
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(documentUri));
            sql = Buffer.from(bytes).toString('utf8');
        }
        catch {
            return;
        }
        if (!sql.trim()) {
            return;
        }
        const id = this.documentMemoryId(documentUri);
        const existing = this.memoryStore.get(id);
        const now = Date.now();
        await this.memoryStore.upsert({
            id,
            sourceKind: 'document',
            sourceId: documentUri,
            sql,
            title: existing?.title,
            summary: existing?.summary,
            summaryStatus: existing?.summaryStatus ?? 'pending',
            summaryError: existing?.summaryError,
            tables: (0, queryMemoryMetadata_1.extractQueryTables)(sql),
            columns: (0, queryMemoryMetadata_1.extractQualifiedColumns)(sql),
            outputColumns: [],
            documentUri,
            sourceFile: this.fsPath(documentUri),
            indexedAt: existing?.indexedAt ?? now,
            updatedAt: now
        });
    }
    fromHistory(item, existing) {
        const connection = this.connectionManager.getConnection(item.connectionId);
        const now = Date.now();
        const lastExecutedAt = Math.max(existing?.lastExecutedAt ?? existing?.executedAt ?? 0, item.executedAt);
        const isLatest = item.executedAt >= (existing?.lastExecutedAt ?? existing?.executedAt ?? 0);
        return {
            id: this.historyMemoryId(item),
            sourceKind: 'history',
            sourceId: this.historyFingerprint(item),
            connectionId: item.connectionId,
            databaseType: item.databaseType,
            databaseName: connection?.database,
            connectionName: connection?.name,
            sql: item.sql,
            title: existing?.title ?? item.memoryTitle,
            summary: existing?.summary ?? item.memorySummary,
            summaryStatus: existing?.summaryStatus ?? item.memorySummaryStatus ?? 'pending',
            summaryError: existing?.summaryError ?? item.memorySummaryError,
            tables: this.mergeStrings(existing?.tables, item.tables?.length ? item.tables : (0, queryMemoryMetadata_1.extractQueryTables)(item.sql)),
            columns: this.mergeStrings(existing?.columns, item.columns?.length ? item.columns : (0, queryMemoryMetadata_1.extractQualifiedColumns)(item.sql)),
            outputColumns: this.mergeStrings(existing?.outputColumns, item.outputColumns ?? []),
            sourceFile: isLatest ? item.sourceFile : existing?.sourceFile,
            documentUri: isLatest ? item.documentUri : existing?.documentUri,
            sourceRange: isLatest ? item.sourceRange : existing?.sourceRange,
            favorite: existing?.favorite || item.favorite,
            status: isLatest ? item.status : existing?.status,
            errorMessage: isLatest ? item.errorMessage : existing?.errorMessage,
            rowCount: isLatest ? item.rowCount : existing?.rowCount,
            durationMs: isLatest ? item.durationMs : existing?.durationMs,
            executedAt: lastExecutedAt,
            firstExecutedAt: Math.min(existing?.firstExecutedAt ?? existing?.executedAt ?? item.executedAt, item.executedAt),
            lastExecutedAt,
            runCount: (existing?.runCount ?? existing?.historyIds?.length ?? 0) + 1,
            historyIds: [...(existing?.historyIds ?? []), item.id],
            latestHistoryId: isLatest ? item.id : existing?.latestHistoryId,
            indexedAt: existing?.indexedAt ?? now,
            updatedAt: now
        };
    }
    queryConsoleHistoryItems() {
        const consoleUris = (0, queryConsoleHistory_1.queryConsoleDocumentUris)(this.consoleStore.getAll());
        return this.historyStore.getAll().filter((item) => (0, queryConsoleHistory_1.isQueryConsoleHistoryItem)(item, consoleUris));
    }
    queryConsoleMemoryItems() {
        const consoleUris = (0, queryConsoleHistory_1.queryConsoleDocumentUris)(this.consoleStore.getAll());
        return this.memoryStore.getAll().filter((item) => (0, queryConsoleHistory_1.isQueryConsoleMemoryItem)(item, consoleUris));
    }
    historyMemoryId(item) {
        return `memory_${this.hash(this.historyFingerprint(item))}`;
    }
    legacyHistoryMemoryId(item) {
        return `memory_${item.id}`;
    }
    historyFingerprint(item) {
        return `${item.connectionId}:${this.normalizeSql(item.sql)}`;
    }
    normalizeSql(sql) {
        return sql
            .replace(/--.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/;+$/g, '')
            .toLowerCase();
    }
    mergeStrings(first = [], second = []) {
        return [...new Set([...first, ...second].filter(Boolean))];
    }
    documentMemoryId(documentUri) {
        return `memory_doc_${this.hash(documentUri)}`;
    }
    hash(value) {
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
        }
        return Math.abs(hash).toString(36);
    }
    fsPath(documentUri) {
        try {
            return vscode.Uri.parse(documentUri).fsPath;
        }
        catch {
            return undefined;
        }
    }
}
exports.QueryMemoryService = QueryMemoryService;
class NoopQueryMemoryService {
    async recordHistoryItem(_item) { }
}
exports.NoopQueryMemoryService = NoopQueryMemoryService;
//# sourceMappingURL=queryMemoryService.js.map