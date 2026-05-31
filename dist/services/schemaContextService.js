"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaContextService = void 0;
exports.disposeTokenSoon = disposeTokenSoon;
const schemaMetadataCacheStore_1 = require("./schemaMetadataCacheStore");
const CACHE_TTL_MS = 5 * 60_000;
const REFRESH_DEBOUNCE_MS = 500;
// Keep below the pg pool size so foreground queries can acquire a client during refresh.
const COLUMN_METADATA_WORKERS = 4;
class SchemaContextService {
    connectionManager;
    persistentCache;
    cache = new Map();
    inflight = new Map();
    refreshTimers = new Map();
    constructor(connectionManager, persistentCache) {
        this.connectionManager = connectionManager;
        this.persistentCache = persistentCache;
    }
    async loadDefaultSchema(connection, refresh = false) {
        return this.loadSchema(connection, connection.defaultSchema ?? 'public', refresh);
    }
    async loadSchema(connection, schemaName, refresh = false) {
        const key = this.key(connection, schemaName);
        const cached = this.markStale(this.cache.get(key));
        if (!refresh && cached && cached.status === 'ready') {
            return cached;
        }
        if (this.inflight.has(key)) {
            return this.inflight.get(key);
        }
        if (!refresh && cached && !this.connectionManager.isConnected(connection.id)) {
            return cached;
        }
        if (!refresh && !cached) {
            const hydrated = await this.hydrateSchema(connection, schemaName);
            if (hydrated && !this.connectionManager.isConnected(connection.id)) {
                return hydrated;
            }
            if (hydrated && hydrated.status === 'ready') {
                return hydrated;
            }
        }
        if (!this.connectionManager.isConnected(connection.id)) {
            const missing = this.emptyEntry(connection, schemaName, 'error', 'Connection is not active. Connect first to refresh metadata.');
            this.cache.set(key, missing);
            return missing;
        }
        const started = cached
            ? { ...cached, errorMessage: undefined }
            : this.emptyEntry(connection, schemaName, 'loading');
        if (!cached) {
            this.cache.set(key, started);
        }
        const load = this.loadSchemaNow(connection, schemaName, started).finally(() => this.inflight.delete(key));
        this.inflight.set(key, load);
        return load;
    }
    getCached(connectionId, schemaName) {
        const connection = this.connectionManager.getConnection(connectionId);
        const cached = connection
            ? this.cache.get(this.key(connection, schemaName))
            : [...this.cache.values()].find((entry) => entry.connectionId === connectionId && entry.schemaName === schemaName);
        return this.markStale(cached);
    }
    async getCachedForConnection(connection, schemaName) {
        return this.markStale(this.cache.get(this.key(connection, schemaName))) ?? await this.hydrateSchema(connection, schemaName);
    }
    getAnyCached(connectionId) {
        return [...this.cache.values()]
            .filter((entry) => entry.connectionId === connectionId)
            .map((entry) => this.markStale(entry));
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
        entry.source = 'live';
        await this.persistentCache?.persist(connection, entry);
        return columns;
    }
    async getCachedColumns(connection, schemaName, tableName) {
        const entry = await this.getCachedForConnection(connection, schemaName);
        return entry?.columns[this.tableKey(schemaName, tableName)];
    }
    invalidate(connectionId, schemaName) {
        if (!connectionId) {
            this.cache.clear();
            return;
        }
        for (const [key, entry] of this.cache) {
            if (entry.connectionId === connectionId && (!schemaName || entry.schemaName === schemaName)) {
                this.cache.delete(key);
            }
        }
    }
    async deletePersistent(connectionId) {
        this.invalidate(connectionId);
        await this.persistentCache?.deleteConnection(connectionId);
    }
    async warmFromDisk(connections) {
        await Promise.all(connections.map((connection) => this.hydrateSchema(connection, connection.defaultSchema ?? 'public')));
    }
    refreshDefaultSchemaInBackground(connection) {
        this.refreshSchemaInBackground(connection, connection.defaultSchema ?? 'public');
    }
    refreshSchemaInBackground(connection, schemaName) {
        if (!this.connectionManager.isConnected(connection.id)) {
            return;
        }
        const key = this.key(connection, schemaName);
        const existing = this.refreshTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.refreshTimers.delete(key);
            void this.loadSchema(connection, schemaName, true);
        }, REFRESH_DEBOUNCE_MS);
        this.refreshTimers.set(key, timer);
    }
    async metadataStatus(connection, schemaName = connection.defaultSchema ?? 'public') {
        const entry = await this.getCachedForConnection(connection, schemaName);
        return {
            connection,
            schemaName,
            entry,
            freshForDiagnostics: !!entry && entry.status === 'ready',
            storageError: this.persistentCache?.getStorageError(),
            refreshRunning: this.inflight.has(this.key(connection, schemaName)),
            connected: this.connectionManager.isConnected(connection.id)
        };
    }
    tablesAndViews(connectionId) {
        return this.getAnyCached(connectionId).flatMap((entry) => [...entry.tables, ...entry.views]);
    }
    async loadSchemaNow(connection, schemaName, base) {
        try {
            const driver = this.connectionManager.getDriver(connection.type);
            const [schemas, tables, views] = await Promise.all([
                driver.getSchemas(connection.id),
                driver.getTables(connection.id, schemaName),
                driver.getViews(connection.id, schemaName)
            ]);
            const columns = await this.loadColumnsForRelations(connection, schemaName, [...tables, ...views]);
            const entry = {
                ...base,
                schemas,
                tables,
                views,
                columns,
                loadedAt: Date.now(),
                cacheVersion: schemaMetadataCacheStore_1.SCHEMA_METADATA_CACHE_VERSION,
                connectionFingerprint: (0, schemaMetadataCacheStore_1.connectionMetadataFingerprint)(connection),
                source: 'live',
                status: 'ready',
                errorMessage: undefined
            };
            this.cache.set(this.key(connection, schemaName), entry);
            await this.persistentCache?.persist(connection, entry);
            return entry;
        }
        catch (error) {
            const failed = {
                ...base,
                status: 'error',
                errorMessage: error instanceof Error ? error.message : String(error),
                loadedAt: Date.now()
            };
            this.cache.set(this.key(connection, schemaName), failed);
            return failed;
        }
    }
    async hydrateSchema(connection, schemaName) {
        const key = this.key(connection, schemaName);
        const hydrated = this.markStale(await this.persistentCache?.hydrate(connection, schemaName));
        if (hydrated) {
            this.cache.set(key, hydrated);
        }
        return hydrated;
    }
    async loadColumnsForRelations(connection, schemaName, relations) {
        const driver = this.connectionManager.getDriver(connection.type);
        const result = {};
        const queue = relations.filter((relation) => relation.schema === schemaName).slice(0, 300);
        const workers = Array.from({ length: Math.min(COLUMN_METADATA_WORKERS, queue.length) }, async () => {
            while (queue.length) {
                const relation = queue.shift();
                if (!relation) {
                    return;
                }
                try {
                    result[this.tableKey(relation.schema, relation.name)] = await driver.getColumns(connection.id, relation.schema, relation.name);
                }
                catch {
                    // Missing column metadata should reduce confidence, not fail the whole schema snapshot.
                }
            }
        });
        await Promise.all(workers);
        return result;
    }
    emptyEntry(connection, schemaName, status, errorMessage) {
        return {
            connectionId: connection.id,
            schemaName,
            cacheVersion: schemaMetadataCacheStore_1.SCHEMA_METADATA_CACHE_VERSION,
            connectionFingerprint: (0, schemaMetadataCacheStore_1.connectionMetadataFingerprint)(connection),
            source: 'memory',
            schemas: [],
            tables: [],
            views: [],
            columns: {},
            indexes: {},
            keys: {},
            status,
            errorMessage
        };
    }
    markStale(entry) {
        if (!entry) {
            return undefined;
        }
        if (entry.loadedAt && Date.now() - entry.loadedAt > CACHE_TTL_MS && entry.status === 'ready') {
            entry.status = 'stale';
        }
        return entry;
    }
    key(connection, schemaName) {
        return `${connection.id}:${(0, schemaMetadataCacheStore_1.connectionMetadataFingerprint)(connection)}:${schemaName}`;
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