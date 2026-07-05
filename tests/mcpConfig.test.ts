import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { loadMcpConfig } from '../src/mcp/config';

describe('loadMcpConfig', () => {
  it('rejects unsupported database types with a clear config error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'querydeck-mcp-config-'));
    const configPath = join(dir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      connections: [{
        id: 'bad',
        name: 'Bad',
        type: 'mongodb',
        host: 'localhost',
        port: 27017,
        database: 'app',
        username: 'app',
        sslMode: 'disable',
        color: 'blue'
      }]
    }));

    try {
      expect(() => loadMcpConfig(configPath)).toThrow(/Invalid QueryDeck MCP config/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clamps excessive default row limits', () => {
    const dir = mkdtempSync(join(tmpdir(), 'querydeck-mcp-config-'));
    const configPath = join(dir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      defaultMaxRows: 5000,
      connections: [{
        id: 'local',
        name: 'Local',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'app',
        username: 'app',
        sslMode: 'disable',
        color: 'blue'
      }]
    }));

    try {
      expect(loadMcpConfig(configPath).defaultMaxRows).toBe(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves query memory files relative to the config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'querydeck-mcp-config-'));
    const configPath = join(dir, 'mcp.json');
    writeFileSync(join(dir, 'memory.json'), JSON.stringify([{
      id: 'memory-1',
      sourceKind: 'history',
      sourceId: 'history-1',
      connectionId: 'local',
      databaseType: 'postgres',
      databaseName: 'app',
      connectionName: 'Local',
      sql: 'select 1',
      title: 'select one',
      summaryStatus: 'pending',
      tables: [],
      columns: [],
      outputColumns: [],
      status: 'completed',
      indexedAt: 1,
      updatedAt: 1
    }]));
    writeFileSync(configPath, JSON.stringify({
      connections: [{
        id: 'local',
        name: 'Local',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'app',
        username: 'app',
        sslMode: 'disable',
        color: 'blue'
      }],
      queryMemoryFile: 'memory.json'
    }));

    try {
      expect(loadMcpConfig(configPath).queryMemory?.[0]?.id).toBe('memory-1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
