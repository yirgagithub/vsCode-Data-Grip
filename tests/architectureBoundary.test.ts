import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArchitecture } from '../scripts/architecture/checkArchitecture';

const temporaryRoots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'querydeck-architecture-'));
  temporaryRoots.push(root);
  for (const [file, contents] of Object.entries(files)) {
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  if (!files['tsconfig.json']) writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { moduleResolution: 'node' }, include: ['src/**/*'] }));
  return root;
}

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('repository architecture', () => {
  it('contains no forbidden target-module imports', () => {
    expect(checkArchitecture(process.cwd())).toEqual([]);
  });

  it('accepts allowed edges and reports forbidden edges', () => {
    const root = fixture({
      'src/core/allowed.ts': "import './shared';\n",
      'src/core/shared.ts': '',
      'src/core/forbidden.ts': "import '../features/results';\n",
      'src/features/results/index.ts': ''
    });

    expect(checkArchitecture(root)).toEqual([
      {
        from: 'src/core/forbidden.ts',
        to: 'src/features/results/index.ts',
        reason: 'forbidden dependency direction or deep feature import'
      }
    ]);
  });

  it('reports unresolved relative imports instead of silently ignoring them', () => {
    const root = fixture({ 'src/core/query.ts': "import './missing';\n" });

    expect(checkArchitecture(root)).toEqual([
      {
        from: 'src/core/query.ts',
        to: 'src/core/missing',
        reason: 'unresolved relative import "./missing"'
      }
    ]);
  });

  it('discovers dynamic imports and TypeScript import-type nodes', () => {
    const root = fixture({
      'src/core/query.ts': "const feature = import('../features/results');\ntype Result = import('../features/results/internal').Result;\n",
      'src/features/results/index.ts': '',
      'src/features/results/internal.ts': 'export interface Result {}\n'
    });

    expect(checkArchitecture(root).map(({ from, to }) => ({ from, to }))).toEqual([
      { from: 'src/core/query.ts', to: 'src/features/results/index.ts' },
      { from: 'src/core/query.ts', to: 'src/features/results/internal.ts' }
    ]);
  });

  it('discovers require calls and export declarations', () => {
    const root = fixture({
      'src/core/query.ts': "require('../features/results');\nexport { Result } from '../features/results/internal';\n",
      'src/features/results/index.ts': '',
      'src/features/results/internal.ts': 'export interface Result {}\n'
    });

    expect(checkArchitecture(root).map(({ from, to }) => ({ from, to }))).toEqual([
      { from: 'src/core/query.ts', to: 'src/features/results/index.ts' },
      { from: 'src/core/query.ts', to: 'src/features/results/internal.ts' }
    ]);
  });

  it('fails target-to-legacy dependencies closed', () => {
    const root = fixture({
      'src/features/results/index.ts': "import '../../services/sqlDialect';\n",
      'src/services/sqlDialect.ts': ''
    });
    expect(checkArchitecture(root)).toEqual([expect.objectContaining({
      from: 'src/features/results/index.ts', to: 'src/services/sqlDialect.ts'
    })]);
  });

  it('detects self, two-feature, and three-feature cycles', () => {
    const root = fixture({
      'src/features/self/index.ts': "import './index';\n",
      'src/features/a/index.ts': "import '../b';\n",
      'src/features/b/index.ts': "import '../c';\n",
      'src/features/c/index.ts': "import '../a';\n",
      'src/features/d/index.ts': "import '../e';\n",
      'src/features/e/index.ts': "import '../d';\n"
    });
    expect(checkArchitecture(root).filter(({ reason }) => reason.startsWith('circular feature dependency')).map(({ reason }) => reason)).toEqual([
      'circular feature dependency: a -> b -> c -> a',
      'circular feature dependency: d -> e -> d',
      'circular feature dependency: self -> self'
    ]);
  });

  it('uses TypeScript config resolution for aliases and import-equals declarations', () => {
    const root = fixture({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@features/*': ['src/features/*'] } }, include: ['src/**/*'] }),
      'src/core/query.ts': "import Result = require('@features/results');\nimport 'external-package';\n",
      'src/features/results/index.ts': ''
    });
    expect(checkArchitecture(root)).toEqual([expect.objectContaining({
      from: 'src/core/query.ts', to: 'src/features/results/index.ts'
    })]);
  });
});
