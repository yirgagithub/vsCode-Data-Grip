import { describe, expect, it } from 'vitest';
import { normalizeGroupByError } from '../src/services/sqlGroupByError';
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
