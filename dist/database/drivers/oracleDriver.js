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
exports.OracleDriver = void 0;
const identifiers_1 = require("../../utils/identifiers");
const runtimeLoader_1 = require("../../runtime/runtimeLoader");
const driverUtils_1 = require("./driverUtils");
class OracleDriver extends driverUtils_1.BasicDatabaseDriver {
    id = 'oracle';
    displayName = 'Oracle';
    pools = new Map();
    async connect(config) {
        await this.disconnect(config.id);
        const oracle = await loadOracle();
        const pool = await oracle.createPool({
            user: config.username,
            password: config.password,
            connectString: `${config.host}:${config.port}/${config.database}`,
            poolMin: 0,
            poolMax: 8,
            connectTimeout: Math.ceil((config.connectTimeoutMs ?? 10000) / 1000)
        });
        this.pools.set(config.id, pool);
        const connection = await pool.getConnection();
        try {
            await connection.execute('select 1 from dual');
        }
        finally {
            await connection.close();
        }
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        const pool = this.pools.get(connectionId);
        if (!pool) {
            return;
        }
        this.pools.delete(connectionId);
        await pool.close(0);
    }
    async testConnection(config) {
        let connection;
        try {
            connection = await this.connect(config);
            const result = await this.executeQuery({ connectionId: connection.id, sql: 'select banner as version from v$version where rownum = 1' });
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
        const oracle = await loadOracle();
        const connection = await this.requirePool(params.connectionId).getConnection();
        const results = [];
        try {
            for (const sql of statements) {
                const started = Date.now();
                try {
                    const result = await connection.execute(sql, [], { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: true });
                    const rows = (result.rows ?? []);
                    const dataTypes = Object.fromEntries((result.metaData ?? []).map((field) => [field.name, field.dbTypeName ?? '']));
                    results.push(rows.length ? (0, driverUtils_1.executionResultFromRows)(rows, started, sql, dataTypes) : (0, driverUtils_1.emptyExecutionResult)(started, sql, result.rowsAffected ?? 0));
                }
                catch (error) {
                    throw (0, driverUtils_1.toQueryError)(error);
                }
            }
            return results;
        }
        finally {
            await connection.close();
        }
    }
    async getSchemas(connectionId) {
        const rows = await this.query(connectionId, `select username as "name" from all_users order by username`);
        return rows.map((row) => ({ name: String(row.name ?? row.NAME) }));
    }
    async getTables(connectionId, schema) {
        const rows = await this.query(connectionId, `select owner as "schema", table_name as "name", 'table' as "type", num_rows as "rowEstimate" from all_tables where owner = upper('${escapeSql(schema)}') order by table_name`);
        return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: 'table', rowEstimate: Number(row.rowEstimate ?? row.ROWESTIMATE) || undefined }));
    }
    async getViews(connectionId, schema) {
        const rows = await this.query(connectionId, `select owner as "schema", view_name as "name", 'view' as "type" from all_views where owner = upper('${escapeSql(schema)}') order by view_name`);
        return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), type: 'view' }));
    }
    async getFunctions(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'FUNCTION');
    }
    async getProcedures(connectionId, schema) {
        return this.getRoutines(connectionId, schema, 'PROCEDURE');
    }
    async getColumns(connectionId, schema, table) {
        const rows = await this.query(connectionId, `select owner as "schema", table_name as "table", column_name as "name", column_id as "ordinal", data_type as "dataType", nullable as "nullable", data_default as "defaultValue" from all_tab_columns where owner = upper('${escapeSql(schema)}') and table_name = upper('${escapeSql(table)}') order by column_id`);
        return rows.map((row) => ({
            schema: String(row.schema ?? row.SCHEMA),
            table: String(row.table ?? row.TABLE),
            name: String(row.name ?? row.NAME),
            ordinal: Number(row.ordinal ?? row.ORDINAL),
            dataType: String(row.dataType ?? row.DATATYPE),
            nullable: String(row.nullable ?? row.NULLABLE).toUpperCase() === 'Y',
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
        const paging = pageLimit ? `\noffset ${offset} rows fetch next ${pageLimit} rows only` : '';
        const sql = `select * from ${(0, identifiers_1.qualifiedName)(schema, table)}${(0, driverUtils_1.safeFilterClause)(options?.where)}${orderBy}${paging}`;
        return this.executeQuery({ connectionId, sql, maxRows: 0 });
    }
    async getRoutines(connectionId, schema, kind) {
        const rows = await this.query(connectionId, `select owner as "schema", object_name as "name" from all_objects where owner = upper('${escapeSql(schema)}') and object_type = '${kind}' order by object_name`);
        return rows.map((row) => ({ schema: String(row.schema ?? row.SCHEMA), name: String(row.name ?? row.NAME), kind: kind === 'PROCEDURE' ? 'procedure' : 'function' }));
    }
    async query(connectionId, sql) {
        const result = await this.executeQuery({ connectionId, sql });
        return result.rows;
    }
    requirePool(connectionId) {
        const pool = this.pools.get(connectionId);
        if (!pool) {
            throw new Error('Connection is not active. Connect first.');
        }
        return pool;
    }
}
exports.OracleDriver = OracleDriver;
async function loadOracle() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('oracleRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('oracledb'))).then((module) => {
        const candidate = module;
        return 'createPool' in candidate ? candidate : candidate.default;
    });
}
function escapeSql(value) {
    return value.replace(/'/g, "''");
}
//# sourceMappingURL=oracleDriver.js.map