"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColumnNode = exports.ViewNode = exports.TableNode = exports.FolderNode = exports.SchemaNode = exports.SchemasNode = exports.CatalogNode = exports.ConnectionNode = void 0;
const vscode = __importStar(require("vscode"));
class ConnectionNode extends vscode.TreeItem {
    connection;
    kind = 'connection';
    constructor(connection, connected) {
        super(truncateMiddle(connection.name, 36), vscode.TreeItemCollapsibleState.Collapsed);
        this.connection = connection;
        this.id = connection.id;
        this.description = `${connected ? 'online' : 'offline'} - ${connection.type}`;
        this.contextValue = 'connection';
        this.iconPath = new vscode.ThemeIcon(connected ? 'circle-filled' : 'circle-outline', new vscode.ThemeColor(connected ? 'testing.iconPassed' : 'descriptionForeground'));
        this.tooltip = new vscode.MarkdownString([
            `**${connection.name}**`,
            '',
            `Type: ${connection.type}`,
            `Host: ${connection.host}:${connection.port}`,
            `Database: ${connection.database}`,
            `User: ${connection.username}`,
            `Schema: ${connection.defaultSchema ?? 'public'}`,
            `Status: ${connected ? 'connected' : 'disconnected'}`
        ].join('\n\n'));
    }
}
exports.ConnectionNode = ConnectionNode;
class CatalogNode extends vscode.TreeItem {
    connection;
    kind = 'catalog';
    constructor(connection) {
        super(truncateMiddle(connection.database, 40), vscode.TreeItemCollapsibleState.Collapsed);
        this.connection = connection;
        this.description = connection.host;
        this.contextValue = 'catalog';
        this.iconPath = new vscode.ThemeIcon('server-environment');
        this.tooltip = `${connection.database} on ${connection.host}:${connection.port}`;
    }
}
exports.CatalogNode = CatalogNode;
class SchemasNode extends vscode.TreeItem {
    connection;
    kind = 'schemas';
    constructor(connection) {
        super('Schemas', vscode.TreeItemCollapsibleState.Collapsed);
        this.connection = connection;
        this.contextValue = 'schemas';
        this.iconPath = new vscode.ThemeIcon('library');
    }
}
exports.SchemasNode = SchemasNode;
class SchemaNode extends vscode.TreeItem {
    connection;
    schema;
    kind = 'schema';
    constructor(connection, schema) {
        super(truncateMiddle(schema.name, 40), vscode.TreeItemCollapsibleState.Collapsed);
        this.connection = connection;
        this.schema = schema;
        this.contextValue = 'schema';
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
        this.tooltip = schema.name;
    }
}
exports.SchemaNode = SchemaNode;
class FolderNode extends vscode.TreeItem {
    connection;
    schema;
    folder;
    tableName;
    kind = 'folder';
    constructor(connection, schema, folder, tableName) {
        super(folder, vscode.TreeItemCollapsibleState.Collapsed);
        this.connection = connection;
        this.schema = schema;
        this.folder = folder;
        this.tableName = tableName;
        this.contextValue = folder.toLowerCase().replace(/\s+/g, '-');
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}
exports.FolderNode = FolderNode;
class TableNode extends vscode.TreeItem {
    connection;
    table;
    kind = 'table';
    constructor(connection, table) {
        super(truncateMiddle(table.name, 48), vscode.TreeItemCollapsibleState.Collapsed);
        this.connection = connection;
        this.table = table;
        this.description = table.rowEstimate !== undefined ? `~${table.rowEstimate}` : undefined;
        this.contextValue = 'table';
        this.iconPath = new vscode.ThemeIcon('table');
        this.tooltip = table.comment ? `${table.schema}.${table.name}\n${table.comment}` : `${table.schema}.${table.name}`;
        this.command = { command: 'database.openTableData', title: 'Open Table Data', arguments: [this] };
    }
}
exports.TableNode = TableNode;
class ViewNode extends vscode.TreeItem {
    connection;
    view;
    kind = 'view';
    constructor(connection, view) {
        super(truncateMiddle(view.name, 48), vscode.TreeItemCollapsibleState.None);
        this.connection = connection;
        this.view = view;
        this.contextValue = 'view';
        this.iconPath = new vscode.ThemeIcon('eye');
        this.tooltip = `${view.schema}.${view.name}`;
    }
}
exports.ViewNode = ViewNode;
class ColumnNode extends vscode.TreeItem {
    connection;
    column;
    kind = 'column';
    constructor(connection, column) {
        super(truncateMiddle(column.name, 44), vscode.TreeItemCollapsibleState.None);
        this.connection = connection;
        this.column = column;
        this.description = truncateEnd(`${column.dataType}${column.nullable ? '' : ' not null'}`, 30);
        this.contextValue = 'column';
        this.iconPath = new vscode.ThemeIcon(column.name.toLowerCase() === 'id' ? 'key' : 'symbol-field');
        this.tooltip = `${column.schema}.${column.table}.${column.name}\n${column.dataType}${column.nullable ? '' : ' not null'}`;
    }
}
exports.ColumnNode = ColumnNode;
function truncateMiddle(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
    return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
function truncateEnd(value, maxLength) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
//# sourceMappingURL=nodes.js.map