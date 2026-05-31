import { CancellationTokenSource } from 'vscode';
import { ColumnInfo, ConnectionConfig, SchemaCacheEntry, TableInfo, ViewInfo } from '../types';
import { ConnectionManager } from '../database/connectionManager';
import { connectionMetadataFingerprint, SCHEMA_METADATA_CACHE_VERSION, SchemaMetadataCacheStore } from './schemaMetadataCacheStore';

const CACHE_TTL_MS = 5 * 60_000;
const REFRESH_DEBOUNCE_MS = 500;
// Keep below the pg pool size so foreground queries can acquire a client during refresh.
const COLUMN_METADATA_WORKERS = 4;

export class SchemaContextService {
  private readonly cache = new Map<string, SchemaCacheEntry>();
  private readonly inflight = new Map<string, Promise<SchemaCacheEntry>>();
  private readonly refreshTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly persistentCache?: SchemaMetadataCacheStore
  ) {}

  async loadDefaultSchema(connection: ConnectionConfig, refresh = false): Promise<SchemaCacheEntry> {
    return this.loadSchema(connection, connection.defaultSchema ?? 'public', refresh);
  }

  async loadSchema(connection: ConnectionConfig, schemaName: string, refresh = false): Promise<SchemaCacheEntry> {
    const key = this.key(connection, schemaName);
    const cached = this.markStale(this.cache.get(key));
    if (!refresh && cached && cached.status === 'ready') {
      return cached;
    }
    if (this.inflight.has(key)) {
      return this.inflight.get(key)!;
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

    const started: SchemaCacheEntry = cached
      ? { ...cached, errorMessage: undefined }
      : this.emptyEntry(connection, schemaName, 'loading');
    if (!cached) {
      this.cache.set(key, started);
    }

    const load = this.loadSchemaNow(connection, schemaName, started).finally(() => this.inflight.delete(key));
    this.inflight.set(key, load);
    return load;
  }

  getCached(connectionId: string, schemaName: string): SchemaCacheEntry | undefined {
    const connection = this.connectionManager.getConnection(connectionId);
    const cached = connection
      ? this.cache.get(this.key(connection, schemaName))
      : [...this.cache.values()].find((entry) => entry.connectionId === connectionId && entry.schemaName === schemaName);
    return this.markStale(cached);
  }

  async getCachedForConnection(connection: ConnectionConfig, schemaName: string): Promise<SchemaCacheEntry | undefined> {
    return this.markStale(this.cache.get(this.key(connection, schemaName))) ?? await this.hydrateSchema(connection, schemaName);
  }

  getAnyCached(connectionId: string): SchemaCacheEntry[] {
    return [...this.cache.values()]
      .filter((entry) => entry.connectionId === connectionId)
      .map((entry) => this.markStale(entry)!);
  }

  async getColumns(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<ColumnInfo[]> {
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

  async getCachedColumns(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<ColumnInfo[] | undefined> {
    const entry = await this.getCachedForConnection(connection, schemaName);
    return entry?.columns[this.tableKey(schemaName, tableName)];
  }

  invalidate(connectionId?: string, schemaName?: string): void {
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

  async deletePersistent(connectionId: string): Promise<void> {
    this.invalidate(connectionId);
    await this.persistentCache?.deleteConnection(connectionId);
  }

  async warmFromDisk(connections: ConnectionConfig[]): Promise<void> {
    await Promise.all(connections.map((connection) => this.hydrateSchema(connection, connection.defaultSchema ?? 'public')));
  }

  refreshDefaultSchemaInBackground(connection: ConnectionConfig): void {
    this.refreshSchemaInBackground(connection, connection.defaultSchema ?? 'public');
  }

  refreshSchemaInBackground(connection: ConnectionConfig, schemaName: string): void {
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

  async metadataStatus(connection: ConnectionConfig, schemaName = connection.defaultSchema ?? 'public') {
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

  tablesAndViews(connectionId: string): Array<TableInfo | ViewInfo> {
    return this.getAnyCached(connectionId).flatMap((entry) => [...entry.tables, ...entry.views]);
  }

  private async loadSchemaNow(connection: ConnectionConfig, schemaName: string, base: SchemaCacheEntry): Promise<SchemaCacheEntry> {
    try {
      const driver = this.connectionManager.getDriver(connection.type);
      const [schemas, tables, views] = await Promise.all([
        driver.getSchemas(connection.id),
        driver.getTables(connection.id, schemaName),
        driver.getViews(connection.id, schemaName)
      ]);
      const columns = await this.loadColumnsForRelations(connection, schemaName, [...tables, ...views]);
      const entry: SchemaCacheEntry = {
        ...base,
        schemas,
        tables,
        views,
        columns,
        loadedAt: Date.now(),
        cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
        connectionFingerprint: connectionMetadataFingerprint(connection),
        source: 'live',
        status: 'ready',
        errorMessage: undefined
      };
      this.cache.set(this.key(connection, schemaName), entry);
      await this.persistentCache?.persist(connection, entry);
      return entry;
    } catch (error) {
      const failed: SchemaCacheEntry = {
        ...base,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        loadedAt: Date.now()
      };
      this.cache.set(this.key(connection, schemaName), failed);
      return failed;
    }
  }

  private async hydrateSchema(connection: ConnectionConfig, schemaName: string): Promise<SchemaCacheEntry | undefined> {
    const key = this.key(connection, schemaName);
    const hydrated = this.markStale(await this.persistentCache?.hydrate(connection, schemaName));
    if (hydrated) {
      this.cache.set(key, hydrated);
    }
    return hydrated;
  }

  private async loadColumnsForRelations(
    connection: ConnectionConfig,
    schemaName: string,
    relations: Array<TableInfo | ViewInfo>
  ): Promise<Record<string, ColumnInfo[]>> {
    const driver = this.connectionManager.getDriver(connection.type);
    const result: Record<string, ColumnInfo[]> = {};
    const queue = relations.filter((relation) => relation.schema === schemaName).slice(0, 300);
    const workers = Array.from({ length: Math.min(COLUMN_METADATA_WORKERS, queue.length) }, async () => {
      while (queue.length) {
        const relation = queue.shift();
        if (!relation) {
          return;
        }
        try {
          result[this.tableKey(relation.schema, relation.name)] = await driver.getColumns(connection.id, relation.schema, relation.name);
        } catch {
          // Missing column metadata should reduce confidence, not fail the whole schema snapshot.
        }
      }
    });
    await Promise.all(workers);
    return result;
  }

  private emptyEntry(connection: ConnectionConfig, schemaName: string, status: SchemaCacheEntry['status'], errorMessage?: string): SchemaCacheEntry {
    return {
      connectionId: connection.id,
      schemaName,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      connectionFingerprint: connectionMetadataFingerprint(connection),
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

  private markStale(entry: SchemaCacheEntry | undefined): SchemaCacheEntry | undefined {
    if (!entry) {
      return undefined;
    }
    if (entry.loadedAt && Date.now() - entry.loadedAt > CACHE_TTL_MS && entry.status === 'ready') {
      entry.status = 'stale';
    }
    return entry;
  }

  private key(connection: ConnectionConfig, schemaName: string): string {
    return `${connection.id}:${connectionMetadataFingerprint(connection)}:${schemaName}`;
  }

  private tableKey(schemaName: string, tableName: string): string {
    return `${schemaName}.${tableName}`;
  }
}

export function disposeTokenSoon(tokenSource: CancellationTokenSource): void {
  setTimeout(() => tokenSource.dispose(), 0);
}
