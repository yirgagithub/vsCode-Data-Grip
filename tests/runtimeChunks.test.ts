import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const requireFromRoot = createRequire(join(root, 'tests/runtimeChunks.test.ts'));

interface RuntimeContract {
  chunk: string;
  exportName: string;
  fallbackImport: string;
  sourcePath: string;
}

const runtimes: RuntimeContract[] = [
  {
    chunk: 'pgRuntime',
    exportName: 'Pool',
    fallbackImport: "import('pg')",
    sourcePath: 'src/database/drivers/postgresDriver.ts'
  },
  {
    chunk: 'mysqlRuntime',
    exportName: 'createPool',
    fallbackImport: "import('mysql2/promise')",
    sourcePath: 'src/database/drivers/mysqlDriver.ts'
  },
  {
    chunk: 'mssqlRuntime',
    exportName: 'ConnectionPool',
    fallbackImport: "import('mssql')",
    sourcePath: 'src/database/drivers/sqlServerDriver.ts'
  },
  {
    chunk: 'oracleRuntime',
    exportName: 'createPool',
    fallbackImport: "import('oracledb')",
    sourcePath: 'src/database/drivers/oracleDriver.ts'
  },
  {
    chunk: 'redisRuntime',
    exportName: 'createClient',
    fallbackImport: "import('redis')",
    sourcePath: 'src/database/drivers/redisDriver.ts'
  },
  {
    chunk: 'snowflakeRuntime',
    exportName: 'createConnection',
    fallbackImport: "import('snowflake-sdk')",
    sourcePath: 'src/database/drivers/snowflakeDriver.ts'
  },
  {
    chunk: 'sqliteRuntime',
    exportName: 'Database',
    fallbackImport: "import('sqlite3')",
    sourcePath: 'src/database/drivers/sqliteDriver.ts'
  },
  {
    chunk: 'sqlFormatterRuntime',
    exportName: 'format',
    fallbackImport: "import('sql-formatter')",
    sourcePath: 'src/services/sqlFormattingService.ts'
  }
];

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('lazy runtime chunks', () => {
  it('wires every external runtime through a packaged chunk with source fallback', () => {
    const extensionBundle = readText('dist/extension.js');

    runtimes.forEach((runtime) => {
      const source = readText(runtime.sourcePath);
      expect(source).toContain(`loadBundledRuntime<`);
      expect(source).toContain(`'${runtime.chunk}'`);
      expect(source).toContain(runtime.fallbackImport);
      expect(extensionBundle).toContain(`loadBundledRuntime("${runtime.chunk}")`);
    });
  });

  it('builds every runtime chunk with the expected public export', () => {
    runtimes.forEach((runtime) => {
      const chunkPath = join(root, 'dist/runtime', `${runtime.chunk}.js`);
      expect(existsSync(chunkPath), `${runtime.chunk} should be packaged under dist/runtime`).toBe(true);

      const moduleExports = requireFromRoot(chunkPath) as Record<string, unknown>;
      expect(typeof moduleExports[runtime.exportName], `${runtime.chunk}.${runtime.exportName}`).toBe('function');
    });
  });
});
