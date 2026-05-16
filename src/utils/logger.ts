import * as vscode from 'vscode';

export class Logger {
  private readonly output = vscode.window.createOutputChannel('Database');

  info(message: string): void {
    this.output.appendLine(`[info] ${message}`);
  }

  error(message: string, error?: unknown): void {
    this.output.appendLine(`[error] ${message}`);
    if (error instanceof Error) {
      this.output.appendLine(error.stack ?? error.message);
    } else if (error !== undefined) {
      this.output.appendLine(String(error));
    }
  }

  show(): void {
    this.output.show();
  }
}
