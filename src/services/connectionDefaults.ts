import { ConnectionColor, DatabaseType } from '../types';

export interface ConnectionTypeDefaults {
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  sslMode: 'disable' | 'prefer' | 'require';
  defaultSchema: string;
  color: ConnectionColor;
}

export const DEFAULTS_BY_DATABASE_TYPE: Record<DatabaseType, ConnectionTypeDefaults> = {
  postgres: {
    name: 'PostgreSQL',
    host: 'localhost',
    port: '5432',
    database: 'postgres',
    username: '',
    sslMode: 'disable',
    defaultSchema: 'public',
    color: 'green'
  },
  redshift: {
    name: 'Redshift',
    host: '',
    port: '5439',
    database: 'dev',
    username: '',
    sslMode: 'require',
    defaultSchema: 'public',
    color: 'purple'
  },
  mysql: {
    name: 'MySQL',
    host: 'localhost',
    port: '3306',
    database: 'mysql',
    username: '',
    sslMode: 'disable',
    defaultSchema: '',
    color: 'blue'
  },
  sqlite: {
    name: 'SQLite',
    host: '',
    port: '0',
    database: ':memory:',
    username: '',
    sslMode: 'disable',
    defaultSchema: 'main',
    color: 'gray'
  },
  sqlserver: {
    name: 'SQL Server',
    host: 'localhost',
    port: '1433',
    database: 'master',
    username: '',
    sslMode: 'prefer',
    defaultSchema: 'dbo',
    color: 'yellow'
  },
  oracle: {
    name: 'Oracle',
    host: 'localhost',
    port: '1521',
    database: 'ORCLPDB1',
    username: '',
    sslMode: 'disable',
    defaultSchema: '',
    color: 'red'
  },
  redis: {
    name: 'Redis',
    host: 'localhost',
    port: '6379',
    database: '0',
    username: '',
    sslMode: 'disable',
    defaultSchema: 'db0',
    color: 'red'
  },
  snowflake: {
    name: 'Snowflake',
    host: '',
    port: '443',
    database: 'SNOWFLAKE',
    username: '',
    sslMode: 'require',
    defaultSchema: 'PUBLIC',
    color: 'purple'
  }
};

export function connectionDefaultsForType(type: DatabaseType): ConnectionTypeDefaults {
  return DEFAULTS_BY_DATABASE_TYPE[type];
}
