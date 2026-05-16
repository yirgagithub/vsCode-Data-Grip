import * as vscode from 'vscode';
import { ConnectionManager } from '../database/connectionManager';
import { CatalogNode, ColumnNode, ConnectionNode, DatabaseNode, FolderNode, SchemaNode, SchemasNode, TableNode, ViewNode } from './nodes';

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseNode> {
  private readonly emitter = new vscode.EventEmitter<DatabaseNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly connectionManager: ConnectionManager) {}

  refresh(node?: DatabaseNode): void {
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
      return [new SchemasNode(element.connection)];
    }

    if (element instanceof SchemasNode) {
      await this.ensureConnected(element.connection.id);
      const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
      return schemas.map((schema) => new SchemaNode(element.connection, schema));
    }

    if (element instanceof SchemaNode) {
      return [
        new FolderNode(element.connection, element.schema.name, 'Tables'),
        new FolderNode(element.connection, element.schema.name, 'Views')
      ];
    }

    if (element instanceof FolderNode && element.folder === 'Tables') {
      await this.ensureConnected(element.connection.id);
      const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
      return tables.map((table) => new TableNode(element.connection, table));
    }

    if (element instanceof FolderNode && element.folder === 'Views') {
      await this.ensureConnected(element.connection.id);
      const views = await this.connectionManager.getDriver(element.connection.type).getViews(element.connection.id, element.schema);
      return views.map((view) => new ViewNode(element.connection, view));
    }

    if (element instanceof TableNode) {
      return [
        new FolderNode(element.connection, element.table.schema, 'Columns', element.table.name),
        new FolderNode(element.connection, element.table.schema, 'Indexes', element.table.name),
        new FolderNode(element.connection, element.table.schema, 'Keys', element.table.name)
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
}
