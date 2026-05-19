import { splitSqlStatements } from '../database/sqlSplitter';
import { SqlSafetyAssessment, SqlSafetyRisk } from '../types';

const DESTRUCTIVE_RE = /\b(drop|truncate|alter)\b/i;
const WRITE_RE = /\b(insert\s+into|update|delete\s+from|create\s+(?:unique\s+)?index|create\s+table|create\s+schema)\b/i;

export class SqlSafetyClassifier {
  classify(sql: string, options: { production?: boolean } = {}): SqlSafetyAssessment {
    const statements = splitSqlStatements(sql).map((statement) => statement.sql);
    const parts = statements.length ? statements : [sql.trim()].filter(Boolean);
    const reasons: string[] = [];
    let risk: SqlSafetyRisk = 'safe';
    let previewAvailable = false;

    for (const statement of parts) {
      if (DESTRUCTIVE_RE.test(statement)) {
        risk = this.maxRisk(risk, 'destructive');
        reasons.push('Contains DROP, TRUNCATE, or ALTER.');
      }
      if (/\bcreate\s+(?:unique\s+)?index\b/i.test(statement)) {
        risk = this.maxRisk(risk, 'write');
        reasons.push('Creates an index, which can be expensive on large tables.');
        previewAvailable = true;
      }
      if (/\bdelete\s+from\b/i.test(statement)) {
        risk = this.maxRisk(risk, 'write');
        previewAvailable = true;
        if (!/\bwhere\b/i.test(statement)) {
          risk = this.maxRisk(risk, 'destructive');
          reasons.push('DELETE has no WHERE clause.');
        } else {
          reasons.push('Deletes rows.');
        }
      }
      if (/\bupdate\b/i.test(statement)) {
        risk = this.maxRisk(risk, 'write');
        previewAvailable = true;
        if (!/\bwhere\b/i.test(statement)) {
          risk = this.maxRisk(risk, 'destructive');
          reasons.push('UPDATE has no WHERE clause.');
        } else {
          reasons.push('Updates rows.');
        }
      }
      if (WRITE_RE.test(statement) && risk === 'safe') {
        risk = 'write';
        reasons.push('Writes database objects or rows.');
      }
    }

    if (options.production) {
      risk = this.maxRisk(risk, 'production');
      reasons.push('Connection is marked production.');
    }

    return {
      risk,
      reasons: [...new Set(reasons)],
      statements: parts,
      requiresConfirmation: risk !== 'safe',
      previewAvailable: previewAvailable || risk === 'destructive' || risk === 'production'
    };
  }

  previewSql(sql: string): string | undefined {
    const first = splitSqlStatements(sql)[0]?.sql ?? sql.trim();
    if (!first) {
      return undefined;
    }
    if (/^\s*(select|with)\b/i.test(first)) {
      return `explain ${first}`;
    }
    const deleteMatch = first.match(/\bdelete\s+from\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)([\s\S]*)/i);
    if (deleteMatch) {
      const where = deleteMatch[2].match(/\bwhere\b[\s\S]*/i)?.[0] ?? '';
      return `select *\nfrom ${deleteMatch[1]}\n${where}\nlimit 100;`.trim();
    }
    const updateMatch = first.match(/\bupdate\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)[\s\S]*?\bwhere\b([\s\S]*)/i);
    if (updateMatch) {
      return `select *\nfrom ${updateMatch[1]}\nwhere ${updateMatch[2].trim()}\nlimit 100;`;
    }
    return `explain ${first}`;
  }

  private maxRisk(current: SqlSafetyRisk, next: SqlSafetyRisk): SqlSafetyRisk {
    const order: SqlSafetyRisk[] = ['safe', 'write', 'destructive', 'production'];
    return order.indexOf(next) > order.indexOf(current) ? next : current;
  }
}
