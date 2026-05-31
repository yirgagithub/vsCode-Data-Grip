import { QueryConsoleRecord, QueryExecutionOrigin, QueryHistoryItem, QueryMemoryItem } from '../types';

export function queryConsoleDocumentUris(records: QueryConsoleRecord[]): Set<string> {
  return new Set(records.map((record) => record.documentUri));
}

export function executionOriginForDocument(documentUri: string | undefined, consoleDocumentUris: Set<string>): QueryExecutionOrigin {
  return documentUri && consoleDocumentUris.has(documentUri) ? 'queryConsole' : 'sqlFile';
}

export function isQueryConsoleHistoryItem(item: QueryHistoryItem, consoleDocumentUris: Set<string>): boolean {
  if (item.sourceOrigin) {
    return item.sourceOrigin === 'queryConsole';
  }
  return item.documentUri !== undefined && (
    consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri)
  );
}

export function isQueryConsoleMemoryItem(item: QueryMemoryItem, consoleDocumentUris: Set<string>): boolean {
  return item.documentUri !== undefined && (
    consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri)
  );
}

function isLegacyQueryConsoleDocumentUri(documentUri: string): boolean {
  const normalized = documentUri.toLowerCase().replace(/\\/g, '/');
  return normalized.includes('/.vscode-data-grip/') || normalized.includes('/query-consoles/');
}
