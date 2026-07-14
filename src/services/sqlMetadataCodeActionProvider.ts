import * as vscode from 'vscode';
import {
  SQL_METADATA_DIAGNOSTIC_SOURCE,
  SQL_METADATA_MISSING_COLUMN,
  SQL_METADATA_MISSING_RELATION
} from './sqlDiagnosticsService';

export const SQL_METADATA_REFRESH_COMMAND = 'database.refreshSqlMetadata';
export const SQL_METADATA_REFRESH_TITLE = 'Refresh database metadata';

export class SqlMetadataCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    return context.diagnostics.flatMap((diagnostic) => {
      const schemaName = metadataSchemaFromDiagnostic(diagnostic);
      if (!schemaName) {
        return [];
      }

      const action = new vscode.CodeAction(SQL_METADATA_REFRESH_TITLE, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      action.command = {
        command: SQL_METADATA_REFRESH_COMMAND,
        title: SQL_METADATA_REFRESH_TITLE,
        arguments: [document.uri, schemaName]
      };
      return [action];
    });
  }
}

function metadataSchemaFromDiagnostic(diagnostic: vscode.Diagnostic): string | undefined {
  const code = diagnostic.code;
  if (diagnostic.source !== SQL_METADATA_DIAGNOSTIC_SOURCE || typeof code !== 'string') {
    return undefined;
  }
  const prefixes = [`${SQL_METADATA_MISSING_RELATION}:`, `${SQL_METADATA_MISSING_COLUMN}:`];
  const prefix = prefixes.find((candidate) => code.startsWith(candidate));
  if (!prefix) {
    return undefined;
  }
  return code.slice(prefix.length) || undefined;
}
