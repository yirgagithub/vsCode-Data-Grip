"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedshiftDriver = void 0;
const postgresDriver_1 = require("./postgresDriver");
const queryPlanService_1 = require("../../services/queryPlanService");
const identifiers_1 = require("../../utils/identifiers");
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
    async getActiveSessions(connectionId) {
        const pool = this.requirePool(connectionId);
        try {
            const result = await pool.query(`select pid,
                user_name as user,
                db_name as database,
                '' as application,
                remotehost as client,
                status as state,
                query as query,
                starttime as "startedAt",
                null as "transactionStartedAt",
                null as "stateChangedAt",
                null as "waitEventType",
                null as "waitEvent",
                pid = pg_backend_pid() as "isCurrent",
                status = 'idle in transaction' as "isIdleInTransaction"
         from stv_recents
         where db_name = current_database()
         order by starttime desc nulls last, pid desc`);
            return result.rows.map((row) => ({
                pid: Number(row.pid),
                user: optionalString(row.user),
                database: optionalString(row.database),
                application: optionalString(row.application),
                client: optionalString(row.client),
                state: optionalString(row.state),
                query: optionalString(row.query),
                startedAt: optionalString(row.startedAt),
                transactionStartedAt: optionalString(row.transactionStartedAt),
                stateChangedAt: optionalString(row.stateChangedAt),
                waitEventType: optionalString(row.waitEventType),
                waitEvent: optionalString(row.waitEvent),
                isCurrent: Boolean(row.isCurrent),
                isIdleInTransaction: Boolean(row.isIdleInTransaction)
            }));
        }
        catch {
            return super.getActiveSessions(connectionId);
        }
    }
    async cancelSession(connectionId, pid) {
        await this.requirePool(connectionId).query('select pg_cancel_backend($1)', [pid]);
    }
    async terminateSession(connectionId, pid) {
        await this.cancelSession(connectionId, pid);
    }
    async getColumns(connectionId, schema, table) {
        const result = await this.requirePool(connectionId).query(`select table_schema as schema, table_name as table, column_name as name,
              ordinal_position as ordinal, data_type as "dataType",
              is_nullable = 'YES' as nullable, column_default as "defaultValue"
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`, [schema, table]);
        return result.rows.map((row) => {
            const name = String(row.name ?? row.column_name);
            const dataType = optionalString(row.dataType ?? row.datatype ?? row.data_type);
            if (!dataType) {
                throw new Error(`Redshift column metadata for ${(0, identifiers_1.qualifiedName)(schema, table)}.${name} did not include a data type.`);
            }
            return {
                schema: String(row.schema ?? schema),
                table: String(row.table ?? table),
                name,
                ordinal: Number(row.ordinal ?? row.ordinal_position),
                dataType,
                nullable: booleanFromDb(row.nullable),
                defaultValue: optionalString(row.defaultValue ?? row.defaultvalue ?? row.column_default)
            };
        });
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
function booleanFromDb(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    const normalized = optionalString(value)?.toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === 'yes' || normalized === 'y' || normalized === '1';
}
//# sourceMappingURL=redshiftDriver.js.map