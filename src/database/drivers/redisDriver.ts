import { ConnectionConfigWithPassword, DbConnection, ExecuteQueryParams, ColumnInfo, SchemaInfo, TableInfo, QueryExecutionResult, TablePreviewOptions } from '../../types';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { BasicDatabaseDriver, emptyExecutionResult, executionResultFromRows, numberFromDb, optionalString, toQueryError } from './driverUtils';

type RedisClient = {
  connect(): Promise<RedisClient>;
  disconnect(): Promise<void>;
  sendCommand<T = unknown>(args: ReadonlyArray<string | Buffer>): Promise<T>;
};

type RedisRuntime = {
  createClient(config: Record<string, unknown>): RedisClient;
};

const REDIS_TABLES = [
  { name: 'strings', redisType: 'string' },
  { name: 'hashes', redisType: 'hash' },
  { name: 'lists', redisType: 'list' },
  { name: 'sets', redisType: 'set' },
  { name: 'sorted_sets', redisType: 'zset' },
  { name: 'streams', redisType: 'stream' },
  { name: 'keys', redisType: '' }
];

export class RedisDriver extends BasicDatabaseDriver {
  readonly id = 'redis' as const;
  readonly displayName = 'Redis';
  private readonly clients = new Map<string, RedisClient>();
  private readonly configs = new Map<string, ConnectionConfigWithPassword>();

  override async beginTransaction(_connectionId: string): Promise<void> {}
  override async commitTransaction(_connectionId: string): Promise<void> {}
  override async rollbackTransaction(_connectionId: string): Promise<void> {}

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
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

  async disconnect(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) {
      return;
    }
    this.clients.delete(connectionId);
    this.configs.delete(connectionId);
    await client.disconnect();
  }

  override async testConnection(config: ConnectionConfigWithPassword) {
    let connection: DbConnection | undefined;
    try {
      connection = await this.connect(config);
      const version = await this.executeQuery({ connectionId: connection.id, sql: 'INFO server' });
      return { ok: true, message: 'Connection successful', serverVersion: optionalString(version.rows.find((row) => row.key === 'redis_version')?.value) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (connection) {
        await this.disconnect(connection.id).catch(() => undefined);
      }
    }
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    const client = this.requireClient(params.connectionId);
    const results: QueryExecutionResult[] = [];
    for (const sql of statements) {
      const started = Date.now();
      const args = parseRedisCommand(sql);
      if (args.length === 0) {
        results.push(emptyExecutionResult(started, sql));
        continue;
      }
      try {
        const reply = await client.sendCommand(args);
        const rows = redisReplyRows(args[0], reply);
        results.push(executionResultFromRows(rows, started, sql));
      } catch (error) {
        throw toQueryError(error);
      }
    }
    return results;
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const connection = this.requireConnectionConfig(connectionId);
    return [{ name: `db${parseRedisDatabase(connection.database)}` }];
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    this.requireClient(connectionId);
    return REDIS_TABLES.map((item) => ({ schema, name: item.name, type: 'table' as const }));
  }

  async getColumns(_connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
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

  async getTablePreview(connectionId: string, _schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult> {
    const started = Date.now();
    const client = this.requireClient(connectionId);
    const redisType = REDIS_TABLES.find((item) => item.name === table)?.redisType ?? '';
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 501;
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pattern = redisKeyPattern(options?.where);
    const keys = await scanKeys(client, pattern, offset + pageLimit);
    const page = keys.slice(offset, offset + pageLimit);
    const rows: Record<string, unknown>[] = [];
    for (const key of page) {
      const type = String(await client.sendCommand(['TYPE', key]));
      if (redisType && type !== redisType) {
        continue;
      }
      const ttl = numberFromDb(await client.sendCommand(['TTL', key]));
      rows.push({
        key,
        type,
        ttl,
        size: await redisValueSize(client, key, type),
        value: await redisPreviewValue(client, key, type)
      });
    }
    return {
      ...executionResultFromRows(rows, started, `SCAN ${pattern}`),
      hasMore: rows.length > limit
    };
  }

  override async getTableDDL(_connectionId: string, schema: string, table: string): Promise<string> {
    return [
      `-- Redis logical view: ${schema}.${table}`,
      '-- Redis is a key-value store; inspect data with commands such as:',
      `-- SCAN 0 MATCH * COUNT 100`,
      `-- TYPE <key>`,
      `-- GET <key> / HGETALL <key> / LRANGE <key> 0 99`
    ].join('\n');
  }

  private requireClient(connectionId: string): RedisClient {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Connection is not active. Connect first.');
    }
    return client;
  }

  private requireConnectionConfig(connectionId: string): ConnectionConfigWithPassword {
    const config = this.configs.get(connectionId);
    if (!config) {
      throw new Error('Connection is not active. Connect first.');
    }
    return config;
  }
}

let redisRuntime: Promise<RedisRuntime> | undefined;

function loadRedis(): Promise<RedisRuntime> {
  redisRuntime ??= loadRedisRuntime();
  return redisRuntime;
}

async function loadRedisRuntime(): Promise<RedisRuntime> {
  const bundled = loadBundledRuntime<RedisRuntime>('redisRuntime');
  if (bundled) {
    return bundled;
  }
  return import('redis').then((module) => {
    const candidate = module as unknown as RedisRuntime | { default?: RedisRuntime };
    return 'createClient' in candidate ? candidate : candidate.default as RedisRuntime;
  });
}

function parseRedisDatabase(value: string): number {
  const next = Number(value || 0);
  return Number.isInteger(next) && next >= 0 ? next : 0;
}

function parseRedisCommand(sql: string): string[] {
  const text = sql.trim().replace(/;+\s*$/, '');
  const args: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    args.push((match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/\\(["'`\\])/g, '$1'));
  }
  return args;
}

function redisReplyRows(command: string, reply: unknown): Record<string, unknown>[] {
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
    return Object.entries(reply as Record<string, unknown>).map(([key, value]) => ({ key, value: stringifyRedisValue(value) }));
  }
  return [{ value: stringifyRedisValue(reply) }];
}

function stringifyRedisValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value ?? null;
  }
  if (value instanceof Buffer) {
    return value.toString('utf8');
  }
  return JSON.stringify(value);
}

function redisKeyPattern(where?: string): string {
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

async function scanKeys(client: RedisClient, pattern: string, limit: number): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const reply = await client.sendCommand<unknown>(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
    if (!Array.isArray(reply) || reply.length < 2) {
      break;
    }
    cursor = String(reply[0]);
    const batch = Array.isArray(reply[1]) ? reply[1] : [];
    keys.push(...batch.map((key) => String(key)));
  } while (cursor !== '0' && keys.length < limit);
  return keys;
}

async function redisValueSize(client: RedisClient, key: string, type: string): Promise<number | undefined> {
  const command: Record<string, string[]> = {
    string: ['STRLEN', key],
    hash: ['HLEN', key],
    list: ['LLEN', key],
    set: ['SCARD', key],
    zset: ['ZCARD', key],
    stream: ['XLEN', key]
  };
  const args = command[type];
  return args ? numberFromDb(await client.sendCommand(args)) : undefined;
}

async function redisPreviewValue(client: RedisClient, key: string, type: string): Promise<string | undefined> {
  const commands: Record<string, string[]> = {
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
  return optionalString(stringifyRedisValue(value));
}
