import * as vscode from 'vscode';
import { ConnectionManager } from '../database/connectionManager';
import { ColumnInfo, ConnectionConfig, QueryError } from '../types';
import { SchemaContextService } from './schemaContextService';
import { SqlSection, SqlSectionService } from './sqlSectionService';
import { findSqlParameters, hasSqlParameters, sqlParameterSpansContain } from './sqlParameters';

const SQL_COLUMN_CONTEXT_KEYWORDS = new Set([
  'all',
  'and',
  'as',
  'asc',
  'between',
  'by',
  'case',
  'cast',
  'date',
  'desc',
  'distinct',
  'else',
  'end',
  'false',
  'from',
  'group',
  'having',
  'in',
  'is',
  'like',
  'limit',
  'not',
  'null',
  'or',
  'order',
  'select',
  'then',
  'true',
  'when',
  'where'
]);

const METADATA_DIAGNOSTIC_SEVERITY = vscode.DiagnosticSeverity.Warning;

export class SqlDiagnosticsService {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly schemaContext: SchemaContextService,
    private readonly sectionService: SqlSectionService
  ) {}

  async getDiagnostics(document: vscode.TextDocument, selection?: vscode.Selection, connectionOverride?: ConnectionConfig | null): Promise<vscode.Diagnostic[]> {
    const diagnostics = [...this.sectionService.getSyntaxIssues(document)];
    const connection = connectionOverride === undefined ? this.connectionManager.getPreferredConnection() : connectionOverride;
    if (!connection) {
      return diagnostics;
    }

    const scriptRelations = this.collectCreatedRelationNames(document);
    diagnostics.push(...await this.getSchemaDiagnostics(document, connection, scriptRelations));
    if (this.connectionManager.isConnected(connection.id)) {
      const executable = selection
        ? this.sectionService.detectExecutable(document, selection)
        : this.sectionService.getSections(document)[0];
      if (executable?.sql.trim() && !hasSqlParameters(executable.sql)) {
        const plannerDiagnostic = await this.getPlannerDiagnostic(document, connection, executable, scriptRelations);
        if (plannerDiagnostic) {
          diagnostics.push(plannerDiagnostic);
        }
      }
    }
    return diagnostics;
  }

  private async getSchemaDiagnostics(document: vscode.TextDocument, connection: ConnectionConfig, scriptRelations: Set<string>): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const defaultSchema = connection.defaultSchema ?? 'public';
    const entry = await this.schemaContext.getCachedForConnection(connection, defaultSchema);
    if (!entry || entry.status !== 'ready') {
      if (this.connectionManager.isConnected(connection.id)) {
        this.schemaContext.refreshDefaultSchemaInBackground(connection);
      }
      return diagnostics;
    }

    const knownRelations = new Set([...entry.tables, ...entry.views].map((item) => this.relationKey(item.schema, item.name)));
    const cteNames = this.collectCteNames(this.sectionService.getTree(document));

    for (const section of this.sectionService.getSections(document)) {
      for (const alias of section.aliases) {
        if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
          continue;
        }
        const schema = alias.schema ?? defaultSchema;
        if (!knownRelations.has(this.relationKey(schema, alias.table))) {
          diagnostics.push(new vscode.Diagnostic(
            this.findIdentifierRange(document, section, alias.schema ? `${alias.schema}.${alias.table}` : alias.table),
            `Table or view "${alias.schema ? `${alias.schema}.` : ''}${alias.table}" does not exist in ${schema}.`,
            METADATA_DIAGNOSTIC_SEVERITY
          ));
        }
      }

      diagnostics.push(...await this.getColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
    }

    return diagnostics;
  }

  private async getColumnDiagnostics(
    document: vscode.TextDocument,
    connection: ConnectionConfig,
    section: SqlSection,
    cteNames: Set<string>,
    scriptRelations: Set<string>
  ): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const defaultSchema = connection.defaultSchema ?? 'public';
    const aliases = new Map(section.aliases.map((alias) => [alias.alias.toLowerCase(), alias]));
    const seen = new Set<string>();
    const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(section.sql)) !== null) {
      const qualifier = match[1] ?? match[2];
      const column = match[3] ?? match[4];
      const alias = aliases.get(qualifier.toLowerCase());
      if (!alias || cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
        continue;
      }
      const key = `${alias.schema ?? defaultSchema}.${alias.table}.${column}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const columns = await this.schemaContext.getCachedColumns(connection, alias.schema ?? defaultSchema, alias.table);
      if (!columns) {
        if (this.connectionManager.isConnected(connection.id)) {
          this.schemaContext.refreshSchemaInBackground(connection, alias.schema ?? defaultSchema);
        }
        continue;
      }
      if (!columns.some((item) => item.name.toLowerCase() === column.toLowerCase())) {
        const start = section.start + match.index + match[0].lastIndexOf(column);
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(document.positionAt(start), document.positionAt(start + column.length)),
          `Column "${column}" does not exist on ${alias.schema ? `${alias.schema}.` : ''}${alias.table}.`,
          METADATA_DIAGNOSTIC_SEVERITY
        ));
      }
    }

    diagnostics.push(...await this.getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
    return diagnostics;
  }

  private async getUnqualifiedColumnDiagnostics(
    document: vscode.TextDocument,
    connection: ConnectionConfig,
    section: SqlSection,
    cteNames: Set<string>,
    scriptRelations: Set<string>
  ): Promise<vscode.Diagnostic[]> {
    const defaultSchema = connection.defaultSchema ?? 'public';
    const relationKeys = new Map<string, { schema: string; table: string }>();
    for (const alias of section.aliases) {
      if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
        continue;
      }
      const schema = alias.schema ?? defaultSchema;
      relationKeys.set(this.relationKey(schema, alias.table), { schema, table: alias.table });
    }
    const [relation] = [...relationKeys.values()];
    if (!relation || relationKeys.size !== 1) {
      return [];
    }

    const columns = await this.schemaContext.getCachedColumns(connection, relation.schema, relation.table);
    if (!columns) {
      if (this.connectionManager.isConnected(connection.id)) {
        this.schemaContext.refreshSchemaInBackground(connection, relation.schema);
      }
      return [];
    }

    const columnNames = new Set(columns.map((column) => column.name.toLowerCase()));
    const ignored = this.unqualifiedColumnIgnoreSet(section, columns, defaultSchema);
    const parameters = findSqlParameters(section.sql);
    const diagnostics: vscode.Diagnostic[] = [];
    const seen = new Set<string>();

    for (const [spanStart, spanEnd] of this.columnExpressionSpans(section.sql)) {
      const text = section.sql.slice(spanStart, spanEnd);
      const regex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const token = match[0];
        const tokenStart = spanStart + match.index;
        const lower = token.toLowerCase();
        if (
          columnNames.has(lower)
          || ignored.has(lower)
          || this.isInsideSingleQuotedLiteral(section.sql, tokenStart)
          || this.isInLineComment(section.sql, tokenStart)
          || sqlParameterSpansContain(parameters, tokenStart, tokenStart + token.length)
          || this.isQualifiedIdentifierPart(section.sql, tokenStart, token.length)
          || this.isTypeCastName(section.sql, tokenStart)
          || this.isFunctionName(section.sql, tokenStart + token.length)
          || this.isAliasDeclaration(section.sql, tokenStart)
        ) {
          continue;
        }
        const key = `${lower}:${tokenStart}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(
            document.positionAt(section.start + tokenStart),
            document.positionAt(section.start + tokenStart + token.length)
          ),
          `Column "${token}" does not exist on ${relation.schema}.${relation.table}.`,
          METADATA_DIAGNOSTIC_SEVERITY
        ));
      }
    }

    return diagnostics;
  }

  private async getPlannerDiagnostic(
    document: vscode.TextDocument,
    connection: ConnectionConfig,
    section: SqlSection,
    scriptRelations: Set<string>
  ): Promise<vscode.Diagnostic | undefined> {
    if (section.aliases.some((alias) => this.isScriptRelation(alias, scriptRelations))) {
      return undefined;
    }
    let result;
    try {
      result = await this.connectionManager.getDriver(connection.type).validateQuery({
        connectionId: connection.id,
        sql: section.sql
      });
    } catch {
      return undefined;
    }
    if (result.ok || !result.error) {
      return undefined;
    }
    return new vscode.Diagnostic(
      this.errorRange(document, section, result.error),
      this.errorMessage(result.error),
      vscode.DiagnosticSeverity.Error
    );
  }

  private findIdentifierRange(document: vscode.TextDocument, section: SqlSection, identifier: string): vscode.Range {
    const index = section.sql.toLowerCase().indexOf(identifier.toLowerCase());
    const start = section.start + Math.max(0, index);
    return new vscode.Range(document.positionAt(start), document.positionAt(start + identifier.length));
  }

  private collectCreatedRelationNames(document: vscode.TextDocument): Set<string> {
    const relations = new Set<string>();
    const regex = /\bcreate\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
    const text = document.getText();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const [schema, table] = this.splitQualified(match[1]);
      relations.add(table.toLowerCase());
      if (schema) {
        relations.add(this.relationKey(schema, table));
      }
    }
    return relations;
  }

  private isScriptRelation(alias: { schema?: string; table: string }, scriptRelations: Set<string>): boolean {
    if (scriptRelations.has(alias.table.toLowerCase())) {
      return !alias.schema || alias.schema.toLowerCase() === 'pg_temp';
    }
    return alias.schema ? scriptRelations.has(this.relationKey(alias.schema, alias.table)) : false;
  }

  private splitQualified(value: string): [string | undefined, string] {
    const parts = value.split('.').map((part) => part.replace(/^"|"$/g, ''));
    return parts.length > 1 ? [parts[0], parts[1]] : [undefined, parts[0]];
  }

  private errorRange(document: vscode.TextDocument, section: SqlSection, error: QueryError): vscode.Range {
    const messageRange = this.errorIdentifierRange(document, section, error);
    if (messageRange) {
      return messageRange;
    }
    const offset = Number(error.position);
    if (Number.isFinite(offset) && offset > 0) {
      const explainPrefixLength = 'explain '.length;
      const relative = Math.max(0, offset - 1 - explainPrefixLength);
      const start = Math.min(section.end, section.start + relative);
      return this.expandIdentifierRange(document, section, start);
    }
    return section.range;
  }

  private errorIdentifierRange(document: vscode.TextDocument, section: SqlSection, error: QueryError): vscode.Range | undefined {
    const column = error.message.match(/\bcolumn\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+does not exist/i)?.[1];
    if (!column) {
      return undefined;
    }
    const regex = new RegExp(`\\b${escapeRegExp(column)}\\b`, 'i');
    const match = regex.exec(section.sql);
    if (!match) {
      return undefined;
    }
    const start = section.start + match.index;
    return new vscode.Range(document.positionAt(start), document.positionAt(start + column.length));
  }

  private expandIdentifierRange(document: vscode.TextDocument, section: SqlSection, absoluteStart: number): vscode.Range {
    const sql = section.sql;
    const relative = Math.max(0, Math.min(sql.length, absoluteStart - section.start));
    let start = relative;
    let end = relative;
    while (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1])) {
      start -= 1;
    }
    while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
      end += 1;
    }
    if (start === end) {
      end = Math.min(sql.length, end + 1);
    }
    return new vscode.Range(document.positionAt(section.start + start), document.positionAt(section.start + end));
  }

  private errorMessage(error: QueryError): string {
    return [error.message, error.detail, error.hint].filter(Boolean).join('\n');
  }

  private relationKey(schema: string, table: string): string {
    return `${schema}.${table}`.toLowerCase();
  }

  private collectCteNames(sections: SqlSection[]): Set<string> {
    const names = new Set<string>();
    const visit = (section: SqlSection): void => {
      if (section.kind === 'cte' && section.name) {
        names.add(section.name.toLowerCase());
      }
      for (const child of section.children) {
        if (child.kind === 'cte' && child.name) {
          names.add(child.name.toLowerCase());
        }
        visit({ ...child, aliases: [], tables: [] });
      }
    };
    for (const section of sections) {
      visit(section);
    }
    return names;
  }

  private unqualifiedColumnIgnoreSet(section: SqlSection, columns: ColumnInfo[], defaultSchema: string): Set<string> {
    const ignored = new Set(SQL_COLUMN_CONTEXT_KEYWORDS);
    for (const alias of section.aliases) {
      ignored.add(alias.alias.toLowerCase());
      ignored.add(alias.table.toLowerCase());
      ignored.add((alias.schema ?? defaultSchema).toLowerCase());
    }
    for (const column of columns) {
      ignored.add(column.dataType.toLowerCase());
    }
    for (const alias of this.outputAliases(section.sql)) {
      ignored.add(alias.toLowerCase());
    }
    return ignored;
  }

  private columnExpressionSpans(sql: string): Array<[number, number]> {
    const spans: Array<[number, number]> = [];
    const select = /\bselect\b/i.exec(sql);
    const from = /\bfrom\b/i.exec(sql);
    if (select && from && from.index > select.index) {
      spans.push([select.index + select[0].length, from.index]);
    }
    for (const regex of [/\bwhere\b/gi, /\bhaving\b/gi, /\bgroup\s+by\b/gi, /\border\s+by\b/gi]) {
      for (const match of sql.matchAll(regex)) {
        if (match.index === undefined) {
          continue;
        }
        const start = match.index + match[0].length;
        spans.push([start, this.nextClauseIndex(sql, start)]);
      }
    }
    return spans;
  }

  private nextClauseIndex(sql: string, start: number): number {
    const match = /\b(?:where|group\s+by|order\s+by|having|limit|union|intersect|except)\b/i.exec(sql.slice(start));
    return match?.index === undefined ? sql.length : start + match.index;
  }

  private isQualifiedIdentifierPart(sql: string, start: number, length: number): boolean {
    return sql.slice(0, start).trimEnd().endsWith('.') || sql.slice(start + length).trimStart().startsWith('.');
  }

  private isTypeCastName(sql: string, start: number): boolean {
    return sql.slice(0, start).trimEnd().endsWith('::');
  }

  private isFunctionName(sql: string, end: number): boolean {
    return sql.slice(end).trimStart().startsWith('(');
  }

  private isAliasDeclaration(sql: string, start: number): boolean {
    return /\bas\s+$/i.test(sql.slice(0, start));
  }

  private outputAliases(sql: string): string[] {
    const select = /\bselect\b/i.exec(sql);
    const from = /\bfrom\b/i.exec(sql);
    if (!select || !from || from.index <= select.index) {
      return [];
    }
    return [...sql.slice(select.index + select[0].length, from.index).matchAll(/\bas\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)]
      .map((match) => match[1] ?? match[2])
      .filter((alias): alias is string => Boolean(alias));
  }

  private isInsideSingleQuotedLiteral(sql: string, start: number): boolean {
    let inside = false;
    for (let index = 0; index < start; index += 1) {
      if (sql[index] !== '\'') {
        continue;
      }
      if (sql[index + 1] === '\'') {
        index += 1;
        continue;
      }
      inside = !inside;
    }
    return inside;
  }

  private isInLineComment(sql: string, start: number): boolean {
    const lineStart = sql.lastIndexOf('\n', start - 1) + 1;
    const commentStart = sql.indexOf('--', lineStart);
    return commentStart >= 0 && commentStart < start;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
