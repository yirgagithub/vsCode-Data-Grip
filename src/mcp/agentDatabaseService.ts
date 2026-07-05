import { randomUUID } from 'crypto';
import { DatabaseDriver } from '../database/drivers/DatabaseDriver';
import { QueryMemorySearch } from '../services/queryMemorySearch';
import { isReadOnlySql } from '../services/readOnlySql';
import {
  ColumnInfo,
  ConnectionConfigWithPassword,
  DatabaseType,
  QueryExecutionResult,
  QueryMemoryItem,
  QueryPlanResult,
  SchemaInfo,
  TableInfo,
  ViewInfo
} from '../types';
import { McpConnectionConfig, QueryDeckMcpConfig } from './config';
import { createMcpDriverRegistry } from './driverRegistry';

export interface McpSchemaRequest {
  connectionId: string;
  schema?: string;
  includeColumns?: boolean;
  tableLimit?: number;
}

export interface McpRunQueryRequest {
  connectionId: string;
  sql: string;
  maxRows?: number;
}

export class AgentDatabaseService {
  private readonly drivers: Map<DatabaseType, DatabaseDriver>;
  private readonly activeConnections = new Set<string>();
  private readonly memorySearch = new QueryMemorySearch();

  constructor(
    private readonly config: QueryDeckMcpConfig,
    drivers = createMcpDriverRegistry()
  ) {
    this.drivers = drivers;
  }

  listConnections(): Array<Omit<ConnectionConfigWithPassword, 'password'> & { hasPassword: boolean }> {
    return this.config.connections.map((connection) => {
      const { password, passwordEnv, ...metadata } = connection;
      return {
        ...metadata,
        hasPassword: Boolean(password || (passwordEnv && process.env[passwordEnv]))
      };
    });
  }

  async getSchema(request: McpSchemaRequest): Promise<Array<{
    schema: SchemaInfo;
    tables: Array<TableInfo & { columns?: ColumnInfo[] }>;
    views: ViewInfo[];
  }>> {
    const connection = await this.ensureConnected(request.connectionId);
    const driver = this.driver(connection.type);
    const schemaNames = request.schema ? [{ name: request.schema }] : await driver.getSchemas(connection.id);
    const tableLimit = boundedLimit(request.tableLimit, 50, 500);
    const includeColumns = request.includeColumns !== false;
    const result = [];

    for (const schema of schemaNames) {
      const tables = (await driver.getTables(connection.id, schema.name)).slice(0, tableLimit);
      const views = (await driver.getViews(connection.id, schema.name)).slice(0, tableLimit);
      const tablesWithColumns = includeColumns
        ? await Promise.all(tables.map(async (table) => ({
          ...table,
          columns: await driver.getColumns(connection.id, table.schema, table.name)
        })))
        : tables;
      result.push({ schema, tables: tablesWithColumns, views });
    }

    return result;
  }

  async getObjectDdl(connectionId: string, schema: string, table: string): Promise<{ ddl: string }> {
    const connection = await this.ensureConnected(connectionId);
    return { ddl: await this.driver(connection.type).getTableDDL(connection.id, schema, table) };
  }

  searchQueryMemory(query: string, connectionId?: string, limit?: number): ReturnType<QueryMemorySearch['search']> {
    return this.memorySearch.search(this.config.queryMemory ?? [], {
      query,
      connectionId,
      limit: boundedLimit(limit, 10, 50)
    });
  }

  async runReadOnlyQuery(request: McpRunQueryRequest): Promise<QueryExecutionResult[]> {
    if (!isReadOnlySql(request.sql)) {
      throw new Error('MCP query execution is read-only. Use SELECT, WITH, VALUES, SHOW, DESCRIBE, or EXPLAIN.');
    }
    const connection = await this.ensureConnected(request.connectionId);
    const maxRows = boundedLimit(request.maxRows, this.config.defaultMaxRows ?? 100, 1000);
    const results = await this.driver(connection.type).executeStatements({
      connectionId: connection.id,
      sql: request.sql,
      maxRows,
      source: { origin: 'sqlFile', fileName: 'querydeck-mcp' }
    }, [request.sql]);
    return results.map((result) => limitRows(result, maxRows));
  }

  async explainQuery(connectionId: string, sql: string): Promise<QueryPlanResult> {
    if (!isReadOnlySql(sql)) {
      throw new Error('MCP explain is limited to read-only SQL.');
    }
    const connection = await this.ensureConnected(connectionId);
    return this.driver(connection.type).explainQuery({ connectionId: connection.id, sql, maxRows: 0 });
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.activeConnections].map(async (connectionId) => {
      const connection = this.connection(connectionId);
      if (connection) {
        await this.driver(connection.type).disconnect(connectionId).catch(() => undefined);
      }
    }));
    this.activeConnections.clear();
  }

  private async ensureConnected(connectionId: string): Promise<ConnectionConfigWithPassword> {
    const connection = this.connection(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    if (!this.activeConnections.has(connection.id)) {
      await this.driver(connection.type).connect(connection);
      this.activeConnections.add(connection.id);
    }
    return connection;
  }

  private connection(connectionId: string): ConnectionConfigWithPassword | undefined {
    const connection = this.config.connections.find((item) => item.id === connectionId);
    return connection ? materializePassword(connection) : undefined;
  }

  private driver(type: DatabaseType): DatabaseDriver {
    const driver = this.drivers.get(type);
    if (!driver) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return driver;
  }
}

export function sampleMcpConfig(): QueryDeckMcpConfig {
  return {
    defaultMaxRows: 100,
    connections: [{
      id: 'local-postgres',
      name: 'Local PostgreSQL',
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      username: 'postgres',
      passwordEnv: 'QUERYDECK_POSTGRES_PASSWORD',
      sslMode: 'disable',
      color: 'blue'
    }],
    queryMemory: []
  };
}

function materializePassword(connection: McpConnectionConfig): ConnectionConfigWithPassword {
  const password = connection.password ?? (connection.passwordEnv ? process.env[connection.passwordEnv] : undefined);
  const { passwordEnv, ...metadata } = connection;
  return {
    ...metadata,
    id: metadata.id || randomUUID(),
    password
  };
}

function boundedLimit(value: number | undefined, fallback: number, max: number): number {
  const candidate = (!Number.isFinite(value) || !value || value <= 0) ? fallback : value;
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return max;
  }
  return Math.min(Math.floor(candidate), max);
}

function limitRows(result: QueryExecutionResult, maxRows: number): QueryExecutionResult {
  if (result.rows.length <= maxRows) {
    return result;
  }
  const rows = result.rows.slice(0, maxRows);
  return {
    ...result,
    rows,
    rowCount: rows.length,
    hasMore: true
  };
}
