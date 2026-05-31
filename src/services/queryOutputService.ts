import * as vscode from 'vscode';
import { ConnectionConfig, QueryExecutionProgress, QueryResultTab } from '../types';

const MAX_OUTPUT_LINES_PER_CONNECTION = 600;

export class QueryOutputService implements vscode.Disposable {
  private readonly channels = new Map<string, vscode.OutputChannel>();
  private readonly lineCounts = new Map<string, number>();

  record(connection: ConnectionConfig, tab: QueryResultTab): void {
    this.channelFor(connection);
    this.ensureCapacity(connection.id, 3 + (tab.error ? 2 : 0));
    this.append(connection.id, `[${new Date(tab.executionStartedAt).toLocaleTimeString()}] ${tab.executionStatus.toUpperCase()} ${tab.executionTimeMs ?? 0}ms ${tab.rowCount ?? 0} rows - ${tab.title}`);
    if (tab.error) {
      this.append(connection.id, `ERROR ${tab.error.code ? `${tab.error.code}: ` : ''}${tab.error.message}`);
    }
    this.append(connection.id, '');
  }

  recordExecutionStarted(connection: ConnectionConfig, fileName: string | undefined, statementCount: number): void {
    this.channelFor(connection);
    this.ensureCapacity(connection.id, 4);
    this.append(connection.id, `[${new Date().toLocaleTimeString()}] RUNNING ${statementCount} statement${statementCount === 1 ? '' : 's'}${fileName ? ` - ${fileName}` : ''}`);
  }

  recordProgress(connection: ConnectionConfig, progress: QueryExecutionProgress): void {
    this.channelFor(connection);
    if (progress.status === 'started') {
      this.ensureCapacity(connection.id, this.lineCount(progress.sql) + 4);
      this.append(connection.id, `[${new Date().toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} running`);
      this.appendMultiline(connection.id, progress.sql);
      return;
    }

    this.ensureCapacity(connection.id, 3 + (progress.errorMessage ? 1 : 0));
    const duration = progress.durationMs !== undefined ? `${progress.durationMs}ms` : 'unknown duration';
    if (progress.status === 'completed') {
      const rows = progress.rowCount !== undefined ? ` - ${progress.rowCount} rows` : '';
      const command = progress.command ? ` - ${progress.command}` : '';
      this.append(connection.id, `[${new Date().toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} completed in ${duration}${rows}${command}`);
    } else {
      this.append(connection.id, `[${new Date().toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} failed in ${duration}`);
      if (progress.errorMessage) {
        this.append(connection.id, `ERROR ${progress.errorMessage}`);
      }
    }
  }

  show(connection: ConnectionConfig, preserveFocus = true): void {
    this.channelFor(connection).show(preserveFocus);
  }

  disposeConnection(connectionId: string): void {
    this.channels.get(connectionId)?.dispose();
    this.channels.delete(connectionId);
    this.lineCounts.delete(connectionId);
  }

  dispose(): void {
    for (const channel of this.channels.values()) {
      channel.dispose();
    }
    this.channels.clear();
    this.lineCounts.clear();
  }

  private channelFor(connection: ConnectionConfig): vscode.OutputChannel {
    const existing = this.channels.get(connection.id);
    if (existing) {
      return existing;
    }
    const channel = vscode.window.createOutputChannel(`Database: ${connection.name}`);
    this.channels.set(connection.id, channel);
    this.lineCounts.set(connection.id, 0);
    return channel;
  }

  private append(connectionId: string, line: string): void {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return;
    }
    channel.appendLine(line);
    this.lineCounts.set(connectionId, (this.lineCounts.get(connectionId) ?? 0) + 1);
  }

  private appendMultiline(connectionId: string, text: string): void {
    for (const line of text.split(/\r?\n/)) {
      this.append(connectionId, `  ${line}`);
    }
  }

  private ensureCapacity(connectionId: string, incomingLines: number): void {
    const channel = this.channels.get(connectionId);
    if (!channel) {
      return;
    }
    const nextLineCount = (this.lineCounts.get(connectionId) ?? 0) + incomingLines;
    if (nextLineCount <= MAX_OUTPUT_LINES_PER_CONNECTION) {
      return;
    }
    channel.clear();
    this.lineCounts.set(connectionId, 0);
    this.append(connectionId, `[${new Date().toLocaleTimeString()}] Output truncated to keep memory bounded.`);
    this.append(connectionId, '');
  }

  private lineCount(text: string): number {
    return text.split(/\r?\n/).length;
  }
}
