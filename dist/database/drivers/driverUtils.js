"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicDatabaseDriver = void 0;
exports.executionResultFromRows = executionResultFromRows;
exports.emptyExecutionResult = emptyExecutionResult;
exports.optionalString = optionalString;
exports.numberFromDb = numberFromDb;
exports.toQueryError = toQueryError;
exports.clientLimit = clientLimit;
exports.safeFilterClause = safeFilterClause;
const crypto_1 = require("crypto");
const sqlDialect_1 = require("../../services/sqlDialect");
class BasicDatabaseDriver {
    async testConnection(config) {
        try {
            const connection = await this.connect(config);
            await this.disconnect(connection.id);
            return { ok: true, message: 'Connection successful' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async beginTransaction(connectionId) {
        await this.executeQuery({ connectionId, sql: 'begin' });
    }
    async commitTransaction(connectionId) {
        await this.executeQuery({ connectionId, sql: 'commit' });
    }
    async rollbackTransaction(connectionId) {
        await this.executeQuery({ connectionId, sql: 'rollback' });
    }
    isTransactionOpen(_connectionId) {
        return false;
    }
    async validateQuery(_params) {
        return { ok: true };
    }
    async explainQuery(params) {
        return {
            format: 'text',
            analyze: false,
            rawText: params.sql,
            annotations: [{ severity: 'low', message: `${this.displayName} explain output is not available in this driver yet.` }]
        };
    }
    async cancelQuery(_executionId) { }
    async getViews(_connectionId, _schema) {
        return [];
    }
    async getFunctions(_connectionId, _schema) {
        return [];
    }
    async getProcedures(_connectionId, _schema) {
        return [];
    }
    async getTriggers(_connectionId, _schema) {
        return [];
    }
    async getActiveSessions(_connectionId) {
        return [];
    }
    async cancelSession(_connectionId, _pid) { }
    async terminateSession(_connectionId, _pid) { }
    async getIndexes(_connectionId, _schema, _table) {
        return [];
    }
    async getPrimaryKeys(_connectionId, _schema, _table) {
        return [];
    }
    async getForeignKeys(_connectionId, _schema, _table) {
        return [];
    }
    async getTableDDL(connectionId, schema, table) {
        const columns = await this.getColumns(connectionId, schema, table);
        return (0, sqlDialect_1.createTableSql)(this.id, schema, table, columns);
    }
    async getTableStats(_connectionId, schema, table) {
        return { schema, table, databaseType: this.id, columns: [] };
    }
}
exports.BasicDatabaseDriver = BasicDatabaseDriver;
function executionResultFromRows(rows, started, sql, dataTypes = {}) {
    const fields = rows[0]
        ? Object.keys(rows[0]).map((name) => ({ name, dataTypeName: dataTypes[name] }))
        : Object.keys(dataTypes).map((name) => ({ name, dataTypeName: dataTypes[name] }));
    return {
        executionId: (0, crypto_1.randomUUID)(),
        fields,
        rows,
        rowCount: rows.length,
        command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
        durationMs: Date.now() - started
    };
}
function emptyExecutionResult(started, sql, rowCount = 0) {
    return {
        executionId: (0, crypto_1.randomUUID)(),
        fields: [],
        rows: [],
        rowCount,
        command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
        durationMs: Date.now() - started
    };
}
function optionalString(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const next = String(value).trim();
    return next || undefined;
}
function numberFromDb(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const next = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(next) ? next : undefined;
}
function toQueryError(error) {
    const record = error;
    return {
        message: record.message ?? String(error),
        code: record.code,
        detail: record.detail,
        hint: record.hint,
        position: record.position,
        where: record.where
    };
}
function clientLimit(sql, maxRows, offset, quote = '"') {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
    const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
    const pageLimit = limit ? limit + 1 : undefined;
    return pageLimit && /^(select|with)\b/i.test(sql.trim())
        ? `select * from (${sql.replace(/;+\s*$/, '')}) ${quote}__dg_query${quote} limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
        : sql;
}
function safeFilterClause(where) {
    const trimmed = where?.trim();
    if (!trimmed) {
        return '';
    }
    if (/;|--|\/\*/.test(trimmed)) {
        throw new Error('WHERE must be a single SQL expression without comments or semicolons.');
    }
    return `\nwhere ${trimmed}`;
}
//# sourceMappingURL=driverUtils.js.map