"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedshiftDriver = void 0;
const postgresDriver_1 = require("./postgresDriver");
const queryPlanService_1 = require("../../services/queryPlanService");
class RedshiftDriver extends postgresDriver_1.PostgresDriver {
    id = 'redshift';
    displayName = 'Amazon Redshift';
    async getSchemas(connectionId) {
        const pool = this.requirePool(connectionId);
        try {
            const result = await pool.query(`select distinct name
         from (
           select schema_name as name
           from svv_all_schemas
           where database_name = current_database()
           union all
           select nspname as name
           from pg_namespace
         ) schemas
         where name <> 'information_schema' and name not like 'pg_toast%' and name not like 'pg_temp%'
         order by name`);
            return result.rows;
        }
        catch {
            const result = await pool.query(`select nspname as name
         from pg_namespace
         where nspname <> 'information_schema' and nspname not like 'pg_toast%' and nspname not like 'pg_temp%'
         order by nspname`);
            return result.rows;
        }
    }
    async getTables(connectionId, schema) {
        const pool = this.requirePool(connectionId);
        try {
            const result = await pool.query(`select schema_name as schema,
                table_name as name,
                case when lower(table_type) like '%materialized%' then 'materialized_view' else 'table' end as type,
                remarks as comment
         from svv_all_tables
         where database_name = current_database() and schema_name = $1
         order by table_name`, [schema]);
            return result.rows;
        }
        catch {
            const result = await pool.query(`select schemaname as schema, tablename as name, 'table' as type
         from pg_tables
         where schemaname = $1
         order by tablename`, [schema]);
            return result.rows;
        }
    }
    async getViews(connectionId, schema) {
        const result = await this.requirePool(connectionId).query(`select schemaname as schema, viewname as name, 'view' as type
       from pg_views
       where schemaname = $1
       order by viewname`, [schema]);
        return result.rows;
    }
    async getColumns(connectionId, schema, table) {
        const result = await this.requirePool(connectionId).query(`select table_schema as schema, table_name as table, column_name as name,
              ordinal_position as ordinal, data_type as "dataType",
              is_nullable = 'YES' as nullable, column_default as "defaultValue"
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`, [schema, table]);
        return result.rows;
    }
    async getTableStats(connectionId, schema, table) {
        const pool = this.requirePool(connectionId);
        try {
            const result = await pool.query(`select diststyle as "distStyle",
                sortkey1 as "sortKey1",
                sortkey_num as "sortKeyNum",
                size as "sizeMb",
                tbl_rows as "rowCount",
                skew_rows as "skewRows",
                unsorted as "unsortedPct",
                stats_off as "statsOffPct",
                encoded as "encoded"
         from svv_table_info
         where "schema" = $1 and "table" = $2`, [schema, table]);
            const row = result.rows[0] ?? {};
            return {
                schema,
                table,
                databaseType: this.id,
                rowEstimate: this.numberFromDb(row.rowCount),
                columns: [],
                redshift: {
                    distStyle: optionalString(row.distStyle),
                    sortKey1: optionalString(row.sortKey1),
                    sortKeyNum: this.numberFromDb(row.sortKeyNum),
                    sizeMb: this.numberFromDb(row.sizeMb),
                    rowCount: this.numberFromDb(row.rowCount),
                    skewRows: this.numberFromDb(row.skewRows),
                    unsortedPct: this.numberFromDb(row.unsortedPct),
                    statsOffPct: this.numberFromDb(row.statsOffPct),
                    encoded: optionalString(row.encoded)
                }
            };
        }
        catch {
            const fallback = await super.getTableStats(connectionId, schema, table);
            return { ...fallback, databaseType: this.id };
        }
    }
    async explainQuery(params, options = {}) {
        try {
            return await super.explainQuery(params, options);
        }
        catch (error) {
            if (options.analyze) {
                throw error;
            }
            const sql = params.sql.trim().replace(/;+\s*$/, '');
            if (!/^(select|with|insert|update|delete|merge)\b/i.test(sql)) {
                throw error;
            }
            const result = await this.requirePool(params.connectionId).query(`explain ${sql}`);
            const rawText = result.rows
                .map((row) => Object.values(row).map((value) => String(value)).join(' '))
                .join('\n');
            return (0, queryPlanService_1.textExplainPlan)(rawText, false);
        }
    }
    shouldRetryWithoutSsl(_config, _error) {
        return false;
    }
    toPoolConfig(config, max) {
        return {
            ...super.toPoolConfig({ ...config, sslMode: config.sslMode === 'disable' ? 'prefer' : config.sslMode }, max),
            port: config.port || 5439
        };
    }
}
exports.RedshiftDriver = RedshiftDriver;
function optionalString(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const next = String(value).trim();
    return next || undefined;
}
//# sourceMappingURL=redshiftDriver.js.map