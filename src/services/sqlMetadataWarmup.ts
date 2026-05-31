import type { ConnectionConfig, DbConnection } from '../types';
import type { SchemaContextService } from './schemaContextService';
import type { ConnectionManager } from '../database/connectionManager';

type MetadataConnectionManager = Pick<ConnectionManager, 'connect' | 'isConnected'>;
type MetadataSchemaContext = Pick<SchemaContextService, 'refreshDefaultSchemaInBackground'>;

export async function connectAndRefreshSqlMetadata(
  connectionManager: MetadataConnectionManager,
  schemaContext: MetadataSchemaContext,
  connection: ConnectionConfig
): Promise<void> {
  let refreshConnection = connection;
  if (!connectionManager.isConnected(connection.id)) {
    const active = await connectionManager.connect(connection.id) as DbConnection;
    refreshConnection = active.config;
  }
  schemaContext.refreshDefaultSchemaInBackground(refreshConnection);
}
