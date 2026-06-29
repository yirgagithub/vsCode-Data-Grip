import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');

describe('marketplace README', () => {
  it('uses Marketplace-safe raw image URLs instead of local image references', () => {
    const imageReferences = [...readme.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1]);

    expect(imageReferences.length).toBeGreaterThanOrEqual(3);
    expect(imageReferences.every((reference) => reference.startsWith('https://raw.githubusercontent.com/yirgagithub/vsCode-Data-Grip/main/'))).toBe(true);
    expect(imageReferences.some((reference) => reference.endsWith('.gif'))).toBe(false);

    for (const reference of imageReferences) {
      const assetPath = reference.replace('https://raw.githubusercontent.com/yirgagithub/vsCode-Data-Grip/main/', '');
      expect(existsSync(join(process.cwd(), assetPath))).toBe(true);
      expect(statSync(join(process.cwd(), assetPath)).size).toBeGreaterThan(10_000);
    }
  });

  it('keeps every supported database engine visible in the Marketplace copy', () => {
    for (const engine of ['PostgreSQL', 'Redshift', 'MySQL', 'SQLite', 'SQL Server', 'Oracle', 'Redis', 'Snowflake']) {
      expect(readme).toContain(engine);
    }
  });

  it('keeps the AI-first and local query memory positioning in the opening section', () => {
    const opening = readme.slice(0, readme.indexOf('## Coming From Another Database Tool?'));

    expect(opening).toContain('AI-first');
    expect(opening).toContain('Codex');
    expect(opening).toContain('Claude Code');
    expect(opening).toContain('local query memory');
    expect(opening).toContain('performance recommendations');
  });
});
