import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');
const verifiedMarketplaceAssets = new Set([
  'media/marketplace/querydeck-connections.png',
  'media/marketplace/querydeck-sql-editor.png'
]);

describe('marketplace README', () => {
  it('uses only verified real Marketplace screenshots and no GIFs', () => {
    const imageReferences = [...readme.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1]);

    expect(imageReferences.length).toBeGreaterThanOrEqual(2);
    expect(imageReferences.every((reference) => verifiedMarketplaceAssets.has(reference))).toBe(true);
    expect(readme).not.toContain('raw.githubusercontent.com');
    expect(readme).not.toMatch(/\.gif\)/i);
    expect(existsSync('scripts/generateMarketplaceAssets.js')).toBe(false);

    for (const reference of imageReferences) {
      expect(existsSync(join(process.cwd(), reference))).toBe(true);
      expect(statSync(join(process.cwd(), reference)).size).toBeGreaterThan(15_000);
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
