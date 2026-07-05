import { splitSqlStatements } from '../database/sqlSplitter';

export function isReadOnlySql(sql: string): boolean {
  const statements = splitSqlStatements(sql).map((statement) => statement.sql.trim()).filter(Boolean);
  const parts = statements.length ? statements : [sql.trim()].filter(Boolean);
  return parts.every((statement) => {
    const normalized = stripSqlLiteralsCommentsAndQuotedIdentifiers(statement);
    return /^(select|with|values|show|describe|explain)\b/i.test(normalized.trim()) && !hasWriteOrDestructiveKeyword(normalized);
  });
}

function hasWriteOrDestructiveKeyword(sql: string): boolean {
  return /\b(insert|update|delete|merge|drop|alter|truncate|create|replace|grant|revoke|call|execute|exec|copy|load|vacuum|refresh|reindex|cluster|attach|detach)\b/i.test(sql);
}

function stripSqlLiteralsCommentsAndQuotedIdentifiers(sql: string): string {
  let result = '';
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      result += ' ';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) {
        index += 1;
      }
      index = Math.min(index + 2, sql.length);
      result += ' ';
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      index = consumeQuoted(sql, index, char);
      result += ' ';
      continue;
    }

    if (char === '[') {
      index += 1;
      while (index < sql.length && sql[index] !== ']') {
        index += 1;
      }
      index = Math.min(index + 1, sql.length);
      result += ' ';
      continue;
    }

    result += char;
    index += 1;
  }
  return result;
}

function consumeQuoted(sql: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    if (quote === '\'' && sql[index] === '\\') {
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
}
