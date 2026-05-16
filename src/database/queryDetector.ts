import * as vscode from 'vscode';
import { splitSqlStatements } from './sqlSplitter';

export interface DetectedQuery {
  sql: string;
  range: vscode.Range;
}

export function detectQuery(document: vscode.TextDocument, selection: vscode.Selection): DetectedQuery | undefined {
  if (!selection.isEmpty) {
    return {
      sql: document.getText(selection),
      range: selection
    };
  }

  const text = document.getText();
  const offset = document.offsetAt(selection.active);
  const statements = splitSqlStatements(text);
  const statement = statements.find((item) => offset >= item.start && offset <= item.end) ?? statements[0];
  if (!statement) {
    return undefined;
  }

  return {
    sql: statement.sql,
    range: new vscode.Range(document.positionAt(statement.start), document.positionAt(statement.end))
  };
}
