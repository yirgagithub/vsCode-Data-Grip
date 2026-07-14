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
  'sql-formatter'
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
    expect(scripts['bundle:runtimes']).not.toContain('src/runtime/xlsxRuntime.ts');
    expect(scripts['bundle:mcp']).toContain('src/mcpServer.ts');
    expect(scripts['bundle:mcp']).toContain('--external:pg');
    expect(scripts['bundle:mcp']).toContain('--external:sqlite3');
    expect(scripts['bundle:runtimes']).not.toContain('--external:oracledb');
    expect(scripts['bundle:runtimes']).toContain('--external:sqlite3');
    expect(scripts['bundle:extension']).not.toContain('--external:xlsx');
    expect(scripts['copy:native-runtimes']).toBe('node scripts/copyNativeRuntimes.js');
    expect(scripts.build).toContain('npm run copy:native-runtimes');
    expect(scripts.build).toContain('npm run bundle:mcp');
    expect(scripts.build).toContain('npm run bundle:runtimes');
    expect(scripts.package).toBe('vsce package --no-dependencies');
    expect(scripts.publish).toBe('vsce publish --no-dependencies');
  });

  it('packages only bundle entrypoints and runtime assets from dist', () => {
    const ignore = readFileSync(join(root, '.vscodeignore'), 'utf8').split(/\r?\n/);

    expect(ignore).not.toContain('!dist/**/*.js');
    expect(ignore).not.toContain('dist/**');
    expect(ignore).toContain('dist/database/**');
    expect(ignore).toContain('dist/services/**');
    expect(ignore).toContain('dist/webviews/**');
    expect(ignore).toContain('dist/mcp/**');
    expect(ignore).toContain('dist/**/*.map');
    expect(ignore).toContain('.tmp-*');
  });

  it('does not copy Oracle JavaScript sources into the VSIX', () => {
    const copyNativeRuntimes = readFileSync(join(root, 'scripts', 'copyNativeRuntimes.js'), 'utf8');

    expect(copyNativeRuntimes).not.toContain("['oracledb/index.js'");
    expect(copyNativeRuntimes).not.toContain("['oracledb/lib'");
    expect(copyNativeRuntimes).not.toContain("['oracledb/plugins'");
  });

  it('rebuilds packaged runtime assets before unit tests import dist chunks in CI', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const buildIndex = workflow.indexOf('run: npm run build');
    const testIndex = workflow.indexOf('run: npm test');

    expect(buildIndex).toBeGreaterThan(-1);
    expect(testIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeLessThan(testIndex);
  });

  it('uses package.json as the only publish version', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'publish-extension.yml'), 'utf8');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("require('./package.json').version");
    expect(workflow).toContain('querydeck-${{ steps.package.outputs.version }}-vsix');
    expect(workflow).not.toContain('inputs:');
    expect(workflow).not.toContain('REQUESTED_VERSION');
    expect(workflow).not.toContain('${{ inputs.version }}');
    expect(workflow).not.toContain('Verify requested version');
  });

  it('bumps and records the patch version before marketplace publishing', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'publish-extension.yml'), 'utf8');
    const bumpIndex = workflow.indexOf('npm version patch --no-git-tag-version');
    const testIndex = workflow.indexOf('run: npm test');
    const pushIndex = workflow.indexOf('git push origin HEAD:main');
    const marketplaceIndex = workflow.indexOf('Publish to Visual Studio Marketplace');
    const openVsxIndex = workflow.indexOf('Publish to Open VSX');

    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('ref: main');
    expect(bumpIndex).toBeGreaterThan(-1);
    expect(testIndex).toBeGreaterThan(bumpIndex);
    expect(pushIndex).toBeGreaterThan(testIndex);
    expect(marketplaceIndex).toBeGreaterThan(pushIndex);
    expect(openVsxIndex).toBeGreaterThan(marketplaceIndex);
    expect(workflow).toContain('git add package.json package-lock.json');
    expect(workflow).toContain('git commit -m "Bump version to $VERSION [skip ci]"');
    expect(workflow).not.toMatch(/revert|reset --hard/i);
  });
});
