import { describe, expect, it } from 'vitest';
import { checkArchitecture } from '../scripts/architecture/checkArchitecture';

describe('repository architecture', () => {
  it('contains no forbidden target-module imports', () => {
    expect(checkArchitecture(process.cwd())).toEqual([]);
  });
});
