"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDriver = void 0;
const pg_1 = require("pg");
const crypto_1 = require("crypto");
const identifiers_1 = require("../../utils/identifiers");
class PostgresDriver {
    id = 'postgres';
    displayName = 'PostgreSQL';
    pools = new Map();
    configs = new Map();
    activeExecutions = new Map();
    async testConnection(config) {
        const pool = new pg_1.Pool(this.toPoolConfig(config, 1));
        try {
            const result = await pool.query('select version() as version');
            return { ok: true, message: 'Connection successful', serverVersion: result.rows[0]?.version };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        finally {
            await pool.end();
        }
    }
    async connect(config) {
        await this.disconnect(config.id);
        const pool = new pg_1.Pool(this.toPoolConfig(config, 8));
        await pool.query('select 1');
        this.pools.set(config.id, pool);
        this.configs.set(config.id, config);
        return { id: config.id, config, connectedAt: Date.now() };
    }
    async disconnect(connectionId) {
        const pool = this.pools.get(connectionId);
        if (pool) {
            this.pools.delete(connectionId);
            await pool.end();
        }
    }
    async executeQuery(params) {
        const executionId = (0, crypto_1.randomUUID)();
        const pool = this.requirePool(params.connectionId);
        const client = await pool.connect();
        const started = Date.now();
        this.activeExecutions.set(executionId, { connectionId: params.connectionId, processId: client.processID });
        try {
            const maxRows = Number.isFinite(params.maxRows) && params.maxRows && params.maxRows > 0 ? Math.floor(params.maxRows) : undefined;
            const limitedSql = maxRows && this.canApplyClientLimit(params.sql)
                ? `select * from (${params.sql.replace(/;+\s*$/, '')}) __dg_query limit ${maxRows}`
                : params.sql;
            const result = await client.query(limitedSql);
            return {
                executionId,
                fields: result.fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
                rows: result.rows,
                rowCount: result.rowCount ?? result.rows.length,
                command: result.command,
                durationMs: Date.now() - started
            };
        }
        finally {
            this.activeExecutions.delete(executionId);
            client.release();
        }
    }
    async validateQuery(params) {
        const pool = this.requirePool(params.connectionId);
        const sql = params.sql.trim().replace(/;+\s*$/, '');
        if (!sql || !this.canExplain(sql)) {
            return { ok: true };
        }
        try {
            await pool.query(`explain ${sql}`);
            return { ok: true };
        }
        catch (error) {
            return { ok: false, error: this.toQueryError(error) };
        }
    }
    async cancelQuery(executionId) {
        const active = this.activeExecutions.get(executionId);
        if (!active?.processId) {
            return;
        }
        const pool = this.requirePool(active.connectionId);
        await pool.query('select pg_cancel_backend($1)', [active.processId]);
    }
    async getSchemas(connectionId) {
        const result = await this.requirePool(connectionId).query(`select schema_name as name
       from information_schema.schemata
       where schema_name not like 'pg_%' and schema_name <> 'information_schema'
       order by schema_name`);
        return result.rows;
    }
    async getTables(connectionId, schema) {
        const result = await this.requirePool(connectionId).query(`select n.nspname as schema, c.relname as name,
              case when c.relkind = 'm' then 'materialized_view' else 'table' end as type,
              c.reltuples::bigint as "rowEstimate",
              obj_description(c.oid) as comment
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p', 'm')
       order by c.relname`, [schema]);
        return result.rows;
    }
    async getViews(connectionId, schema) {
        const result = await this.requirePool(connectionId).query(`select table_schema as schema, table_name as name, 'view' as type
       from information_schema.views
       where table_schema = $1
       order by table_name`, [schema]);
        return result.rows;
    }
    async getColumns(connectionId, schema, table) {
        const result = await this.requirePool(connectionId).query(`select c.table_schema as schema, c.table_name as table, c.column_name as name,
              c.ordinal_position as ordinal, c.data_type as "dataType",
              c.is_nullable = 'YES' as nullable, c.column_default as "defaultValue",
              col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass::oid, c.ordinal_position) as comment
       from information_schema.columns c
       where c.table_schema = $1 and c.table_name = $2
       order by c.ordinal_position`, [schema, table]);
        return result.rows;
    }
    async getIndexes(connectionId, schema, table) {
        const result = await this.requirePool(connectionId).query(`select indexname as name, indexdef as definition
       from pg_indexes
       where schemaname = $1 and tablename = $2
       order by indexname`, [schema, table]);
        return result.rows.map((row) => ({
            name: row.name,
            definition: row.definition,
            columns: this.columnsFromIndexDefinition(row.definition),
            unique: /\bunique\b/i.test(row.definition)
        }));
    }
    async getPrimaryKeys(connectionId, schema, table) {
        const result = await this.requirePool(connectionId).query(`select tc.constraint_name as name, array_agg(kcu.column_name order by kcu.ordinal_position) as columns
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name`, [schema, table]);
        return result.rows;
    }
    async getForeignKeys(connectionId, schema, table) {
        const result = await this.requirePool(connectionId).query(`select tc.constraint_name as name,
              array_agg(kcu.column_name order by kcu.ordinal_position) as columns,
              ccu.table_schema as "foreignSchema",
              ccu.table_name as "foreignTable",
              array_agg(ccu.column_name order by kcu.ordinal_position) as "foreignColumns"
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = $1 and tc.table_name = $2
       group by tc.constraint_name, ccu.table_schema, ccu.table_name`, [schema, table]);
        return result.rows;
    }
    async getTablePreview(connectionId, schema, table, limit, options) {
        const where = options?.where?.trim();
        if (where && /;|--|\/\*/.test(where)) {
            throw new Error('WHERE must be a single SQL expression without comments or semicolons.');
        }
        const orderBySql = options?.orderBySql?.trim();
        if (orderBySql && /;|--|\/\*/.test(orderBySql)) {
            throw new Error('ORDER BY must be a single SQL expression without comments or semicolons.');
        }
        const orderBy = orderBySql
            ? `\norder by ${orderBySql}`
            : options?.orderBy?.length
                ? `\norder by ${options.orderBy.map((item) => `${(0, identifiers_1.quoteIdentifier)(item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
                : '';
        const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
        const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
        const paging = pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : '';
        const sql = `select * from ${(0, identifiers_1.qualifiedName)(schema, table)}${where ? `\nwhere ${where}` : ''}${orderBy}${paging}`;
        return this.executeQuery({ connectionId, sql, maxRows: 0 });
    }
    async getTableDDL(connectionId, schema, table) {
        const columns = await this.getColumns(connectionId, schema, table);
        const lines = columns.map((column) => {
            const nullable = column.nullable ? '' : ' not null';
            const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : '';
            return `  "${column.name}" ${column.dataType}${defaultValue}${nullable}`;
        });
        return `create table ${(0, identifiers_1.qualifiedName)(schema, table)} (\n${lines.join(',\n')}\n);`;
    }
    requirePool(connectionId) {
        const pool = this.pools.get(connectionId);
        if (!pool) {
            throw new Error('Connection is not active. Connect first.');
        }
        return pool;
    }
    toPoolConfig(config, max) {
        return {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.username,
            password: config.password,
            max,
            connectionTimeoutMillis: config.connectTimeoutMs ?? 10000,
            query_timeout: config.queryTimeoutMs,
            ssl: config.sslMode === 'disable' ? false : { rejectUnauthorized: false }
        };
    }
    columnsFromIndexDefinition(definition) {
        const match = definition.match(/\((.*)\)/);
        return match ? match[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')) : [];
    }
    canApplyClientLimit(sql) {
        const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
        return normalized.startsWith('select') || normalized.startsWith('with');
    }
    canExplain(sql) {
        const normalized = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
        return /^(select|with|insert|update|delete|merge)\b/.test(normalized);
    }
    toQueryError(error) {
        const pgError = error;
        return {
            message: pgError.message ?? String(error),
            code: pgError.code,
            detail: pgError.detail,
            hint: pgError.hint,
            position: pgError.position,
            where: pgError.where
        };
    }
}
exports.PostgresDriver = PostgresDriver;
//# sourceMappingURL=postgresDriver.js.map