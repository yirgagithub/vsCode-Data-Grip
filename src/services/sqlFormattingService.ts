import { ConnectionConfig } from '../types';

export type SqlFormatterDialect = 'postgresql' | 'redshift' | 'mysql';

export function sqlFormatterDialect(connection?: ConnectionConfig): SqlFormatterDialect {
  if (connection?.type === 'redshift') {
    return 'redshift';
  }
  if (connection?.type === 'mysql') {
    return 'mysql';
  }
  return 'postgresql';
}

export async function formatSqlText(sql: string, dialect: SqlFormatterDialect): Promise<string> {
  if (!sql.trim()) {
    return sql;
  }
  const { format } = await loadSqlFormatter();
  return format(sql, {
    language: dialect,
    tabWidth: 2
  });
}

type SqlFormatterRuntime = {
  format(sql: string, options: { language: SqlFormatterDialect; tabWidth: number }): string;
};

let sqlFormatterRuntime: Promise<SqlFormatterRuntime> | undefined;

function loadSqlFormatter(): Promise<SqlFormatterRuntime> {
  sqlFormatterRuntime ??= import('sql-formatter').then((module) => {
    const candidate = module as unknown as SqlFormatterRuntime | { default?: SqlFormatterRuntime };
    return 'format' in candidate ? candidate : candidate.default as SqlFormatterRuntime;
  });
  return sqlFormatterRuntime;
}
