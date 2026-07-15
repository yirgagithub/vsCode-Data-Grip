import { describe, expect, it, vi } from 'vitest';
import { connectionMetadataFingerprint, parseStoredSchemaCacheEntry, SCHEMA_METADATA_CACHE_VERSION, serializeSchemaCacheEntry } from '../src/services/schemaMetadataCacheStore';
import type { ConnectionConfig, SchemaCacheEntry } from '../src/types';

vi.mock('vscode', () => ({
  Uri: { joinPath: vi.fn() },
  workspace: { fs: {} },
  FileSystemError: class extends Error {}
}));

const connection: ConnectionConfig = {
  id: 'local', name: 'Local', type: 'postgres', host: 'localhost', port: 5432,
  database: 'app', username: 'postgres', sslMode: 'prefer', color: 'green', defaultSchema: 'public'
};

describe('schema metadata cache store object metadata', () => {
  it('serializes routine and trigger metadata in the versioned snapshot', () => {
    const entry = schemaEntry({
      functions: [{ schema: 'public', name: 'lookup', kind: 'function', signature: 'lookup(integer)', arguments: ['integer'] }],
      procedures: [{ schema: 'public', name: 'rebuild', kind: 'procedure' }],
      triggers: [{ schema: 'public', table: 'users', name: 'audit_users' }]
    });

    const parsed = parseStoredSchemaCacheEntry(connection, serializeSchemaCacheEntry(connection, entry));

    expect(parsed?.entry.functions).toEqual(entry.functions);
    expect(parsed?.entry.procedures).toEqual(entry.procedures);
    expect(parsed?.entry.triggers).toEqual(entry.triggers);
  });

  it('serializes foreign-key metadata and hydrates older snapshots with an empty map', () => {
    const entry = schemaEntry({ foreignKeys: {
      'public.users': [{ name: 'users_team_fk', columns: ['team_id'], foreignSchema: 'public', foreignTable: 'teams', foreignColumns: ['id'] }]
    } });
    expect(parseStoredSchemaCacheEntry(connection, serializeSchemaCacheEntry(connection, entry))?.entry.foreignKeys)
      .toEqual(entry.foreignKeys);

    const legacy = schemaEntry({}) as SchemaCacheEntry & { foreignKeys?: SchemaCacheEntry['foreignKeys'] };
    delete legacy.foreignKeys;
    const raw = JSON.stringify({ version: 2, fingerprint: connectionMetadataFingerprint(connection), savedAt: Date.now(), entry: legacy });
    expect(parseStoredSchemaCacheEntry(connection, raw)?.entry.foreignKeys).toEqual({});
  });

  it('migrates version 1 snapshots without routine and trigger fields using empty arrays', () => {
    const legacyEntry = schemaEntry({}) as Partial<SchemaCacheEntry>;
    delete legacyEntry.functions;
    delete legacyEntry.procedures;
    delete legacyEntry.triggers;
    const raw = JSON.stringify({
      version: 1,
      fingerprint: connectionMetadataFingerprint(connection),
      savedAt: Date.now(),
      entry: legacyEntry
    });

    expect(parseStoredSchemaCacheEntry(connection, raw)?.entry).toEqual(expect.objectContaining({
      functions: [], procedures: [], triggers: []
    }));
  });

  it('rejects unsupported snapshot versions', () => {
    const raw = JSON.stringify({
      version: SCHEMA_METADATA_CACHE_VERSION + 1,
      fingerprint: connectionMetadataFingerprint(connection),
      savedAt: Date.now(),
      entry: schemaEntry({})
    });

    expect(parseStoredSchemaCacheEntry(connection, raw)).toBeUndefined();
  });
});

function schemaEntry(overrides: Partial<SchemaCacheEntry>): SchemaCacheEntry {
  return {
    connectionId: 'local', schemaName: 'public', schemas: [{ name: 'public' }], tables: [], views: [],
    functions: [], procedures: [], triggers: [], columns: {}, indexes: {}, keys: {}, foreignKeys: {}, status: 'ready', ...overrides
  };
}
