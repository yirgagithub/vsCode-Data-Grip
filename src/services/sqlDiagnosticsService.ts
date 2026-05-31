import * as vscode from 'vscode';
import { ConnectionManager } from '../database/connectionManager';
import { ConnectionConfig, QueryError } from '../types';
import { SchemaContextService } from './schemaContextService';
import { SqlSection, SqlSectionService } from './sqlSectionService';

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
      if (executable?.sql.trim()) {
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
            vscode.DiagnosticSeverity.Error
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
          vscode.DiagnosticSeverity.Error
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
    const offset = Number(error.position);
    if (Number.isFinite(offset) && offset > 0) {
      const explainPrefixLength = 'explain '.length;
      const relative = Math.max(0, offset - 1 - explainPrefixLength);
      const start = Math.min(section.end, section.start + relative);
      return new vscode.Range(document.positionAt(start), document.positionAt(Math.min(section.end, start + 1)));
    }
    return section.range;
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
}
