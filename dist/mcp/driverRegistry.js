"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpDriverRegistry = createMcpDriverRegistry;
const postgresDriver_1 = require("../database/drivers/postgresDriver");
const redshiftDriver_1 = require("../database/drivers/redshiftDriver");
const mysqlDriver_1 = require("../database/drivers/mysqlDriver");
const sqliteDriver_1 = require("../database/drivers/sqliteDriver");
const sqlServerDriver_1 = require("../database/drivers/sqlServerDriver");
const oracleDriver_1 = require("../database/drivers/oracleDriver");
const redisDriver_1 = require("../database/drivers/redisDriver");
const snowflakeDriver_1 = require("../database/drivers/snowflakeDriver");
function createMcpDriverRegistry() {
    return new Map([
        ['postgres', new postgresDriver_1.PostgresDriver()],
        ['redshift', new redshiftDriver_1.RedshiftDriver()],
        ['mysql', new mysqlDriver_1.MySQLDriver()],
        ['sqlite', new sqliteDriver_1.SQLiteDriver()],
        ['sqlserver', new sqlServerDriver_1.SqlServerDriver()],
        ['oracle', new oracleDriver_1.OracleDriver()],
        ['redis', new redisDriver_1.RedisDriver()],
        ['snowflake', new snowflakeDriver_1.SnowflakeDriver()]
    ]);
}
//# sourceMappingURL=driverRegistry.js.map