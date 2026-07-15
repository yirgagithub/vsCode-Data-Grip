import {
  ColumnInfo,
  DatabaseObjectIdentity,
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
  RoutineInfo,
  TriggerInfo,
  ActiveSessionInfo,
  ViewInfo
} from '../../types';

export interface DatabaseDriver {
  id: 'postgres' | 'redshift' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle' | 'redis' | 'snowflake';
  displayName: string;

  testConnection(config: ConnectionConfigWithPassword): Promise<TestConnectionResult>;
  connect(config: ConnectionConfigWithPassword): Promise<DbConnection>;
  disconnect(connectionId: string): Promise<void>;
  beginTransaction(connectionId: string): Promise<void>;
  commitTransaction(connectionId: string): Promise<void>;
  rollbackTransaction(connectionId: string): Promise<void>;
  isTransactionOpen(connectionId: string): boolean;
  executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult>;
  executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]>;
  validateQuery(params: ExecuteQueryParams): Promise<QueryValidationResult>;
  explainQuery(params: ExecuteQueryParams, options?: ExplainQueryOptions): Promise<QueryPlanResult>;
  cancelQuery(executionId: string): Promise<void>;

  getSchemas(connectionId: string): Promise<SchemaInfo[]>;
  getTables(connectionId: string, schema: string): Promise<TableInfo[]>;
  getViews(connectionId: string, schema: string): Promise<ViewInfo[]>;
  getFunctions(connectionId: string, schema: string): Promise<RoutineInfo[]>;
  getProcedures(connectionId: string, schema: string): Promise<RoutineInfo[]>;
  getTriggers(connectionId: string, schema: string): Promise<TriggerInfo[]>;
  getActiveSessions(connectionId: string): Promise<ActiveSessionInfo[]>;
  cancelSession(connectionId: string, pid: number): Promise<void>;
  terminateSession(connectionId: string, pid: number): Promise<void>;
  getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]>;
  getIndexes(connectionId: string, schema: string, table: string): Promise<IndexInfo[]>;
  getPrimaryKeys(connectionId: string, schema: string, table: string): Promise<KeyInfo[]>;
  getForeignKeys(connectionId: string, schema: string, table: string): Promise<ForeignKeyInfo[]>;
  getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult>;
  getTableDDL(connectionId: string, schema: string, table: string): Promise<string>;
  getObjectDefinition(connectionId: string, object: DatabaseObjectIdentity): Promise<string | undefined>;
  getTableStats(connectionId: string, schema: string, table: string): Promise<TableStatsInfo>;
}
