import { describe, expect, it } from 'vitest';
import { formatSqlText, sqlFormatterDialect } from '../src/services/sqlFormattingService';
import { DatabaseType } from '../src/types';

describe('sqlFormattingService', () => {
  it.each([
    ['postgres', 'postgresql'],
    ['redshift', 'redshift'],
    ['mysql', 'mysql'],
    ['sqlite', 'sqlite'],
    ['sqlserver', 'transactsql'],
    ['oracle', 'plsql'],
    ['snowflake', 'snowflake'],
    ['redis', 'postgresql']
  ] satisfies Array<[DatabaseType, ReturnType<typeof sqlFormatterDialect>]>)('chooses %s formatter dialect', (type, dialect) => {
    expect(sqlFormatterDialect({ type } as never)).toBe(dialect);
  });

  it('chooses redshift formatting for redshift connections', () => {
    expect(sqlFormatterDialect({ type: 'redshift' } as never)).toBe('redshift');
  });

  it('defaults to postgres formatting for other connections', () => {
    expect(sqlFormatterDialect({ type: 'postgres' } as never)).toBe('postgresql');
    expect(sqlFormatterDialect(undefined)).toBe('postgresql');
  });

  it('chooses mysql formatting for mysql connections', () => {
    expect(sqlFormatterDialect({ type: 'mysql' } as never)).toBe('mysql');
  });

  it('chooses dialects for the additional database drivers', () => {
    expect(sqlFormatterDialect({ type: 'sqlite' } as never)).toBe('sqlite');
    expect(sqlFormatterDialect({ type: 'sqlserver' } as never)).toBe('transactsql');
    expect(sqlFormatterDialect({ type: 'oracle' } as never)).toBe('plsql');
    expect(sqlFormatterDialect({ type: 'snowflake' } as never)).toBe('snowflake');
    expect(sqlFormatterDialect({ type: 'redis' } as never)).toBe('postgresql');
  });

  it('formats SQL with stable keyword and clause layout', async () => {
    await expect(formatSqlText('select * from users where id=1', 'postgresql')).resolves.toBe(
      'select\n  *\nfrom\n  users\nwhere\n  id = 1'
    );
  });

  it('formats Redshift insert-with queries that contain QueryDeck parameters', async () => {
    const sql = `insert into cost_plus_offers_fact_staging (
 date,
 network_offer_id,
 installs,
 revenue,
 checksum,
 natural_key_hash
)
with cost_data as (
 select
   vcr.date::date as date,
   vcr.campaign_name::varchar(256) as campaign_name,
   trim(split_part(vcr.ad_name, '*', 1))::varchar(255) as network_offer_id,
   vcr.package_name::varchar(256) as package_name,
   sum(vcr.installs) as installs
 from public.vivo_api_cost_report vcr
 where vcr.date::date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
 group by 1, 2
),
rps_data as (
 select
   dspr.date,
   dspr.network_offer_id,
   dspr.revenue as revenue_percentage,
   'Appsflyer'::varchar(256) as mmp
 from public.aph_appsflyer_direct_sources_payout_revenue dspr
 where dspr.date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
 union all
 select
   dspr.date,
   dspr.network_offer_id,
   dspr.revenue as revenue_percentage,
   'Adjust'::varchar(256) as mmp
 from public.aph_adjust_reporting_direct_sources_payout_revenue dspr
 where dspr.date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
),
offer_data as (
 select network_offer_id, app_identifier, category
 from public.offer_fact
 where ingestion_time::date >= date_trunc('month', current_date)::date - (:months_ago || ' month')::interval
),
offer_all_data as (
 select
   network_offer_id,
   app_identifier,
   row_number() over (partition by network_offer_id order by time_saved desc) as rn
 from public.offer_all_fact
)
select
 cd.date,
 cd.network_offer_id,
 cd.installs,
 rd.revenue_percentage,
 md5(coalesce(cd.installs::text, '') || coalesce(rd.revenue_percentage::text, '')) as checksum,
 md5(coalesce(cd.date::text, '') || coalesce(cd.campaign_name, '') || coalesce(ofd.app_identifier, oaf.app_identifier, cd.package_name, '')) as natural_key_hash
from cost_data cd
join rps_data rd on rd.network_offer_id = cd.network_offer_id
left join offer_data ofd on ofd.network_offer_id = cd.network_offer_id
left join offer_all_data oaf on oaf.network_offer_id = cd.network_offer_id and oaf.rn = 1`;

    const formatted = await formatSqlText(sql, 'redshift');

    expect(formatted).toContain(':months_ago');
    expect(formatted).not.toContain('__querydeck_parameter_');
  });
});
