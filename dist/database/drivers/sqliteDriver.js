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
exports.SQLiteDriver = void 0;
const identifiers_1 = require("../../utils/identifiers");
const runtimeLoader_1 = require("../../runtime/runtimeLoader");
const driverUtils_1 = require("./driverUtils");
class SQLiteDriver extends driverUtils_1.BasicDatabaseDriver {
    id = 'sqlite';
    displayName = 'SQLite';
    connections = new Map();
    async connect(config) {
        await this.disconnect(config.id);
        const sqlite = await loadSqlite();
        const database = new sqlite.Database(config.database);
        await run(database, 'select 1');
        this.connections.set(config.id, database);
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        const database = this.connections.get(connectionId);
        if (!database) {
            return;
        }
        this.connections.delete(connectionId);
        await close(database);
    }
    async executeQuery(params) {
        const [result] = await this.executeStatements(params, [params.sql]);
        return result;
    }
    async executeStatements(params, statements) {
        const database = this.requireDatabase(params.connectionId);
        const results = [];
        for (const sql of statements) {
            const started = Date.now();
            const executable = (0, driverUtils_1.clientLimit)(sql, params.maxRows, params.offset);
            if (/^\s*(select|with|pragma)\b/i.test(executable)) {
                const rows = await all(database, executable);
                results.push((0, driverUtils_1.executionResultFromRows)(rows, started, sql));
            }
            else {
                const changes = await run(database, executable);
                results.push((0, driverUtils_1.emptyExecutionResult)(started, sql, changes));
            }
        }
        return results;
    }
    async getSchemas(connectionId) {
        const rows = await all(this.requireDatabase(connectionId), 'pragma database_list');
        return rows.map((row) => ({ name: String(row.name) }));
    }
    async getTables(connectionId, schema) {
        const rows = await all(this.requireDatabase(connectionId), `select name, type from ${(0, identifiers_1.quoteIdentifier)(schema)}.sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`);
        return rows.map((row) => ({ schema, name: String(row.name), type: 'table' }));
    }
    async getViews(connectionId, schema) {
        const rows = await all(this.requireDatabase(connectionId), `select name from ${(0, identifiers_1.quoteIdentifier)(schema)}.sqlite_master where type = 'view' order by name`);
        return rows.map((row) => ({ schema, name: String(row.name), type: 'view' }));
    }
    async getTriggers(connectionId, schema) {
        const rows = await all(this.requireDatabase(connectionId), `select name, tbl_name as "table" from ${(0, identifiers_1.quoteIdentifier)(schema)}.sqlite_master where type = 'trigger' order by tbl_name, name`);
        return rows.map((row) => ({ schema, table: String(row.table), name: String(row.name) }));
    }
    async getColumns(connectionId, schema, table) {
        const rows = await all(this.requireDatabase(connectionId), `pragma ${(0, identifiers_1.quoteIdentifier)(schema)}.table_info(${(0, identifiers_1.quoteIdentifier)(table)})`);
        return rows.map((row) => ({
            schema,
            table,
            name: String(row.name),
            ordinal: ((0, driverUtils_1.numberFromDb)(row.cid) ?? 0) + 1,
            dataType: (0, driverUtils_1.optionalString)(row.type) ?? 'text',
            nullable: !Boolean(row.notnull),
            defaultValue: (0, driverUtils_1.optionalString)(row.dflt_value)
        }));
    }
    async getIndexes(connectionId, schema, table) {
        const database = this.requireDatabase(connectionId);
        const indexes = await all(database, `pragma ${(0, identifiers_1.quoteIdentifier)(schema)}.index_list(${(0, identifiers_1.quoteIdentifier)(table)})`);
        const result = [];
        for (const index of indexes) {
            const name = String(index.name);
            const columns = await all(database, `pragma ${(0, identifiers_1.quoteIdentifier)(schema)}.index_info(${(0, identifiers_1.quoteIdentifier)(name)})`);
            result.push({
                name,
                unique: Boolean(index.unique),
                columns: columns.map((column) => String(column.name))
            });
        }
        return result;
    }
    async getPrimaryKeys(connectionId, schema, table) {
        const columns = await all(this.requireDatabase(connectionId), `pragma ${(0, identifiers_1.quoteIdentifier)(schema)}.table_info(${(0, identifiers_1.quoteIdentifier)(table)})`);
        const primaryColumns = columns.filter((column) => Number(column.pk) > 0).sort((left, right) => Number(left.pk) - Number(right.pk));
        return primaryColumns.length ? [{ name: `${table}_pk`, columns: primaryColumns.map((column) => String(column.name)) }] : [];
    }
    async getForeignKeys(connectionId, schema, table) {
        const rows = await all(this.requireDatabase(connectionId), `pragma ${(0, identifiers_1.quoteIdentifier)(schema)}.foreign_key_list(${(0, identifiers_1.quoteIdentifier)(table)})`);
        const grouped = new Map();
        for (const row of rows) {
            const name = `${table}_fk_${row.id}`;
            const entry = grouped.get(name) ?? { name, columns: [], foreignSchema: schema, foreignTable: String(row.table), foreignColumns: [] };
            entry.columns.push(String(row.from));
            entry.foreignColumns.push(String(row.to));
            grouped.set(name, entry);
        }
        return [...grouped.values()];
    }
    async getTablePreview(connectionId, schema, table, limit, options) {
        const orderBy = options?.orderBy?.length
            ? `\norder by ${options.orderBy.map((item) => `${(0, identifiers_1.quoteIdentifier)(item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
            : options?.orderBySql?.trim()
                ? `\norder by ${options.orderBySql.trim()}`
                : '';
        const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
        const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
        const sql = `select * from ${(0, identifiers_1.qualifiedName)(schema, table)}${(0, driverUtils_1.safeFilterClause)(options?.where)}${orderBy}${pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : ''}`;
        return this.executeQuery({ connectionId, sql, maxRows: 0 });
    }
    async getTableDDL(connectionId, schema, table) {
        const rows = await all(this.requireDatabase(connectionId), `select sql from ${(0, identifiers_1.quoteIdentifier)(schema)}.sqlite_master where name = ? and type in ('table', 'view')`, [table]);
        const ddl = (0, driverUtils_1.optionalString)(rows[0]?.sql);
        return ddl ? `${ddl};` : super.getTableDDL(connectionId, schema, table);
    }
    async getObjectDefinition(connectionId, object) {
        if (object.kind === 'function' || object.kind === 'procedure')
            return undefined;
        try {
            const rows = await all(this.requireDatabase(connectionId), `select sql from ${(0, identifiers_1.quoteIdentifier)(object.schema)}.sqlite_master where name = ? and type = ?`, [object.name, object.kind]);
            const value = rows[0]?.sql;
            return value === null || value === undefined || value === '' ? undefined : String(value);
        }
        catch (error) {
            throw (0, driverUtils_1.toQueryError)(error);
        }
    }
    requireDatabase(connectionId) {
        const database = this.connections.get(connectionId);
        if (!database) {
            throw new Error('Connection is not active. Connect first.');
        }
        return database;
    }
}
exports.SQLiteDriver = SQLiteDriver;
async function loadSqlite() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('sqliteRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('sqlite3'))).then((module) => {
        const candidate = module;
        return 'Database' in candidate ? candidate : candidate.default;
    });
}
function all(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows ?? [])));
    });
}
function run(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, params, function callback(error) {
            if (error) {
                reject(error);
            }
            else {
                resolve(this.changes ?? 0);
            }
        });
    });
}
function close(database) {
    return new Promise((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
    });
}
//# sourceMappingURL=sqliteDriver.js.map