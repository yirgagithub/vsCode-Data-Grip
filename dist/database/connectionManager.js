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
const mysqlDriver_1 = require("./drivers/mysqlDriver");
const sqliteDriver_1 = require("./drivers/sqliteDriver");
const sqlServerDriver_1 = require("./drivers/sqlServerDriver");
const oracleDriver_1 = require("./drivers/oracleDriver");
const redisDriver_1 = require("./drivers/redisDriver");
const snowflakeDriver_1 = require("./drivers/snowflakeDriver");
const id_1 = require("../utils/id");
const connectionDefaults_1 = require("../services/connectionDefaults");
const sshTunnelManager_1 = require("../services/sshTunnelManager");
class ConnectionManager {
    store;
    drivers = new Map();
    active = new Map();
    transactionModes = new Map();
    activeConnectionEmitter = new vscode.EventEmitter();
    sshTunnelManager = new sshTunnelManager_1.SshTunnelManager();
    connectionCreator;
    onDidChangeActiveConnections = this.activeConnectionEmitter.event;
    constructor(store) {
        this.store = store;
        this.drivers.set('postgres', new postgresDriver_1.PostgresDriver());
        this.drivers.set('redshift', new redshiftDriver_1.RedshiftDriver());
        this.drivers.set('mysql', new mysqlDriver_1.MySQLDriver());
        this.drivers.set('sqlite', new sqliteDriver_1.SQLiteDriver());
        this.drivers.set('sqlserver', new sqlServerDriver_1.SqlServerDriver());
        this.drivers.set('oracle', new oracleDriver_1.OracleDriver());
        this.drivers.set('redis', new redisDriver_1.RedisDriver());
        this.drivers.set('snowflake', new snowflakeDriver_1.SnowflakeDriver());
    }
    setConnectionCreator(creator) {
        this.connectionCreator = creator;
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
        await this.disconnect(config.id);
        await this.connect(config.id);
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
        const driver = this.getDriver(config.type);
        try {
            const tunneled = await this.sshTunnelManager.open(config);
            await driver.connect(tunneled);
            const connection = { id: config.id, config, connectedAt: Date.now() };
            this.active.set(id, connection);
            await this.store.setSelectedConnectionId(id);
            this.activeConnectionEmitter.fire(id);
            return connection;
        }
        catch (error) {
            await this.sshTunnelManager.close(id).catch(() => undefined);
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
        await this.sshTunnelManager.close(id).catch(() => undefined);
        this.active.delete(id);
        this.transactionModes.delete(id);
        if (wasConnected) {
            this.activeConnectionEmitter.fire(id);
        }
    }
    async test(id) {
        const config = await this.getConnectionWithPassword(id);
        return this.testConfig(config);
    }
    async testConfig(config) {
        const driver = this.getDriver(config.type);
        const tunneled = await this.sshTunnelManager.open(config);
        try {
            const result = await driver.testConnection(tunneled);
            if (!result.ok) {
                throw new Error(`Connection failed for ${config.username}@${config.host}:${config.port}/${config.database}: ${result.message}`);
            }
            return result.serverVersion ?? result.message;
        }
        finally {
            await this.sshTunnelManager.close(config.id).catch(() => undefined);
        }
    }
    getTransactionMode(id) {
        return this.transactionModes.get(id) ?? 'auto';
    }
    setTransactionMode(id, mode) {
        if (mode === 'auto') {
            this.transactionModes.delete(id);
        }
        else {
            this.transactionModes.set(id, mode);
        }
    }
    isTransactionOpen(id) {
        const connection = this.getConnection(id);
        return connection ? this.getDriver(connection.type).isTransactionOpen(id) : false;
    }
    async beginTransaction(id) {
        const connection = this.getConnection(id);
        if (!connection) {
            throw new Error('Connection not found.');
        }
        await this.getDriver(connection.type).beginTransaction(id);
        this.transactionModes.set(id, 'manual');
    }
    async commitTransaction(id) {
        const connection = this.getConnection(id);
        if (!connection) {
            throw new Error('Connection not found.');
        }
        await this.getDriver(connection.type).commitTransaction(id);
    }
    async rollbackTransaction(id) {
        const connection = this.getConnection(id);
        if (!connection) {
            throw new Error('Connection not found.');
        }
        await this.getDriver(connection.type).rollbackTransaction(id);
    }
    async pickConnection() {
        const connections = this.getConnections();
        if (connections.length === 0) {
            const create = await vscode.window.showInformationMessage('No database connections yet.', 'Add Connection');
            if (create === 'Add Connection') {
                return this.connectionCreator?.();
            }
            return undefined;
        }
        const selectedId = this.store.getSelectedConnectionId();
        const picked = await vscode.window.showQuickPick(connections.map((connection) => ({
            label: truncateMiddle(connection.name, 48),
            description: `${this.isConnected(connection.id) ? 'online' : 'offline'} - ${connection.type}${connection.production ? ' - prod' : ''}`,
            detail: `${connection.username}@${connection.host}:${connection.port}/${connection.database}`,
            connection
        })), { placeHolder: 'Select database connection' });
        return picked?.connection ?? connections.find((connection) => connection.id === selectedId);
    }
    async promptConnection(existing) {
        const typePick = await vscode.window.showQuickPick([
            { label: 'PostgreSQL', type: 'postgres' },
            { label: 'Amazon Redshift', type: 'redshift' },
            { label: 'MySQL', type: 'mysql' },
            { label: 'SQLite', type: 'sqlite' },
            { label: 'Microsoft SQL Server', type: 'sqlserver' },
            { label: 'Oracle', type: 'oracle' },
            { label: 'Redis', type: 'redis' },
            { label: 'Snowflake', type: 'snowflake' }
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
        const host = type === 'sqlite'
            ? defaults.host
            : await vscode.window.showInputBox({ prompt: connectionHostPrompt(type), value: existing?.host ?? defaults.host });
        if (!host && type !== 'sqlite') {
            return undefined;
        }
        const port = type === 'sqlite'
            ? 0
            : Number(await vscode.window.showInputBox({ prompt: 'Port', value: String(existing?.port ?? defaults.port) }));
        if (type !== 'sqlite' && (!Number.isInteger(port) || port <= 0)) {
            void vscode.window.showErrorMessage(`${typePick.label} port must be a positive whole number.`);
            return undefined;
        }
        const database = type === 'sqlite'
            ? await this.pickSqliteDatabase(existing?.database ?? defaults.database)
            : await vscode.window.showInputBox({ prompt: connectionDatabasePrompt(type), value: existing?.database ?? defaults.database });
        if (!database) {
            return undefined;
        }
        if (type === 'redis') {
            const databaseIndex = Number(database);
            if (!Number.isInteger(databaseIndex) || databaseIndex < 0) {
                void vscode.window.showErrorMessage('Redis database index must be a zero-based whole number, for example 0.');
                return undefined;
            }
        }
        const username = type === 'sqlite'
            ? defaults.username
            : await vscode.window.showInputBox({ prompt: type === 'redis' ? 'ACL username (optional)' : 'Username', value: existing?.username ?? defaults.username });
        if (type !== 'sqlite' && type !== 'redis' && !username) {
            return undefined;
        }
        const password = type === 'sqlite' ? undefined : await vscode.window.showInputBox({ prompt: 'Password', password: true });
        const ssl = type === 'sqlite' ? defaults.sslMode : await vscode.window.showQuickPick(['disable', 'prefer', 'require'], { placeHolder: connectionSslPrompt(type) });
        return {
            id: existing?.id ?? (0, id_1.createId)('conn'),
            name,
            type,
            host: host || defaults.host,
            port: type === 'sqlite' ? 0 : port,
            database,
            username: username ?? '',
            password,
            sslMode: (ssl ?? defaults.sslMode),
            color: existing?.color ?? defaults.color,
            defaultSchema: existing?.defaultSchema ?? defaults.defaultSchema,
            queryTimeoutMs: vscode.workspace.getConfiguration('database').get('query.timeoutMs', 300000)
        };
    }
    async pickSqliteDatabase(current) {
        const choice = await vscode.window.showQuickPick([
            { label: 'Choose SQLite database file', value: 'file' },
            { label: 'Use in-memory database', description: ':memory:', value: 'memory' }
        ], { placeHolder: current === ':memory:' ? 'SQLite database' : `SQLite database: ${current}` });
        if (!choice) {
            return undefined;
        }
        if (choice.value === 'memory') {
            return ':memory:';
        }
        const files = await vscode.window.showOpenDialog({
            title: 'Choose SQLite database file',
            openLabel: 'Use Database File',
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'SQLite databases': ['db', 'sqlite', 'sqlite3'],
                'All files': ['*']
            }
        });
        return files?.[0]?.fsPath;
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
function connectionHostPrompt(type) {
    if (type === 'snowflake') {
        return 'Snowflake account identifier';
    }
    if (type === 'redshift') {
        return 'Redshift cluster endpoint';
    }
    if (type === 'sqlserver') {
        return 'SQL Server host';
    }
    return 'Host';
}
function connectionDatabasePrompt(type) {
    if (type === 'oracle') {
        return 'Oracle service name';
    }
    if (type === 'redis') {
        return 'Redis database index';
    }
    return 'Database';
}
function connectionSslPrompt(type) {
    if (type === 'sqlserver') {
        return 'SSL mode: prefer trusts the server certificate, require validates it';
    }
    if (type === 'redshift' || type === 'snowflake') {
        return 'SSL mode: require is recommended';
    }
    if (type === 'redis') {
        return 'SSL mode: use require for rediss/TLS endpoints';
    }
    return 'SSL mode';
}
//# sourceMappingURL=connectionManager.js.map