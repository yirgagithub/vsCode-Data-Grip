import * as vscode from 'vscode';
import { computeGroupByQuickFix } from './sqlGroupByQuickFix';
import { SQL_GROUP_BY_DIAGNOSTIC_CODE, SQL_GROUP_BY_DIAGNOSTIC_SOURCE } from './sqlDiagnosticsService';

export class SqlGroupByCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    return context.diagnostics.flatMap(diagnostic => {
      const expression = groupByExpression(diagnostic);
      if (!expression) return [];
      const fix = computeGroupByQuickFix(document.getText(), {
        expression,
        position: document.offsetAt(diagnostic.range.start),
        confidence: 'high'
      });
      if (!fix) return [];

      const action = new vscode.CodeAction(`Add ${expression} to GROUP BY`, vscode.CodeActionKind.QuickFix);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(fix.start), document.positionAt(fix.end)), fix.newText);
      action.edit = edit;
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      return [action];
    });
  }
}

function groupByExpression(diagnostic: vscode.Diagnostic): string | undefined {
  if (diagnostic.source !== SQL_GROUP_BY_DIAGNOSTIC_SOURCE || typeof diagnostic.code !== 'string') return undefined;
  const prefix = `${SQL_GROUP_BY_DIAGNOSTIC_CODE}:`;
  if (!diagnostic.code.startsWith(prefix)) return undefined;
  try {
    return decodeURIComponent(diagnostic.code.slice(prefix.length)) || undefined;
  } catch {
    return undefined;
  }
}
