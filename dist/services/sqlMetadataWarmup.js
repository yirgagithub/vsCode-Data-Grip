"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectAndRefreshSqlMetadata = connectAndRefreshSqlMetadata;
async function connectAndRefreshSqlMetadata(connectionManager, schemaContext, connection) {
    let refreshConnection = connection;
    if (!connectionManager.isConnected(connection.id)) {
        const active = await connectionManager.connect(connection.id);
        refreshConnection = active.config;
    }
    schemaContext.refreshDefaultSchemaInBackground(refreshConnection);
}
//# sourceMappingURL=sqlMetadataWarmup.js.map