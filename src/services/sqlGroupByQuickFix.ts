import { GroupByErrorEvidence } from './sqlGroupByError';

export interface GroupByQuickFix {
  start: number;
  end: number;
  newText: string;
  expression: string;
}

interface Token {
  text: string;
  normalized: string;
  start: number;
  end: number;
  depth: number;
}

interface SelectScope {
  start: number;
  end: number;
  depth: number;
  tokenIndex: number;
}

const SET_OPERATORS = new Set(['union', 'intersect', 'except']);
const TRAILING_CLAUSES = new Set(['having', 'limit', 'offset', 'fetch', 'qualify']);

export function computeGroupByQuickFix(sql: string, evidence: GroupByErrorEvidence): GroupByQuickFix | undefined {
  const tokens = scan(sql);
  const scopes = findSelectScopes(tokens, sql.length);
  const expressionParts = identifierParts(evidence.expression);
  if (expressionParts.length === 0) return undefined;

  const candidates = scopes
    .map(scope => ({ scope, occurrences: findExpression(tokens, scope, expressionParts) }))
    .filter(candidate => candidate.occurrences.length > 0);

  let selected: typeof candidates[number] | undefined;
  if (evidence.position !== undefined) {
    const hints = [evidence.position, Math.max(0, evidence.position - 1)];
    const containing = candidates.filter(({ scope }) => hints.some(hint => hint >= scope.start && hint < scope.end));
    if (containing.length > 0) {
      selected = containing.sort((a, b) => (a.scope.end - a.scope.start) - (b.scope.end - b.scope.start))[0];
    }
  } else if (candidates.length === 1) {
    selected = candidates[0];
  }
  if (!selected) return undefined;

  const { scope } = selected;
  const ownTokens = tokens.filter(token => token.start >= scope.start && token.start < scope.end && token.depth === scope.depth);
  const groupIndex = ownTokens.findIndex((token, index) => token.normalized === 'group' && ownTokens[index + 1]?.normalized === 'by');
  const boundaryIndex = (from: number) => ownTokens.findIndex((token, index) => index > from && isTrailingBoundary(ownTokens, index));

  if (groupIndex >= 0) {
    const next = boundaryIndex(groupIndex + 1);
    const end = next >= 0 ? ownTokens[next].start : scope.end;
    const groupText = sql.slice(ownTokens[groupIndex + 1].end, end);
    if (containsExpression(groupText, expressionParts)) return undefined;
    const insertion = trimWhitespaceLeft(sql, end, ownTokens[groupIndex + 1].end);
    return { start: insertion, end: insertion, newText: `, ${evidence.expression}`, expression: evidence.expression };
  }

  const next = ownTokens.findIndex((token, index) => index > 0 && isTrailingBoundary(ownTokens, index));
  const insertion = next >= 0 ? ownTokens[next].start : scope.end;
  const before = sql.slice(0, insertion);
  const prefix = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  return {
    start: insertion,
    end: insertion,
    newText: `${prefix}GROUP BY ${evidence.expression}${next >= 0 ? ' ' : ''}`,
    expression: evidence.expression
  };
}

export function applyGroupByQuickFix(sql: string, fix: GroupByQuickFix): string {
  return sql.slice(0, fix.start) + fix.newText + sql.slice(fix.end);
}

function findSelectScopes(tokens: Token[], sqlLength: number): SelectScope[] {
  const scopes: SelectScope[] = [];
  tokens.forEach((token, tokenIndex) => {
    if (token.normalized !== 'select') return;
    let end = sqlLength;
    for (let index = tokenIndex + 1; index < tokens.length; index++) {
      const current = tokens[index];
      if (current.depth < token.depth ||
          (current.depth === token.depth && (current.text === ';' || SET_OPERATORS.has(current.normalized)))) {
        end = current.start;
        break;
      }
    }
    scopes.push({ start: token.start, end, depth: token.depth, tokenIndex });
  });
  return scopes;
}

function findExpression(tokens: Token[], scope: SelectScope, parts: string[]): number[] {
  const own = tokens.filter(token => token.start >= scope.start && token.start < scope.end && token.depth === scope.depth);
  const found: number[] = [];
  for (let index = 0; index < own.length; index++) {
    let cursor = index;
    let matched = true;
    for (let part = 0; part < parts.length; part++) {
      if (own[cursor]?.normalized !== parts[part]) { matched = false; break; }
      cursor++;
      if (part < parts.length - 1) {
        if (own[cursor]?.text !== '.') { matched = false; break; }
        cursor++;
      }
    }
    if (matched) found.push(own[index].start);
  }
  return found;
}

function identifierParts(expression: string): string[] {
  return expression.split('.').map(part => part.trim().replace(/^(?:"|`|\[)|(?:"|`|\])$/g, '').toLowerCase()).filter(Boolean);
}

function containsExpression(text: string, parts: string[]): boolean {
  const tokens = scan(text);
  return findExpression(tokens, { start: 0, end: text.length, depth: 0, tokenIndex: 0 }, parts).length > 0;
}

function isTrailingBoundary(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  return TRAILING_CLAUSES.has(token.normalized) || SET_OPERATORS.has(token.normalized) ||
    (token.normalized === 'order' && tokens[index + 1]?.normalized === 'by');
}

function trimWhitespaceLeft(sql: string, position: number, minimum: number): number {
  while (position > minimum && /\s/.test(sql[position - 1])) position--;
  return position;
}

function scan(sql: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (/\s/.test(char)) { index++; continue; }
    if (char === '-' && sql[index + 1] === '-') { index += 2; while (index < sql.length && sql[index] !== '\n') index++; continue; }
    if (char === '/' && sql[index + 1] === '*') { index += 2; while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index++; index = Math.min(sql.length, index + 2); continue; }
    if (char === "'") { index++; while (index < sql.length) { if (sql[index] === "'" && sql[index + 1] === "'") { index += 2; continue; } if (sql[index++] === "'") break; } continue; }
    if (char === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
      if (tag) { const close = sql.indexOf(tag, index + tag.length); index = close < 0 ? sql.length : close + tag.length; continue; }
    }
    if (char === '(') { tokens.push(makeToken(char, index, index + 1, depth)); depth++; index++; continue; }
    if (char === ')') { depth = Math.max(0, depth - 1); tokens.push(makeToken(char, index, index + 1, depth)); index++; continue; }
    if (';,.'.includes(char)) { tokens.push(makeToken(char, index, index + 1, depth)); index++; continue; }
    if (char === '"' || char === '`' || char === '[') {
      const closeChar = char === '[' ? ']' : char;
      const start = index++;
      while (index < sql.length) { if (sql[index] === closeChar) { index++; if (sql[index] === closeChar && closeChar !== ']') { index++; continue; } break; } index++; }
      tokens.push(makeToken(sql.slice(start, index), start, index, depth));
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index++;
      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index])) index++;
      tokens.push(makeToken(sql.slice(start, index), start, index, depth));
      continue;
    }
    index++;
  }
  return tokens;
}

function makeToken(text: string, start: number, end: number, depth: number): Token {
  return { text, normalized: text.replace(/^(?:"|`|\[)|(?:"|`|\])$/g, '').toLowerCase(), start, end, depth };
}
