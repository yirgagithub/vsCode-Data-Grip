"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedshiftDriver = void 0;
const postgresDriver_1 = require("./postgresDriver");
class RedshiftDriver extends postgresDriver_1.PostgresDriver {
    id = 'redshift';
    displayName = 'Amazon Redshift';
    async getTables(connectionId, schema) {
        const result = await this.requirePool(connectionId).query(`select schemaname as schema, tablename as name, 'table' as type
       from pg_tables
       where schemaname = $1
       order by tablename`, [schema]);
        return result.rows;
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
    toPoolConfig(config, max) {
        return {
            ...super.toPoolConfig({ ...config, sslMode: config.sslMode === 'disable' ? 'prefer' : config.sslMode }, max),
            port: config.port || 5439
        };
    }
}
exports.RedshiftDriver = RedshiftDriver;
//# sourceMappingURL=redshiftDriver.js.map