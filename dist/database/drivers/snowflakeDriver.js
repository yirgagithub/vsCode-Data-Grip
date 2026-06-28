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
exports.SnowflakeDriver = void 0;
const identifiers_1 = require("../../utils/identifiers");
const runtimeLoader_1 = require("../../runtime/runtimeLoader");
const driverUtils_1 = require("./driverUtils");
class SnowflakeDriver extends driverUtils_1.BasicDatabaseDriver {
    id = 'snowflake';
    displayName = 'Snowflake';
    connections = new Map();
    async connect(config) {
        await this.disconnect(config.id);
        const snowflake = await loadSnowflake();
        const connection = snowflake.createConnection({
            account: snowflakeAccount(config.host),
            username: config.username,
            password: config.password,
            database: (0, driverUtils_1.optionalString)(config.database),
            schema: (0, driverUtils_1.optionalString)(config.defaultSchema),
            timeout: config.connectTimeoutMs ?? 10000,
            application: 'QueryDeck',
            rowMode: 'object'
        });
        await connection.connectAsync();
        this.connections.set(config.id, connection);
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return;
        }
        this.connections.delete(connectionId);
        await new Promise((resolve, reject) => {
            connection.destroy((error) => error ? reject(error) : resolve());
        });
    }
    async testConnection(config) {
        let connection;
        try {
            connection = await this.connect(config);
            const result = await this.executeQuery({ connectionId: connection.id, sql: 'select current_version() as version' });
            return { ok: true, message: 'Connection successful', serverVersion: (0, driverUtils_1.optionalString)(result.rows[0]?.VERSION ?? result.rows[0]?.version) };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        finally {
            if (connection) {
                await this.disconnect(connection.id).catch(() => undefined);
            }
        }
    }
    async executeQuery(params) {
        const [result] = await this.executeStatements(params, [params.sql]);
        return result;
    }
    async executeStatements(params, statements) {
        const connection = this.requireConnection(params.connectionId);
        const results = [];
        for (const sql of statements) {
            const started = Date.now();
            try {
                const result = await executeSnowflake(connection, sqlWithLimit(sql, params.maxRows, params.offset));
                results.push(result.rows.length ? (0, driverUtils_1.executionResultFromRows)(result.rows, started, sql, result.dataTypes) : (0, driverUtils_1.emptyExecutionResult)(started, sql, result.rowCount));
            }
            catch (error) {
                throw (0, driverUtils_1.toQueryError)(error);
            }
        }
        return results;
    }
    async getSchemas(connectionId) {
        const rows = await this.query(connectionId, 'select schema_name as "name" from information_schema.schemata order by schema_name');
        return rows.map((row) => ({ name: String(row.name ?? row.NAME) }));
    }
    async getTables(connectionId, schema) {
        const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "name", row_count as "rowEstimate" from information_schema.tables where table_schema = upper('${escapeSql(schema)}') and table_type = 'BASE TABLE' order by table_name`);
        return rows.map((row) => ({
            schema: String(row.schema ?? row.SCHEMA),
            name: String(row.name ?? row.NAME),
            type: 'table',
            rowEstimate: (0, driverUtils_1.numberFromDb)(row.rowEstimate ?? row.ROWESTIMATE)
        }));
    }
    async getViews(connectionId, schema) {
        const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "name" from information_schema.views where table_schema = upper('${escapeSql(schema)}') order by table_name`);
        return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: 'view' }));
    }
    async getFunctions(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'FUNCTION');
    }
    async getProcedures(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'PROCEDURE');
    }
    async getColumns(connectionId, schema, table) {
        const rows = await this.query(connectionId, `select table_schema as "schema", table_name as "table", column_name as "name", ordinal_position as "ordinal", data_type as "dataType", is_nullable as "nullable", column_default as "defaultValue" from information_schema.columns where table_schema = upper('${escapeSql(schema)}') and table_name = upper('${escapeSql(table)}') order by ordinal_position`);
        return rows.map((row) => ({
            schema: String(row.schema ?? row.SCHEMA),
            table: String(row.table ?? row.TABLE),
            name: String(row.name ?? row.NAME),
            ordinal: Number(row.ordinal ?? row.ORDINAL),
            dataType: String(row.dataType ?? row.DATATYPE),
            nullable: String(row.nullable ?? row.NULLABLE).toUpperCase() === 'YES',
            defaultValue: (0, driverUtils_1.optionalString)(row.defaultValue ?? row.DEFAULTVALUE)
        }));
    }
    async getTablePreview(connectionId, schema, table, limit, options) {
        const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
        const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
        const orderBy = options?.orderBy?.length
            ? `\norder by ${options.orderBy.map((item) => `${(0, identifiers_1.quoteIdentifier)(item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
            : options?.orderBySql?.trim()
                ? `\norder by ${options.orderBySql.trim()}`
                : '';
        const sql = `select * from ${(0, identifiers_1.qualifiedName)(schema, table)}${(0, driverUtils_1.safeFilterClause)(options?.where)}${orderBy}${pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : ''}`;
        return this.executeQuery({ connectionId, sql, maxRows: 0 });
    }
    async getRoutines(connectionId, schema, kind) {
        const rows = await this.query(connectionId, `select routine_schema as "schema", routine_name as "name", data_type as "returnType" from information_schema.routines where routine_schema = upper('${escapeSql(schema)}') and routine_type = '${kind}' order by routine_name`);
        return rows.map((row) => ({
            schema: String(row.schema ?? row.SCHEMA),
            name: String(row.name ?? row.NAME),
            kind: kind === 'PROCEDURE' ? 'procedure' : 'function',
            returnType: (0, driverUtils_1.optionalString)(row.returnType ?? row.RETURNTYPE)
        }));
    }
    async query(connectionId, sql) {
        const result = await this.executeQuery({ connectionId, sql });
        return result.rows;
    }
    requireConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error('Connection is not active. Connect first.');
        }
        return connection;
    }
}
exports.SnowflakeDriver = SnowflakeDriver;
let snowflakeRuntime;
function loadSnowflake() {
    snowflakeRuntime ??= loadSnowflakeRuntime();
    return snowflakeRuntime;
}
async function loadSnowflakeRuntime() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('snowflakeRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('snowflake-sdk'))).then((module) => {
        const candidate = module;
        return 'createConnection' in candidate ? candidate : candidate.default;
    });
}
function executeSnowflake(connection, sql) {
    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: sql,
            complete: (error, statement, rows = []) => {
                if (error) {
                    reject(error);
                    return;
                }
                const dataTypes = Object.fromEntries((statement.getColumns() ?? []).map((column) => [column.getName(), column.getType()]));
                resolve({
                    rows,
                    rowCount: statement.getNumUpdatedRows() ?? statement.getNumRows() ?? rows.length,
                    dataTypes
                });
            }
        });
    });
}
function sqlWithLimit(sql, maxRows, offset) {
    const limit = Number.isFinite(maxRows) && maxRows && maxRows > 0 ? Math.floor(maxRows) : undefined;
    const nextOffset = Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : 0;
    const pageLimit = limit ? limit + 1 : undefined;
    return pageLimit && /^(select|with)\b/i.test(sql.trim())
        ? `select * from (${sql.replace(/;+\s*$/, '')}) "__dg_query" limit ${pageLimit}${nextOffset ? ` offset ${nextOffset}` : ''}`
        : sql;
}
function snowflakeAccount(host) {
    return host.replace(/^https?:\/\//i, '').replace(/\.snowflakecomputing\.com$/i, '').replace(/\/.*$/, '');
}
function escapeSql(value) {
    return value.replace(/'/g, "''");
}
//# sourceMappingURL=snowflakeDriver.js.map