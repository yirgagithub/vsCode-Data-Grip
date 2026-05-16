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
exports.QueryConsoleStore = void 0;
const vscode = __importStar(require("vscode"));
const id_1 = require("../utils/id");
const CONSOLES_KEY = 'database.queryConsoles';
class QueryConsoleStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.workspaceState.get(CONSOLES_KEY, []);
    }
    getByConnection(connectionId) {
        return this.getAll()
            .filter((record) => record.connectionId === connectionId)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    async openOrCreate(connection, initialSql = '', options = {}) {
        const reuse = options.reuse ?? true;
        const existing = reuse && connection ? this.getByConnection(connection.id) : undefined;
        if (existing) {
            try {
                return await vscode.workspace.openTextDocument(vscode.Uri.parse(existing.documentUri));
            }
            catch {
                await this.delete(existing.id);
            }
        }
        const uri = await this.createConsoleUri(connection);
        await this.ensureFile(uri, initialSql || this.defaultContent(connection, uri));
        const now = Date.now();
        if (connection) {
            await this.save({
                id: (0, id_1.createId)('console'),
                connectionId: connection.id,
                documentUri: uri.toString(),
                schemaName: connection.defaultSchema,
                createdAt: now,
                updatedAt: now
            });
        }
        return vscode.workspace.openTextDocument(uri);
    }
    async markExecuted(documentUri, range) {
        const records = this.getAll();
        const index = records.findIndex((record) => record.documentUri === documentUri);
        if (index === -1) {
            return;
        }
        records[index] = { ...records[index], lastExecutedRange: range, updatedAt: Date.now() };
        await this.context.workspaceState.update(CONSOLES_KEY, records);
    }
    async delete(id) {
        await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => record.id !== id));
    }
    async save(record) {
        const records = this.getAll().filter((existing) => existing.id !== record.id);
        records.push(record);
        await this.context.workspaceState.update(CONSOLES_KEY, records);
    }
    async createConsoleUri(connection) {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const base = folder
            ? vscode.Uri.joinPath(folder, '.vscode-data-grip')
            : vscode.Uri.joinPath(this.context.globalStorageUri, 'query-consoles');
        await vscode.workspace.fs.createDirectory(base);
        const name = this.safeName(connection ? `${connection.name}-${connection.database}` : 'sql-console');
        const existing = new Set(this.getAll().map((record) => record.documentUri));
        for (let index = 1; index < 10_000; index += 1) {
            const suffix = index === 1 ? '' : `-${index}`;
            const uri = vscode.Uri.joinPath(base, `${name}${suffix}.sql`);
            if (!existing.has(uri.toString())) {
                try {
                    await vscode.workspace.fs.stat(uri);
                }
                catch {
                    return uri;
                }
            }
        }
        return vscode.Uri.joinPath(base, `${name}-${Date.now()}.sql`);
    }
    async ensureFile(uri, content) {
        try {
            await vscode.workspace.fs.stat(uri);
        }
        catch {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            if (!vscode.workspace.workspaceFolders?.length) {
                void vscode.window.showWarningMessage('No workspace is open. Query console files are stored in extension storage.');
            }
        }
    }
    defaultContent(connection, uri) {
        const pathLine = uri ? `-- File: ${uri.fsPath}\n` : '';
        return connection
            ? `-- ${connection.name} / ${connection.database}\n-- Schema: ${connection.defaultSchema ?? 'public'}\n${pathLine}\nselect *\nfrom \nlimit 100;\n`
            : `-- SQL Console\n${pathLine}\n`;
    }
    safeName(value) {
        return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sql-console';
    }
}
exports.QueryConsoleStore = QueryConsoleStore;
//# sourceMappingURL=queryConsoleStore.js.map