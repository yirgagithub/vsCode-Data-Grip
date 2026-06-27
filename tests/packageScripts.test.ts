import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  scripts?: Record<string, string>;
}

const root = process.cwd();
const runtimePackages = [
  'pg',
  'pg/*',
  'mysql2',
  'mysql2/*',
  'mssql',
  'mssql/*',
  'oracledb',
  'redis',
  'redis/*',
  'snowflake-sdk',
  'snowflake-sdk/*',
  'sqlite3',
  'sqlite3/*',
  'sql-formatter',
  'xlsx'
];

function packageJson(): PackageJson {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;
}

function externalPackages(script: string): Set<string> {
  return new Set([...script.matchAll(/--external:([^ ]+)/g)].map((match) => match[1]));
}

describe('package scripts', () => {
  it('keeps heavy runtime packages lazy and builds packaged runtime chunks', () => {
    const scripts = packageJson().scripts ?? {};
    const externalized = externalPackages(scripts['bundle:extension'] ?? '');

    expect(externalized).toContain('vscode');
    expect(externalized).toContain('pg-native');
    expect(runtimePackages.filter((name) => externalized.has(name))).toEqual(runtimePackages);
    expect(scripts['bundle:runtimes']).toContain('src/runtime/pgRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/mysqlRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/mssqlRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/oracleRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/redisRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/snowflakeRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/sqliteRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/sqlFormatterRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('src/runtime/xlsxRuntime.ts');
    expect(scripts['bundle:runtimes']).toContain('--external:oracledb');
    expect(scripts['bundle:runtimes']).toContain('--external:sqlite3');
    expect(scripts['copy:native-runtimes']).toBe('node scripts/copyNativeRuntimes.js');
    expect(scripts.build).toContain('npm run copy:native-runtimes');
    expect(scripts.build).toContain('npm run bundle:runtimes');
    expect(scripts.package).toBe('vsce package --no-dependencies');
    expect(scripts.publish).toBe('vsce publish --no-dependencies');
  });
});
