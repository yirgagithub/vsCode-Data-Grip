import { ConnectionConfig } from '../types';

export interface DocumentConnectionBinding {
  documentUri: string;
  connectionId: string;
}

export interface DocumentConnectionResolution {
  connection?: ConnectionConfig;
  isBound: boolean;
  boundConnectionId?: string;
}

export function resolveDocumentConnection(
  documentUri: string,
  bindings: DocumentConnectionBinding[],
  connections: ConnectionConfig[],
  fallback?: ConnectionConfig
): DocumentConnectionResolution {
  const binding = bindings.find((record) => record.documentUri === documentUri);
  if (binding) {
    return {
      connection: connections.find((connection) => connection.id === binding.connectionId),
      isBound: true,
      boundConnectionId: binding.connectionId
    };
  }

  return {
    connection: fallback,
    isBound: false
  };
}
