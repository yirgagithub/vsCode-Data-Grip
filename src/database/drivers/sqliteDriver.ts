import { Database } from 'sqlite3';
import { ConnectionConfigWithPassword, DbConnection, ExecuteQueryParams, ColumnInfo, SchemaInfo, TableInfo, QueryExecutionResult, TablePreviewOptions, ViewInfo, IndexInfo, KeyInfo, ForeignKeyInfo } from '../../types';
import { qualifiedName, quoteIdentifier } from '../../utils/identifiers';
import { loadBundledRuntime } from '../../runtime/runtimeLoader';
import { BasicDatabaseDriver, clientLimit, emptyExecutionResult, executionResultFromRows, numberFromDb, optionalString, safeFilterClause } from './driverUtils';

export class SQLiteDriver extends BasicDatabaseDriver {
  readonly id = 'sqlite' as const;
  readonly displayName = 'SQLite';
  private readonly connections = new Map<string, Database>();

  async connect(config: ConnectionConfigWithPassword): Promise<DbConnection> {
    await this.disconnect(config.id);
    const sqlite = await loadSqlite();
    const database = new sqlite.Database(config.database);
    await run(database, 'select 1');
    this.connections.set(config.id, database);
    return { id: config.id, config, connectedAt: Date.now() };
  }

  async disconnect(connectionId: string): Promise<void> {
    const database = this.connections.get(connectionId);
    if (!database) {
      return;
    }
    this.connections.delete(connectionId);
    await close(database);
  }

  async executeQuery(params: ExecuteQueryParams): Promise<QueryExecutionResult> {
    const [result] = await this.executeStatements(params, [params.sql]);
    return result;
  }

  async executeStatements(params: ExecuteQueryParams, statements: string[]): Promise<QueryExecutionResult[]> {
    const database = this.requireDatabase(params.connectionId);
    const results: QueryExecutionResult[] = [];
    for (const sql of statements) {
      const started = Date.now();
      const executable = clientLimit(sql, params.maxRows, params.offset);
      if (/^\s*(select|with|pragma)\b/i.test(executable)) {
        const rows = await all(database, executable);
        results.push(executionResultFromRows(rows, started, sql));
      } else {
        const changes = await run(database, executable);
        results.push(emptyExecutionResult(started, sql, changes));
      }
    }
    return results;
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    const rows = await all(this.requireDatabase(connectionId), 'pragma database_list');
    return rows.map((row) => ({ name: String(row.name) }));
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    const rows = await all(this.requireDatabase(connectionId), `select name, type from ${quoteIdentifier(schema)}.sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`);
    return rows.map((row) => ({ schema, name: String(row.name), type: 'table' }));
  }

  override async getViews(connectionId: string, schema: string): Promise<ViewInfo[]> {
    const rows = await all(this.requireDatabase(connectionId), `select name from ${quoteIdentifier(schema)}.sqlite_master where type = 'view' order by name`);
    return rows.map((row) => ({ schema, name: String(row.name), type: 'view' }));
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = await all(this.requireDatabase(connectionId), `pragma ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(table)})`);
    return rows.map((row) => ({
      schema,
      table,
      name: String(row.name),
      ordinal: (numberFromDb(row.cid) ?? 0) + 1,
      dataType: optionalString(row.type) ?? 'text',
      nullable: !Boolean(row.notnull),
      defaultValue: optionalString(row.dflt_value)
    }));
  }

  override async getIndexes(connectionId: string, schema: string, table: string): Promise<IndexInfo[]> {
    const database = this.requireDatabase(connectionId);
    const indexes = await all(database, `pragma ${quoteIdentifier(schema)}.index_list(${quoteIdentifier(table)})`);
    const result: IndexInfo[] = [];
    for (const index of indexes) {
      const name = String(index.name);
      const columns = await all(database, `pragma ${quoteIdentifier(schema)}.index_info(${quoteIdentifier(name)})`);
      result.push({
        name,
        unique: Boolean(index.unique),
        columns: columns.map((column) => String(column.name))
      });
    }
    return result;
  }

  override async getPrimaryKeys(connectionId: string, schema: string, table: string): Promise<KeyInfo[]> {
    const columns = await all(this.requireDatabase(connectionId), `pragma ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(table)})`);
    const primaryColumns = columns.filter((column) => Number(column.pk) > 0).sort((left, right) => Number(left.pk) - Number(right.pk));
    return primaryColumns.length ? [{ name: `${table}_pk`, columns: primaryColumns.map((column) => String(column.name)) }] : [];
  }

  override async getForeignKeys(connectionId: string, schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const rows = await all(this.requireDatabase(connectionId), `pragma ${quoteIdentifier(schema)}.foreign_key_list(${quoteIdentifier(table)})`);
    const grouped = new Map<string, ForeignKeyInfo>();
    for (const row of rows) {
      const name = `${table}_fk_${row.id}`;
      const entry = grouped.get(name) ?? { name, columns: [], foreignSchema: schema, foreignTable: String(row.table), foreignColumns: [] };
      entry.columns.push(String(row.from));
      entry.foreignColumns.push(String(row.to));
      grouped.set(name, entry);
    }
    return [...grouped.values()];
  }

  async getTablePreview(connectionId: string, schema: string, table: string, limit: number, options?: TablePreviewOptions): Promise<QueryExecutionResult> {
    const orderBy = options?.orderBy?.length
      ? `\norder by ${options.orderBy.map((item) => `${quoteIdentifier(item.column)} ${item.direction === 'desc' ? 'desc' : 'asc'}`).join(', ')}`
      : options?.orderBySql?.trim()
        ? `\norder by ${options.orderBySql.trim()}`
        : '';
    const offset = Number.isFinite(options?.offset) && options?.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const pageLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) + 1 : 0;
    const sql = `select * from ${qualifiedName(schema, table)}${safeFilterClause(options?.where)}${orderBy}${pageLimit ? `\nlimit ${pageLimit}${offset ? ` offset ${offset}` : ''}` : ''}`;
    return this.executeQuery({ connectionId, sql, maxRows: 0 });
  }

  override async getTableDDL(connectionId: string, schema: string, table: string): Promise<string> {
    const rows = await all(this.requireDatabase(connectionId), `select sql from ${quoteIdentifier(schema)}.sqlite_master where name = ? and type in ('table', 'view')`, [table]);
    const ddl = optionalString(rows[0]?.sql);
    return ddl ? `${ddl};` : super.getTableDDL(connectionId, schema, table);
  }

  private requireDatabase(connectionId: string): Database {
    const database = this.connections.get(connectionId);
    if (!database) {
      throw new Error('Connection is not active. Connect first.');
    }
    return database;
  }
}

type SqliteRuntime = typeof import('sqlite3');

async function loadSqlite(): Promise<SqliteRuntime> {
  const bundled = loadBundledRuntime<SqliteRuntime>('sqliteRuntime');
  if (bundled) {
    return bundled;
  }
  return import('sqlite3').then((module) => {
    const candidate = module as unknown as SqliteRuntime | { default?: SqliteRuntime };
    return 'Database' in candidate ? candidate : candidate.default as SqliteRuntime;
  });
}

function all(database: Database, sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows ?? []) as Record<string, unknown>[]));
  });
}

function run(database: Database, sql: string, params: unknown[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function callback(error) {
      if (error) {
        reject(error);
      } else {
        resolve(this.changes ?? 0);
      }
    });
  });
}

function close(database: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    database.close((error) => error ? reject(error) : resolve());
  });
}
