import * as vscode from 'vscode';
import { ConnectionManager } from '../database/connectionManager';
import { buildTablePerformancePrepassFlags } from '../services/tablePerformanceAdvisorService';
import { TablePerformancePrepassFlag, TableStatsInfo, TableWorkloadSummary } from '../types';
import { CatalogNode, ColumnNode, ConnectionNode, DatabaseNode, FolderNode, SchemaNode, SchemasNode, TableNode, ViewNode } from './nodes';

const EMPTY_WORKLOAD: TableWorkloadSummary = {
  connectionId: '',
  table: '',
  queryCount: 0,
  totalRunCount: 0,
  totalDurationMs: 0,
  topQueries: [],
  columns: []
};

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseNode> {
  private readonly emitter = new vscode.EventEmitter<DatabaseNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly tableStatsCache = new Map<string, TableStatsInfo>();
  private readonly inflightTableStats = new Map<string, Promise<void>>();

  constructor(private readonly connectionManager: ConnectionManager) {}

  refresh(node?: DatabaseNode): void {
    if (!node) {
      this.tableStatsCache.clear();
    }
    this.emitter.fire(node);
  }

  getTreeItem(element: DatabaseNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DatabaseNode): Promise<DatabaseNode[]> {
    if (!element) {
      return this.connectionManager.getConnections().map((connection) => new ConnectionNode(connection, this.connectionManager.isConnected(connection.id)));
    }

    if (element instanceof ConnectionNode) {
      return [new CatalogNode(element.connection)];
    }

    if (element instanceof CatalogNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }

    if (element instanceof SchemasNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }

    if (element instanceof SchemaNode) {
      return [
        new FolderNode(element.connection, element.schema.name, 'Tables'),
        new FolderNode(element.connection, element.schema.name, 'Materialized Views'),
        new FolderNode(element.connection, element.schema.name, 'Views')
      ];
    }

    if (element instanceof FolderNode && element.folder === 'Tables') {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.filter((table) => table.type !== 'materialized_view').map((table) => {
        const node = new TableNode(element.connection, table);
        void this.decorateTableNode(node);
        return node;
      });
    }

    if (element instanceof FolderNode && element.folder === 'Materialized Views') {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.filter((table) => table.type === 'materialized_view').map((table) => {
        const node = new TableNode(element.connection, table);
        void this.decorateTableNode(node);
        return node;
      });
    }

    if (element instanceof FolderNode && element.folder === 'Views') {
      await this.ensureConnected(element.connection.id);
      const views = await this.connectionManager.getDriver(element.connection.type).getViews(element.connection.id, element.schema);
      return views.map((view) => new ViewNode(element.connection, view));
    }

    if (element instanceof TableNode) {
      return [
        new FolderNode(element.connection, element.table.schema, 'Columns', element.table.name)
      ];
    }

    if (element instanceof FolderNode && element.folder === 'Columns') {
      const table = element.tableName;
      if (!table) {
        return [];
      }
      const columns = await this.connectionManager.getDriver(element.connection.type).getColumns(element.connection.id, element.schema, table);
      return columns.map((column) => new ColumnNode(element.connection, column));
    }

    return [];
  }

  private async ensureConnected(connectionId: string): Promise<void> {
    if (!this.connectionManager.isConnected(connectionId)) {
      await this.connectionManager.connect(connectionId);
    }
  }

  private async decorateTableNode(node: TableNode): Promise<void> {
    const key = this.tableKey(node.connection.id, node.table.schema, node.table.name);
    const cached = this.tableStatsCache.get(key);
    if (cached) {
      node.applyMaintenanceFlags(this.maintenanceFlags(cached));
      this.refresh(node);
      return;
    }
    if (this.inflightTableStats.has(key)) {
      return this.inflightTableStats.get(key)!;
    }
    const task = (async () => {
      try {
        await this.ensureConnected(node.connection.id);
        const stats = await this.connectionManager.getDriver(node.connection.type).getTableStats(node.connection.id, node.table.schema, node.table.name);
        this.tableStatsCache.set(key, stats);
        node.applyMaintenanceFlags(this.maintenanceFlags(stats));
        this.refresh(node);
      } catch {
        node.applyMaintenanceFlags([]);
        this.refresh(node);
      } finally {
        this.inflightTableStats.delete(key);
      }
    })();
    this.inflightTableStats.set(key, task);
    return task;
  }

  private maintenanceFlags(stats: TableStatsInfo): TablePerformancePrepassFlag[] {
    if (stats.databaseType !== 'redshift') {
      return [];
    }
    return buildTablePerformancePrepassFlags(stats, EMPTY_WORKLOAD).filter((flag) => flag.kind === 'redshift_unsorted_rows' || flag.kind === 'redshift_stale_stats');
  }

  private tableKey(connectionId: string, schema: string, table: string): string {
    return `${connectionId}:${schema}:${table}`;
  }
}
