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
        if (!this.connectionManager.isConnected(params.connectionId)) {
            await this.connectionManager.connect(params.connectionId);
        }
        await this.confirmDestructiveIfNeeded(config.production === true, params.sql);
        const started = Date.now();
        const tabId = (0, id_1.createId)('tab');
        const statements = (0, sqlSplitter_1.splitSqlStatements)(params.sql);
        const sqlParts = statements.length ? statements.map((statement) => statement.sql) : [params.sql];
        const resultSets = [];
        try {
            for (const [index, sql] of sqlParts.entries()) {
                const result = await this.connectionManager.getDriver(config.type).executeQuery({ ...params, sql });
                resultSets.push({
                    id: result.executionId,
                    title: sqlParts.length > 1 ? `Result ${index + 1}` : this.resultTitle(params.sql, params.source?.fileName),
                    fields: result.fields,
                    rows: result.rows,
                    rowCount: result.rowCount,
                    maxRows: params.maxRows,
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
            await this.historyStore.add(historyItem);
            await this.recorder?.recordHistoryItem(historyItem);
            return {
                id: tabId,
                title: this.resultTitle(params.sql, params.source?.fileName),
                pinned: false,
                connectionId: config.id,
                databaseType: config.type,
                databaseName: config.database,
                schemaName: config.defaultSchema,
                queryText: params.sql,
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
                resultSets,
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
            const historyItem = {
                id: (0, id_1.createId)('history'),
                connectionId: config.id,
                databaseType: config.type,
                sql: params.sql,
                sourceFile: params.source?.fileName,
                documentUri: params.source?.documentUri,
                schemaName: config.defaultSchema,
                sourceRange: params.source?.range,
                favorite: false,
                executedAt: started,
                durationMs: Date.now() - started,
                status: 'failed',
                errorMessage: queryError.message,
                tables: (0, queryMemoryMetadata_1.extractQueryTables)(params.sql),
                columns: (0, queryMemoryMetadata_1.extractQualifiedColumns)(params.sql)
            };
            await this.historyStore.add(historyItem);
            await this.recorder?.recordHistoryItem(historyItem);
            return {
                id: tabId,
                title: this.resultTitle(params.sql, params.source?.fileName),
                pinned: false,
                connectionId: config.id,
                databaseType: config.type,
                databaseName: config.database,
                schemaName: config.defaultSchema,
                queryText: params.sql,
                sourceFile: params.source?.fileName,
                sourceDocumentUri: params.source?.documentUri,
                sourceQueryId: params.source?.queryId,
                sourceSectionIndex: params.source?.sectionIndex,
                sourceRange: params.source?.range,
                executionStatus: 'failed',
                executionStartedAt: started,
                executionFinishedAt: Date.now(),
                executionTimeMs: Date.now() - started,
                maxRows: params.maxRows,
                error: queryError,
                resultSets: [],
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
//# sourceMappingURL=queryExecutor.js.map