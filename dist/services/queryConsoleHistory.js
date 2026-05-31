"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryConsoleDocumentUris = queryConsoleDocumentUris;
exports.executionOriginForDocument = executionOriginForDocument;
exports.isQueryConsoleHistoryItem = isQueryConsoleHistoryItem;
exports.isQueryConsoleMemoryItem = isQueryConsoleMemoryItem;
function queryConsoleDocumentUris(records) {
    return new Set(records.map((record) => record.documentUri));
}
function executionOriginForDocument(documentUri, consoleDocumentUris) {
    return documentUri && consoleDocumentUris.has(documentUri) ? 'queryConsole' : 'sqlFile';
}
function isQueryConsoleHistoryItem(item, consoleDocumentUris) {
    if (item.sourceOrigin) {
        return item.sourceOrigin === 'queryConsole';
    }
    return item.documentUri !== undefined && (consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri));
}
function isQueryConsoleMemoryItem(item, consoleDocumentUris) {
    return item.documentUri !== undefined && (consoleDocumentUris.has(item.documentUri) || isLegacyQueryConsoleDocumentUri(item.documentUri));
}
function isLegacyQueryConsoleDocumentUri(documentUri) {
    const normalized = documentUri.toLowerCase().replace(/\\/g, '/');
    return normalized.includes('/.vscode-data-grip/') || normalized.includes('/query-consoles/');
}
//# sourceMappingURL=queryConsoleHistory.js.map