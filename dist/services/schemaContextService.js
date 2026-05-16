"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaContextService = void 0;
exports.disposeTokenSoon = disposeTokenSoon;
const CACHE_TTL_MS = 5 * 60_000;
class SchemaContextService {
    connectionManager;
    cache = new Map();
    inflight = new Map();
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }
    async loadDefaultSchema(connection, refresh = false) {
        return this.loadSchema(connection, connection.defaultSchema ?? 'public', refresh);
    }
    async loadSchema(connection, schemaName, refresh = false) {
        const key = this.key(connection.id, schemaName);
        const cached = this.cache.get(key);
        if (!refresh && cached && cached.status === 'ready' && cached.loadedAt && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
            return cached;
        }
        if (!refresh && this.inflight.has(key)) {
            return this.inflight.get(key);
        }
        const started = cached
            ? { ...cached, status: 'loading', errorMessage: undefined }
            : {
                connectionId: connection.id,
                schemaName,
                schemas: [],
                tables: [],
                views: [],
                columns: {},
                indexes: {},
                keys: {},
                status: 'loading'
            };
        this.cache.set(key, started);
        const load = this.loadSchemaNow(connection, schemaName, started).finally(() => this.inflight.delete(key));
        this.inflight.set(key, load);
        return load;
    }
    getCached(connectionId, schemaName) {
        const cached = this.cache.get(this.key(connectionId, schemaName));
        if (!cached) {
            return undefined;
        }
        if (cached.loadedAt && Date.now() - cached.loadedAt > CACHE_TTL_MS) {
            cached.status = 'stale';
        }
        return cached;
    }
    getAnyCached(connectionId) {
        return [...this.cache.values()].filter((entry) => entry.connectionId === connectionId);
    }
    async getColumns(connection, schemaName, tableName) {
        const entry = await this.loadSchema(connection, schemaName);
        const tableKey = this.tableKey(schemaName, tableName);
        if (entry.columns[tableKey]) {
            return entry.columns[tableKey];
        }
        const columns = await this.connectionManager.getDriver(connection.type).getColumns(connection.id, schemaName, tableName);
        entry.columns[tableKey] = columns;
        entry.loadedAt = Date.now();
        entry.status = 'ready';
        return columns;
    }
    invalidate(connectionId, schemaName) {
        if (!connectionId) {
            this.cache.clear();
            return;
        }
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${connectionId}:`) && (!schemaName || key === this.key(connectionId, schemaName))) {
                this.cache.delete(key);
            }
        }
    }
    tablesAndViews(connectionId) {
        return this.getAnyCached(connectionId).flatMap((entry) => [...entry.tables, ...entry.views]);
    }
    async loadSchemaNow(connection, schemaName, base) {
        try {
            if (!this.connectionManager.isConnected(connection.id)) {
                await this.connectionManager.connect(connection.id);
            }
            const driver = this.connectionManager.getDriver(connection.type);
            const [schemas, tables, views] = await Promise.all([
                driver.getSchemas(connection.id),
                driver.getTables(connection.id, schemaName),
                driver.getViews(connection.id, schemaName)
            ]);
            const entry = {
                ...base,
                schemas,
                tables,
                views,
                loadedAt: Date.now(),
                status: 'ready',
                errorMessage: undefined
            };
            this.cache.set(this.key(connection.id, schemaName), entry);
            return entry;
        }
        catch (error) {
            const failed = {
                ...base,
                status: 'error',
                errorMessage: error instanceof Error ? error.message : String(error),
                loadedAt: Date.now()
            };
            this.cache.set(this.key(connection.id, schemaName), failed);
            return failed;
        }
    }
    key(connectionId, schemaName) {
        return `${connectionId}:${schemaName}`;
    }
    tableKey(schemaName, tableName) {
        return `${schemaName}.${tableName}`;
    }
}
exports.SchemaContextService = SchemaContextService;
function disposeTokenSoon(tokenSource) {
    setTimeout(() => tokenSource.dispose(), 0);
}
//# sourceMappingURL=schemaContextService.js.map