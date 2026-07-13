import { ConnectionConfig } from '../types';
import { loadBundledRuntime } from '../runtime/runtimeLoader';
import { findSqlParameters } from './sqlParameters';

export type SqlFormatterDialect = 'postgresql' | 'redshift' | 'mysql' | 'sqlite' | 'transactsql' | 'plsql' | 'snowflake';

export function sqlFormatterDialect(connection?: ConnectionConfig): SqlFormatterDialect {
  if (connection?.type === 'redshift') {
    return 'redshift';
  }
  if (connection?.type === 'mysql') {
    return 'mysql';
  }
  if (connection?.type === 'sqlite') {
    return 'sqlite';
  }
  if (connection?.type === 'sqlserver') {
    return 'transactsql';
  }
  if (connection?.type === 'oracle') {
    return 'plsql';
  }
  if (connection?.type === 'snowflake') {
    return 'snowflake';
  }
  return 'postgresql';
}

export async function formatSqlText(sql: string, dialect: SqlFormatterDialect): Promise<string> {
  if (!sql.trim()) {
    return sql;
  }
  const { format } = await loadSqlFormatter();
  const masked = maskSqlParameters(sql);
  const formatted = format(masked.sql, {
    language: dialect,
    tabWidth: 2
  });
  return masked.restore(formatted);
}

function maskSqlParameters(sql: string): { sql: string; restore: (formatted: string) => string } {
  const parameters = findSqlParameters(sql);
  if (parameters.length === 0) {
    return {
      sql,
      restore: (formatted) => formatted
    };
  }

  const replacements = parameters.map((parameter, index) => ({
    placeholder: parameter.placeholder,
    sentinel: `__querydeck_parameter_${index}_${safeSentinelPart(parameter.name)}__`,
    start: parameter.start,
    end: parameter.end
  }));
  let maskedSql = sql;
  for (const replacement of [...replacements].reverse()) {
    maskedSql = `${maskedSql.slice(0, replacement.start)}${replacement.sentinel}${maskedSql.slice(replacement.end)}`;
  }

  return {
    sql: maskedSql,
    restore: (formatted) => replacements.reduce(
      (restored, replacement) => restored.split(replacement.sentinel).join(replacement.placeholder),
      formatted
    )
  };
}

function safeSentinelPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

type SqlFormatterRuntime = {
  format(sql: string, options: { language: SqlFormatterDialect; tabWidth: number }): string;
};

let sqlFormatterRuntime: Promise<SqlFormatterRuntime> | undefined;

function loadSqlFormatter(): Promise<SqlFormatterRuntime> {
  sqlFormatterRuntime ??= loadSqlFormatterRuntime();
  return sqlFormatterRuntime;
}

async function loadSqlFormatterRuntime(): Promise<SqlFormatterRuntime> {
  const bundled = loadBundledRuntime<SqlFormatterRuntime>('sqlFormatterRuntime');
  if (bundled) {
    return bundled;
  }
  return import('sql-formatter').then((module) => {
    const candidate = module as unknown as SqlFormatterRuntime | { default?: SqlFormatterRuntime };
    return 'format' in candidate ? candidate : candidate.default as SqlFormatterRuntime;
  });
}
