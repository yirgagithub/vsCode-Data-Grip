import { CancellationTokenSource } from 'vscode';
import { ColumnInfo, ConnectionConfig, SchemaCacheEntry, TableInfo, ViewInfo } from '../types';
import { ConnectionManager } from '../database/connectionManager';

const CACHE_TTL_MS = 5 * 60_000;

export class SchemaContextService {
  private readonly cache = new Map<string, SchemaCacheEntry>();
  private readonly inflight = new Map<string, Promise<SchemaCacheEntry>>();

  constructor(private readonly connectionManager: ConnectionManager) {}

  async loadDefaultSchema(connection: ConnectionConfig, refresh = false): Promise<SchemaCacheEntry> {
    return this.loadSchema(connection, connection.defaultSchema ?? 'public', refresh);
  }

  async loadSchema(connection: ConnectionConfig, schemaName: string, refresh = false): Promise<SchemaCacheEntry> {
    const key = this.key(connection.id, schemaName);
    const cached = this.cache.get(key);
    if (!refresh && cached && cached.status === 'ready' && cached.loadedAt && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached;
    }
    if (!refresh && this.inflight.has(key)) {
      return this.inflight.get(key)!;
    }

    const started: SchemaCacheEntry = cached
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

  getCached(connectionId: string, schemaName: string): SchemaCacheEntry | undefined {
    const cached = this.cache.get(this.key(connectionId, schemaName));
    if (!cached) {
      return undefined;
    }
    if (cached.loadedAt && Date.now() - cached.loadedAt > CACHE_TTL_MS) {
      cached.status = 'stale';
    }
    return cached;
  }

  getAnyCached(connectionId: string): SchemaCacheEntry[] {
    return [...this.cache.values()].filter((entry) => entry.connectionId === connectionId);
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
    return columns;
  }

  invalidate(connectionId?: string, schemaName?: string): void {
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

  tablesAndViews(connectionId: string): Array<TableInfo | ViewInfo> {
    return this.getAnyCached(connectionId).flatMap((entry) => [...entry.tables, ...entry.views]);
  }

  private async loadSchemaNow(connection: ConnectionConfig, schemaName: string, base: SchemaCacheEntry): Promise<SchemaCacheEntry> {
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
      const entry: SchemaCacheEntry = {
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
    } catch (error) {
      const failed: SchemaCacheEntry = {
        ...base,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        loadedAt: Date.now()
      };
      this.cache.set(this.key(connection.id, schemaName), failed);
      return failed;
    }
  }

  private key(connectionId: string, schemaName: string): string {
    return `${connectionId}:${schemaName}`;
  }

  private tableKey(schemaName: string, tableName: string): string {
    return `${schemaName}.${tableName}`;
  }
}

export function disposeTokenSoon(tokenSource: CancellationTokenSource): void {
  setTimeout(() => tokenSource.dispose(), 0);
}
