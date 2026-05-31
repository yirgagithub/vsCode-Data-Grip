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
const queryConsoleRecords_1 = require("./queryConsoleRecords");
const CONSOLES_KEY = 'database.queryConsoles';
class QueryConsoleStore {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.workspaceState.get(CONSOLES_KEY, []);
    }
    async pruneMissingDocuments() {
        const records = this.getAll();
        const { existing, missing } = await (0, queryConsoleRecords_1.partitionExistingConsoleRecords)(records, (documentUri) => this.documentExists(documentUri));
        if (missing.length) {
            await this.context.workspaceState.update(CONSOLES_KEY, existing);
        }
        return missing.length;
    }
    getByConnection(connectionId) {
        return this.getAll()
            .filter((record) => record.connectionId === connectionId)
            .sort((a, b) => (b.lastTouchedAt ?? b.updatedAt) - (a.lastTouchedAt ?? a.updatedAt))[0];
    }
    async openOrCreate(connection, initialSql = '', options = {}) {
        const reuse = options.reuse ?? true;
        const existing = reuse && connection ? this.getByConnection(connection.id) : undefined;
        if (existing) {
            try {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(existing.documentUri));
                await this.touch(existing.id, { opened: true });
                return document;
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
                sortOrder: -now,
                lastOpenedAt: now,
                lastTouchedAt: now,
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
        const now = Date.now();
        records[index] = { ...records[index], lastExecutedRange: range, lastTouchedAt: now, updatedAt: now };
        await this.context.workspaceState.update(CONSOLES_KEY, records);
    }
    async touch(id, options = {}) {
        const now = Date.now();
        await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => (record.id === id
            ? { ...record, lastOpenedAt: options.opened ? now : record.lastOpenedAt, lastTouchedAt: now, updatedAt: now }
            : record)));
    }
    async touchDocument(documentUri, options = {}) {
        const record = this.getAll().find((item) => item.documentUri === documentUri);
        if (record) {
            await this.touch(record.id, options);
        }
    }
    async setPinned(id, pinned) {
        const now = Date.now();
        await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().map((record) => (record.id === id ? { ...record, pinned, updatedAt: now } : record)));
    }
    async move(id, direction) {
        const records = this.getAll();
        const record = records.find((item) => item.id === id);
        if (!record) {
            return;
        }
        const siblings = records
            .filter((item) => item.connectionId === record.connectionId)
            .sort((a, b) => this.sortValue(a) - this.sortValue(b));
        const index = siblings.findIndex((item) => item.id === id);
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        const swap = siblings[swapIndex];
        if (index === -1 || !swap) {
            return;
        }
        const firstOrder = this.sortValue(record);
        const secondOrder = this.sortValue(swap);
        const now = Date.now();
        await this.context.workspaceState.update(CONSOLES_KEY, records.map((item) => {
            if (item.id === record.id) {
                return { ...item, sortOrder: secondOrder, updatedAt: now };
            }
            if (item.id === swap.id) {
                return { ...item, sortOrder: firstOrder, updatedAt: now };
            }
            return item;
        }));
    }
    async delete(id) {
        await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => record.id !== id));
    }
    async deleteMany(ids) {
        const idSet = new Set(ids);
        if (!idSet.size) {
            return;
        }
        await this.context.workspaceState.update(CONSOLES_KEY, this.getAll().filter((record) => !idSet.has(record.id)));
    }
    async save(record) {
        const records = this.getAll().filter((existing) => existing.id !== record.id);
        records.push(record);
        await this.context.workspaceState.update(CONSOLES_KEY, records);
    }
    sortValue(record) {
        return record.sortOrder ?? -(record.lastTouchedAt ?? record.updatedAt);
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
                void vscode.window.showInformationMessage('No workspace is open. Query console files are stored in extension storage; SQL autocomplete still works after metadata warms.');
            }
        }
    }
    defaultContent(connection, uri) {
        return connection
            ? `-- ${connection.name} / ${connection.database}\n-- Schema: ${connection.defaultSchema ?? 'public'}\n\nselect *\nfrom \nlimit 100;\n`
            : `-- SQL Console\n\n`;
    }
    safeName(value) {
        return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sql-console';
    }
    async documentExists(documentUri) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.parse(documentUri));
            return true;
        }
        catch (error) {
            return !this.isFileNotFound(error);
        }
    }
    isFileNotFound(error) {
        const code = error instanceof vscode.FileSystemError
            ? error.code
            : typeof error === 'object' && error !== null
                ? error.code
                : undefined;
        const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        return code === 'FileNotFound' || /\b(FileNotFound|ENOENT)\b/i.test(message);
    }
}
exports.QueryConsoleStore = QueryConsoleStore;
//# sourceMappingURL=queryConsoleStore.js.map