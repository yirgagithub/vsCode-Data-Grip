import type { ConnectionManager } from '../database/connectionManager';
import type { ConnectionConfig, DbConnection, SchemaCacheEntry } from '../types';
import type { SchemaContextService } from './schemaContextService';

type MetadataConnectionManager = Pick<ConnectionManager, 'connect' | 'isConnected'>;
type MetadataSchemaContext = Pick<SchemaContextService, 'invalidate' | 'loadSchema'>;

export async function refreshSqlMetadata(
  connectionManager: MetadataConnectionManager,
  schemaContext: MetadataSchemaContext,
  connection: ConnectionConfig,
  schemaNames: string[]
): Promise<void> {
  let refreshConnection = connection;
  if (!connectionManager.isConnected(connection.id)) {
    const active = await connectionManager.connect(connection.id) as DbConnection;
    refreshConnection = active.config;
  }

  const schemas = [...new Set(schemaNames.length ? schemaNames : [refreshConnection.defaultSchema ?? 'public'])];
  schemaContext.invalidate(refreshConnection.id);
  for (const schemaName of schemas) {
    const entry = await schemaContext.loadSchema(refreshConnection, schemaName, true) as SchemaCacheEntry;
    if (entry.status !== 'ready') {
      throw new Error(entry.errorMessage ?? `Could not refresh metadata for schema "${schemaName}".`);
    }
  }
}
