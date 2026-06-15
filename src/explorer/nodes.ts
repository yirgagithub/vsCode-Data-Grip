import * as vscode from 'vscode';
import { ColumnInfo, ConnectionColor, ConnectionConfig, RoutineInfo, SchemaInfo, TableInfo, TablePerformancePrepassFlag, TriggerInfo, ViewInfo } from '../types';

export type DatabaseNode =
  | ConnectionNode
  | CatalogNode
  | SchemasNode
  | SchemaNode
  | FolderNode
  | TableNode
  | ViewNode
  | RoutineNode
  | TriggerNode
  | ColumnNode;

export class ConnectionNode extends vscode.TreeItem {
  readonly kind = 'connection';
  constructor(public readonly connection: ConnectionConfig, connected: boolean) {
    super(truncateMiddle(connection.name, 36), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = connection.id;
    this.description = `${connected ? 'online' : 'offline'} | ${connection.type}${connection.production ? ' | prod' : ''}`;
    this.contextValue = 'connection';
    this.iconPath = new vscode.ThemeIcon(
      'database',
      new vscode.ThemeColor(connection.production ? 'errorForeground' : connected ? connectionColorTheme(connection.color) : 'descriptionForeground')
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
        `Environment: ${connection.production ? 'production' : 'non-production'}`,
        `Status: ${connected ? 'connected' : 'disconnected'}`
      ].join('\n\n')
    );
  }
}

function connectionColorTheme(color: ConnectionColor): string {
  switch (color) {
    case 'red':
      return 'charts.red';
    case 'yellow':
      return 'charts.yellow';
    case 'green':
      return 'charts.green';
    case 'blue':
      return 'charts.blue';
    case 'purple':
      return 'charts.purple';
    case 'gray':
    default:
      return 'descriptionForeground';
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
    public readonly folder: 'Tables' | 'Views' | 'Materialized Views' | 'Columns' | 'Functions' | 'Procedures' | 'Triggers',
    public readonly tableName?: string
  ) {
    super(folder, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `folder:${connection.id}:${schema}:${folder}:${tableName ?? ''}`;
    this.contextValue = folder === 'Functions'
      ? 'function-folder'
      : folder === 'Procedures'
        ? 'procedure-folder'
        : folder === 'Triggers'
          ? 'trigger-folder'
          : folder.toLowerCase().replace(/\s+/g, '-');
    this.iconPath = new vscode.ThemeIcon(folder === 'Materialized Views' ? 'symbol-structure' : 'folder');
  }
}

export class RoutineNode extends vscode.TreeItem {
  readonly kind = 'routine';
  constructor(public readonly connection: ConnectionConfig, public readonly routine: RoutineInfo) {
    super(truncateMiddle(routine.name, 48), vscode.TreeItemCollapsibleState.None);
    this.id = `routine:${connection.id}:${routine.kind}:${routine.schema}:${routine.name}`;
    this.contextValue = routine.kind;
    this.iconPath = new vscode.ThemeIcon(routine.kind === 'procedure' ? 'gear' : 'symbol-function');
    this.tooltip = [
      `${routine.schema}.${routine.name}`,
      routine.kind === 'procedure' ? 'Procedure' : 'Function',
      routine.returnType ? `Returns: ${routine.returnType}` : undefined,
      routine.language ? `Language: ${routine.language}` : undefined,
      routine.comment
    ].filter(Boolean).join('\n');
    this.command = { command: 'database.quickDocumentation', title: 'Quick Documentation', arguments: [this] };
  }
}

export class TriggerNode extends vscode.TreeItem {
  readonly kind = 'trigger';
  constructor(public readonly connection: ConnectionConfig, public readonly trigger: TriggerInfo) {
    super(truncateMiddle(trigger.name, 48), vscode.TreeItemCollapsibleState.None);
    this.id = `trigger:${connection.id}:${trigger.schema}:${trigger.table}:${trigger.name}`;
    this.contextValue = 'trigger';
    this.iconPath = new vscode.ThemeIcon('debug-breakpoint-log');
    this.tooltip = [
      `${trigger.schema}.${trigger.table}.${trigger.name}`,
      trigger.timing ? `Timing: ${trigger.timing}` : undefined,
      trigger.orientation ? `Orientation: ${trigger.orientation}` : undefined,
      trigger.events?.length ? `Events: ${trigger.events.join(', ')}` : undefined,
      trigger.enabled ? `Enabled: ${trigger.enabled}` : undefined
    ].filter(Boolean).join('\n');
    this.command = { command: 'database.quickDocumentation', title: 'Quick Documentation', arguments: [this] };
  }
}

export class TableNode extends vscode.TreeItem {
  readonly kind = 'table';
  private readonly baseDescription: string | undefined;
  private readonly baseTooltip: string;
  private readonly baseIconPath: vscode.ThemeIcon;

  constructor(public readonly connection: ConnectionConfig, public readonly table: TableInfo) {
    super(truncateMiddle(table.name, 48), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `table:${connection.id}:${table.schema}:${table.name}`;
    this.baseDescription = table.rowEstimate !== undefined ? `~${table.rowEstimate}` : undefined;
    this.description = this.baseDescription;
    this.contextValue = 'table';
    this.baseIconPath = new vscode.ThemeIcon(table.type === 'materialized_view' ? 'symbol-structure' : 'table');
    this.iconPath = this.baseIconPath;
    this.baseTooltip = table.comment ? `${table.schema}.${table.name}\n${table.comment}` : `${table.schema}.${table.name}`;
    this.tooltip = this.baseTooltip;
    this.command = { command: 'database.openTableData', title: 'Open Table Data', arguments: [this] };
  }

  applyMaintenanceFlags(flags: TablePerformancePrepassFlag[]): void {
    if (!flags.length) {
      this.description = this.baseDescription;
      this.iconPath = this.baseIconPath;
      this.tooltip = this.baseTooltip;
      return;
    }

    const details = flags.map((flag) => `${flag.message} (${flag.evidence})`);
    const actionSummary = flags
      .map((flag) => flag.ddl ? `${flag.recommendationKind ?? 'maintenance'}: ${flag.ddl}` : flag.message)
      .join('\n');

    this.description = [this.baseDescription, flags.map((flag) => flag.evidence).join(' • ')].filter(Boolean).join(' | ');
    this.iconPath = new vscode.ThemeIcon('warning');
    this.tooltip = `${this.baseTooltip}\n\n${details.join('\n')}${actionSummary ? `\n\n${actionSummary}` : ''}`;
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
