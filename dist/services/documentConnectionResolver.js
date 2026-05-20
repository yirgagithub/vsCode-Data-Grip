"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDocumentConnection = resolveDocumentConnection;
function resolveDocumentConnection(documentUri, bindings, connections, fallback) {
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
//# sourceMappingURL=documentConnectionResolver.js.map