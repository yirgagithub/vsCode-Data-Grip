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
});
