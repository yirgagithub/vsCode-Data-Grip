import { ConnectionColor, DatabaseType } from '../types';

export interface ConnectionTypeDefaults {
  name: string;
  port: string;
  database: string;
  sslMode: 'disable' | 'prefer' | 'require';
  color: ConnectionColor;
}

export const DEFAULTS_BY_DATABASE_TYPE: Record<DatabaseType, ConnectionTypeDefaults> = {
  postgres: {
    name: 'PostgreSQL',
    port: '5432',
    database: 'postgres',
    sslMode: 'disable',
    color: 'green'
  },
  redshift: {
    name: 'Redshift',
    port: '5439',
    database: 'dev',
    sslMode: 'require',
    color: 'purple'
  },
  mysql: {
    name: 'MySQL',
    port: '3306',
    database: 'mysql',
    sslMode: 'disable',
    color: 'blue'
  },
  sqlite: {
    name: 'SQLite',
    port: '0',
    database: ':memory:',
    sslMode: 'disable',
    color: 'gray'
  },
  sqlserver: {
    name: 'SQL Server',
    port: '1433',
    database: 'master',
    sslMode: 'prefer',
    color: 'yellow'
  },
  oracle: {
    name: 'Oracle',
    port: '1521',
    database: 'ORCLPDB1',
    sslMode: 'disable',
    color: 'red'
  },
  redis: {
    name: 'Redis',
    port: '6379',
    database: '0',
    sslMode: 'disable',
    color: 'red'
  },
  snowflake: {
    name: 'Snowflake',
    port: '443',
    database: 'SNOWFLAKE',
    sslMode: 'require',
    color: 'purple'
  }
};

export function connectionDefaultsForType(type: DatabaseType): ConnectionTypeDefaults {
  return DEFAULTS_BY_DATABASE_TYPE[type];
}
