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
        const existing = this.get(documentUri);
        const records = this.getAll().filter((record) => record.documentUri !== documentUri);
        records.push({ ...existing, documentUri, connectionId, updatedAt: Date.now() });
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS));
    }
    async markExecuted(documentUri, connectionId, range) {
        const now = Date.now();
        const existing = this.get(documentUri);
        const records = this.getAll().filter((record) => record.documentUri !== documentUri);
        records.push({
            ...existing,
            documentUri,
            connectionId,
            lastExecutedRange: range,
            lastTouchedAt: now,
            updatedAt: now
        });
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, records.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SQL_DOCUMENT_CONNECTIONS));
    }
    async touch(documentUri) {
        const now = Date.now();
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, this.getAll().map((record) => record.documentUri === documentUri
            ? { ...record, lastTouchedAt: now, updatedAt: now }
            : record));
    }
    async delete(documentUri) {
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, this.getAll().filter((record) => record.documentUri !== documentUri));
    }
    async deleteMany(documentUris) {
        const uriSet = new Set(documentUris);
        if (!uriSet.size) {
            return;
        }
        await this.context.workspaceState.update(SQL_DOCUMENT_CONNECTIONS_KEY, this.getAll().filter((record) => !uriSet.has(record.documentUri)));
    }
}
exports.SqlDocumentConnectionStore = SqlDocumentConnectionStore;
//# sourceMappingURL=sqlDocumentConnectionStore.js.map