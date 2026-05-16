import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { splitSqlStatements } from './sqlSplitter';
import { ExecuteQueryParams, QueryError, QueryResultTab, ResultSet } from '../types';
import { QueryHistoryStore } from '../persistence/queryHistoryStore';
import { createId } from '../utils/id';

export class QueryExecutor {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly historyStore: QueryHistoryStore
  ) {}

  async execute(params: ExecuteQueryParams): Promise<QueryResultTab> {
    const config = this.connectionManager.getConnection(params.connectionId);
    if (!config) {
      throw new Error('Connection not found.');
    }

    if (!this.connectionManager.isConnected(params.connectionId)) {
      await this.connectionManager.connect(params.connectionId);
    }

    await this.confirmDestructiveIfNeeded(config.production === true, params.sql);

    const started = Date.now();
    const tabId = createId('tab');
    const statements = splitSqlStatements(params.sql);
    const sqlParts = statements.length ? statements.map((statement) => statement.sql) : [params.sql];
    const resultSets: ResultSet[] = [];

    try {
      for (const [index, sql] of sqlParts.entries()) {
        const result = await this.connectionManager.getDriver(config.type).executeQuery({ ...params, sql });
        resultSets.push({
          id: result.executionId,
          title: sqlParts.length > 1 ? `Result ${index + 1}` : this.resultTitle(params.sql, params.source?.fileName),
          fields: result.fields,
          rows: result.rows,
          rowCount: result.rowCount,
          maxRows: params.maxRows,
          command: result.command,
          durationMs: result.durationMs
        });
      }

      const durationMs = Date.now() - started;
      await this.historyStore.add({
        id: createId('history'),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs,
        rowCount: resultSets.reduce((total, set) => total + set.rowCount, 0),
        status: 'completed'
      });

      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
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
        resultSets,
        activeResultSetIndex: 0,
        filters: [],
        sort: [],
        columnState: [],
        createdAt: started,
        updatedAt: Date.now()
      };
    } catch (error) {
      const queryError = this.toQueryError(error);
      await this.historyStore.add({
        id: createId('history'),
        connectionId: config.id,
        databaseType: config.type,
        sql: params.sql,
        sourceFile: params.source?.fileName,
        documentUri: params.source?.documentUri,
        schemaName: config.defaultSchema,
        sourceRange: params.source?.range,
        favorite: false,
        executedAt: started,
        durationMs: Date.now() - started,
        status: 'failed',
        errorMessage: queryError.message
      });

      return {
        id: tabId,
        title: this.resultTitle(params.sql, params.source?.fileName),
        pinned: false,
        connectionId: config.id,
        databaseType: config.type,
        databaseName: config.database,
        schemaName: config.defaultSchema,
        queryText: params.sql,
        sourceFile: params.source?.fileName,
        sourceDocumentUri: params.source?.documentUri,
        sourceQueryId: params.source?.queryId,
        sourceSectionIndex: params.source?.sectionIndex,
        sourceRange: params.source?.range,
        executionStatus: 'failed',
        executionStartedAt: started,
        executionFinishedAt: Date.now(),
        executionTimeMs: Date.now() - started,
        maxRows: params.maxRows,
        error: queryError,
        resultSets: [],
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
    if (fileName) {
      return fileName.split(/[\\/]/).pop() ?? fileName;
    }
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const from = normalized.match(/\bfrom\s+("?[\w.]+"?)/i)?.[1];
    const keyword = normalized.match(/^\w+/)?.[0]?.toUpperCase() ?? 'SQL';
    return from ? `${keyword} ${from.replace(/"/g, '')}` : keyword;
  }

  private async confirmDestructiveIfNeeded(isProduction: boolean, sql: string): Promise<void> {
    const confirm = vscode.workspace.getConfiguration('database').get<boolean>('safety.confirmDestructiveQueries', true);
    const warnAll = vscode.workspace.getConfiguration('database').get<boolean>('safety.confirmDestructiveQueriesOnAllConnections', false);
    if (!confirm || (!isProduction && !warnAll)) {
      return;
    }
    const dangerous = /\b(drop|truncate|alter)\b/i.test(sql)
      || /\bdelete\s+from\b(?![\s\S]*\bwhere\b)/i.test(sql)
      || /\bupdate\b(?![\s\S]*\bwhere\b)/i.test(sql);
    if (!dangerous) {
      return;
    }
    const target = isProduction ? 'production connection' : 'connection';
    const answer = await vscode.window.showWarningMessage(`This looks destructive on a ${target}.`, { modal: true }, 'Run Anyway');
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
