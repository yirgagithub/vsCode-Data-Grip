import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { splitSqlStatements } from './sqlSplitter';
import { ExecuteQueryParams, QueryError, QueryHistoryItem, QueryResultTab, ResultSet } from '../types';
import { QueryHistoryStore } from '../persistence/queryHistoryStore';
import { createId } from '../utils/id';
import { outputColumnNames, extractQualifiedColumns, extractQueryTables } from '../services/queryMemoryMetadata';
import { SqlSafetyClassifier } from '../services/sqlSafetyClassifier';
import { isReadOnlySql } from '../services/readOnlySql';

export interface QueryExecutionRecorder {
  recordHistoryItem(item: QueryHistoryItem): Promise<void>;
}

export class QueryExecutor {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly historyStore: QueryHistoryStore,
    private readonly recorder?: QueryExecutionRecorder,
    private readonly safety = new SqlSafetyClassifier()
  ) {}

  async execute(params: ExecuteQueryParams): Promise<QueryResultTab> {
    const config = this.connectionManager.getConnection(params.connectionId);
    if (!config) {
      throw new Error('Connection not found.');
    }

    const started = Date.now();
    const tabId = createId('tab');
    const resultSets: ResultSet[] = [];
    const transactionMode = this.connectionManager.getTransactionMode(params.connectionId);
    let effectiveTransactionMode: 'auto' | 'manual' = params.transactionMode ?? transactionMode;

    try {
      if (!this.connectionManager.isConnected(params.connectionId)) {
        await this.connectionManager.connect(params.connectionId);
      }

      if (config.readOnlyDefault && !isReadOnlySql(params.sql)) {
        throw new Error('This connection is read-only by default and only accepts SELECT-style queries.');
      }

      await this.confirmDestructiveIfNeeded(config.production === true, params.sql);

      if (effectiveTransactionMode === 'manual' && !this.connectionManager.isTransactionOpen(params.connectionId)) {
        await this.connectionManager.beginTransaction(params.connectionId);
      }

      const statements = splitSqlStatements(params.sql);
      const sqlParts = statements.length ? statements.map((statement) => statement.sql) : [params.sql];
      const results = await this.connectionManager.getDriver(config.type).executeStatements(params, sqlParts);
      for (const [index, result] of results.entries()) {
        const maxRows = params.maxRows && params.maxRows > 0 ? Math.floor(params.maxRows) : undefined;
        const rows = maxRows ? result.rows.slice(0, maxRows) : result.rows;
        resultSets.push({
          id: result.executionId,
          title: sqlParts.length > 1 ? `Result ${index + 1}` : this.resultTitle(sqlParts[index] ?? params.sql, params.source?.fileName),
          fields: result.fields,
          rows,
          rowCount: rows.length,
          maxRows,
          hasMore: maxRows ? result.rowCount > rows.length : false,
          command: result.command,
          durationMs: result.durationMs
        });
      }

      const durationMs = Date.now() - started;
      const historyItem: QueryHistoryItem = {
        id: createId('history'),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        status: 'completed',
        outputColumns: outputColumnNames(resultSets[0]?.fields),
        tables: extractQueryTables(params.sql),
        columns: extractQualifiedColumns(params.sql)
      };
      await this.recordHistory(params, historyItem);

      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: 'completed',
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        maxRows: params.maxRows,
        rowOffset: params.offset && params.offset > 0 ? Math.floor(params.offset) : 0,
        resultSets,
        transaction: {
          mode: effectiveTransactionMode,
          open: this.connectionManager.isTransactionOpen(config.id)
        },
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    } catch (error) {
      const queryError = this.toQueryError(error);
      const cancelled = params.isCancellationRequested?.() === true || isCancellationError(error);
      const historyItem: QueryHistoryItem = {
        id: createId('history'),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs: Date.now() - started,
        status: cancelled ? 'cancelled' : 'failed',
        errorMessage: cancelled ? undefined : queryError.message,
        tables: extractQueryTables(params.sql),
        columns: extractQualifiedColumns(params.sql)
      };
      await this.recordHistory(params, historyItem);

      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceOrigin: params.source?.origin,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: cancelled ? 'cancelled' : 'failed',
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: Date.now() - started,
        maxRows: params.maxRows,
        rowOffset: params.offset && params.offset > 0 ? Math.floor(params.offset) : 0,
        error: cancelled ? undefined : queryError,
        resultSets: [],
        transaction: {
          mode: effectiveTransactionMode,
          open: this.connectionManager.isTransactionOpen(config.id)
        },
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    }
  }

  async cancel(connectionId: string, executionId: string): Promise<void> {
    const driver = this.connectionManager.getDriverByConnectionId(connectionId);
    await driver.cancelQuery(executionId);
  }

  private resultTitle(sql: string, fileName?: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? 'SQL';
    if (from) {
      return `${keyword} ${from.replace(/"/g, '')}`;
    }
    if (normalized) {
      return keyword;
    }
    return fileName?.split(/[\\/]/).pop() ?? 'SQL';
  }

  private async recordHistory(params: ExecuteQueryParams, item: QueryHistoryItem): Promise<void> {
    if (params.source?.origin !== 'queryConsole') {
      return;
    }
    await this.historyStore.add(item);
    await this.recorder?.recordHistoryItem(item);
  }

  private async confirmDestructiveIfNeeded(isProduction: boolean, sql: string): Promise<void> {
    const confirm = vscode.workspace.getConfiguration('database').get<boolean>('safety.confirmDestructiveQueries', true);
    const warnAll = vscode.workspace.getConfiguration('database').get<boolean>('safety.confirmDestructiveQueriesOnAllConnections', false);
    if (!confirm || (!isProduction && !warnAll)) {
      return;
    }
    const assessment = this.safety.classify(sql, { production: isProduction });
    if (!assessment.requiresConfirmation) {
      return;
    }
    const target = isProduction ? 'production connection' : 'connection';
    const detail = assessment.reasons.length ? ` ${assessment.reasons.join(' ')}` : '';
    const answer = await vscode.window.showWarningMessage(`This looks risky on a ${target}.${detail}`, { modal: true }, 'Run Anyway');
    if (answer !== 'Run Anyway') {
      throw new Error('Query cancelled by safety confirmation.');
    }
  }

  private toQueryError(error: unknown): QueryError {
    const pgError = error as Partial<QueryError> & { message?: string };
    return {
      message: pgError.message ?? String(error),
      code: pgError.code,
      detail: pgError.detail,
      hint: pgError.hint,
      position: pgError.position,
      where: pgError.where
    };
  }
}

function isCancellationError(error: unknown): boolean {
  const record = error as { code?: unknown; errno?: unknown; message?: unknown };
  const code = typeof record?.code === 'string' ? record.code : undefined;
  const errno = typeof record?.errno === 'number' ? record.errno : undefined;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(record?.message ?? '');
  if (/statement timeout/i.test(message)) {
    return false;
  }
  return (code === '57014' && /\b(user request|canceling statement)\b/i.test(message)) ||
    code === 'ER_QUERY_INTERRUPTED' ||
    errno === 1317 ||
    /\b(cancelled|canceled|canceling statement|cancelled by safety confirmation|query execution was interrupted|query interrupted)\b/i.test(message);
}
