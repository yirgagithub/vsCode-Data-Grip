export type DatabaseType = 'postgres' | 'redshift';

export type ConnectionColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: 'disable' | 'prefer' | 'require';
  color: ConnectionColor;
  defaultSchema?: string;
  connectTimeoutMs?: number;
  queryTimeoutMs?: number;
  production?: boolean;
  readOnlyDefault?: boolean;
}

export interface ConnectionConfigWithPassword extends ConnectionConfig {
  password?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  serverVersion?: string;
}

export interface DbConnection {
  id: string;
  config: ConnectionConfig;
  connectedAt: number;
}

export interface QueryField {
  name: string;
  dataTypeId?: number;
  dataTypeName?: string;
}

export interface ExecuteQueryParams {
  connectionId: string;
  sql: string;
  source?: {
    fileName?: string;
    documentUri?: string;
    queryId?: string;
    sectionIndex?: number;
    range?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  };
  maxRows?: number;
}

export interface QueryExecutionResult {
  executionId: string;
  fields: QueryField[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command?: string;
  durationMs: number;
  notices?: string[];
  messages?: string[];
}

export interface QueryError {
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  where?: string;
}

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: 'table' | 'materialized_view';
  rowEstimate?: number;
  comment?: string;
}

export interface ViewInfo {
  schema: string;
  name: string;
  type: 'view' | 'materialized_view';
}

export interface ColumnInfo {
  schema: string;
  table: string;
  name: string;
  ordinal: number;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  encoding?: string;
  sortKey?: number;
  distKey?: boolean;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  definition?: string;
}

export interface KeyInfo {
  name: string;
  columns: string[];
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  foreignSchema: string;
  foreignTable: string;
  foreignColumns: string[];
}

export interface ResultSet {
  id: string;
  title: string;
  fields: QueryField[];
  rows: Record<string, unknown>[];
  rowCount: number;
  maxRows?: number;
  command?: string;
  durationMs: number;
}

export interface GridFilter {
  column: string;
  operator: string;
  value?: string;
  secondValue?: string;
}

export type GridFilterState = GridFilter[];

export interface SortSpec {
  column: string;
  direction: 'asc' | 'desc';
}

export interface ColumnState {
  column: string;
  width?: number;
  hidden?: boolean;
}

export interface ScrollState {
  top: number;
  left: number;
}

export interface QueryResultTab {
  id: string;
  title: string;
  customTitle?: string;
  pinned: boolean;
  connectionId: string;
  databaseType: DatabaseType;
  databaseName?: string;
  schemaName?: string;
  queryText: string;
  sourceFile?: string;
  sourceDocumentUri?: string;
  sourceQueryId?: string;
  sourceSectionIndex?: number;
  sourceRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  executionStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  executionStartedAt: number;
  executionFinishedAt?: number;
  executionTimeMs?: number;
  rowCount?: number;
  maxRows?: number;
  error?: QueryError;
  resultSets: ResultSet[];
  activeResultSetIndex: number;
  filters: GridFilterState;
  sort: SortSpec[];
  columnState: ColumnState[];
  scrollState?: ScrollState;
  createdAt: number;
  updatedAt: number;
}

export interface QueryHistoryItem {
  id: string;
  connectionId: string;
  databaseType: DatabaseType;
  sql: string;
  sourceFile?: string;
  documentUri?: string;
  schemaName?: string;
  sourceRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  favorite?: boolean;
  executedAt: number;
  durationMs?: number;
  rowCount?: number;
  status: 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
}

export interface QueryConsoleRecord {
  id: string;
  connectionId: string;
  documentUri: string;
  schemaName?: string;
  lastExecutedRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  createdAt: number;
  updatedAt: number;
}

export type SchemaCacheStatus = 'empty' | 'loading' | 'ready' | 'stale' | 'error';

export interface SchemaCacheEntry {
  connectionId: string;
  schemaName: string;
  schemas: SchemaInfo[];
  tables: TableInfo[];
  views: ViewInfo[];
  columns: Record<string, ColumnInfo[]>;
  indexes: Record<string, IndexInfo[]>;
  keys: Record<string, KeyInfo[]>;
  loadedAt?: number;
  status: SchemaCacheStatus;
  errorMessage?: string;
}

export interface AiSqlRequest {
  action: 'explain' | 'fix' | 'generate';
  selectedSql?: string;
  relevantSchema: {
    connectionName?: string;
    databaseType?: DatabaseType;
    databaseName?: string;
    defaultSchema?: string;
    tables: Array<{
      schema: string;
      name: string;
      type: string;
      columns?: Array<{ name: string; dataType: string; nullable: boolean }>;
    }>;
  };
  lastError?: string;
}
