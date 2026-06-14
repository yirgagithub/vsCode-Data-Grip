import * as vscode from 'vscode';
import { splitSqlStatements, SqlStatement } from '../database/sqlSplitter';
import { ParsedSqlAlias, extractSqlAliases } from './sqlRelationParser';
import { SqlQueryNode, SqlQueryTreeService } from './sqlQueryTreeService';

export type SqlAlias = ParsedSqlAlias;

export interface SqlSection extends SqlQueryNode {
  aliases: SqlAlias[];
  tables: Array<{ schema?: string; table: string }>;
}

export class SqlSectionService {
  private readonly treeService = new SqlQueryTreeService();

  getSections(document: vscode.TextDocument): SqlSection[] {
    return this.treeService.getRootNodes(document).map((node) => this.toSection(node));
  }

  getTree(document: vscode.TextDocument): SqlSection[] {
    return this.treeService.getTree(document).map((node) => this.toSection(node));
  }

  detect(document: vscode.TextDocument, selection: vscode.Selection): SqlSection | undefined {
    const node = this.treeService.findNode(document, selection);
    return node ? this.toSection(node) : undefined;
  }

  detectExecutable(document: vscode.TextDocument, selection: vscode.Selection): SqlSection | undefined {
    const node = this.treeService.findExecutableNode(document, selection);
    return node ? this.toSection(node) : undefined;
  }

  getSyntaxIssues(document: vscode.TextDocument): vscode.Diagnostic[] {
    return this.treeService.getSyntaxIssues(document).map((issue) => new vscode.Diagnostic(
      issue.range,
      issue.message,
      vscode.DiagnosticSeverity.Error
    ));
  }

  outline(document: vscode.TextDocument): vscode.SymbolInformation[] {
    return this.getSections(document).map((section) => new vscode.SymbolInformation(
      section.kind === 'cte' && section.name ? `CTE ${section.name}` : `SQL section ${section.index + 1}`,
      vscode.SymbolKind.Function,
      section.sql.replace(/\s+/g, ' ').slice(0, 80),
      new vscode.Location(document.uri, section.range)
    ));
  }

  extractAliases(sql: string): SqlAlias[] {
    return extractSqlAliases(sql);
  }

  extractTables(sql: string): Array<{ schema?: string; table: string }> {
    return this.extractAliases(sql).map(({ schema, table }) => ({ schema, table }));
  }

  private toSection(node: SqlQueryNode): SqlSection {
    return {
      ...node,
      aliases: this.extractAliases(node.sql),
      tables: this.extractTables(node.sql)
    };
  }
}
