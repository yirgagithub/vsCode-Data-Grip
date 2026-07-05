import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AgentDatabaseService } from './agentDatabaseService';
import { loadMcpConfig } from './config';

export function createQueryDeckMcpServer(service: AgentDatabaseService): McpServer {
  const server = new McpServer({ name: 'querydeck-mcp', version: '0.1.0' });

  server.registerTool('querydeck_list_connections', {
    title: 'List QueryDeck Connections',
    description: 'List configured QueryDeck MCP database connections without revealing passwords.',
    inputSchema: {}
  }, async () => textResult(service.listConnections()));

  server.registerTool('querydeck_get_schema', {
    title: 'Get Database Schema',
    description: 'Inspect schemas, tables, views, and optionally columns for a connection.',
    inputSchema: {
      connectionId: z.string().min(1),
      schema: z.string().min(1).optional(),
      includeColumns: z.boolean().optional(),
      tableLimit: z.number().int().positive().max(500).optional()
    }
  }, async (args) => textResult(await service.getSchema(args)));

  server.registerTool('querydeck_get_object_ddl', {
    title: 'Get Object DDL',
    description: 'Return generated DDL for a table or table-like object.',
    inputSchema: {
      connectionId: z.string().min(1),
      schema: z.string().min(1),
      table: z.string().min(1)
    }
  }, async ({ connectionId, schema, table }) => textResult(await service.getObjectDdl(connectionId, schema, table)));

  server.registerTool('querydeck_search_query_memory', {
    title: 'Search Query Memory',
    description: 'Search local QueryDeck query memory by phrase, SQL, table, column, output column, source, or status.',
    inputSchema: {
      query: z.string(),
      connectionId: z.string().min(1).optional(),
      limit: z.number().int().positive().max(50).optional()
    }
  }, async ({ query, connectionId, limit }) => textResult(service.searchQueryMemory(query, connectionId, limit)));

  server.registerTool('querydeck_run_readonly_query', {
    title: 'Run Read-Only Query',
    description: 'Run read-only SQL with a row limit. Write and destructive statements are rejected.',
    inputSchema: {
      connectionId: z.string().min(1),
      sql: z.string().min(1),
      maxRows: z.number().int().positive().max(1000).optional()
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true
    }
  }, async (args) => textResult(await service.runReadOnlyQuery(args)));

  server.registerTool('querydeck_explain_query', {
    title: 'Explain Query',
    description: 'Explain a read-only SQL query using the target database driver.',
    inputSchema: {
      connectionId: z.string().min(1),
      sql: z.string().min(1)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true
    }
  }, async ({ connectionId, sql }) => textResult(await service.explainQuery(connectionId, sql)));

  return server;
}

export async function runStdioMcpServer(service = new AgentDatabaseService(loadMcpConfig())): Promise<void> {
  const server = createQueryDeckMcpServer(service);
  const transport = new StdioServerTransport();
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void service.dispose().finally(() => {
      void server.close().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('close', shutdown);
  process.stdin.once('end', shutdown);
  await server.connect(transport);
}

function textResult(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  };
}
