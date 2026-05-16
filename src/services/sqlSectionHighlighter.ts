import * as vscode from 'vscode';

export interface PlainRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export class SqlSectionHighlighter implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    border: '1px solid',
    borderColor: new vscode.ThemeColor('focusBorder'),
    borderRadius: '3px',
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('focusBorder'),
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });
  private readonly activeRanges = new Map<string, vscode.Range>();

  async reveal(documentUri: string, range: PlainRange, expectedSql?: string): Promise<vscode.TextEditor | undefined> {
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
    } catch {
      void vscode.window.showWarningMessage('Source SQL file no longer exists.');
      return undefined;
    }

    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Active
    });
    const targetRange = this.resolveRange(document, range, expectedSql);
    this.activeRanges.set(document.uri.toString(), targetRange);
    editor.setDecorations(this.decoration, [targetRange]);
    editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return editor;
  }

  refreshVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const range = this.activeRanges.get(editor.document.uri.toString());
      editor.setDecorations(this.decoration, range ? [range] : []);
    }
  }

  clear(documentUri?: string): void {
    if (documentUri) {
      this.activeRanges.delete(documentUri);
    } else {
      this.activeRanges.clear();
    }
    this.refreshVisibleEditors();
  }

  dispose(): void {
    this.decoration.dispose();
  }

  private resolveRange(document: vscode.TextDocument, range: PlainRange, expectedSql?: string): vscode.Range {
    const direct = this.clampRange(document, range);
    const directText = document.getText(direct);
    if (!expectedSql || normalizeSql(directText) === normalizeSql(expectedSql)) {
      return direct;
    }

    const text = document.getText();
    const normalizedExpected = normalizeSql(expectedSql);
    const index = text.toLowerCase().indexOf(expectedSql.trim().toLowerCase());
    if (index >= 0) {
      return new vscode.Range(document.positionAt(index), document.positionAt(index + expectedSql.trim().length));
    }

    for (const line of text.split(/\r?\n/).entries()) {
      if (normalizeSql(line[1]).includes(normalizedExpected.slice(0, 48))) {
        const start = new vscode.Position(line[0], 0);
        return new vscode.Range(start, start.translate(0, line[1].length));
      }
    }

    void vscode.window.showWarningMessage('Source SQL range changed; showing the last known location.');
    return direct;
  }

  private clampRange(document: vscode.TextDocument, range: PlainRange): vscode.Range {
    const maxLine = Math.max(0, document.lineCount - 1);
    const startLine = Math.min(Math.max(0, range.startLine), maxLine);
    const endLine = Math.min(Math.max(startLine, range.endLine), maxLine);
    const startColumn = Math.min(Math.max(0, range.startColumn), document.lineAt(startLine).text.length);
    const endColumn = Math.min(Math.max(0, range.endColumn), document.lineAt(endLine).text.length);
    return new vscode.Range(
      new vscode.Position(startLine, startColumn),
      new vscode.Position(endLine, endColumn)
    );
  }
}

export function rangeFromPlain(range: PlainRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(range.startLine, range.startColumn),
    new vscode.Position(range.endLine, range.endColumn)
  );
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
