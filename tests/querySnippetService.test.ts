import { describe, expect, it } from 'vitest';
import { querySnippets } from '../src/services/querySnippetService';

describe('query snippet service', () => {
  it('exposes placeholder-driven SQL templates', () => {
    const snippets = querySnippets();

    expect(snippets.length).toBeGreaterThan(3);
    expect(snippets.map((snippet) => snippet.label)).toContain('Join Query');
    expect(snippets.some((snippet) => snippet.snippet.includes('${1:table_name}'))).toBe(true);
    expect(snippets.some((snippet) => snippet.snippet.includes('${5|asc,desc|}'))).toBe(true);
  });
});
