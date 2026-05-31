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
  }
};

export function connectionDefaultsForType(type: DatabaseType): ConnectionTypeDefaults {
  return DEFAULTS_BY_DATABASE_TYPE[type];
}
