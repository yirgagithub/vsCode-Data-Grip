"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentDatabaseService = void 0;
exports.sampleMcpConfig = sampleMcpConfig;
const crypto_1 = require("crypto");
const queryMemorySearch_1 = require("../services/queryMemorySearch");
const readOnlySql_1 = require("../services/readOnlySql");
const driverRegistry_1 = require("./driverRegistry");
class AgentDatabaseService {
    config;
    drivers;
    activeConnections = new Set();
    memorySearch = new queryMemorySearch_1.QueryMemorySearch();
    constructor(config, drivers = (0, driverRegistry_1.createMcpDriverRegistry)()) {
        this.config = config;
        this.drivers = drivers;
    }
    listConnections() {
        return this.config.connections.map((connection) => {
            const { password, passwordEnv, ...metadata } = connection;
            return {
                ...metadata,
                hasPassword: Boolean(password || (passwordEnv && process.env[passwordEnv]))
            };
        });
    }
    async getSchema(request) {
        const connection = await this.ensureConnected(request.connectionId);
        const driver = this.driver(connection.type);
        const schemaNames = request.schema ? [{ name: request.schema }] : await driver.getSchemas(connection.id);
        const tableLimit = boundedLimit(request.tableLimit, 50, 500);
        const includeColumns = request.includeColumns !== false;
        const result = [];
        for (const schema of schemaNames) {
            const tables = (await driver.getTables(connection.id, schema.name)).slice(0, tableLimit);
            const views = (await driver.getViews(connection.id, schema.name)).slice(0, tableLimit);
            const tablesWithColumns = includeColumns
                ? await Promise.all(tables.map(async (table) => ({
                    ...table,
                    columns: await driver.getColumns(connection.id, table.schema, table.name)
                })))
                : tables;
            result.push({ schema, tables: tablesWithColumns, views });
        }
        return result;
    }
    async getObjectDdl(connectionId, schema, table) {
        const connection = await this.ensureConnected(connectionId);
        return { ddl: await this.driver(connection.type).getTableDDL(connection.id, schema, table) };
    }
    searchQueryMemory(query, connectionId, limit) {
        return this.memorySearch.search(this.config.queryMemory ?? [], {
            query,
            connectionId,
            limit: boundedLimit(limit, 10, 50)
        });
    }
    async runReadOnlyQuery(request) {
        if (!(0, readOnlySql_1.isReadOnlySql)(request.sql)) {
            throw new Error('MCP query execution is read-only. Use SELECT, WITH, VALUES, SHOW, DESCRIBE, or EXPLAIN.');
        }
        const connection = await this.ensureConnected(request.connectionId);
        const maxRows = boundedLimit(request.maxRows, this.config.defaultMaxRows ?? 100, 1000);
        const results = await this.driver(connection.type).executeStatements({
            connectionId: connection.id,
            sql: request.sql,
            maxRows,
            source: { origin: 'sqlFile', fileName: 'querydeck-mcp' }
        }, [request.sql]);
        return results.map((result) => limitRows(result, maxRows));
    }
    async explainQuery(connectionId, sql) {
        if (!(0, readOnlySql_1.isReadOnlySql)(sql)) {
            throw new Error('MCP explain is limited to read-only SQL.');
        }
        const connection = await this.ensureConnected(connectionId);
        return this.driver(connection.type).explainQuery({ connectionId: connection.id, sql, maxRows: 0 });
    }
    async dispose() {
        await Promise.all([...this.activeConnections].map(async (connectionId) => {
            const connection = this.connection(connectionId);
            if (connection) {
                await this.driver(connection.type).disconnect(connectionId).catch(() => undefined);
            }
        }));
        this.activeConnections.clear();
    }
    async ensureConnected(connectionId) {
        const connection = this.connection(connectionId);
        if (!connection) {
            throw new Error(`Connection not found: ${connectionId}`);
        }
        if (!this.activeConnections.has(connection.id)) {
            await this.driver(connection.type).connect(connection);
            this.activeConnections.add(connection.id);
        }
        return connection;
    }
    connection(connectionId) {
        const connection = this.config.connections.find((item) => item.id === connectionId);
        return connection ? materializePassword(connection) : undefined;
    }
    driver(type) {
        const driver = this.drivers.get(type);
        if (!driver) {
            throw new Error(`Unsupported database type: ${type}`);
        }
        return driver;
    }
}
exports.AgentDatabaseService = AgentDatabaseService;
function sampleMcpConfig() {
    return {
        defaultMaxRows: 100,
        connections: [{
                id: 'local-postgres',
                name: 'Local PostgreSQL',
                type: 'postgres',
                host: 'localhost',
                port: 5432,
                database: 'postgres',
                username: 'postgres',
                passwordEnv: 'QUERYDECK_POSTGRES_PASSWORD',
                sslMode: 'disable',
                color: 'blue'
            }],
        queryMemory: []
    };
}
function materializePassword(connection) {
    const password = connection.password ?? (connection.passwordEnv ? process.env[connection.passwordEnv] : undefined);
    const { passwordEnv, ...metadata } = connection;
    return {
        ...metadata,
        id: metadata.id || (0, crypto_1.randomUUID)(),
        password
    };
}
function boundedLimit(value, fallback, max) {
    const candidate = (!Number.isFinite(value) || !value || value <= 0) ? fallback : value;
    if (!Number.isFinite(candidate) || candidate <= 0) {
        return max;
    }
    return Math.min(Math.floor(candidate), max);
}
function limitRows(result, maxRows) {
    if (result.rows.length <= maxRows) {
        return result;
    }
    const rows = result.rows.slice(0, maxRows);
    return {
        ...result,
        rows,
        rowCount: rows.length,
        hasMore: true
    };
}
//# sourceMappingURL=agentDatabaseService.js.map