import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { projectPublicSurface } from '../scripts/compatibility/publicSurface';

describe('public surface compatibility', () => {
  it('preserves the reviewed command, activation, menu, keybinding, and settings surface', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const expected = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/compatibility/public-surface.json'), 'utf8'));

    expect(projectPublicSurface(pkg)).toEqual(expected);
  });
});
