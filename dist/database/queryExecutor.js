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
exports.QueryExecutor = void 0;
const vscode = __importStar(require("vscode"));
const sqlSplitter_1 = require("./sqlSplitter");
const id_1 = require("../utils/id");
const queryMemoryMetadata_1 = require("../services/queryMemoryMetadata");
const sqlSafetyClassifier_1 = require("../services/sqlSafetyClassifier");
class QueryExecutor {
    connectionManager;
    historyStore;
    recorder;
    safety;
    constructor(connectionManager, historyStore, recorder, safety = new sqlSafetyClassifier_1.SqlSafetyClassifier()) {
        this.connectionManager = connectionManager;
        this.historyStore = historyStore;
        this.recorder = recorder;
        this.safety = safety;
    }
    async execute(params) {
        const config = this.connectionManager.getConnection(params.connectionId);
        if (!config) {
            throw new Error('Connection not found.');
        }
        const started = Date.now();
        const tabId = (0, id_1.createId)('tab');
        const resultSets = [];
        const transactionMode = this.connectionManager.getTransactionMode(params.connectionId);
        let effectiveTransactionMode = params.transactionMode ?? transactionMode;
        try {
            if (!this.connectionManager.isConnected(params.connectionId)) {
                await this.connectionManager.connect(params.connectionId);
            }
            if (config.readOnlyDefault && !isReadOnlySql(params.sql)) {
                throw new Error('This connection is read-only by default and only accepts SELECT-style queries.');
            }
            await this.confirmDestructiveIfNeeded(config.production === true, params.sql);
            if (effectiveTransactionMode === 'manual' && !this.connectionManager.isTransactionOpen(params.connectionId)) {
                await this.connectionManager.beginTransaction(params.connectionId);
            }
            const statements = (0, sqlSplitter_1.splitSqlStatements)(params.sql);
            const sqlParts = statements.length ? statements.map((statement) => statement.sql) : [params.sql];
            const results = await this.connectionManager.getDriver(config.type).executeStatements(params, sqlParts);
            for (const [index, result] of results.entries()) {
                const maxRows = params.maxRows && params.maxRows > 0 ? Math.floor(params.maxRows) : undefined;
                const rows = maxRows ? result.rows.slice(0, maxRows) : result.rows;
                resultSets.push({
                    id: result.executionId,
                    title: sqlParts.length > 1 ? `Result ${index + 1}` : this.resultTitle(sqlParts[index] ?? params.sql, params.source?.fileName),
                    fields: result.fields,
                    rows,
                    rowCount: rows.length,
                    maxRows,
                    hasMore: maxRows ? result.rowCount > rows.length : false,
                    command: result.command,
                    durationMs: result.durationMs
                });
            }
            const durationMs = Date.now() - started;
            const historyItem = {
                id: (0, id_1.createId)('history'),
                connectionId: config.id,
                databaseType: config.type,
                sql: params.sql,
                sourceOrigin: params.source?.origin,
                sourceFile: params.source?.fileName,
                documentUri: params.source?.documentUri,
                schemaName: config.defaultSchema,
                sourceRange: params.source?.range,
                favorite: false,
                executedAt: started,
                durationMs,
                rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
                status: 'completed',
                outputColumns: (0, queryMemoryMetadata_1.outputColumnNames)(resultSets[0]?.fields),
                tables: (0, queryMemoryMetadata_1.extractQueryTables)(params.sql),
                columns: (0, queryMemoryMetadata_1.extractQualifiedColumns)(params.sql)
            };
            await this.recordHistory(params, historyItem);
            return {
                id: tabId,
                title: this.resultTitle(params.sql, params.source?.fileName),
                pinned: false,
                connectionId: config.id,
                databaseType: config.type,
                databaseName: config.database,
                schemaName: config.defaultSchema,
                queryText: params.sql,
                sourceOrigin: params.source?.origin,
                sourceFile: params.source?.fileName,
                sourceDocumentUri: params.source?.documentUri,
                sourceQueryId: params.source?.queryId,
                sourceSectionIndex: params.source?.sectionIndex,
                sourceRange: params.source?.range,
                executionStatus: 'completed',
                executionStartedAt: started,
                executionFinishedAt: Date.now(),
                executionTimeMs: durationMs,
                rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
                maxRows: params.maxRows,
                rowOffset: params.offset && params.offset > 0 ? Math.floor(params.offset) : 0,
                resultSets,
                transaction: {
                    mode: effectiveTransactionMode,
                    open: this.connectionManager.isTransactionOpen(config.id)
                },
                activeResultSetIndex: 0,
                filters: [],
                sort: [],
                columnState: [],
                createdAt: started,
                updatedAt: Date.now()
            };
        }
        catch (error) {
            const queryError = this.toQueryError(error);
            const cancelled = params.isCancellationRequested?.() === true || isCancellationError(error);
            const historyItem = {
                id: (0, id_1.createId)('history'),
                connectionId: config.id,
                databaseType: config.type,
                sql: params.sql,
                sourceOrigin: params.source?.origin,
                sourceFile: params.source?.fileName,
                documentUri: params.source?.documentUri,
                schemaName: config.defaultSchema,
                sourceRange: params.source?.range,
                favorite: false,
                executedAt: started,
                durationMs: Date.now() - started,
                status: cancelled ? 'cancelled' : 'failed',
                errorMessage: cancelled ? undefined : queryError.message,
                tables: (0, queryMemoryMetadata_1.extractQueryTables)(params.sql),
                columns: (0, queryMemoryMetadata_1.extractQualifiedColumns)(params.sql)
            };
            await this.recordHistory(params, historyItem);
            return {
                id: tabId,
                title: this.resultTitle(params.sql, params.source?.fileName),
                pinned: false,
                connectionId: config.id,
                databaseType: config.type,
                databaseName: config.database,
                schemaName: config.defaultSchema,
                queryText: params.sql,
                sourceOrigin: params.source?.origin,
                sourceFile: params.source?.fileName,
                sourceDocumentUri: params.source?.documentUri,
                sourceQueryId: params.source?.queryId,
                sourceSectionIndex: params.source?.sectionIndex,
                sourceRange: params.source?.range,
                executionStatus: cancelled ? 'cancelled' : 'failed',
                executionStartedAt: started,
                executionFinishedAt: Date.now(),
                executionTimeMs: Date.now() - started,
                maxRows: params.maxRows,
                rowOffset: params.offset && params.offset > 0 ? Math.floor(params.offset) : 0,
                error: cancelled ? undefined : queryError,
                resultSets: [],
                transaction: {
                    mode: effectiveTransactionMode,
                    open: this.connectionManager.isTransactionOpen(config.id)
                },
                activeResultSetIndex: 0,
                filters: [],
                sort: [],
                columnState: [],
                createdAt: started,
                updatedAt: Date.now()
            };
        }
    }
    async cancel(connectionId, executionId) {
        const driver = this.connectionManager.getDriverByConnectionId(connectionId);
        await driver.cancelQuery(executionId);
    }
    resultTitle(sql, fileName) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
        const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? 'SQL';
        if (from) {
            return `${keyword} ${from.replace(/"/g, '')}`;
        }
        if (normalized) {
            return keyword;
        }
        return fileName?.split(/[\\/]/).pop() ?? 'SQL';
    }
    async recordHistory(params, item) {
        if (params.source?.origin !== 'queryConsole') {
            return;
        }
        await this.historyStore.add(item);
        await this.recorder?.recordHistoryItem(item);
    }
    async confirmDestructiveIfNeeded(isProduction, sql) {
        const confirm = vscode.workspace.getConfiguration('database').get('safety.confirmDestructiveQueries', true);
        const warnAll = vscode.workspace.getConfiguration('database').get('safety.confirmDestructiveQueriesOnAllConnections', false);
        if (!confirm || (!isProduction && !warnAll)) {
            return;
        }
        const assessment = this.safety.classify(sql, { production: isProduction });
        if (!assessment.requiresConfirmation) {
            return;
        }
        const target = isProduction ? 'production connection' : 'connection';
        const detail = assessment.reasons.length ? ` ${assessment.reasons.join(' ')}` : '';
        const answer = await vscode.window.showWarningMessage(`This looks risky on a ${target}.${detail}`, { modal: true }, 'Run Anyway');
        if (answer !== 'Run Anyway') {
            throw new Error('Query cancelled by safety confirmation.');
        }
    }
    toQueryError(error) {
        const pgError = error;
        return {
            message: pgError.message ?? String(error),
            code: pgError.code,
            detail: pgError.detail,
            hint: pgError.hint,
            position: pgError.position,
            where: pgError.where
        };
    }
}
exports.QueryExecutor = QueryExecutor;
function isReadOnlySql(sql) {
    const statements = (0, sqlSplitter_1.splitSqlStatements)(sql).map((statement) => statement.sql.trim()).filter(Boolean);
    const parts = statements.length ? statements : [sql.trim()].filter(Boolean);
    return parts.every((statement) => /^(select|with|values|show|describe|explain)\b/i.test(statement));
}
function isCancellationError(error) {
    const record = error;
    const code = typeof record?.code === 'string' ? record.code : undefined;
    const errno = typeof record?.errno === 'number' ? record.errno : undefined;
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(record?.message ?? '');
    if (/statement timeout/i.test(message)) {
        return false;
    }
    return (code === '57014' && /\b(user request|canceling statement)\b/i.test(message)) ||
        code === 'ER_QUERY_INTERRUPTED' ||
        errno === 1317 ||
        /\b(cancelled|canceled|canceling statement|cancelled by safety confirmation|query execution was interrupted|query interrupted)\b/i.test(message);
}
//# sourceMappingURL=queryExecutor.js.map