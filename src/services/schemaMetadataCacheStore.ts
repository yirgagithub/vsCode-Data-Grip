import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ConnectionConfig, SchemaCacheEntry } from '../types';

export const SCHEMA_METADATA_CACHE_VERSION = 2;

interface StoredSchemaCacheEntry {
  version: number;
  fingerprint: string;
  savedAt: number;
  entry: SchemaCacheEntry;
}

export class SchemaMetadataCacheStore {
  private readonly baseUri: vscode.Uri;
  private storageError: string | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.baseUri = vscode.Uri.joinPath(context.globalStorageUri, 'schema-metadata-cache');
  }

  getStorageError(): string | undefined {
    return this.storageError;
  }

  async hydrate(connection: ConnectionConfig, schemaName: string): Promise<SchemaCacheEntry | undefined> {
    try {
      const uri = this.cacheUri(connection, schemaName);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const stored = parseStoredSchemaCacheEntry(connection, Buffer.from(bytes).toString('utf8'));
      if (!stored || stored.entry.schemaName !== schemaName) {
        return undefined;
      }
      this.storageError = undefined;
      return { ...stored.entry, source: 'disk' };
    } catch (error) {
      if (!this.isNotFound(error)) {
        this.storageError = error instanceof Error ? error.message : String(error);
      }
      return undefined;
    }
  }

  async persist(connection: ConnectionConfig, entry: SchemaCacheEntry): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.connectionCacheUri(connection));
      await vscode.workspace.fs.writeFile(
        this.cacheUri(connection, entry.schemaName),
        Buffer.from(serializeSchemaCacheEntry(connection, entry), 'utf8')
      );
      this.storageError = undefined;
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : String(error);
    }
  }

  async deleteConnection(connectionId: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.baseUri, safePath(connectionId)), { recursive: true, useTrash: false });
      this.storageError = undefined;
    } catch (error) {
      if (!this.isNotFound(error)) {
        this.storageError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  private connectionCacheUri(connection: ConnectionConfig): vscode.Uri {
    return vscode.Uri.joinPath(this.baseUri, safePath(connection.id), connectionMetadataFingerprint(connection));
  }

  private cacheUri(connection: ConnectionConfig, schemaName: string): vscode.Uri {
    return vscode.Uri.joinPath(this.connectionCacheUri(connection), `${safePath(schemaName)}.json`);
  }

  private isNotFound(error: unknown): boolean {
    const code = error instanceof vscode.FileSystemError
      ? error.code
      : typeof error === 'object' && error !== null
        ? (error as { code?: unknown }).code
        : undefined;
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return code === 'FileNotFound' || /\b(FileNotFound|ENOENT)\b/i.test(message);
  }
}

export function connectionMetadataFingerprint(connection: ConnectionConfig): string {
  const identity = {
    type: connection.type,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    sslMode: connection.sslMode,
    defaultSchema: connection.defaultSchema ?? 'public'
  };
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
}

export function serializeSchemaCacheEntry(connection: ConnectionConfig, entry: SchemaCacheEntry): string {
  const fingerprint = connectionMetadataFingerprint(connection);
  const stored: StoredSchemaCacheEntry = {
    version: SCHEMA_METADATA_CACHE_VERSION,
    fingerprint,
    savedAt: Date.now(),
    entry: {
      ...entry,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      connectionFingerprint: fingerprint,
      source: 'disk'
    }
  };
  return `${JSON.stringify(stored)}\n`;
}

export function parseStoredSchemaCacheEntry(connection: ConnectionConfig, raw: string): StoredSchemaCacheEntry | undefined {
  let stored: StoredSchemaCacheEntry;
  try {
    stored = JSON.parse(raw) as StoredSchemaCacheEntry;
  } catch {
    return undefined;
  }
  if (![1, SCHEMA_METADATA_CACHE_VERSION].includes(stored.version) || stored.fingerprint !== connectionMetadataFingerprint(connection)) {
    return undefined;
  }
  if (!stored.entry || stored.entry.connectionId !== connection.id) {
    return undefined;
  }
  return {
    ...stored,
    version: SCHEMA_METADATA_CACHE_VERSION,
    entry: {
      ...stored.entry,
      cacheVersion: SCHEMA_METADATA_CACHE_VERSION,
      functions: stored.entry.functions ?? [],
      procedures: stored.entry.procedures ?? [],
      triggers: stored.entry.triggers ?? []
    }
  };
}

function safePath(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}
