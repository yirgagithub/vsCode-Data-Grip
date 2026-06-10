import * as vscode from 'vscode';
import { ColumnInfo, ConnectionConfig, SchemaInfo, TableInfo, ViewInfo } from '../types';

export type DatabaseNode =
  | ConnectionNode
  | CatalogNode
  | SchemasNode
  | SchemaNode
  | FolderNode
  | TableNode
  | ViewNode
  | ColumnNode;

export class ConnectionNode extends vscode.TreeItem {
  readonly kind = 'connection';
  constructor(public readonly connection: ConnectionConfig, connected: boolean) {
    super(truncateMiddle(connection.name, 36), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = connection.id;
    this.description = `${connected ? 'online' : 'offline'} | ${connection.type}`;
    this.contextValue = 'connection';
    this.iconPath = new vscode.ThemeIcon(
      'database',
      new vscode.ThemeColor(connected ? 'testing.iconPassed' : 'descriptionForeground')
    );
    this.tooltip = new vscode.MarkdownString(
      [
        `**${connection.name}**`,
        '',
        `Type: ${connection.type}`,
        `Host: ${connection.host}:${connection.port}`,
        `Database: ${connection.database}`,
        `User: ${connection.username}`,
        `Schema: ${connection.defaultSchema ?? 'public'}`,
        `Status: ${connected ? 'connected' : 'disconnected'}`
      ].join('\n\n')
    );
  }
}

export class CatalogNode extends vscode.TreeItem {
  readonly kind = 'catalog';
  constructor(public readonly connection: ConnectionConfig) {
    super(truncateMiddle(connection.database, 40), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `catalog:${connection.id}:${connection.database}`;
    this.description = connection.host;
    this.contextValue = 'catalog';
    this.iconPath = new vscode.ThemeIcon('server-environment');
    this.tooltip = `${connection.database} on ${connection.host}:${connection.port}`;
  }
}

export class SchemasNode extends vscode.TreeItem {
  readonly kind = 'schemas';
  constructor(public readonly connection: ConnectionConfig) {
    super('Schemas', vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `schemas:${connection.id}`;
    this.contextValue = 'schemas';
    this.iconPath = new vscode.ThemeIcon('library');
  }
}

export class SchemaNode extends vscode.TreeItem {
  readonly kind = 'schema';
  constructor(public readonly connection: ConnectionConfig, public readonly schema: SchemaInfo) {
    super(truncateMiddle(schema.name, 40), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `schema:${connection.id}:${schema.name}`;
    this.contextValue = 'schema';
    this.iconPath = new vscode.ThemeIcon('library');
    this.tooltip = schema.name;
  }
}

export class FolderNode extends vscode.TreeItem {
  readonly kind = 'folder';
  constructor(
    public readonly connection: ConnectionConfig,
    public readonly schema: string,
    public readonly folder: 'Tables' | 'Views' | 'Materialized Views' | 'Columns',
    public readonly tableName?: string
  ) {
    super(folder, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `folder:${connection.id}:${schema}:${folder}:${tableName ?? ''}`;
    this.contextValue = folder.toLowerCase().replace(/\s+/g, '-');
    this.iconPath = new vscode.ThemeIcon(folder === 'Materialized Views' ? 'symbol-structure' : 'folder');
  }
}

export class TableNode extends vscode.TreeItem {
  readonly kind = 'table';
  constructor(public readonly connection: ConnectionConfig, public readonly table: TableInfo) {
    super(truncateMiddle(table.name, 48), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `table:${connection.id}:${table.schema}:${table.name}`;
    this.description = table.rowEstimate !== undefined ? `~${table.rowEstimate}` : undefined;
    this.contextValue = 'table';
    this.iconPath = new vscode.ThemeIcon(table.type === 'materialized_view' ? 'symbol-structure' : 'table');
    this.tooltip = table.comment ? `${table.schema}.${table.name}\n${table.comment}` : `${table.schema}.${table.name}`;
    this.command = { command: 'database.openTableData', title: 'Open Table Data', arguments: [this] };
  }
}

export class ViewNode extends vscode.TreeItem {
  readonly kind = 'view';
  constructor(public readonly connection: ConnectionConfig, public readonly view: ViewInfo) {
    super(truncateMiddle(view.name, 48), vscode.TreeItemCollapsibleState.None);
    this.id = `view:${connection.id}:${view.schema}:${view.name}`;
    this.contextValue = 'view';
    this.iconPath = new vscode.ThemeIcon('eye');
    this.tooltip = `${view.schema}.${view.name}`;
  }
}

export class ColumnNode extends vscode.TreeItem {
  readonly kind = 'column';
  constructor(public readonly connection: ConnectionConfig, public readonly column: ColumnInfo) {
    super(truncateMiddle(column.name, 44), vscode.TreeItemCollapsibleState.None);
    this.id = `column:${connection.id}:${column.schema}:${column.table}:${column.name}`;
    this.description = truncateEnd(`${column.dataType}${column.nullable ? '' : ' not null'}`, 30);
    this.contextValue = 'column';
    this.iconPath = new vscode.ThemeIcon(column.name.toLowerCase() === 'id' ? 'key' : 'symbol-field');
    this.tooltip = `${column.schema}.${column.table}.${column.name}\n${column.dataType}${column.nullable ? '' : ' not null'}`;
  }
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function truncateEnd(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
