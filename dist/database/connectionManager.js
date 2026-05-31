"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const vscode = __importStar(require("vscode"));
const postgresDriver_1 = require("./drivers/postgresDriver");
const redshiftDriver_1 = require("./drivers/redshiftDriver");
const id_1 = require("../utils/id");
const connectionDefaults_1 = require("../services/connectionDefaults");
class ConnectionManager {
    store;
    drivers = new Map();
    active = new Map();
    activeConnectionEmitter = new vscode.EventEmitter();
    onDidChangeActiveConnections = this.activeConnectionEmitter.event;
    constructor(store) {
        this.store = store;
        this.drivers.set('postgres', new postgresDriver_1.PostgresDriver());
        this.drivers.set('redshift', new redshiftDriver_1.RedshiftDriver());
    }
    getConnections() {
        return this.store.getAll();
    }
    getActiveConnections() {
        return [...this.active.values()];
    }
    isConnected(id) {
        return this.active.has(id);
    }
    getConnection(id) {
        return this.store.getAll().find((connection) => connection.id === id);
    }
    getPreferredConnection() {
        const selected = this.store.getSelectedConnectionId();
        return this.active.get(selected ?? '')?.config
            ?? (selected ? this.getConnection(selected) : undefined)
            ?? this.getActiveConnections()[0]?.config
            ?? this.getConnections()[0];
    }
    async getConnectionWithPassword(id) {
        const config = this.getConnection(id);
        if (!config) {
            throw new Error('Connection not found.');
        }
        return this.store.withPassword(config);
    }
    getDriverByConnectionId(id) {
        const connection = this.getConnection(id);
        if (!connection) {
            throw new Error('Connection not found.');
        }
        return this.getDriver(connection.type);
    }
    getDriver(type) {
        const driver = this.drivers.get(type);
        if (!driver) {
            throw new Error(`Unsupported database type: ${type}`);
        }
        return driver;
    }
    async save(config) {
        const activeConnection = this.active.get(config.id);
        await this.store.save(config);
        if (!activeConnection) {
            return;
        }
        if (activeConnection.config.type !== config.type) {
            await this.getDriver(activeConnection.config.type).disconnect(config.id);
        }
        try {
            const nextConfig = await this.getConnectionWithPassword(config.id);
            const connection = await this.getDriver(nextConfig.type).connect(nextConfig);
            this.active.set(config.id, connection);
            await this.store.setSelectedConnectionId(config.id);
            this.activeConnectionEmitter.fire(config.id);
        }
        catch (error) {
            this.active.delete(config.id);
            this.activeConnectionEmitter.fire(config.id);
            throw error;
        }
    }
    async setSelectedConnection(id) {
        await this.store.setSelectedConnectionId(id);
    }
    async delete(id) {
        await this.disconnect(id);
        await this.store.delete(id);
    }
    async connect(id) {
        const config = await this.getConnectionWithPassword(id);
        try {
            const connection = await this.getDriver(config.type).connect(config);
            this.active.set(id, connection);
            await this.store.setSelectedConnectionId(id);
            this.activeConnectionEmitter.fire(id);
            return connection;
        }
        catch (error) {
            if (this.active.has(id)) {
                this.active.delete(id);
                this.activeConnectionEmitter.fire(id);
            }
            throw error;
        }
    }
    async disconnect(id) {
        const wasConnected = this.active.has(id);
        const config = this.getConnection(id);
        if (config) {
            await this.getDriver(config.type).disconnect(id);
        }
        this.active.delete(id);
        if (wasConnected) {
            this.activeConnectionEmitter.fire(id);
        }
    }
    async test(id) {
        const config = await this.getConnectionWithPassword(id);
        return this.testConfig(config);
    }
    async testConfig(config) {
        const result = await this.getDriver(config.type).testConnection(config);
        if (!result.ok) {
            throw new Error(`Connection failed for ${config.username}@${config.host}:${config.port}/${config.database}: ${result.message}`);
        }
        return result.serverVersion ?? result.message;
    }
    async pickConnection() {
        const connections = this.getConnections();
        if (connections.length === 0) {
            const create = await vscode.window.showInformationMessage('No database connections yet.', 'Add Connection');
            if (create === 'Add Connection') {
                return this.promptConnection();
            }
            return undefined;
        }
        const selectedId = this.store.getSelectedConnectionId();
        const picked = await vscode.window.showQuickPick(connections.map((connection) => ({
            label: truncateMiddle(connection.name, 48),
            description: `${this.isConnected(connection.id) ? 'online' : 'offline'} - ${connection.type}`,
            detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
            connection
        })), { placeHolder: 'Select database connection' });
        return picked?.connection ?? connections.find((connection) => connection.id === selectedId);
    }
    async promptConnection(existing) {
        const typePick = await vscode.window.showQuickPick([
            { label: 'PostgreSQL', type: 'postgres' },
            { label: 'Amazon Redshift', type: 'redshift' }
        ], { placeHolder: 'Database type' });
        if (!typePick) {
            return undefined;
        }
        const type = typePick.type;
        const defaults = (0, connectionDefaults_1.connectionDefaultsForType)(type);
        const name = await vscode.window.showInputBox({ prompt: 'Connection name', value: existing?.name ?? defaults.name });
        if (!name) {
            return undefined;
        }
        const host = await vscode.window.showInputBox({ prompt: 'Host', value: existing?.host ?? 'localhost' });
        if (!host) {
            return undefined;
        }
        const port = Number(await vscode.window.showInputBox({ prompt: 'Port', value: String(existing?.port ?? defaults.port) }));
        const database = await vscode.window.showInputBox({ prompt: 'Database', value: existing?.database ?? defaults.database });
        if (!database) {
            return undefined;
        }
        const username = await vscode.window.showInputBox({ prompt: 'Username', value: existing?.username });
        if (!username) {
            return undefined;
        }
        const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
        const ssl = await vscode.window.showQuickPick(['disable', 'prefer', 'require'], { placeHolder: 'SSL mode' });
        return {
            id: existing?.id ?? (0, id_1.createId)('conn'),
            name,
            type,
            host,
            port,
            database,
            username,
            password,
            sslMode: (ssl ?? defaults.sslMode),
            color: existing?.color ?? defaults.color,
            defaultSchema: existing?.defaultSchema ?? 'public',
            queryTimeoutMs: vscode.workspace.getConfiguration('database').get('query.timeoutMs', 300000)
        };
    }
}
exports.ConnectionManager = ConnectionManager;
function truncateMiddle(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
    return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
//# sourceMappingURL=connectionManager.js.map