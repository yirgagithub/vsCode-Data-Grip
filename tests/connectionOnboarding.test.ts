import { describe, expect, it } from 'vitest';
import { DEFAULTS_BY_DATABASE_TYPE } from '../src/services/connectionDefaults';
import { ENGINE_GUIDANCE_BY_DATABASE_TYPE } from '../src/webviews/connection/connectionOnboarding';
import { DatabaseType } from '../src/types';

const supportedEngines: DatabaseType[] = ['postgres', 'redshift', 'mysql', 'sqlite', 'sqlserver', 'oracle', 'redis', 'snowflake'];

describe('connection onboarding guidance', () => {
  it('covers every supported database engine', () => {
    expect(Object.keys(ENGINE_GUIDANCE_BY_DATABASE_TYPE).sort()).toEqual([...supportedEngines].sort());
    expect(Object.keys(ENGINE_GUIDANCE_BY_DATABASE_TYPE).sort()).toEqual(Object.keys(DEFAULTS_BY_DATABASE_TYPE).sort());
  });

  it.each(supportedEngines)('has complete labels, help text, and required field metadata for %s', (engine) => {
    const guidance = ENGINE_GUIDANCE_BY_DATABASE_TYPE[engine];

    expect(guidance.hostLabel).toMatch(/:$/);
    expect(guidance.databaseLabel).toMatch(/:$/);
    expect(guidance.usernameLabel).toMatch(/:$/);
    expect(guidance.defaultSchemaLabel).toMatch(/:$/);
    expect(guidance.databaseHelp).toBeTruthy();
    expect(guidance.usernameHelp).toBeTruthy();
    expect(guidance.authHelp).toBeTruthy();
    expect(guidance.sslHelp).toBeTruthy();
    expect(guidance.defaultSchemaHelp).toBeTruthy();
    expect(guidance.required.database).toBe(true);
    expect(typeof guidance.required.host).toBe('boolean');
    expect(typeof guidance.required.username).toBe('boolean');
  });

  it('marks SQLite as file-based and disables network/auth fields', () => {
    const sqlite = ENGINE_GUIDANCE_BY_DATABASE_TYPE.sqlite;

    expect(sqlite.databaseLabel).toBe('SQLite file:');
    expect(sqlite.databaseHelp).toContain(':memory:');
    expect(sqlite.required).toEqual({ host: false, username: false, database: true });
    expect(sqlite.disabled).toMatchObject({
      host: true,
      port: true,
      username: true,
      password: true,
      sslMode: true
    });
  });

  it('uses engine-specific wording for non-generic connection fields', () => {
    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.sqlserver.hostLabel).toBe('Server:');
    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.sqlserver.authHelp).toContain('Windows auth is not configured');

    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.oracle.databaseLabel).toBe('Service name:');
    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.oracle.databaseHelp).toContain('ORCLPDB1');

    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.redis.databaseLabel).toBe('Database index:');
    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.redis.usernameLabel).toBe('ACL user:');
    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.redis.required.username).toBe(false);

    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.snowflake.hostLabel).toBe('Account:');
    expect(ENGINE_GUIDANCE_BY_DATABASE_TYPE.snowflake.hostHelp).toContain('not a full URL');
  });
});

