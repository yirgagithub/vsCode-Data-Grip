import {
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExplainQueryOptions,
  ExecuteQueryParams,
  ForeignKeyInfo,
  IndexInfo,
  KeyInfo,
  QueryPlanResult,
  QueryExecutionResult,
  TablePreviewOptions,
  QueryValidationResult,
  SchemaInfo,
  TableStatsInfo,
  TableInfo,
  TestConnectionResult,
  ViewInfo
} from '../../types';

export interface DatabaseDriver {
  id: 'postgres' | 'redshift';
  displayName: string;

  testConnection(config: ConnectionConfigWithPassword): Promise<TestConnectionResult>;
  connect(config: ConnectionConfigWithPassword): Promise<DbConnection>;
  disconnect(connectionId: string): Promise<void>;
  executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult>;
  executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]>;
  validateQuery(params: ExecuteQueryParams): Promise<QueryValidationResult>;
  explainQuery(params: ExecuteQueryParams, options?: ExplainQueryOptions): Promise<QueryPlanResult>;
  cancelQuery(executionId: string): Promise<void>;

  getSchemas(connectionId: string): Promise<SchemaInfo[]>;
  getTables(connectionId: string, schema: string): Promise<TableInfo[]>;
  getViews(connectionId: string, schema: string): Promise<ViewInfo[]>;
  getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]>;
  getIndexes(connectionId: string, schema: string, table: string): Promise<IndexInfo[]>;
  getPrimaryKeys(connectionId: string, schema: string, table: string): Promise<KeyInfo[]>;
  getForeignKeys(connectionId: string, schema: string, table: string): Promise<ForeignKeyInfo[]>;
  getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult>;
  getTableDDL(connectionId: string, schema: string, table: string): Promise<string>;
  getTableStats(connectionId: string, schema: string, table: string): Promise<TableStatsInfo>;
}
