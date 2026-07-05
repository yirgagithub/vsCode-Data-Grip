import { readFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { z } from 'zod';
import { ConnectionConfigWithPassword, QueryMemoryItem } from '../types';

export interface McpConnectionConfig extends ConnectionConfigWithPassword {
  passwordEnv?: string;
}

export interface QueryDeckMcpConfig {
  connections: McpConnectionConfig[];
  queryMemory?: QueryMemoryItem[];
  queryMemoryFile?: string;
  defaultMaxRows?: number;
}

export function loadMcpConfig(configPath = process.env.QUERYDECK_MCP_CONFIG): QueryDeckMcpConfig {
  if (!configPath) {
    throw new Error('Set QUERYDECK_MCP_CONFIG to a QueryDeck MCP config JSON file.');
  }
  const resolved = resolve(configPath);
  const config = parseConfig(JSON.parse(readFileSync(resolved, 'utf8')), resolved);
  return {
    ...config,
    queryMemory: [
      ...(config.queryMemory ?? []),
      ...loadQueryMemoryFile(config.queryMemoryFile, dirname(resolved))
    ]
  };
}

const databaseTypeSchema = z.enum(['postgres', 'redshift', 'mysql', 'sqlite', 'sqlserver', 'oracle', 'redis', 'snowflake']);
const connectionColorSchema = z.enum(['red', 'yellow', 'green', 'blue', 'purple', 'gray']);
const sslModeSchema = z.enum(['disable', 'prefer', 'require']);
const defaultMaxRowsSchema = z.preprocess((value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }
  return Math.min(Math.floor(value), 1000);
}, z.number().int().positive().optional());
const connectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: databaseTypeSchema,
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  username: z.string(),
  sslMode: sslModeSchema,
  color: connectionColorSchema,
  password: z.string().optional(),
  passwordEnv: z.string().min(1).optional(),
  defaultSchema: z.string().optional(),
  connectTimeoutMs: z.number().int().positive().optional(),
  queryTimeoutMs: z.number().int().positive().optional(),
  production: z.boolean().optional(),
  readOnlyDefault: z.boolean().optional(),
  sshTunnel: z.object({
    enabled: z.boolean(),
    host: z.string(),
    port: z.number().int().positive().optional(),
    username: z.string(),
    privateKeyPath: z.string().optional(),
    localHost: z.string().optional(),
    localPort: z.number().int().positive().optional()
  }).optional()
});
const queryMemoryItemSchema = z.object({ id: z.string() }).passthrough();
const configSchema = z.object({
  connections: z.array(connectionSchema).min(1),
  queryMemory: z.array(queryMemoryItemSchema).optional(),
  queryMemoryFile: z.string().min(1).optional(),
  defaultMaxRows: defaultMaxRowsSchema
});

function parseConfig(value: unknown, configPath: string): QueryDeckMcpConfig {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid QueryDeck MCP config ${configPath}: ${reason}`);
  }
  return parsed.data as QueryDeckMcpConfig;
}

function loadQueryMemoryFile(filePath: string | undefined, baseDir: string): QueryMemoryItem[] {
  if (!filePath) {
    return [];
  }
  const resolved = isAbsolute(filePath) ? filePath : resolve(baseDir, filePath);
  const value = JSON.parse(readFileSync(resolved, 'utf8')) as unknown;
  const parsed = z.array(queryMemoryItemSchema).safeParse(value);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'queryMemory'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid QueryDeck MCP query memory file ${resolved}: ${reason}`);
  }
  return parsed.data as unknown as QueryMemoryItem[];
}
