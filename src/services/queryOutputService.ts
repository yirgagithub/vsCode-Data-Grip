import * as vscode from 'vscode';
import { ConnectionConfig, QueryResultTab } from '../types';

const MAX_OUTPUT_LINES_PER_CONNECTION = 600;

export class QueryOutputService implements vscode.Disposable {
  private readonly channels = new Map<string, vscode.OutputChannel>();
  private readonly lineCounts = new Map<string, number>();

  record(connection: ConnectionConfig, tab: QueryResultTab): void {
    this.channelFor(connection);
    this.ensureCapacity(connection.id, 4 + (tab.error ? 2 : 0));
    this.append(connection.id, `[${new Date(tab.executionStartedAt).toLocaleTimeString()}] ${tab.executionStatus.toUpperCase()} ${tab.executionTimeMs ?? 0}ms ${tab.rowCount ?? 0} rows - ${tab.title}`);
    this.append(connection.id, this.compactSql(tab.queryText));
    if (tab.error) {
      this.append(connection.id, `ERROR ${tab.error.code ? `${tab.error.code}: ` : ''}${tab.error.message}`);
    }
    this.append(connection.id, '');
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

  private compactSql(sql: string): string {
    const compact = sql.replace(/\s+/g, ' ').trim();
    return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
  }
}
