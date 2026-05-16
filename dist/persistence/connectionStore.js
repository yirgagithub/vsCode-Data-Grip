"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionStore = void 0;
const CONNECTIONS_KEY = 'database.connections';
const SELECTED_CONNECTION_KEY = 'database.selectedConnectionId';
class ConnectionStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.globalState.get(CONNECTIONS_KEY, []);
    }
    async save(config) {
        const { password, ...metadata } = config;
        const connections = this.getAll().filter((item) => item.id !== config.id);
        connections.push(metadata);
        await this.context.globalState.update(CONNECTIONS_KEY, connections.sort((a, b) => a.name.localeCompare(b.name)));
        if (password !== undefined) {
            await this.context.secrets.store(this.secretKey(config.id), password);
        }
    }
    async delete(id) {
        await this.context.globalState.update(CONNECTIONS_KEY, this.getAll().filter((item) => item.id !== id));
        await this.context.secrets.delete(this.secretKey(id));
    }
    async withPassword(config) {
        return { ...config, password: await this.context.secrets.get(this.secretKey(config.id)) };
    }
    getSelectedConnectionId() {
        return this.context.workspaceState.get(SELECTED_CONNECTION_KEY);
    }
    async setSelectedConnectionId(id) {
        await this.context.workspaceState.update(SELECTED_CONNECTION_KEY, id);
    }
    secretKey(id) {
        return `database.connection.${id}.password`;
    }
}
exports.ConnectionStore = ConnectionStore;
//# sourceMappingURL=connectionStore.js.map