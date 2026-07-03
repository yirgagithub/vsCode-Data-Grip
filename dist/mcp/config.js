"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMcpConfig = loadMcpConfig;
const fs_1 = require("fs");
const path_1 = require("path");
const zod_1 = require("zod");
function loadMcpConfig(configPath = process.env.QUERYDECK_MCP_CONFIG) {
    if (!configPath) {
        throw new Error('Set QUERYDECK_MCP_CONFIG to a QueryDeck MCP config JSON file.');
    }
    const resolved = (0, path_1.resolve)(configPath);
    const config = parseConfig(JSON.parse((0, fs_1.readFileSync)(resolved, 'utf8')), resolved);
    return {
        ...config,
        queryMemory: [
            ...(config.queryMemory ?? []),
            ...loadQueryMemoryFile(config.queryMemoryFile, (0, path_1.dirname)(resolved))
        ]
    };
}
const databaseTypeSchema = zod_1.z.enum(['postgres', 'redshift', 'mysql', 'sqlite', 'sqlserver', 'oracle', 'redis', 'snowflake']);
const connectionColorSchema = zod_1.z.enum(['red', 'yellow', 'green', 'blue', 'purple', 'gray']);
const sslModeSchema = zod_1.z.enum(['disable', 'prefer', 'require']);
const defaultMaxRowsSchema = zod_1.z.preprocess((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return value;
    }
    return Math.min(Math.floor(value), 1000);
}, zod_1.z.number().int().positive().optional());
const connectionSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    type: databaseTypeSchema,
    host: zod_1.z.string(),
    port: zod_1.z.number().int().positive(),
    database: zod_1.z.string(),
    username: zod_1.z.string(),
    sslMode: sslModeSchema,
    color: connectionColorSchema,
    password: zod_1.z.string().optional(),
    passwordEnv: zod_1.z.string().min(1).optional(),
    defaultSchema: zod_1.z.string().optional(),
    connectTimeoutMs: zod_1.z.number().int().positive().optional(),
    queryTimeoutMs: zod_1.z.number().int().positive().optional(),
    production: zod_1.z.boolean().optional(),
    readOnlyDefault: zod_1.z.boolean().optional(),
    sshTunnel: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        host: zod_1.z.string(),
        port: zod_1.z.number().int().positive().optional(),
        username: zod_1.z.string(),
        privateKeyPath: zod_1.z.string().optional(),
        localHost: zod_1.z.string().optional(),
        localPort: zod_1.z.number().int().positive().optional()
    }).optional()
});
const queryMemoryItemSchema = zod_1.z.object({ id: zod_1.z.string() }).passthrough();
const configSchema = zod_1.z.object({
    connections: zod_1.z.array(connectionSchema).min(1),
    queryMemory: zod_1.z.array(queryMemoryItemSchema).optional(),
    queryMemoryFile: zod_1.z.string().min(1).optional(),
    defaultMaxRows: defaultMaxRowsSchema
});
function parseConfig(value, configPath) {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
        const reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ');
        throw new Error(`Invalid QueryDeck MCP config ${configPath}: ${reason}`);
    }
    return parsed.data;
}
function loadQueryMemoryFile(filePath, baseDir) {
    if (!filePath) {
        return [];
    }
    const resolved = (0, path_1.isAbsolute)(filePath) ? filePath : (0, path_1.resolve)(baseDir, filePath);
    const value = JSON.parse((0, fs_1.readFileSync)(resolved, 'utf8'));
    const parsed = zod_1.z.array(queryMemoryItemSchema).safeParse(value);
    if (!parsed.success) {
        const reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'queryMemory'}: ${issue.message}`).join('; ');
        throw new Error(`Invalid QueryDeck MCP query memory file ${resolved}: ${reason}`);
    }
    return parsed.data;
}
//# sourceMappingURL=config.js.map