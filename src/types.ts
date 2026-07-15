export type DatabaseType = 'postgres' | 'redshift' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle' | 'redis' | 'snowflake';

export type ConnectionColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export type QueryExecutionOrigin = 'queryConsole' | 'sqlFile';

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
  sshTunnel?: SshTunnelConfig;
}

export interface SshTunnelConfig {
  enabled: boolean;
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  localHost?: string;
  localPort?: number;
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
  transactionMode?: 'auto' | 'manual';
  offset?: number;
  isCancellationRequested?: () => boolean;
  onProgress?: (progress: QueryExecutionProgress) => void;
  source?: {
    origin?: QueryExecutionOrigin;
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

export interface ExplainQueryOptions {
  analyze?: boolean;
}

export type QueryExecutionProgressStatus = 'started' | 'completed' | 'failed';

export interface QueryExecutionProgress {
  statementIndex: number;
  statementCount: number;
  sql: string;
  status: QueryExecutionProgressStatus;
  executionId?: string;
  startedAt?: number;
  durationMs?: number;
  rowCount?: number;
  command?: string;
  errorMessage?: string;
}

export interface QueryExecutionResult {
  executionId: string;
  fields: QueryField[];
  rows: Record<string, unknown>[];
  rowCount: number;
  hasMore?: boolean;
  command?: string;
  durationMs: number;
  notices?: string[];
  messages?: string[];
}

export interface TablePreviewOptions {
  where?: string;
  offset?: number;
  orderBySql?: string;
  orderBy?: Array<{
    column: string;
    direction: 'asc' | 'desc';
  }>;
}

export interface QueryError {
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  where?: string;
}

export interface QueryValidationResult {
  ok: boolean;
  error?: QueryError;
}

export interface QueryPlanNode {
  id: string;
  nodeType: string;
  relationName?: string;
  alias?: string;
  indexName?: string;
  joinType?: string;
  startupCost?: number;
  totalCost?: number;
  planRows?: number;
  planWidth?: number;
  actualStartupTime?: number;
  actualTotalTime?: number;
  actualRows?: number;
  actualLoops?: number;
  filter?: string;
  indexCond?: string;
  joinFilter?: string;
  hashCond?: string;
  mergeCond?: string;
  sortKey?: string[];
  groupKey?: string[];
  raw?: Record<string, unknown>;
  children: QueryPlanNode[];
}

export interface QueryPlanAnnotation {
  nodeId?: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion?: string;
}

export interface QueryPlanResult {
  format: 'json' | 'text';
  analyze: boolean;
  root?: QueryPlanNode;
  rawPlan?: unknown;
  rawText?: string;
  planningTimeMs?: number;
  executionTimeMs?: number;
  annotations: QueryPlanAnnotation[];
  aiFindings?: string[];
  rewrittenSql?: string;
  aiError?: string;
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

export interface RoutineInfo {
  schema: string;
  name: string;
  kind: 'function' | 'procedure';
  returnType?: string;
  language?: string;
  comment?: string;
  signature?: string;
  arguments?: string[];
}

export interface TriggerInfo {
  schema: string;
  table: string;
  name: string;
  timing?: string;
  events?: string[];
  orientation?: string;
  enabled?: string;
}

export type DatabaseObjectKind = 'table' | 'view' | 'function' | 'procedure' | 'trigger';

export interface DatabaseObjectIdentity {
  kind: DatabaseObjectKind;
  schema: string;
  name: string;
  signature?: string;
  table?: string;
}

export interface ActiveSessionInfo {
  pid: number;
  user?: string;
  database?: string;
  application?: string;
  client?: string;
  state?: string;
  query?: string;
  startedAt?: string;
  transactionStartedAt?: string;
  stateChangedAt?: string;
  waitEventType?: string;
  waitEvent?: string;
  isCurrent?: boolean;
  isIdleInTransaction?: boolean;
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

export interface TableColumnStatsInfo {
  name: string;
  nullFraction?: number;
  nDistinct?: number;
  correlation?: number;
}

export interface RedshiftTableStatsInfo {
  distStyle?: string;
  sortKey1?: string;
  sortKeyNum?: number;
  sizeMb?: number;
  rowCount?: number;
  skewRows?: number;
  unsortedPct?: number;
  statsOffPct?: number;
  encoded?: string;
}

export interface TableStatsInfo {
  schema: string;
  table: string;
  databaseType: DatabaseType;
  rowEstimate?: number;
  seqScan?: number;
  idxScan?: number;
  liveRows?: number;
  deadRows?: number;
  lastVacuum?: string;
  lastAutoVacuum?: string;
  lastAnalyze?: string;
  lastAutoAnalyze?: string;
  columns: TableColumnStatsInfo[];
  redshift?: RedshiftTableStatsInfo;
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
  hasMore?: boolean;
  maxRows?: number;
  command?: string;
  durationMs: number;
}

export interface GridFilter {
  column: string;
  operator: string;
  value?: string;
  secondValue?: string;
  values?: string[];
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
  sourceOrigin?: QueryExecutionOrigin;
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
  rowOffset?: number;
  error?: QueryError;
  resultSets: ResultSet[];
  plan?: QueryPlanResult;
  transaction?: {
    mode: 'auto' | 'manual';
    open: boolean;
  };
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
  sourceOrigin?: QueryExecutionOrigin;
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
  outputColumns?: string[];
  tables?: string[];
  columns?: string[];
  memoryTitle?: string;
  memorySummary?: string;
  memorySummaryStatus?: QueryMemorySummaryStatus;
  memorySummaryError?: string;
}

export type QueryMemorySourceKind = 'history' | 'document';

export type QueryMemorySummaryStatus = 'pending' | 'ready' | 'failed' | 'skipped';

export interface QueryMemoryItem {
  id: string;
  sourceKind: QueryMemorySourceKind;
  sourceId: string;
  connectionId?: string;
  databaseType?: DatabaseType;
  databaseName?: string;
  connectionName?: string;
  sql: string;
  title?: string;
  summary?: string;
  summaryStatus: QueryMemorySummaryStatus;
  summaryError?: string;
  tables: string[];
  columns: string[];
  outputColumns: string[];
  sourceFile?: string;
  documentUri?: string;
  sourceRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  favorite?: boolean;
  status?: 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  rowCount?: number;
  durationMs?: number;
  executedAt?: number;
  firstExecutedAt?: number;
  lastExecutedAt?: number;
  runCount?: number;
  historyIds?: string[];
  latestHistoryId?: string;
  indexedAt: number;
  updatedAt: number;
}

export interface QueryMemorySearchRequest {
  query: string;
  connectionId?: string;
  limit?: number;
  includeFailed?: boolean;
}

export interface QueryMemorySearchResult {
  item: QueryMemoryItem;
  score: number;
  reasons: string[];
  safety: SqlSafetyAssessment;
}

export interface QueryMemorySummary {
  title: string;
  summary: string;
  tables: string[];
  columns: string[];
}

export interface QueryMemorySummaryRequest {
  sql: string;
  connectionName?: string;
  databaseType?: DatabaseType;
  databaseName?: string;
  outputColumns?: string[];
  errorMessage?: string;
}

export type TableWorkloadColumnRole = 'join' | 'filter' | 'groupBy' | 'orderBy';

export interface TableWorkloadColumnUse {
  column: string;
  role: TableWorkloadColumnRole;
  queryCount: number;
  runCount: number;
  durationMs: number;
}

export interface TableWorkloadQuery {
  sql: string;
  title?: string;
  runCount: number;
  durationMs: number;
  lastExecutedAt?: number;
  score: number;
}

export interface TableWorkloadSummary {
  connectionId: string;
  table: string;
  queryCount: number;
  totalRunCount: number;
  totalDurationMs: number;
  topQueries: TableWorkloadQuery[];
  columns: TableWorkloadColumnUse[];
}

export type TablePerformanceImpact = 'high' | 'medium' | 'low';
export type TablePerformanceRecommendationKind = 'sortkey' | 'distkey' | 'index' | 'partition' | 'vacuum' | 'analyze';

export interface TablePerformancePrepassFlag {
  kind: string;
  impact: TablePerformanceImpact;
  message: string;
  evidence: string;
  recommendationKind?: TablePerformanceRecommendationKind;
  ddl?: string;
}

export interface TablePerformanceRecommendation {
  kind: TablePerformanceRecommendationKind;
  impact: TablePerformanceImpact;
  rationale: string;
  ddl: string;
}

export interface TablePerformanceAdvice {
  findings: string[];
  recommendations: TablePerformanceRecommendation[];
}

export interface TablePerformanceAdviceRequest {
  connectionName?: string;
  databaseType: DatabaseType;
  databaseName?: string;
  schema: string;
  table: string;
  tableDdl: string;
  stats: TableStatsInfo;
  prepassFlags: TablePerformancePrepassFlag[];
  workload: TableWorkloadSummary;
}

export interface QueryPlanAnnotationRequest {
  connectionName?: string;
  databaseType: DatabaseType;
  databaseName?: string;
  sql: string;
  plan: QueryPlanResult;
}

export interface QueryPlanAiAdvice {
  findings: string[];
  annotations: QueryPlanAnnotation[];
  rewrittenSql?: string;
}

export interface DataProfileTopValue {
  value: string;
  count: number;
}

export interface DataProfileHistogramBucket {
  label: string;
  count: number;
}

export interface DataProfileColumn {
  name: string;
  dataType?: string;
  nullable?: boolean;
  rowCount: number;
  nullCount: number;
  nullPct: number;
  distinctCount: number;
  min?: string;
  max?: string;
  topValues: DataProfileTopValue[];
  histogram: DataProfileHistogramBucket[];
}

export interface DataProfileNarrative {
  summary: string;
  anomalies: string[];
}

export interface DataProfileReport {
  connectionName?: string;
  databaseType: DatabaseType;
  databaseName?: string;
  schema: string;
  table: string;
  sampleRows: number;
  sampledAt: number;
  columns: DataProfileColumn[];
  narrative?: DataProfileNarrative;
  aiError?: string;
}

export interface DataProfileNarrativeRequest {
  connectionName?: string;
  databaseType: DatabaseType;
  databaseName?: string;
  schema: string;
  table: string;
  sampleRows: number;
  columns: DataProfileColumn[];
}

export type SqlSafetyRisk = 'safe' | 'write' | 'destructive' | 'production';

export interface SqlSafetyAssessment {
  risk: SqlSafetyRisk;
  reasons: string[];
  statements: string[];
  requiresConfirmation: boolean;
  previewAvailable: boolean;
}

export interface QueryConsoleRecord {
  id: string;
  connectionId: string;
  documentUri: string;
  schemaName?: string;
  pinned?: boolean;
  sortOrder?: number;
  lastOpenedAt?: number;
  lastTouchedAt?: number;
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
export type SchemaCacheSource = 'memory' | 'disk' | 'live';

export interface SchemaCacheEntry {
  connectionId: string;
  schemaName: string;
  cacheVersion?: number;
  connectionFingerprint?: string;
  source?: SchemaCacheSource;
  schemas: SchemaInfo[];
  tables: TableInfo[];
  views: ViewInfo[];
  functions: RoutineInfo[];
  procedures: RoutineInfo[];
  triggers: TriggerInfo[];
  columns: Record<string, ColumnInfo[]>;
  indexes: Record<string, IndexInfo[]>;
  keys: Record<string, KeyInfo[]>;
  foreignKeys: Record<string, ForeignKeyInfo[]>;
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
