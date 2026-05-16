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
exports.DatabaseTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const nodes_1 = require("./nodes");
class DatabaseTreeProvider {
    connectionManager;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }
    refresh(node) {
        this.emitter.fire(node);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.connectionManager.getConnections().map((connection) => new nodes_1.ConnectionNode(connection, this.connectionManager.isConnected(connection.id)));
        }
        if (element instanceof nodes_1.ConnectionNode) {
            return [new nodes_1.CatalogNode(element.connection)];
        }
        if (element instanceof nodes_1.CatalogNode) {
            return [new nodes_1.SchemasNode(element.connection)];
        }
        if (element instanceof nodes_1.SchemasNode) {
            await this.ensureConnected(element.connection.id);
            const schemas = await this.connectionManager.getDriver(element.connection.type).getSchemas(element.connection.id);
            return schemas.map((schema) => new nodes_1.SchemaNode(element.connection, schema));
        }
        if (element instanceof nodes_1.SchemaNode) {
            return [
                new nodes_1.FolderNode(element.connection, element.schema.name, 'Tables'),
                new nodes_1.FolderNode(element.connection, element.schema.name, 'Views')
            ];
        }
        if (element instanceof nodes_1.FolderNode && element.folder === 'Tables') {
            await this.ensureConnected(element.connection.id);
            const tables = await this.connectionManager.getDriver(element.connection.type).getTables(element.connection.id, element.schema);
            return tables.map((table) => new nodes_1.TableNode(element.connection, table));
        }
        if (element instanceof nodes_1.FolderNode && element.folder === 'Views') {
            await this.ensureConnected(element.connection.id);
            const views = await this.connectionManager.getDriver(element.connection.type).getViews(element.connection.id, element.schema);
            return views.map((view) => new nodes_1.ViewNode(element.connection, view));
        }
        if (element instanceof nodes_1.TableNode) {
            return [
                new nodes_1.FolderNode(element.connection, element.table.schema, 'Columns', element.table.name),
                new nodes_1.FolderNode(element.connection, element.table.schema, 'Indexes', element.table.name),
                new nodes_1.FolderNode(element.connection, element.table.schema, 'Keys', element.table.name)
            ];
        }
        if (element instanceof nodes_1.FolderNode && element.folder === 'Columns') {
            const table = element.tableName;
            if (!table) {
                return [];
            }
            const columns = await this.connectionManager.getDriver(element.connection.type).getColumns(element.connection.id, element.schema, table);
            return columns.map((column) => new nodes_1.ColumnNode(element.connection, column));
        }
        return [];
    }
    async ensureConnected(connectionId) {
        if (!this.connectionManager.isConnected(connectionId)) {
            await this.connectionManager.connect(connectionId);
        }
    }
}
exports.DatabaseTreeProvider = DatabaseTreeProvider;
//# sourceMappingURL=DatabaseTreeProvider.js.map