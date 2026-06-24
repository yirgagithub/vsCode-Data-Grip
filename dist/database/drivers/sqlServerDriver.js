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
exports.SqlServerDriver = void 0;
const runtimeLoader_1 = require("../../runtime/runtimeLoader");
const driverUtils_1 = require("./driverUtils");
const sqlDialect_1 = require("../../services/sqlDialect");
class SqlServerDriver extends driverUtils_1.BasicDatabaseDriver {
    id = 'sqlserver';
    displayName = 'Microsoft SQL Server';
    pools = new Map();
    async connect(config) {
        await this.disconnect(config.id);
        const mssql = await loadMssql();
        const pool = new mssql.ConnectionPool({
            server: config.host,
            port: config.port,
            database: config.database,
            user: config.username,
            password: config.password,
            connectionTimeout: config.connectTimeoutMs ?? 10000,
            requestTimeout: config.queryTimeoutMs ?? 300000,
            options: {
                encrypt: config.sslMode !== 'disable',
                trustServerCertificate: config.sslMode !== 'require'
            }
        });
        await pool.connect();
        this.pools.set(config.id, pool);
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        const pool = this.pools.get(connectionId);
        if (!pool) {
            return;
        }
        this.pools.delete(connectionId);
        await pool.close();
    }
    async testConnection(config) {
        let connection;
        try {
            connection = await this.connect(config);
            const result = await this.executeQuery({ connectionId: connection.id, sql: 'select @@version as version' });
            return { ok: true, message: 'Connection successful', serverVersion: (0, driverUtils_1.optionalString)(result.rows[0]?.version) };
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
        const pool = this.requirePool(params.connectionId);
        const results = [];
        for (const sql of statements) {
            const started = Date.now();
            try {
                const result = await pool.request().query(sql);
                const rows = result.recordset ?? [];
                results.push(rows.length ? (0, driverUtils_1.executionResultFromRows)(rows, started, sql) : (0, driverUtils_1.emptyExecutionResult)(started, sql, result.rowsAffected?.[0] ?? 0));
            }
            catch (error) {
                throw (0, driverUtils_1.toQueryError)(error);
            }
        }
        return results;
    }
    async getSchemas(connectionId) {
        const result = await this.query(connectionId, `select name from sys.schemas where name not in ('sys', 'INFORMATION_SCHEMA') order by name`);
        return result.map((row) => ({ name: String(row.name) }));
    }
    async getTables(connectionId, schema) {
        const result = await this.query(connectionId, `select table_schema as schema, table_name as name, 'table' as type from information_schema.tables where table_schema = '${escapeSql(schema)}' and table_type = 'BASE TABLE' order by table_name`);
        return result.map((row) => ({ schema: String(row.schema), name: String(row.name), type: 'table' }));
    }
    async getViews(connectionId, schema) {
        const result = await this.query(connectionId, `select table_schema as schema, table_name as name, 'view' as type from information_schema.views where table_schema = '${escapeSql(schema)}' order by table_name`);
        return result.map((row) => ({ schema: String(row.schema), name: String(row.name), type: 'view' }));
    }
    async getFunctions(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'FUNCTION');
    }
    async getProcedures(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'PROCEDURE');
    }
    async getColumns(connectionId, schema, table) {
        const rows = await this.query(connectionId, `select table_schema as schema, table_name as [table], column_name as name, ordinal_position as ordinal, data_type as dataType, is_nullable as nullable, column_default as defaultValue from information_schema.columns where table_schema = '${escapeSql(schema)}' and table_name = '${escapeSql(table)}' order by ordinal_position`);
        return rows.map((row) => ({
            schema: String(row.schema),
            table: String(row.table),
            name: String(row.name),
            ordinal: Number(row.ordinal),
            dataType: String(row.dataType),
            nullable: String(row.nullable).toUpperCase() === 'YES',
            defaultValue: (0, driverUtils_1.optionalString)(row.defaultValue)
        }));
    }
    async getTablePreview(connectionId, schema, table, limit, options) {
        const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
        const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
        const orderBy = options?.orderBy?.length
            ? ` order by ${options.orderBy.map((item) => `${(0, sqlDialect_1.quoteSqlIdentifier)(this.id, item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
            : options?.orderBySql?.trim()
                ? ` order by ${options.orderBySql.trim()}`
                : offset
                    ? ' order by (select null)'
                    : '';
        const sql = `select ${pageLimit && !offset ? `top (${pageLimit}) ` : ''}* from ${(0, sqlDialect_1.qualifiedSqlName)(this.id, schema, table)}${(0, driverUtils_1.safeFilterClause)(options?.where)}${orderBy}${pageLimit && offset ? ` offset ${offset} rows fetch next ${pageLimit} rows only` : ''}`;
        return this.executeQuery({ connectionId, sql, maxRows: 0 });
    }
    async getRoutines(connectionId, schema, type) {
        const rows = await this.query(connectionId, `select routine_schema as schema, routine_name as name, routine_type as kind, data_type as returnType from information_schema.routines where routine_schema = '${escapeSql(schema)}' and routine_type = '${type}' order by routine_name`);
        return rows.map((row) => ({
            schema: String(row.schema),
            name: String(row.name),
            kind: type === 'PROCEDURE' ? 'procedure' : 'function',
            returnType: (0, driverUtils_1.optionalString)(row.returnType)
        }));
    }
    async query(connectionId, sql) {
        const result = await this.requirePool(connectionId).request().query(sql);
        return result.recordset ?? [];
    }
    requirePool(connectionId) {
        const pool = this.pools.get(connectionId);
        if (!pool) {
            throw new Error('Connection is not active. Connect first.');
        }
        return pool;
    }
}
exports.SqlServerDriver = SqlServerDriver;
async function loadMssql() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('mssqlRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('mssql'))).then((module) => {
        const candidate = module;
        return 'ConnectionPool' in candidate ? candidate : candidate.default;
    });
}
function escapeSql(value) {
    return value.replace(/'/g, "''");
}
//# sourceMappingURL=sqlServerDriver.js.map