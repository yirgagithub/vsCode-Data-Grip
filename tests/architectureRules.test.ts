import { describe, expect, it } from 'vitest';
import { classifyModule, isAllowedDependency, validateManifest } from '../scripts/architecture/architectureRules';

describe('architecture rules', () => {
  it('classifies target modules and legacy source', () => {
    expect(classifyModule('src/core/errors.ts')).toBe('core');
    expect(classifyModule('src/features/results/index.ts')).toBe('feature');
    expect(classifyModule('src/adapters/database/postgres.ts')).toBe('adapter');
    expect(classifyModule('src/app/createApplication.ts')).toBe('app');
    expect(classifyModule('src/services/sqlDialect.ts')).toBe('legacy');
  });

  it('classifies only declared legacy roots and files as legacy', () => {
    expect(classifyModule('src/services/sqlDialect.ts')).toBe('legacy');
    expect(classifyModule('src/extension.ts')).toBe('legacy');
    expect(classifyModule('src/unknown/example.ts')).toBe('unknown');
    expect(classifyModule('src/services-extra/example.ts')).toBe('unknown');
    expect(classifyModule('src/extension.ts.bak')).toBe('unknown');
  });

  it('normalizes relative and Windows-style paths', () => {
    expect(classifyModule('./src/core/errors.ts')).toBe('core');
    expect(classifyModule('.\\src\\services\\sqlDialect.ts')).toBe('legacy');
  });

  it('enforces inward dependencies and feature public APIs', () => {
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/core/query.ts')).toBe(true);
    expect(isAllowedDependency('src/core/query.ts', 'src/features/results/index.ts')).toBe(false);
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/adapters/database/postgres.ts')).toBe(false);
    expect(isAllowedDependency('src/features/results/index.ts', 'src/features/connections/index.ts')).toBe(true);
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/features/connections/internal/store.ts')).toBe(false);
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/unknown/store.ts')).toBe(false);
    expect(isAllowedDependency('src/unknown/runQuery.ts', 'src/core/query.ts')).toBe(false);
    expect(isAllowedDependency('src/features/results/index.ts', 'src/services/sqlDialect.ts')).toBe(false);
    expect(isAllowedDependency('src/services/sqlDialect.ts', 'src/features/results/index.ts')).toBe(true);
  });

  it('allows only explicit target-to-legacy exceptions', () => {
    expect(isAllowedDependency('src/features/results/index.ts', 'src/services/sqlDialect.ts', [{
      from: 'src/features/results/index.ts', to: 'src/services/sqlDialect.ts',
      rationale: 'Temporary result migration facade', removalMilestone: 'Stage 3'
    }])).toBe(true);
  });

  it('rejects malformed or ambiguous manifests', () => {
    const valid = {
      layers: ['core', 'feature', 'adapter', 'app', 'legacy'],
      roots: { core: 'src/core/', feature: 'src/features/', adapter: 'src/adapters/', app: 'src/app/' },
      featurePublicEntry: 'index.ts', legacyRoots: ['src/services/', 'src/vendorModules.d.ts'], legacyDependencyExceptions: []
    };
    expect(() => validateManifest(valid)).not.toThrow();
    expect(() => validateManifest({ ...valid, surprise: true })).toThrow(/unknown key/);
    expect(() => validateManifest({ ...valid, legacyRoots: ['src/services'] })).toThrow(/trailing/);
    expect(() => validateManifest({ ...valid, legacyRoots: ['src/core/file.ts'] })).toThrow(/overlap/);
    expect(() => validateManifest({ ...valid, layers: ['core', 'feature'] })).toThrow(/layers/);
  });
});
