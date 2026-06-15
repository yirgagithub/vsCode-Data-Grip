import * as vscode from 'vscode';
import { splitSqlStatements } from '../database/sqlSplitter';
import { extractSqlAliases } from './sqlRelationParser';

export type SqlQueryKind = 'statement' | 'cte' | 'subquery';

export interface SqlQueryNode {
  id: string;
  index: number;
  kind: SqlQueryKind;
  name?: string;
  sql: string;
  range: vscode.Range;
  start: number;
  end: number;
  children: SqlQueryNode[];
  aliasNames: string[];
}

export interface SqlSyntaxIssue {
  message: string;
  range: vscode.Range;
}

export class SqlQueryTreeService {
  getTree(document: vscode.TextDocument): SqlQueryNode[] {
    const text = document.getText();
    const counter = { value: 0 };
    return splitSqlStatements(text).map((statement) => {
      const sql = text.slice(statement.start, statement.end);
      const range = new vscode.Range(document.positionAt(statement.start), document.positionAt(statement.end));
      const index = counter.value;
      counter.value += 1;
      const node: SqlQueryNode = {
        id: this.nodeId(document.uri.toString(), 'statement', statement.start, statement.end),
        index,
        kind: 'statement',
        sql,
        range,
        start: statement.start,
        end: statement.end,
        children: [],
        aliasNames: this.extractAliases(sql)
      };
      node.children = this.parseChildren(document, sql, statement.start, counter);
      return node;
    });
  }

  findNode(document: vscode.TextDocument, selection: vscode.Selection): SqlQueryNode | undefined {
    const roots = this.getTree(document);
    if (!roots.length) {
      return undefined;
    }

    if (!selection.isEmpty) {
      const trimmed = this.trimRange(document, selection);
      if (trimmed.isEmpty) {
        return undefined;
      }
      return this.findSmallestContainingNode(roots, document.offsetAt(trimmed.start), document.offsetAt(trimmed.end));
    }

    const offset = document.offsetAt(selection.active);
    const token = this.wordAt(document.getText(), offset);
    const root = roots.find((node) => offset >= node.start && offset <= node.end);
    if (root && token) {
      const cte = this.findReferencedCte(root, token);
      if (cte) {
        return cte;
      }
    }

    return this.findSmallestContainingNode(roots, offset, offset);
  }

  findExecutableNode(document: vscode.TextDocument, selection: vscode.Selection): SqlQueryNode | undefined {
    const node = this.findNode(document, selection);
    if (!node) {
      return undefined;
    }
    if (node.kind !== 'cte') {
      return node;
    }
    return this.getTree(document).find((root) => node.start >= root.start && node.end <= root.end);
  }

  getRootNodes(document: vscode.TextDocument): SqlQueryNode[] {
    return this.getTree(document);
  }

  getSyntaxIssues(document: vscode.TextDocument): SqlSyntaxIssue[] {
    const text = document.getText();
    const issues: SqlSyntaxIssue[] = [];
    const stack: number[] = [];
    let single = false;
    let double = false;
    let lineComment = false;
    let blockCommentStart: number | undefined;
    let dollarTag: string | undefined;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (lineComment) {
        if (char === '\n') {
          lineComment = false;
        }
        continue;
      }

      if (blockCommentStart !== undefined) {
        if (char === '*' && next === '/') {
          blockCommentStart = undefined;
          i += 1;
        }
        continue;
      }

      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = undefined;
        }
        continue;
      }

      if (single) {
        if (char === "'" && next === "'") {
          i += 1;
        } else if (char === "'") {
          single = false;
        }
        continue;
      }

      if (double) {
        if (char === '"' && next === '"') {
          i += 1;
        } else if (char === '"') {
          double = false;
        }
        continue;
      }

      if (char === '-' && next === '-') {
        lineComment = true;
        i += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        blockCommentStart = i;
        i += 1;
        continue;
      }

      if (char === "'") {
        single = true;
        continue;
      }

      if (char === '"') {
        double = true;
        continue;
      }

      if (char === '$') {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length - 1;
          continue;
        }
      }

      if (char === '(') {
        stack.push(i);
      } else if (char === ')') {
        const open = stack.pop();
        if (open === undefined) {
          issues.push({
            message: 'Unexpected closing parenthesis.',
            range: new vscode.Range(document.positionAt(i), document.positionAt(i + 1))
          });
        }
      }
    }

    for (const open of stack) {
      issues.push({
        message: 'Missing closing parenthesis.',
        range: new vscode.Range(document.positionAt(open), document.positionAt(open + 1))
      });
    }
    if (single) {
      issues.push(this.endOfDocumentIssue(document, 'Unterminated string literal.'));
    }
    if (double) {
      issues.push(this.endOfDocumentIssue(document, 'Unterminated quoted identifier.'));
    }
    if (blockCommentStart !== undefined) {
      issues.push({
        message: 'Unterminated block comment.',
        range: new vscode.Range(document.positionAt(blockCommentStart), document.positionAt(blockCommentStart + 2))
      });
    }
    if (dollarTag) {
      issues.push(this.endOfDocumentIssue(document, `Unterminated dollar quote ${dollarTag}.`));
    }
    issues.push(...this.getIncompleteBetweenIssues(document));
    issues.push(...this.getDanglingClauseIssues(document));

    return issues;
  }

  private parseChildren(document: vscode.TextDocument, text: string, baseOffset: number, counter: { value: number }): SqlQueryNode[] {
    const children: SqlQueryNode[] = [];
    let i = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag: string | undefined;

    while (i < text.length) {
      const char = text[i];
      const next = text[i + 1];

      if (lineComment) {
        if (char === '\n') {
          lineComment = false;
        }
        i += 1;
        continue;
      }

      if (blockComment) {
        if (char === '*' && next === '/') {
          blockComment = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length;
          dollarTag = undefined;
        } else {
          i += 1;
        }
        continue;
      }

      if (single) {
        if (char === "'" && next === "'") {
          i += 2;
        } else if (char === "'") {
          single = false;
          i += 1;
        } else {
          i += 1;
        }
        continue;
      }

      if (double) {
        if (char === '"' && next === '"') {
          i += 2;
        } else if (char === '"') {
          double = false;
          i += 1;
        } else {
          i += 1;
        }
        continue;
      }

      if (char === '-' && next === '-') {
        lineComment = true;
        i += 2;
        continue;
      }

      if (char === '/' && next === '*') {
        blockComment = true;
        i += 2;
        continue;
      }

      if (char === "'") {
        single = true;
        i += 1;
        continue;
      }

      if (char === '"') {
        double = true;
        i += 1;
        continue;
      }

      if (char === '$') {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length;
          continue;
        }
      }

      const withMatch = this.matchWord(text, i, 'with');
      if (withMatch) {
        const parsed = this.parseWithClause(document, text, baseOffset, i, counter);
        if (parsed) {
          children.push(...parsed.nodes);
          i = parsed.nextIndex;
          continue;
        }
      }

      if (char === '(') {
        const close = this.findMatchingParen(text, i);
        if (close > i) {
          const inner = text.slice(i + 1, close);
          const trimmed = this.trimBounds(inner, 0, inner.length);
          if (trimmed) {
            const innerSql = inner.slice(trimmed.start, trimmed.end);
            if (this.isQueryStart(innerSql)) {
              const start = baseOffset + i + 1 + trimmed.start;
              const end = baseOffset + i + 1 + trimmed.end;
              const child: SqlQueryNode = {
                id: this.nodeId(document.uri.toString(), 'subquery', start, end),
                index: counter.value += 1,
                kind: 'subquery',
                sql: innerSql,
                range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
                start,
                end,
                children: [],
                aliasNames: this.extractAliases(innerSql)
              };
              child.children = this.parseChildren(document, innerSql, start, counter);
              children.push(child);
            }
          }
          const nestedBaseOffset = baseOffset + i + 1;
          const nestedChildren = this.parseChildren(document, inner, nestedBaseOffset, counter)
            .filter((child) => !children.some((existing) => existing.start === child.start && existing.end === child.end));
          children.push(...nestedChildren);
          i = close + 1;
          continue;
        }
      }

      i += 1;
    }

    return children;
  }

  private parseWithClause(
    document: vscode.TextDocument,
    text: string,
    baseOffset: number,
    withIndex: number,
    counter: { value: number }
  ): { nodes: SqlQueryNode[]; nextIndex: number } | undefined {
    let i = withIndex + 4;
    i = this.skipWhitespace(text, i);
    if (this.matchWord(text, i, 'recursive')) {
      i += 'recursive'.length;
      i = this.skipWhitespace(text, i);
    }

    const nodes: SqlQueryNode[] = [];
    while (i < text.length) {
      i = this.skipWhitespace(text, i);
      const nameMatch = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*|"[^"]+"/);
      if (!nameMatch) {
        break;
      }
      const name = this.stripQuotes(nameMatch[0]);
      const nameStart = i;
      i += nameMatch[0].length;
      i = this.skipWhitespace(text, i);

      if (text[i] === '(') {
        const columnsClose = this.findMatchingParen(text, i);
        if (columnsClose > i) {
          i = columnsClose + 1;
          i = this.skipWhitespace(text, i);
        }
      }

      if (!this.matchWord(text, i, 'as')) {
        break;
      }
      i += 2;
      i = this.skipWhitespace(text, i);
      if (text[i] !== '(') {
        break;
      }

      const open = i;
      const close = this.findMatchingParen(text, open);
      if (close <= open) {
        break;
      }

      const nodeStart = nameStart;
      const nodeEnd = close + 1;
      const sql = text.slice(nodeStart, nodeEnd);
      const start = baseOffset + nodeStart;
      const end = baseOffset + nodeEnd;
      const node: SqlQueryNode = {
        id: this.nodeId(document.uri.toString(), 'cte', start, end, name),
        index: counter.value += 1,
        kind: 'cte',
        name,
        sql,
        range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
        start,
        end,
        children: [],
        aliasNames: this.extractAliases(sql)
      };
      const body = text.slice(open + 1, close);
      node.children = this.parseChildren(document, body, baseOffset + open + 1, counter);
      nodes.push(node);

      i = close + 1;
      i = this.skipWhitespace(text, i);
      if (text[i] === ',') {
        i += 1;
        continue;
      }
      break;
    }

    return nodes.length ? { nodes, nextIndex: i } : undefined;
  }

  private findSmallestContainingNode(nodes: SqlQueryNode[], startOffset: number, endOffset: number): SqlQueryNode | undefined {
    const flat = this.flatten(nodes).filter((node) => startOffset >= node.start && endOffset <= node.end);
    if (!flat.length) {
      return nodes.find((node) => startOffset >= node.start && endOffset <= node.end);
    }
    flat.sort((a, b) => (a.end - a.start) - (b.end - b.start));
    return flat[0];
  }

  private flatten(nodes: SqlQueryNode[]): SqlQueryNode[] {
    const flat: SqlQueryNode[] = [];
    for (const node of nodes) {
      flat.push(node);
      flat.push(...this.flatten(node.children));
    }
    return flat;
  }

  private findReferencedCte(root: SqlQueryNode, token: string): SqlQueryNode | undefined {
    const tokenLower = token.toLowerCase();
    return this.flatten(root.children).find((node) => node.kind === 'cte' && node.name?.toLowerCase() === tokenLower);
  }

  private extractAliases(sql: string): string[] {
    return extractSqlAliases(sql)
      .filter((alias) => alias.explicitAlias)
      .map((alias) => alias.alias);
  }

  private matchWord(text: string, index: number, word: string): boolean {
    const slice = text.slice(index, index + word.length);
    if (slice.toLowerCase() !== word.toLowerCase()) {
      return false;
    }
    const before = index > 0 ? text[index - 1] : '';
    const after = text[index + word.length] ?? '';
    return !this.isWordChar(before) && !this.isWordChar(after);
  }

  private isQueryStart(sql: string): boolean {
    return /^(with|select|values|insert|update|delete)\b/i.test(sql.trim());
  }

  private wordAt(text: string, offset: number): string | undefined {
    let start = offset;
    let end = offset;
    while (start > 0 && this.isWordChar(text[start - 1])) {
      start -= 1;
    }
    while (end < text.length && this.isWordChar(text[end])) {
      end += 1;
    }
    const word = text.slice(start, end).trim();
    return word || undefined;
  }

  private findMatchingParen(text: string, openIndex: number): number {
    let depth = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag: string | undefined;

    for (let i = openIndex; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (lineComment) {
        if (char === '\n') {
          lineComment = false;
        }
        continue;
      }

      if (blockComment) {
        if (char === '*' && next === '/') {
          blockComment = false;
          i += 1;
        }
        continue;
      }

      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = undefined;
        }
        continue;
      }

      if (single) {
        if (char === "'" && next === "'") {
          i += 1;
        } else if (char === "'") {
          single = false;
        }
        continue;
      }

      if (double) {
        if (char === '"' && next === '"') {
          i += 1;
        } else if (char === '"') {
          double = false;
        }
        continue;
      }

      if (char === '-' && next === '-') {
        lineComment = true;
        i += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        blockComment = true;
        i += 1;
        continue;
      }

      if (char === "'") {
        single = true;
        continue;
      }

      if (char === '"') {
        double = true;
        continue;
      }

      if (char === '$') {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          i += dollarTag.length - 1;
          continue;
        }
      }

      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  private trimBounds(text: string, start: number, end: number): { start: number; end: number } | undefined {
    let nextStart = start;
    let nextEnd = end;
    while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
      nextStart += 1;
    }
    while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
      nextEnd -= 1;
    }
    return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : undefined;
  }

  private trimRange(document: vscode.TextDocument, range: vscode.Selection): vscode.Range {
    const text = document.getText(range);
    const trimmed = this.trimBounds(text, 0, text.length);
    if (!trimmed) {
      return new vscode.Range(range.start, range.start);
    }
    const base = document.offsetAt(range.start);
    return new vscode.Range(document.positionAt(base + trimmed.start), document.positionAt(base + trimmed.end));
  }

  private skipWhitespace(text: string, index: number): number {
    let i = index;
    while (i < text.length && /\s/.test(text[i])) {
      i += 1;
    }
    return i;
  }

  private isWordChar(char: string | undefined): boolean {
    return !!char && /[A-Za-z0-9_]/.test(char);
  }

  private stripQuotes(value: string): string {
    return value.replace(/^"|"$/g, '');
  }

  private getDanglingClauseIssues(document: vscode.TextDocument): SqlSyntaxIssue[] {
    const text = document.getText();
    const issues: SqlSyntaxIssue[] = [];
    for (const statement of splitSqlStatements(text)) {
      const tokens = this.wordTokens(text, statement.start, statement.end, { includeQuotedIdentifiers: true });
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const word = token.word.toLowerCase();
        if (!['from', 'join', 'update', 'into'].includes(word)) {
          continue;
        }
        const next = tokens[index + 1]?.word.toLowerCase();
        if (!next || this.isClauseBoundary(next)) {
          issues.push({
            message: `Expected a table name after ${word.toUpperCase()}.`,
            range: new vscode.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
        }
      }
    }
    return issues;
  }

  private getIncompleteBetweenIssues(document: vscode.TextDocument): SqlSyntaxIssue[] {
    const text = document.getText();
    const issues: SqlSyntaxIssue[] = [];
    for (const statement of splitSqlStatements(text)) {
      const tokens = this.wordTokens(text, statement.start, statement.end, { includeQuotedValues: true });
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.word.toLowerCase() !== 'between') {
          continue;
        }

        const lowerBound = tokens[index + 1]?.word.toLowerCase();
        if (!lowerBound || lowerBound === 'and' || this.isBetweenBoundary(lowerBound)) {
          issues.push({
            message: 'BETWEEN requires a lower bound and an AND upper bound.',
            range: new vscode.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
          continue;
        }

        const andIndex = this.findBetweenAnd(tokens, index + 2);
        if (andIndex < 0) {
          issues.push({
            message: 'BETWEEN requires an AND upper bound.',
            range: new vscode.Range(document.positionAt(token.start), document.positionAt(token.end))
          });
          continue;
        }

        const upperBound = tokens[andIndex + 1]?.word.toLowerCase();
        if (!upperBound || upperBound === 'and' || this.isBetweenBoundary(upperBound)) {
          issues.push({
            message: 'BETWEEN requires an upper bound after AND.',
            range: new vscode.Range(document.positionAt(tokens[andIndex].start), document.positionAt(tokens[andIndex].end))
          });
        }
      }
    }
    return issues;
  }

  private findBetweenAnd(tokens: Array<{ word: string; start: number; end: number }>, startIndex: number): number {
    for (let index = startIndex; index < tokens.length; index += 1) {
      const word = tokens[index].word.toLowerCase();
      if (word === 'and') {
        return index;
      }
      if (this.isBetweenBoundary(word)) {
        return -1;
      }
    }
    return -1;
  }

  private wordTokens(
    text: string,
    start: number,
    end: number,
    options: { includeQuotedValues?: boolean; includeQuotedIdentifiers?: boolean } = {}
  ): Array<{ word: string; start: number; end: number }> {
    const tokens: Array<{ word: string; start: number; end: number }> = [];
    let i = start;
    let lineComment = false;
    let blockComment = false;

    while (i < end) {
      const char = text[i];
      const next = text[i + 1];

      if (lineComment) {
        lineComment = char !== '\n';
        i += 1;
        continue;
      }
      if (blockComment) {
        if (char === '*' && next === '/') {
          blockComment = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (char === '-' && next === '-') {
        lineComment = true;
        i += 2;
        continue;
      }
      if (char === '/' && next === '*') {
        blockComment = true;
        i += 2;
        continue;
      }
      if (char === "'") {
        const tokenStart = i;
        i += 1;
        while (i < end) {
          if (text[i] === "'" && text[i + 1] === "'") {
            i += 2;
          } else if (text[i] === "'") {
            i += 1;
            break;
          } else {
            i += 1;
          }
        }
        if (options.includeQuotedValues) {
          tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        }
        continue;
      }
      if (char === '"') {
        const tokenStart = i;
        i += 1;
        while (i < end) {
          if (text[i] === '"' && text[i + 1] === '"') {
            i += 2;
          } else if (text[i] === '"') {
            i += 1;
            break;
          } else {
            i += 1;
          }
        }
        if (options.includeQuotedValues || options.includeQuotedIdentifiers) {
          tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        }
        continue;
      }
      if (char === '$') {
        const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          const tokenStart = i;
          const tag = match[0];
          const close = text.indexOf(tag, i + tag.length);
          i = close >= 0 ? close + tag.length : end;
          if (options.includeQuotedValues) {
            tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
          }
          continue;
        }
      }
      if (this.isWordChar(char)) {
        const tokenStart = i;
        while (i < end && this.isWordChar(text[i])) {
          i += 1;
        }
        tokens.push({ word: text.slice(tokenStart, i), start: tokenStart, end: i });
        continue;
      }
      i += 1;
    }

    return tokens;
  }

  private isBetweenBoundary(word: string): boolean {
    return [
      'or',
      'when',
      'then',
      'else',
      'end'
    ].includes(word) || this.isClauseBoundary(word);
  }

  private isClauseBoundary(word: string): boolean {
    return [
      'where',
      'group',
      'order',
      'limit',
      'having',
      'union',
      'intersect',
      'except',
      'join',
      'left',
      'right',
      'inner',
      'outer',
      'full',
      'cross',
      'on',
      'using',
      'set',
      'values',
      'returning'
    ].includes(word);
  }

  private endOfDocumentIssue(document: vscode.TextDocument, message: string): SqlSyntaxIssue {
    const end = document.positionAt(document.getText().length);
    return {
      message,
      range: new vscode.Range(end, end)
    };
  }

  private nodeId(documentUri: string, kind: SqlQueryKind, start: number, end: number, name?: string): string {
    return `${documentUri}:${kind}:${start}-${end}${name ? `:${name}` : ''}`;
  }
}
