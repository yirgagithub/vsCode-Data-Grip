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
exports.MySQLDriver = void 0;
const crypto_1 = require("crypto");
const identifiers_1 = require("../../utils/identifiers");
const queryPlanService_1 = require("../../services/queryPlanService");
const runtimeLoader_1 = require("../../runtime/runtimeLoader");
const sqlDialect_1 = require("../../services/sqlDialect");
class MySQLDriver {
    id = 'mysql';
    displayName = 'MySQL';
    pools = new Map();
    configs = new Map();
    activeExecutions = new Map();
    transactionConnections = new Map();
    async testConnection(config) {
        let pool;
        try {
            pool = await this.createVerifiedPool(config, 1);
            const [rows] = await pool.query('select version() as version');
            const row = rows[0] ?? {};
            return { ok: true, message: 'Connection successful', serverVersion: optionalString(row.version) };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        finally {
            if (pool) {
                await this.endPool(pool);
            }
        }
    }
    async connect(config) {
        await this.disconnect(config.id);
        const pool = await this.createVerifiedPool(config, 8);
        this.pools.set(config.id, pool);
        this.configs.set(config.id, config);
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        await this.rollbackTransaction(connectionId).catch(() => undefined);
        const pool = this.pools.get(connectionId);
        if (pool) {
            this.pools.delete(connectionId);
            await pool.end();
        }
    }
    async beginTransaction(connectionId) {
        if (this.transactionConnections.has(connectionId)) {
            return;
        }
        const pool = this.requirePool(connectionId);
        const connection = await pool.getConnection();
        try {
            await connection.query('start transaction');
            this.transactionConnections.set(connectionId, connection);
        }
        catch (error) {
            connection.release();
            throw error;
        }
    }
    async commitTransaction(connectionId) {
        const connection = this.transactionConnections.get(connectionId);
        if (!connection) {
            return;
        }
        try {
            await connection.query('commit');
        }
        finally {
            this.transactionConnections.delete(connectionId);
            connection.release();
        }
    }
    async rollbackTransaction(connectionId) {
        const connection = this.transactionConnections.get(connectionId);
        if (!connection) {
            return;
        }
        try {
            await connection.query('rollback');
        }
        finally {
            this.transactionConnections.delete(connectionId);
            connection.release();
        }
    }
    isTransactionOpen(connectionId) {
        return this.transactionConnections.has(connectionId);
    }
    async executeQuery(params) {
        const [result] = await this.executeStatements(params, [params.sql]);
        return result;
    }
    async executeStatements(params, statements) {
        const pool = this.requirePool(params.connectionId);
        const transactionConnection = this.transactionConnections.get(params.connectionId);
        const connection = transactionConnection ?? await pool.getConnection();
        const results = [];
        const hasExplicitTransaction = !transactionConnection && statements.some((sql) => /\bbegin\b/i.test(sql));
        const pinnedTransaction = !!transactionConnection;
        try {
            for (const [index, sql] of statements.entries()) {
                const executionId = (0, crypto_1.randomUUID)();
                const started = Date.now();
                params.onProgress?.({
                    statementIndex: index,
                    statementCount: statements.length,
                    sql,
                    status: 'started',
                    executionId,
                    startedAt: started
                });
                this.activeExecutions.set(executionId, { connectionId: params.connectionId, threadId: this.threadId(connection) });
                try {
                    const [rows, fields] = await connection.query(this.sqlWithClientLimit(sql, params.maxRows, params.offset));
                    const executionResult = this.toExecutionResult(rows, fields, executionId, started, sql);
                    params.onProgress?.({
                        statementIndex: index,
                        statementCount: statements.length,
                        sql,
                        status: 'completed',
                        executionId,
                        startedAt: started,
                        durationMs: Date.now() - started,
                        rowCount: executionResult.rowCount,
                        command: executionResult.command
                    });
                    results.push(executionResult);
                }
                catch (error) {
                    params.onProgress?.({
                        statementIndex: index,
                        statementCount: statements.length,
                        sql,
                        status: 'failed',
                        executionId,
                        startedAt: started,
                        durationMs: Date.now() - started,
                        errorMessage: error instanceof Error ? error.message : String(error)
                    });
                    throw error;
                }
                finally {
                    this.activeExecutions.delete(executionId);
                }
            }
            return results;
        }
        catch (error) {
            if (hasExplicitTransaction) {
                try {
                    await connection.query('rollback');
                }
                catch {
                    // Preserve the original query error.
                }
            }
            throw error;
        }
        finally {
            if (!pinnedTransaction) {
                connection.release();
            }
        }
    }
    async validateQuery(params) {
        const pool = this.requirePool(params.connectionId);
        const sql = params.sql.trim().replace(/;+\s*$/, '');
        if (!sql || !this.canExplain(sql)) {
            return { ok: true };
        }
        try {
            await pool.query(`explain ${sql}`);
            return { ok: true };
        }
        catch (error) {
            return { ok: false, error: this.toQueryError(error) };
        }
    }
    async explainQuery(params, options = {}) {
        const pool = this.requirePool(params.connectionId);
        const sql = params.sql.trim().replace(/;+\s*$/, '');
        if (!sql || !this.canExplain(sql)) {
            throw new Error('Only SELECT, WITH, INSERT, UPDATE, DELETE, and MERGE statements can be explained.');
        }
        const explainSql = options.analyze ? `explain analyze ${sql}` : `explain format=json ${sql}`;
        const [rows] = await pool.query(explainSql);
        return (0, queryPlanService_1.textExplainPlan)(JSON.stringify(rows, null, 2), options.analyze === true);
    }
    async cancelQuery(executionId) {
        const active = this.activeExecutions.get(executionId);
        if (!active?.threadId) {
            return;
        }
        const pool = this.requirePool(active.connectionId);
        await pool.query(`kill query ${active.threadId}`);
    }
    async getSchemas(connectionId) {
        const [rows] = await this.requirePool(connectionId).query(`select schema_name as name
       from information_schema.schemata
       where schema_name not in ('information_schema', 'mysql', 'performance_schema', 'sys')
       order by schema_name`);
        return rows;
    }
    async getTables(connectionId, schema) {
        const [rows] = await this.requirePool(connectionId).query(`select table_schema as \`schema\`,
              table_name as name,
              'table' as type,
              table_rows as "rowEstimate",
              table_comment as comment
       from information_schema.tables
       where table_schema = ? and table_type = 'BASE TABLE'
       order by table_name`, [schema]);
        return rows;
    }
    async getViews(connectionId, schema) {
        const [rows] = await this.requirePool(connectionId).query(`select table_schema as \`schema\`, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = ?
       order by table_name`, [schema]);
        return rows;
    }
    async getFunctions(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'FUNCTION');
    }
    async getProcedures(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'PROCEDURE');
    }
    async getTriggers(connectionId, schema) {
        const [rows] = await this.requirePool(connectionId).query(`select trigger_schema as \`schema\`,
              event_object_table as "table",
              trigger_name as name,
              action_timing as timing,
              event_manipulation as event,
              action_orientation as orientation,
              action_statement as definition
       from information_schema.triggers
       where trigger_schema = ?
       order by event_object_table, trigger_name`, [schema]);
        return rows.map((row) => ({
            schema: String(row.schema),
            table: String(row.table),
            name: String(row.name),
            timing: optionalString(row.timing)?.toLowerCase(),
            orientation: optionalString(row.orientation)?.toLowerCase(),
            enabled: 'YES',
            events: optionalString(row.event) ? [optionalString(row.event)] : undefined
        }));
    }
    async getActiveSessions(connectionId) {
        const pool = this.requirePool(connectionId);
        const connection = await pool.getConnection();
        let currentThreadId;
        let rows = [];
        try {
            const [currentRows] = await connection.query(`select connection_id() as id`);
            currentThreadId = numberFromDb(currentRows[0]?.id);
            const [processRows] = await connection.query(`show full processlist`);
            rows = processRows;
        }
        finally {
            connection.release();
        }
        return rows.map((row) => ({
            pid: Number(row.Id ?? row.id ?? row.ID),
            user: optionalString(row.User ?? row.user),
            database: optionalString(row.db ?? row.Database ?? row.database),
            application: optionalString(row.Command ?? row.command),
            client: optionalString(row.Host ?? row.host),
            state: optionalString(row.State ?? row.state),
            query: optionalString(row.Info ?? row.info),
            isCurrent: Number(row.Id ?? row.id ?? row.ID) === currentThreadId
        }));
    }
    async cancelSession(connectionId, pid) {
        await this.requirePool(connectionId).query(`kill query ${Math.trunc(pid)}`);
    }
    async terminateSession(connectionId, pid) {
        await this.requirePool(connectionId).query(`kill ${Math.trunc(pid)}`);
    }
    async getColumns(connectionId, schema, table) {
        const [rows] = await this.requirePool(connectionId).query(`select table_schema as \`schema\`,
              table_name as \`table\`,
              column_name as name,
              ordinal_position as ordinal,
              column_type as "dataType",
              is_nullable = 'YES' as nullable,
              column_default as "defaultValue",
              column_comment as comment
       from information_schema.columns
       where table_schema = ? and table_name = ?
       order by ordinal_position`, [schema, table]);
        return rows;
    }
    async getIndexes(connectionId, schema, table) {
        const [rows] = await this.requirePool(connectionId).query(`select index_name as name,
              non_unique as "nonUnique",
              seq_in_index as "seqInIndex",
              column_name as "columnName",
              index_type as "indexType"
       from information_schema.statistics
       where table_schema = ? and table_name = ?
       order by index_name, seq_in_index`, [schema, table]);
        const grouped = new Map();
        for (const row of rows) {
            const name = String(row.name);
            const entry = grouped.get(name) ?? { name, columns: [], unique: true };
            if (typeof row.nonUnique === 'number') {
                entry.unique = row.nonUnique === 0;
            }
            if (row.columnName) {
                entry.columns.push(String(row.columnName));
            }
            if (!entry.definition && row.indexType) {
                entry.definition = String(row.indexType);
            }
            grouped.set(name, entry);
        }
        return [...grouped.values()].map(({ nonUnique: _nonUnique, ...index }) => index);
    }
    async getPrimaryKeys(connectionId, schema, table) {
        const [rows] = await this.requirePool(connectionId).query(`select constraint_name as name, column_name as "columnName", ordinal_position as ordinal
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and constraint_name = 'PRIMARY'
       order by ordinal_position`, [schema, table]);
        return groupKeyRows(rows);
    }
    async getForeignKeys(connectionId, schema, table) {
        const [rows] = await this.requirePool(connectionId).query(`select constraint_name as name,
              column_name as "columnName",
              ordinal_position as ordinal,
              referenced_table_schema as "foreignSchema",
              referenced_table_name as "foreignTable",
              referenced_column_name as "foreignColumn"
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and referenced_table_name is not null
       order by constraint_name, ordinal_position`, [schema, table]);
        return groupForeignKeyRows(rows);
    }
    async getTablePreview(connectionId, schema, table, limit, options) {
        const where = options?.where?.trim();
        if (where && /;|--|\/\*/.test(where)) {
            throw new Error('WHERE must be a single SQL expression without comments or semicolons.');
        }
        const orderBySql = options?.orderBySql?.trim();
        if (orderBySql && /;|--|\/\*/.test(orderBySql)) {
            throw new Error('ORDER BY must be a single SQL expression without comments or semicolons.');
        }
        const orderBy = orderBySql
            ? `\norder by ${orderBySql}`
            : options?.orderBy?.length
                ? `\norder by ${options.orderBy.map((item) => `${(0, identifiers_1.quoteIdentifier)(item.column, '`')} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
                : '';
        const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
        const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
        const paging = pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : '';
        const sql = `select * from ${(0, identifiers_1.qualifiedName)(schema, table, '`')}${where ? `\nwhere ${where}` : ''}${orderBy}${paging}`;
        return this.executeQuery({ connectionId, sql, maxRows: 0 });
    }
    async getTableDDL(connectionId, schema, table) {
        const columns = await this.getColumns(connectionId, schema, table);
        return (0, sqlDialect_1.createTableSql)(this.id, schema, table, columns);
    }
    async getTableStats(connectionId, schema, table) {
        const [rows] = await this.requirePool(connectionId).query(`select table_rows as "rowEstimate",
              data_length as "dataLength",
              index_length as "indexLength",
              update_time as "updatedAt"
       from information_schema.tables
       where table_schema = ? and table_name = ?`, [schema, table]);
        const row = rows[0] ?? {};
        return {
            schema,
            table,
            databaseType: this.id,
            rowEstimate: numberFromDb(row.rowEstimate),
            columns: []
        };
    }
    requirePool(connectionId) {
        const pool = this.pools.get(connectionId);
        if (!pool) {
            throw new Error('Connection is not active. Connect first.');
        }
        return pool;
    }
    toPoolConfig(config, max) {
        const ssl = config.sslMode === 'disable' ? undefined : { rejectUnauthorized: false };
        return {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.username,
            password: config.password,
            connectionLimit: max,
            waitForConnections: true,
            connectTimeout: config.connectTimeoutMs ?? 10000,
            ssl
        };
    }
    shouldRetryWithoutSsl(config, error) {
        const message = error instanceof Error ? error.message : String(error);
        return config.sslMode === 'prefer' && /ssl|secure connection|handshake/i.test(message);
    }
    async createVerifiedPool(config, max) {
        const mysql = await loadMysql();
        const pool = mysql.createPool(this.toPoolConfig(config, max));
        try {
            await pool.query('select 1');
            return pool;
        }
        catch (error) {
            await this.endPool(pool);
            if (!this.shouldRetryWithoutSsl(config, error)) {
                throw error;
            }
            const fallbackPool = mysql.createPool(this.toPoolConfig({ ...config, sslMode: 'disable' }, max));
            try {
                await fallbackPool.query('select 1');
                return fallbackPool;
            }
            catch (fallbackError) {
                await this.endPool(fallbackPool);
                throw fallbackError;
            }
        }
    }
    async endPool(pool) {
        try {
            await pool.end();
        }
        catch {
            // Preserve the original connection error.
        }
    }
    sqlWithClientLimit(sql, maxRows, offset) {
        const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
        const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
        const pageLimit = limit ? limit + 1 : undefined;
        return pageLimit && this.canApplyClientLimit(sql)
            ? `select * from (${sql.replace(/;+\s*$/, '')}) __dg_query limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
            : sql;
    }
    canApplyClientLimit(sql) {
        const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
        return normalized.startsWith('select') || normalized.startsWith('with');
    }
    toExecutionResult(rows, fields, executionId, started, sql) {
        const recordRows = Array.isArray(rows) ? rows : [];
        const rowCount = Array.isArray(rows)
            ? recordRows.length
            : typeof rows?.affectedRows === 'number'
                ? Number(rows.affectedRows)
                : 0;
        return {
            executionId,
            fields: Array.isArray(fields)
                ? fields.map((field) => ({ name: field.name, dataTypeId: field.columnType }))
                : [],
            rows: recordRows,
            rowCount,
            command: sql.trim().match(/^\w+/)?.[0]?.toUpperCase(),
            durationMs: Date.now() - started
        };
    }
    async getRoutines(connectionId, schema, type) {
        const [rows] = await this.requirePool(connectionId).query(`select routine_schema as \`schema\`,
              routine_name as name,
              routine_type as kind,
              dtd_identifier as "returnType",
              security_type as language,
              routine_comment as comment
       from information_schema.routines
       where routine_schema = ? and routine_type = ?
       order by routine_name`, [schema, type]);
        return rows.map((row) => ({
            schema: String(row.schema),
            name: String(row.name),
            kind: optionalString(row.kind)?.toLowerCase() === 'procedure' ? 'procedure' : 'function',
            returnType: optionalString(row.returnType),
            language: optionalString(row.language),
            comment: optionalString(row.comment)
        }));
    }
    canExplain(sql) {
        const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
        return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
    }
    threadId(connection) {
        return numberFromDb(connection.threadId);
    }
    toQueryError(error) {
        const mysqlError = error;
        return {
            message: mysqlError.message ?? String(error),
            code: mysqlError.code,
            detail: mysqlError.detail,
            hint: mysqlError.hint,
            position: mysqlError.position,
            where: mysqlError.where
        };
    }
}
exports.MySQLDriver = MySQLDriver;
let mysqlRuntime;
function loadMysql() {
    mysqlRuntime ??= loadMysqlRuntime();
    return mysqlRuntime;
}
async function loadMysqlRuntime() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('mysqlRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('mysql2/promise'))).then((module) => {
        const candidate = module;
        return 'createPool' in candidate ? candidate : candidate.default;
    });
}
function groupKeyRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const name = String(row.name);
        const entry = grouped.get(name) ?? { name, columns: [] };
        const column = row.columnName ?? row.column_name;
        if (column) {
            entry.columns.push(String(column));
        }
        grouped.set(name, entry);
    }
    return [...grouped.values()];
}
function groupForeignKeyRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const name = String(row.name);
        const entry = grouped.get(name) ?? {
            name,
            columns: [],
            foreignSchema: String(row.foreignSchema ?? row.referenced_table_schema ?? ''),
            foreignTable: String(row.foreignTable ?? row.referenced_table_name ?? ''),
            foreignColumns: []
        };
        const column = row.columnName ?? row.column_name;
        const foreignColumn = row.foreignColumn ?? row.referenced_column_name;
        if (column) {
            entry.columns.push(String(column));
        }
        if (foreignColumn) {
            entry.foreignColumns.push(String(foreignColumn));
        }
        grouped.set(name, entry);
    }
    return [...grouped.values()];
}
function numberFromDb(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const next = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(next) ? next : undefined;
}
function optionalString(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const next = String(value).trim();
    return next || undefined;
}
//# sourceMappingURL=mysqlDriver.js.map