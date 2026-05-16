import {
  ColumnInfo,
  ConnectionConfigWithPassword,
  DbConnection,
  ExecuteQueryParams,
  ForeignKeyInfo,
  IndexInfo,
  KeyInfo,
  QueryExecutionResult,
  SchemaInfo,
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
  cancelQuery(executionId: string): Promise<void>;

  getSchemas(connectionId: string): Promise<SchemaInfo[]>;
  getTables(connectionId: string, schema: string): Promise<TableInfo[]>;
  getViews(connectionId: string, schema: string): Promise<ViewInfo[]>;
  getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]>;
  getIndexes(connectionId: string, schema: string, table: string): Promise<IndexInfo[]>;
  getPrimaryKeys(connectionId: string, schema: string, table: string): Promise<KeyInfo[]>;
  getForeignKeys(connectionId: string, schema: string, table: string): Promise<ForeignKeyInfo[]>;
  getTablePreview(connectionId: string, schema: string, table: string, limit: number): Promise<QueryExecutionResult>;
  getTableDDL(connectionId: string, schema: string, table: string): Promise<string>;
}
