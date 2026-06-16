import * as vscode from 'vscode';
import { ConnectionConfig, QueryExecutionProgress, QueryResultTab } from '../types';

const MAX_OUTPUT_LINES_PER_CONNECTION = 600;

export class QueryOutputService implements vscode.Disposable {
  private readonly channels = new Map<string, vscode.OutputChannel>();
  private readonly lineCounts = new Map<string, number>();

  record(connection: ConnectionConfig, tab: QueryResultTab): void {
    this.channelFor(connection);
    this.appendBlock(connection.id, formatQueryResultOutput(tab));
  }

  recordExecutionStarted(connection: ConnectionConfig, fileName: string | undefined, statementCount: number, startedAt = Date.now()): void {
    this.channelFor(connection);
    this.appendBlock(connection.id, formatQueryExecutionStartedOutput(fileName, statementCount, startedAt));
  }

  recordExecutionElapsed(connection: ConnectionConfig, startedAt: number, now = Date.now()): void {
    this.channelFor(connection);
    this.appendBlock(connection.id, [`${timestamp(now)} ${statusText('running')} for ${formatDuration(now - startedAt)}`]);
  }

  recordProgress(connection: ConnectionConfig, progress: QueryExecutionProgress): void {
    this.channelFor(connection);
    this.appendBlock(connection.id, formatQueryProgressOutput(progress));
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

  private appendBlock(connectionId: string, lines: string[]): void {
    this.ensureCapacity(connectionId, lines.length);
    for (const line of lines) {
      this.append(connectionId, line);
    }
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
    this.append(connectionId, `${timestamp(Date.now())} OUTPUT truncated to keep memory bounded`);
    this.append(connectionId, '');
  }
}

export function formatQueryExecutionStartedOutput(fileName: string | undefined, statementCount: number, startedAt = Date.now()): string[] {
  const lines = [
    '',
    `${timestamp(startedAt)} ${statusText('running')} ${statementCount} statement${statementCount === 1 ? '' : 's'}`
  ];
  if (fileName) {
    lines.push(`  file: ${fileName}`);
  }
  return lines;
}

export function formatQueryProgressOutput(progress: QueryExecutionProgress, now = Date.now()): string[] {
  const statement = `statement ${progress.statementIndex + 1}/${progress.statementCount}`;
  if (progress.status === 'started') {
    return [
      `${timestamp(now)} ${statusText('running')} ${statement} started`,
      '  sql:',
      ...progress.sql.trimEnd().split(/\r?\n/).map((line) => `    ${line}`)
    ];
  }

  const duration = progress.durationMs !== undefined ? formatDuration(progress.durationMs) : 'unknown duration';
  if (progress.status === 'completed') {
    const details = [
      `completed in ${duration}`,
      progress.rowCount !== undefined ? `${progress.rowCount} rows` : undefined,
      progress.command
    ].filter(Boolean).join(' | ');
    return [`${timestamp(now)} ${statusText('completed')} ${statement} ${details}`];
  }

  const lines = [`${timestamp(now)} ${statusText('failed')} ${statement} failed after ${duration}`];
  if (progress.errorMessage) {
    lines.push(`  error: ${progress.errorMessage}`);
  }
  return lines;
}

export function formatQueryResultOutput(tab: QueryResultTab): string[] {
  const duration = formatDuration(tab.executionTimeMs ?? 0);
  const status = statusText(tab.executionStatus);
  const lines = [
    `${timestamp(tab.executionFinishedAt ?? Date.now())} ${status} total ${duration} | ${tab.rowCount ?? 0} rows | ${tab.title}`
  ];
  if (tab.error) {
    lines.push(`  error: ${tab.error.code ? `${tab.error.code}: ` : ''}${tab.error.message}`);
  }
  lines.push('');
  return lines;
}

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0s';
  }
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function timestamp(value: number): string {
  return `[${new Date(value).toLocaleTimeString()}]`;
}

function statusText(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'COMPLETED';
    case 'failed':
      return 'FAILED';
    case 'cancelled':
      return 'CANCELLED';
    case 'running':
      return 'RUNNING';
    default:
      return status.toUpperCase();
  }
}
