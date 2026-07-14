import { DatabaseType, QueryError } from '../types';

export interface GroupByErrorEvidence {
  expression: string;
  position?: number;
  confidence: 'high';
}

const SAFE_IDENTIFIER = /^(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))*$/;

export function normalizeGroupByError(databaseType: DatabaseType, error: QueryError): GroupByErrorEvidence | undefined {
  const expression = expressionFromMessage(databaseType, error.message);
  if (!expression || !SAFE_IDENTIFIER.test(expression)) {
    return undefined;
  }
  const position = Number(error.position);
  return {
    expression,
    ...(Number.isFinite(position) && position > 0 ? { position } : {}),
    confidence: 'high'
  };
}

function expressionFromMessage(databaseType: DatabaseType, message: string): string | undefined {
  switch (databaseType) {
    case 'postgres':
    case 'redshift':
    case 'sqlite':
      return message.match(/^column\s+"([^"]+)"\s+must appear in the GROUP BY clause(?:\s+or be used in an aggregate function)?$/i)?.[1];
    case 'mysql': {
      const value = message.match(/^Expression #\d+ of SELECT list contains nonaggregated column '([^']+)'; this is incompatible with sql_mode=only_full_group_by$/i)?.[1];
      return value ? withoutCatalog(value) : undefined;
    }
    case 'sqlserver':
      return message.match(/^Column '([^']+)' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause\.?$/i)?.[1];
    case 'oracle':
      return message.match(/^ORA-00979:\s*((?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))*)\s*:\s*must appear in the GROUP BY clause$/i)?.[1];
    case 'snowflake':
      return message.match(/^'([^']+)' in select clause is neither an aggregate nor in the group by clause$/i)?.[1];
    default:
      return undefined;
  }
}

function withoutCatalog(value: string): string {
  const parts = value.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : value;
}
