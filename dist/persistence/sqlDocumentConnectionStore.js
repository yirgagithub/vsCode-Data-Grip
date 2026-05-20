"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlDocumentConnectionStore = void 0;
const SQL_DOCUMENT_CONNECTIONS_KEY = 'database.sqlDocumentConnections';
const MAX_SQL_DOCUMENT_CONNECTIONS = 500;
class SqlDocumentConnectionStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.workspaceState.get(SQL_DOCUMENT_CONNECTIONS_KEY, []);
    }
    get(documentUri) {
        return this.getAll().find((record) => record.documentUri === documentUri);
    }
    async set(documentUri, connectionId) {
        const records = this.getAll().filter((record) => record.documentUri !== documentUri);
        records.push({ documentUri, connectionId, updatedAt: Date.now() });
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS));
    }
    async delete(documentUri) {
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, this.getAll().filter((record) => record.documentUri !== documentUri));
    }
}
exports.SqlDocumentConnectionStore = SqlDocumentConnectionStore;
//# sourceMappingURL=sqlDocumentConnectionStore.js.map