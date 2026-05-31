import * as vscode from 'vscode';
import { ConnectionManager } from '../database/connectionManager';
import { QueryConsoleStore } from '../persistence/queryConsoleStore';
import { QueryHistoryStore } from '../persistence/queryHistoryStore';
import { QueryMemoryStore } from '../persistence/queryMemoryStore';
import {
  QueryHistoryItem,
  QueryMemoryItem,
  QueryMemorySearchRequest,
  QueryMemorySearchResult,
  QueryMemorySummary,
  QueryMemorySummaryRequest
} from '../types';
import { QueryMemorySearch } from './queryMemorySearch';
import { extractQualifiedColumns, extractQueryTables } from './queryMemoryMetadata';
import { isQueryConsoleHistoryItem, isQueryConsoleMemoryItem, queryConsoleDocumentUris } from './queryConsoleHistory';

export interface QueryMemorySummarizer {
  summarizeQueryMemory(request: QueryMemorySummaryRequest): Promise<QueryMemorySummary>;
}

export interface QueryMemoryBackfillResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export class QueryMemoryService {
  private readonly searcher = new QueryMemorySearch();

  constructor(
    private readonly historyStore: QueryHistoryStore,
    private readonly memoryStore: QueryMemoryStore,
    private readonly consoleStore: QueryConsoleStore,
    private readonly connectionManager: ConnectionManager,
    private readonly summarizer?: QueryMemorySummarizer
  ) {}

  getAll(): QueryMemoryItem[] {
    return this.memoryStore.getAll();
  }

  async recordHistoryItem(item: QueryHistoryItem): Promise<void> {
    const id = this.historyMemoryId(item);
    const existing = this.memoryStore.get(id);
    if (existing?.historyIds?.includes(item.id)) {
      return;
    }
    await this.memoryStore.upsert(this.fromHistory(item, existing));
    const legacyId = this.legacyHistoryMemoryId(item);
    if (legacyId !== id) {
      await this.memoryStore.delete(legacyId);
    }
  }

  async search(request: QueryMemorySearchRequest): Promise<QueryMemorySearchResult[]> {
    await this.syncFromHistory();
    await this.syncKnownDocuments();
    return this.searcher.search(this.queryConsoleMemoryItems(), request);
  }

  async backfillSummaries(options: { limit?: number; token?: vscode.CancellationToken } = {}): Promise<QueryMemoryBackfillResult> {
    const limit = options.limit && options.limit > 0 ? options.limit : 25;
    const result: QueryMemoryBackfillResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    if (!this.summarizer) {
      return { ...result, skipped: limit };
    }

    const candidates = this.memoryStore.getAll()
      .filter((item) => item.summaryStatus !== 'ready')
      .slice(0, limit);

    for (const item of candidates) {
      if (options.token?.isCancellationRequested) {
        break;
      }
      result.processed += 1;
      if (!item.sql.trim()) {
        result.skipped += 1;
        await this.memoryStore.update(item.id, { summaryStatus: 'skipped', summaryError: 'Empty SQL.' });
        continue;
      }
      try {
        await this.memoryStore.update(item.id, { summaryStatus: 'pending', summaryError: undefined });
        const summary = await this.summarizer.summarizeQueryMemory({
          sql: item.sql,
          connectionName: item.connectionName,
          databaseName: item.databaseName,
          databaseType: item.databaseType,
          outputColumns: item.outputColumns,
          errorMessage: item.errorMessage
        });
        await this.memoryStore.update(item.id, {
          title: summary.title,
          summary: summary.summary,
          tables: summary.tables.length ? summary.tables : item.tables,
          columns: summary.columns.length ? summary.columns : item.columns,
          summaryStatus: 'ready',
          summaryError: undefined
        });
        result.succeeded += 1;
      } catch (error) {
        await this.memoryStore.update(item.id, {
          summaryStatus: 'failed',
          summaryError: error instanceof Error ? error.message : String(error)
        });
        result.failed += 1;
      }
    }

    return result;
  }

  private async syncFromHistory(): Promise<void> {
    for (const item of this.queryConsoleHistoryItems()) {
      await this.recordHistoryItem(item);
    }
  }

  private async syncKnownDocuments(): Promise<void> {
    const documentUris = new Set<string>();
    for (const record of this.consoleStore.getAll()) {
      documentUris.add(record.documentUri);
    }

    for (const documentUri of documentUris) {
      await this.indexDocument(documentUri);
    }
  }

  private async indexDocument(documentUri: string): Promise<void> {
    let sql = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(documentUri));
      sql = Buffer.from(bytes).toString('utf8');
    } catch {
      return;
    }
    if (!sql.trim()) {
      return;
    }
    const id = this.documentMemoryId(documentUri);
    const existing = this.memoryStore.get(id);
    const now = Date.now();
    await this.memoryStore.upsert({
      id,
      sourceKind: 'document',
      sourceId: documentUri,
      sql,
      title: existing?.title,
      summary: existing?.summary,
      summaryStatus: existing?.summaryStatus ?? 'pending',
      summaryError: existing?.summaryError,
      tables: extractQueryTables(sql),
      columns: extractQualifiedColumns(sql),
      outputColumns: [],
      documentUri,
      sourceFile: this.fsPath(documentUri),
      indexedAt: existing?.indexedAt ?? now,
      updatedAt: now
    });
  }

  private fromHistory(item: QueryHistoryItem, existing?: QueryMemoryItem): QueryMemoryItem {
    const connection = this.connectionManager.getConnection(item.connectionId);
    const now = Date.now();
    const lastExecutedAt = Math.max(existing?.lastExecutedAt ?? existing?.executedAt ?? 0, item.executedAt);
    const isLatest = item.executedAt >= (existing?.lastExecutedAt ?? existing?.executedAt ?? 0);
    return {
      id: this.historyMemoryId(item),
      sourceKind: 'history',
      sourceId: this.historyFingerprint(item),
      connectionId: item.connectionId,
      databaseType: item.databaseType,
      databaseName: connection?.database,
      connectionName: connection?.name,
      sql: item.sql,
      title: existing?.title ?? item.memoryTitle,
      summary: existing?.summary ?? item.memorySummary,
      summaryStatus: existing?.summaryStatus ?? item.memorySummaryStatus ?? 'pending',
      summaryError: existing?.summaryError ?? item.memorySummaryError,
      tables: this.mergeStrings(existing?.tables, item.tables?.length ? item.tables : extractQueryTables(item.sql)),
      columns: this.mergeStrings(existing?.columns, item.columns?.length ? item.columns : extractQualifiedColumns(item.sql)),
      outputColumns: this.mergeStrings(existing?.outputColumns, item.outputColumns ?? []),
      sourceFile: isLatest ? item.sourceFile : existing?.sourceFile,
      documentUri: isLatest ? item.documentUri : existing?.documentUri,
      sourceRange: isLatest ? item.sourceRange : existing?.sourceRange,
      favorite: existing?.favorite || item.favorite,
      status: isLatest ? item.status : existing?.status,
      errorMessage: isLatest ? item.errorMessage : existing?.errorMessage,
      rowCount: isLatest ? item.rowCount : existing?.rowCount,
      durationMs: isLatest ? item.durationMs : existing?.durationMs,
      executedAt: lastExecutedAt,
      firstExecutedAt: Math.min(existing?.firstExecutedAt ?? existing?.executedAt ?? item.executedAt, item.executedAt),
      lastExecutedAt,
      runCount: (existing?.runCount ?? existing?.historyIds?.length ?? 0) + 1,
      historyIds: [...(existing?.historyIds ?? []), item.id],
      latestHistoryId: isLatest ? item.id : existing?.latestHistoryId,
      indexedAt: existing?.indexedAt ?? now,
      updatedAt: now
    };
  }

  private queryConsoleHistoryItems(): QueryHistoryItem[] {
    const consoleUris = queryConsoleDocumentUris(this.consoleStore.getAll());
    return this.historyStore.getAll().filter((item) => isQueryConsoleHistoryItem(item, consoleUris));
  }

  private queryConsoleMemoryItems(): QueryMemoryItem[] {
    const consoleUris = queryConsoleDocumentUris(this.consoleStore.getAll());
    return this.memoryStore.getAll().filter((item) => isQueryConsoleMemoryItem(item, consoleUris));
  }

  private historyMemoryId(item: QueryHistoryItem): string {
    return `memory_${this.hash(this.historyFingerprint(item))}`;
  }

  private legacyHistoryMemoryId(item: QueryHistoryItem): string {
    return `memory_${item.id}`;
  }

  private historyFingerprint(item: QueryHistoryItem): string {
    return `${item.connectionId}:${this.normalizeSql(item.sql)}`;
  }

  private normalizeSql(sql: string): string {
    return sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/;+$/g, '')
      .toLowerCase();
  }

  private mergeStrings(first: string[] = [], second: string[] = []): string[] {
    return [...new Set([...first, ...second].filter(Boolean))];
  }

  private documentMemoryId(documentUri: string): string {
    return `memory_doc_${this.hash(documentUri)}`;
  }

  private hash(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  private fsPath(documentUri: string): string | undefined {
    try {
      return vscode.Uri.parse(documentUri).fsPath;
    } catch {
      return undefined;
    }
  }
}

export class NoopQueryMemoryService {
  async recordHistoryItem(_item: QueryHistoryItem): Promise<void> {}
}
