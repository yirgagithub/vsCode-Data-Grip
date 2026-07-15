export interface SqlObjectReference {
  range: { start: number; end: number };
  parts: string[];
  context: 'relation' | 'routine' | 'trigger';
  argumentCount?: number;
}

type TokenKind = 'identifier' | 'string' | 'punctuation';

interface Token {
  kind: TokenKind;
  text: string;
  normalized: string;
  start: number;
  end: number;
}

interface IdentifierSequence {
  startIndex: number;
  endIndex: number;
  parts: string[];
  start: number;
  end: number;
}

interface CteScope {
  name: string;
  startIndex: number;
  endIndex: number;
}

const builtInRoutines = new Set([
  'abs', 'acos', 'asin', 'atan', 'avg', 'cast', 'ceil', 'ceiling', 'coalesce', 'concat',
  'convert', 'cos', 'count', 'current_date', 'current_time', 'current_timestamp', 'dateadd',
  'datediff', 'dense_rank', 'exists', 'exp', 'extract', 'floor', 'greatest', 'ifnull',
  'json_extract', 'lag', 'last_value', 'lead', 'least', 'length', 'ln', 'log', 'lower',
  'ltrim', 'max', 'min', 'mod', 'nullif', 'now', 'nth_value', 'ntile', 'power', 'rank',
  'replace', 'round', 'row_number', 'rtrim', 'sin', 'sqrt', 'substring', 'sum', 'tan',
  'trim', 'upper', 'getdate', 'sysdate', 'nvl', 'isnull', 'json_value',
]);

const nonRoutineKeywords = new Set([
  'all', 'and', 'any', 'as', 'between', 'by', 'case', 'distinct', 'else', 'end',
  'exists', 'filter', 'from', 'group', 'having', 'in', 'is', 'like', 'not', 'null',
  'on', 'or', 'order', 'over', 'partition', 'select', 'some', 'then', 'using', 'values',
  'when', 'where', 'within',
]);

const routineDeclarationKeywords = new Set(['function', 'procedure', 'trigger', 'table', 'view', 'type']);

export function findSqlObjectReference(sql: string, offset: number): SqlObjectReference | undefined {
  if (offset < 0 || offset >= sql.length) {
    return undefined;
  }

  const tokens = tokenize(sql);
  const cteScopes = collectCteScopes(tokens);
  const candidates: SqlObjectReference[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const word = keyword(tokens[index]);
    if (word === 'trigger' && isTriggerDdl(tokens, index)) {
      let nameIndex = index + 1;
      while (['if', 'not', 'exists'].includes(keyword(tokens[nameIndex]))) nameIndex += 1;
      const sequence = readIdentifierSequence(tokens, nameIndex);
      if (sequence) {
        candidates.push(toReference(sequence, 'trigger'));
      }
      continue;
    }

    if (isRelationIntroducer(tokens, index)) {
      const sequence = readIdentifierSequence(tokens, index + 1);
      const insertTarget = word === 'into' && keyword(tokens[index - 1]) === 'insert';
      if (sequence && (tokens[sequence.endIndex + 1]?.text !== '(' || insertTarget)
        && !isCteReference(sequence, cteScopes)) {
        candidates.push(toReference(sequence, 'relation'));
      }
    }

    if ((word === 'exec' || word === 'execute' || word === 'call')
      && keyword(tokens[index + 1]) !== 'as') {
      const sequence = readIdentifierSequence(tokens, index + 1);
      if (sequence) candidates.push(toReference(sequence, 'routine'));
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const sequence = readIdentifierSequence(tokens, index);
    if (!sequence || sequence.startIndex !== index || tokens[sequence.endIndex + 1]?.text !== '(') {
      continue;
    }
    const name = lastPart(sequence);
    const previous = keyword(tokens[index - 1]);
    if (nonRoutineKeywords.has(name) || builtInRoutines.has(name)
      || routineDeclarationKeywords.has(previous) || previous === 'into'
      || isCteDeclaration(tokens, sequence)) {
      index = sequence.endIndex;
      continue;
    }
    const closeIndex = matchingCloseParen(tokens, sequence.endIndex + 1);
    if (closeIndex !== undefined) {
      candidates.push({
        ...toReference(sequence, 'routine'),
        argumentCount: countArguments(tokens, sequence.endIndex + 1, closeIndex),
      });
    }
    index = sequence.endIndex;
  }

  return candidates.find((candidate) => offset >= candidate.range.start && offset < candidate.range.end);
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '-' && sql[index + 1] === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2);
      index = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (char === "'") {
      const start = index++;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
        } else if (sql[index++] === "'") {
          break;
        }
      }
      tokens.push({ kind: 'string', text: sql.slice(start, index), normalized: '', start, end: index });
      continue;
    }
    if (char === '"' || char === '`' || char === '[') {
      const start = index;
      const close = char === '[' ? ']' : char;
      index += 1;
      let value = '';
      while (index < sql.length) {
        if (sql[index] === close && sql[index + 1] === close) {
          value += close;
          index += 2;
        } else if (sql[index] === close) {
          index += 1;
          break;
        } else {
          value += sql[index++];
        }
      }
      tokens.push({ kind: 'identifier', text: sql.slice(start, index), normalized: value, start, end: index });
      continue;
    }
    if (/[A-Za-z_$#]/.test(char)) {
      const start = index++;
      while (index < sql.length && /[A-Za-z0-9_$#]/.test(sql[index])) index += 1;
      const text = sql.slice(start, index);
      tokens.push({ kind: 'identifier', text, normalized: text, start, end: index });
      continue;
    }
    tokens.push({ kind: 'punctuation', text: char, normalized: char, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

function keyword(token: Token | undefined): string {
  return token?.kind === 'identifier' && /^[A-Za-z_$#]/.test(token.text) ? token.normalized.toLowerCase() : '';
}

function readIdentifierSequence(tokens: Token[], startIndex: number): IdentifierSequence | undefined {
  const first = tokens[startIndex];
  if (!first || first.kind !== 'identifier') return undefined;
  const parts = [first.normalized];
  let endIndex = startIndex;
  while (tokens[endIndex + 1]?.text === '.' && tokens[endIndex + 2]?.kind === 'identifier') {
    parts.push(tokens[endIndex + 2].normalized);
    endIndex += 2;
  }
  return { startIndex, endIndex, parts, start: first.start, end: tokens[endIndex].end };
}

function toReference(sequence: IdentifierSequence, context: SqlObjectReference['context']): SqlObjectReference {
  return { range: { start: sequence.start, end: sequence.end }, parts: sequence.parts, context };
}

function lastPart(sequence: IdentifierSequence): string {
  return sequence.parts[sequence.parts.length - 1].toLowerCase();
}

function isRelationIntroducer(tokens: Token[], index: number): boolean {
  const word = keyword(tokens[index]);
  if (word === 'from' || word === 'join' || word === 'update') return true;
  if (word === 'into' && keyword(tokens[index - 1]) === 'insert') return true;
  if (tokens[index].text !== ',') return false;
  const clauseBoundaries = new Set(['where', 'group', 'order', 'having', 'on', 'union', 'set', 'values', 'returning']);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const priorWord = keyword(tokens[cursor]);
    if (priorWord === 'from' || priorWord === 'join') return true;
    if (clauseBoundaries.has(priorWord) || tokens[cursor].text === ';' || tokens[cursor].text === '(') return false;
  }
  return false;
}

function isTriggerDdl(tokens: Token[], triggerIndex: number): boolean {
  for (let index = triggerIndex - 1; index >= 0 && triggerIndex - index <= 3; index -= 1) {
    const word = keyword(tokens[index]);
    if (word === 'create' || word === 'alter' || word === 'drop') return true;
    if (tokens[index].text === ';') break;
  }
  return false;
}

function collectCteScopes(tokens: Token[]): CteScope[] {
  const scopes: CteScope[] = [];
  const depths = tokenDepths(tokens);
  for (let index = 0; index < tokens.length; index += 1) {
    if (keyword(tokens[index]) !== 'with') continue;
    const scopeEnd = cteScopeEnd(tokens, depths, index);
    let cursor = index + 1;
    if (keyword(tokens[cursor]) === 'recursive') cursor += 1;
    while (cursor < scopeEnd) {
      const sequence = readIdentifierSequence(tokens, cursor);
      if (!sequence || sequence.parts.length !== 1) break;
      cursor = sequence.endIndex + 1;
      if (tokens[cursor]?.text === '(') {
        const columnsEnd = matchingCloseParen(tokens, cursor);
        if (columnsEnd === undefined) break;
        cursor = columnsEnd + 1;
      }
      if (keyword(tokens[cursor]) !== 'as') break;
      cursor += 1;
      if (keyword(tokens[cursor]) === 'not') cursor += 1;
      if (keyword(tokens[cursor]) === 'materialized') cursor += 1;
      if (tokens[cursor]?.text !== '(') break;
      const bodyEnd = matchingCloseParen(tokens, cursor);
      if (bodyEnd === undefined) break;
      scopes.push({ name: lastPart(sequence), startIndex: index, endIndex: scopeEnd });
      cursor = bodyEnd + 1;
      if (tokens[cursor]?.text !== ',') break;
      cursor += 1;
    }
  }
  return scopes;
}

function isCteReference(sequence: IdentifierSequence, scopes: CteScope[]): boolean {
  if (sequence.parts.length !== 1) return false;
  const name = lastPart(sequence);
  return scopes.some((scope) => scope.name === name
    && sequence.startIndex > scope.startIndex && sequence.startIndex < scope.endIndex);
}

function tokenDepths(tokens: Token[]): number[] {
  const depths: number[] = [];
  let depth = 0;
  for (const token of tokens) {
    depths.push(depth);
    if (token.text === '(') depth += 1;
    else if (token.text === ')') depth = Math.max(0, depth - 1);
  }
  return depths;
}

function cteScopeEnd(tokens: Token[], depths: number[], withIndex: number): number {
  const depth = depths[withIndex];
  for (let index = withIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index].text === ';' && depths[index] === depth) return index;
    if (tokens[index].text === ')' && depths[index] === depth) return index;
  }
  return tokens.length;
}

function isCteDeclaration(tokens: Token[], sequence: IdentifierSequence): boolean {
  const close = matchingCloseParen(tokens, sequence.endIndex + 1);
  return close !== undefined && keyword(tokens[close + 1]) === 'as'
    && (keyword(tokens[sequence.startIndex - 1]) === 'with' || tokens[sequence.startIndex - 1]?.text === ',');
}

function matchingCloseParen(tokens: Token[], openIndex: number): number | undefined {
  if (tokens[openIndex]?.text !== '(') return undefined;
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].text === '(') depth += 1;
    if (tokens[index].text === ')' && --depth === 0) return index;
  }
  return undefined;
}

function countArguments(tokens: Token[], openIndex: number, closeIndex: number): number {
  if (closeIndex === openIndex + 1) return 0;
  let depth = 0;
  let commas = 0;
  let hasContent = false;
  for (let index = openIndex + 1; index < closeIndex; index += 1) {
    const text = tokens[index].text;
    if (text === '(') depth += 1;
    else if (text === ')') depth -= 1;
    else if (text === ',' && depth === 0) commas += 1;
    else hasContent = true;
  }
  return hasContent ? commas + 1 : 0;
}
