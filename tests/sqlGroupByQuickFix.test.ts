import { describe, expect, it } from 'vitest';
import { normalizeGroupByError } from '../src/services/sqlGroupByError';
import { applyGroupByQuickFix, computeGroupByQuickFix } from '../src/services/sqlGroupByQuickFix';
import { DatabaseType } from '../src/types';

describe('GROUP BY error normalization', () => {
  it.each<[DatabaseType, string, string]>([
    ['postgres', 'column "sales.region" must appear in the GROUP BY clause or be used in an aggregate function', 'sales.region'],
    ['redshift', 'column "sales.region" must appear in the GROUP BY clause or be used in an aggregate function', 'sales.region'],
    ['mysql', "Expression #1 of SELECT list contains nonaggregated column 'shop.sales.region'; this is incompatible with sql_mode=only_full_group_by", 'sales.region'],
    ['sqlserver', "Column 'sales.region' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.", 'sales.region'],
    ['oracle', 'ORA-00979: "SALES"."REGION": must appear in the GROUP BY clause', '"SALES"."REGION"'],
    ['snowflake', "'SALES.REGION' in select clause is neither an aggregate nor in the group by clause", 'SALES.REGION'],
    ['sqlite', 'column "sales.region" must appear in the GROUP BY clause', 'sales.region']
  ])('normalizes %s GROUP BY errors', (databaseType, message, expression) => {
    expect(normalizeGroupByError(databaseType, { message, position: '18' })).toEqual({
      expression,
      position: 18,
      confidence: 'high'
    });
  });

  it.each([
    ['oracle', 'ORA-00979: not a GROUP BY expression'],
    ['postgres', 'syntax error at or near "from"'],
    ['redis', 'column "sales.region" must appear in the GROUP BY clause'],
    ['postgres', 'column "sales.region; drop table users" must appear in the GROUP BY clause'],
    ['postgres', 'column "" must appear in the GROUP BY clause']
  ] as const)('refuses unsafe or unsupported %s errors', (databaseType, message) => {
    expect(normalizeGroupByError(databaseType, { message })).toBeUndefined();
  });
});

describe('GROUP BY SQL rewrite', () => {
  const fix = (sql: string, expression = 'sales.region', hint?: number) => {
    const edit = computeGroupByQuickFix(sql, { expression, position: hint, confidence: 'high' });
    return edit ? applyGroupByQuickFix(sql, edit) : undefined;
  };

  it.each([
    ['select sales.region, count(*) from sales order by sales.region;', 'select sales.region, count(*) from sales GROUP BY sales.region order by sales.region;'],
    ['select sales.region, count(*) from sales having count(*) > 1;', 'select sales.region, count(*) from sales GROUP BY sales.region having count(*) > 1;'],
    ['select sales.region, count(*) from sales limit 5;', 'select sales.region, count(*) from sales GROUP BY sales.region limit 5;'],
    ['select sales.region, count(*) from sales;', 'select sales.region, count(*) from sales GROUP BY sales.region;']
  ])('preserves top-level clause order', (sql, expected) => expect(fix(sql)).toBe(expected));

  it('appends to an existing GROUP BY', () => {
    expect(fix('select sales.region, sales.day, count(*) from sales group by sales.day order by sales.day')).toBe(
      'select sales.region, sales.day, count(*) from sales group by sales.day, sales.region order by sales.day'
    );
  });

  it('refuses a duplicate GROUP BY expression', () => {
    expect(fix('select sales.region, count(*) from sales group by sales.region')).toBeUndefined();
  });

  it('edits the nested SELECT selected by the error position', () => {
    const sql = 'select customer_id, (select sales.region, count(*) from sales) as x from customers;';
    expect(fix(sql, 'sales.region', sql.indexOf('sales.region'))).toBe(
      'select customer_id, (select sales.region, count(*) from sales GROUP BY sales.region) as x from customers;'
    );
  });

  it('edits only the matching CTE scope', () => {
    const sql = 'with totals as (select sales.region, count(*) from sales) select * from totals;';
    expect(fix(sql, 'sales.region', sql.indexOf('sales.region'))).toBe(
      'with totals as (select sales.region, count(*) from sales GROUP BY sales.region) select * from totals;'
    );
  });

  it('edits only one UNION branch', () => {
    const sql = 'select region, count(*) from east union all select region, count(*) from west;';
    const second = sql.lastIndexOf('region');
    expect(fix(sql, 'region', second)).toBe(
      'select region, count(*) from east union all select region, count(*) from west GROUP BY region;'
    );
  });

  it('edits only the failing statement', () => {
    const sql = 'select region, count(*) from east;\nselect region, count(*) from west;';
    expect(fix(sql, 'region', sql.lastIndexOf('region'))).toBe(
      'select region, count(*) from east;\nselect region, count(*) from west GROUP BY region;'
    );
  });

  it('ignores clause words in comments and preserves CRLF', () => {
    const sql = 'select region, count(*)\r\nfrom sales -- order by ignored\r\norder by region;';
    expect(fix(sql, 'region', sql.indexOf('region'))).toBe(
      'select region, count(*)\r\nfrom sales -- order by ignored\r\nGROUP BY region order by region;'
    );
  });

  it('refuses ambiguous repeated scopes without a position hint', () => {
    expect(fix('select region, count(*) from east; select region, count(*) from west', 'region')).toBeUndefined();
  });
});
