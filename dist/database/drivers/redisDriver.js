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
exports.RedisDriver = void 0;
const runtimeLoader_1 = require("../../runtime/runtimeLoader");
const driverUtils_1 = require("./driverUtils");
const REDIS_TABLES = [
    { name: 'strings', redisType: 'string' },
    { name: 'hashes', redisType: 'hash' },
    { name: 'lists', redisType: 'list' },
    { name: 'sets', redisType: 'set' },
    { name: 'sorted_sets', redisType: 'zset' },
    { name: 'streams', redisType: 'stream' },
    { name: 'keys', redisType: '' }
];
class RedisDriver extends driverUtils_1.BasicDatabaseDriver {
    id = 'redis';
    displayName = 'Redis';
    clients = new Map();
    configs = new Map();
    async beginTransaction(_connectionId) { }
    async commitTransaction(_connectionId) { }
    async rollbackTransaction(_connectionId) { }
    async connect(config) {
        await this.disconnect(config.id);
        const redis = await loadRedis();
        const client = redis.createClient({
            username: config.username || undefined,
            password: config.password || undefined,
            database: parseRedisDatabase(config.database),
            socket: {
                host: config.host,
                port: config.port,
                tls: config.sslMode !== 'disable',
                connectTimeout: config.connectTimeoutMs ?? 10000
            }
        });
        await client.connect();
        await client.sendCommand(['PING']);
        this.clients.set(config.id, client);
        this.configs.set(config.id, config);
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        const client = this.clients.get(connectionId);
        if (!client) {
            return;
        }
        this.clients.delete(connectionId);
        this.configs.delete(connectionId);
        await client.disconnect();
    }
    async testConnection(config) {
        let connection;
        try {
            connection = await this.connect(config);
            const version = await this.executeQuery({ connectionId: connection.id, sql: 'INFO server' });
            return { ok: true, message: 'Connection successful', serverVersion: (0, driverUtils_1.optionalString)(version.rows.find((row) => row.key === 'redis_version')?.value) };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        finally {
            if (connection) {
                await this.disconnect(connection.id).catch(() => undefined);
            }
        }
    }
    async executeQuery(params) {
        const [result] = await this.executeStatements(params, [params.sql]);
        return result;
    }
    async executeStatements(params, statements) {
        const client = this.requireClient(params.connectionId);
        const results = [];
        for (const sql of statements) {
            const started = Date.now();
            const args = parseRedisCommand(sql);
            if (args.length === 0) {
                results.push((0, driverUtils_1.emptyExecutionResult)(started, sql));
                continue;
            }
            try {
                const reply = await client.sendCommand(args);
                const rows = redisReplyRows(args[0], reply);
                results.push((0, driverUtils_1.executionResultFromRows)(rows, started, sql));
            }
            catch (error) {
                throw (0, driverUtils_1.toQueryError)(error);
            }
        }
        return results;
    }
    async getSchemas(connectionId) {
        const connection = this.requireConnectionConfig(connectionId);
        return [{ name: `db${parseRedisDatabase(connection.database)}` }];
    }
    async getTables(connectionId, schema) {
        this.requireClient(connectionId);
        return REDIS_TABLES.map((item) => ({ schema, name: item.name, type: 'table' }));
    }
    async getColumns(_connectionId, schema, table) {
        const fields = ['key', 'type', 'ttl', 'size', 'value'];
        return fields.map((name, index) => ({
            schema,
            table,
            name,
            ordinal: index + 1,
            dataType: name === 'ttl' || name === 'size' ? 'integer' : 'text',
            nullable: name !== 'key' && name !== 'type'
        }));
    }
    async getTablePreview(connectionId, _schema, table, limit, options) {
        const started = Date.now();
        const client = this.requireClient(connectionId);
        const redisType = REDIS_TABLES.find((item) => item.name === table)?.redisType ?? '';
        const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 501;
        const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
        const pattern = redisKeyPattern(options?.where);
        const keys = await scanKeys(client, pattern, offset + pageLimit);
        const page = keys.slice(offset, offset + pageLimit);
        const rows = [];
        for (const key of page) {
            const type = String(await client.sendCommand(['TYPE', key]));
            if (redisType && type !== redisType) {
                continue;
            }
            const ttl = (0, driverUtils_1.numberFromDb)(await client.sendCommand(['TTL', key]));
            rows.push({
                key,
                type,
                ttl,
                size: await redisValueSize(client, key, type),
                value: await redisPreviewValue(client, key, type)
            });
        }
        return {
            ...(0, driverUtils_1.executionResultFromRows)(rows, started, `SCAN ${pattern}`),
            hasMore: rows.length > limit
        };
    }
    async getTableDDL(_connectionId, schema, table) {
        return [
            `-- Redis logical view: ${schema}.${table}`,
            '-- Redis is a key-value store; inspect data with commands such as:',
            `-- SCAN 0 MATCH * COUNT 100`,
            `-- TYPE <key>`,
            `-- GET <key> / HGETALL <key> / LRANGE <key> 0 99`
        ].join('\n');
    }
    requireClient(connectionId) {
        const client = this.clients.get(connectionId);
        if (!client) {
            throw new Error('Connection is not active. Connect first.');
        }
        return client;
    }
    requireConnectionConfig(connectionId) {
        const config = this.configs.get(connectionId);
        if (!config) {
            throw new Error('Connection is not active. Connect first.');
        }
        return config;
    }
}
exports.RedisDriver = RedisDriver;
let redisRuntime;
function loadRedis() {
    redisRuntime ??= loadRedisRuntime();
    return redisRuntime;
}
async function loadRedisRuntime() {
    const bundled = (0, runtimeLoader_1.loadBundledRuntime)('redisRuntime');
    if (bundled) {
        return bundled;
    }
    return Promise.resolve().then(() => __importStar(require('redis'))).then((module) => {
        const candidate = module;
        return 'createClient' in candidate ? candidate : candidate.default;
    });
}
function parseRedisDatabase(value) {
    const next = Number(value || 0);
    return Number.isInteger(next) && next >= 0 ? next : 0;
}
function parseRedisCommand(sql) {
    const text = sql.trim().replace(/;+\s*$/, '');
    const args = [];
    const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|(\S+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        args.push((match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/\\(["'`\\])/g, '$1'));
    }
    return args;
}
function redisReplyRows(command, reply) {
    if (command.toUpperCase() === 'INFO' && typeof reply === 'string') {
        return reply.split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
            .map((line) => {
            const index = line.indexOf(':');
            return index >= 0 ? { key: line.slice(0, index), value: line.slice(index + 1) } : { value: line };
        });
    }
    if (Array.isArray(reply)) {
        return reply.map((value, index) => ({ index, value: stringifyRedisValue(value) }));
    }
    if (reply && typeof reply === 'object' && !(reply instanceof Buffer)) {
        return Object.entries(reply).map(([key, value]) => ({ key, value: stringifyRedisValue(value) }));
    }
    return [{ value: stringifyRedisValue(reply) }];
}
function stringifyRedisValue(value) {
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value ?? null;
    }
    if (value instanceof Buffer) {
        return value.toString('utf8');
    }
    return JSON.stringify(value);
}
function redisKeyPattern(where) {
    const trimmed = where?.trim();
    if (!trimmed) {
        return '*';
    }
    const match = trimmed.match(/^(?:key\s+(?:like|=)\s*)?['"]?([^'";]+)['"]?$/i);
    if (!match) {
        throw new Error('Redis preview filter must be a key pattern, for example: user:*');
    }
    return match[1].replace(/%/g, '*');
}
async function scanKeys(client, pattern, limit) {
    const keys = [];
    let cursor = '0';
    do {
        const reply = await client.sendCommand(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
        if (!Array.isArray(reply) || reply.length < 2) {
            break;
        }
        cursor = String(reply[0]);
        const batch = Array.isArray(reply[1]) ? reply[1] : [];
        keys.push(...batch.map((key) => String(key)));
    } while (cursor !== '0' && keys.length < limit);
    return keys;
}
async function redisValueSize(client, key, type) {
    const command = {
        string: ['STRLEN', key],
        hash: ['HLEN', key],
        list: ['LLEN', key],
        set: ['SCARD', key],
        zset: ['ZCARD', key],
        stream: ['XLEN', key]
    };
    const args = command[type];
    return args ? (0, driverUtils_1.numberFromDb)(await client.sendCommand(args)) : undefined;
}
async function redisPreviewValue(client, key, type) {
    const commands = {
        string: ['GET', key],
        hash: ['HGETALL', key],
        list: ['LRANGE', key, '0', '9'],
        set: ['SMEMBERS', key],
        zset: ['ZRANGE', key, '0', '9', 'WITHSCORES'],
        stream: ['XRANGE', key, '-', '+', 'COUNT', '10']
    };
    const args = commands[type];
    if (!args) {
        return undefined;
    }
    const value = await client.sendCommand(args);
    return (0, driverUtils_1.optionalString)(stringifyRedisValue(value));
}
//# sourceMappingURL=redisDriver.js.map