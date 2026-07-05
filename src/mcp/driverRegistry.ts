import { DatabaseType } from '../types';
import { DatabaseDriver } from '../database/drivers/DatabaseDriver';
import { PostgresDriver } from '../database/drivers/postgresDriver';
import { RedshiftDriver } from '../database/drivers/redshiftDriver';
import { MySQLDriver } from '../database/drivers/mysqlDriver';
import { SQLiteDriver } from '../database/drivers/sqliteDriver';
import { SqlServerDriver } from '../database/drivers/sqlServerDriver';
import { OracleDriver } from '../database/drivers/oracleDriver';
import { RedisDriver } from '../database/drivers/redisDriver';
import { SnowflakeDriver } from '../database/drivers/snowflakeDriver';

export function createMcpDriverRegistry(): Map<DatabaseType, DatabaseDriver> {
  return new Map<DatabaseType, DatabaseDriver>([
    ['postgres', new PostgresDriver()],
    ['redshift', new RedshiftDriver()],
    ['mysql', new MySQLDriver()],
    ['sqlite', new SQLiteDriver()],
    ['sqlserver', new SqlServerDriver()],
    ['oracle', new OracleDriver()],
    ['redis', new RedisDriver()],
    ['snowflake', new SnowflakeDriver()]
  ]);
}
