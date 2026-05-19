import { describe, expect, it } from 'vitest';
import { parseQueryMemorySummaryText } from '../src/ai/queryMemorySummaryParser';
import { extractQualifiedColumns, extractQueryTables, outputColumnNames } from '../src/services/queryMemoryMetadata';
import { QueryMemorySearch } from '../src/services/queryMemorySearch';
import { SqlSafetyClassifier } from '../src/services/sqlSafetyClassifier';
import { QueryMemoryItem } from '../src/types';

describe('SqlSafetyClassifier', () => {
  const classifier = new SqlSafetyClassifier();

  it('flags destructive statements and missing where clauses', () => {
    expect(classifier.classify('drop table public.users').risk).toBe('destructive');
    expect(classifier.classify('delete from invoices').reasons).toContain('DELETE has no WHERE clause.');
    expect(classifier.classify('update users set active = false').risk).toBe('destructive');
  });

  it('flags production connections even for reads', () => {
    const result = classifier.classify('select * from invoices', { production: true });
    expect(result.risk).toBe('production');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('builds preview sql for risky writes', () => {
    expect(classifier.previewSql('delete from invoices where customer_id = 10')).toContain('select *');
    expect(classifier.previewSql('update public.users set active = false where id = 1')).toContain('where id = 1');
  });
});

describe('query memory metadata', () => {
  it('extracts tables, qualified columns, and output field names', () => {
    const sql = 'select c.email, o.total from public.customers c join orders o on o.customer_id = c.id';
    expect(extractQueryTables(sql)).toEqual(['public.customers', 'orders']);
    expect(extractQualifiedColumns(sql)).toEqual(['c.email', 'o.total', 'o.customer_id', 'c.id']);
    expect(outputColumnNames([{ name: 'email' }, { name: 'email' }, { name: 'total' }])).toEqual(['email', 'total']);
  });
});

describe('QueryMemorySearch', () => {
  it('scores summaries, tables, output columns, and recency', () => {
    const now = Date.now();
    const items: QueryMemoryItem[] = [
      memory({ id: 'a', title: 'Duplicate invoice check', summary: 'Finds duplicate invoices by customer.', tables: ['invoices'], outputColumns: ['invoice_number'], executedAt: now }),
      memory({ id: 'b', title: 'User login list', summary: 'Returns users by last login.', tables: ['users'], outputColumns: ['last_login'], executedAt: now - 30 * 24 * 60 * 60 * 1000 })
    ];
    const [first] = new QueryMemorySearch().search(items, { query: 'duplicate invoice_number invoices' });
    expect(first.item.id).toBe('a');
    expect(first.score).toBeGreaterThan(20);
  });

  it('filters failed results by default', () => {
    const items = [memory({ id: 'failed', status: 'failed', summary: 'missing column error' })];
    expect(new QueryMemorySearch().search(items, { query: 'missing' })).toHaveLength(0);
    expect(new QueryMemorySearch().search(items, { query: 'missing', includeFailed: true })).toHaveLength(1);
  });
});

describe('parseQueryMemorySummaryText', () => {
  it('parses fenced JSON and filters invalid arrays', () => {
    const parsed = parseQueryMemorySummaryText('```json\n{"title":" Duplicate invoice check ","summary":" Finds duplicate invoices. ","tables":["invoices",1],"columns":["i.id",false]}\n```');
    expect(parsed).toEqual({
      title: 'Duplicate invoice check',
      summary: 'Finds duplicate invoices.',
      tables: ['invoices'],
      columns: ['i.id']
    });
  });

  it('rejects malformed summaries', () => {
    expect(() => parseQueryMemorySummaryText('not json')).toThrow(/summary JSON/);
    expect(() => parseQueryMemorySummaryText('{"title":"Only title"}')).toThrow(/missing title or summary/);
  });
});

function memory(overrides: Partial<QueryMemoryItem>): QueryMemoryItem {
  return {
    id: overrides.id ?? 'memory',
    sourceKind: 'history',
    sourceId: overrides.sourceId ?? overrides.id ?? 'history',
    sql: overrides.sql ?? 'select * from invoices',
    title: overrides.title,
    summary: overrides.summary,
    summaryStatus: overrides.summaryStatus ?? 'ready',
    tables: overrides.tables ?? [],
    columns: overrides.columns ?? [],
    outputColumns: overrides.outputColumns ?? [],
    status: overrides.status ?? 'completed',
    indexedAt: overrides.indexedAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    executedAt: overrides.executedAt
  };
}
