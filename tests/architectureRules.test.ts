import { describe, expect, it } from 'vitest';
import { classifyModule, isAllowedDependency } from '../scripts/architecture/architectureRules';

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
  });
});
