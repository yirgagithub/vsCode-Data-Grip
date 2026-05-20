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
exports.SqlDiagnosticsService = void 0;
const vscode = __importStar(require("vscode"));
class SqlDiagnosticsService {
    connectionManager;
    schemaContext;
    sectionService;
    constructor(connectionManager, schemaContext, sectionService) {
        this.connectionManager = connectionManager;
        this.schemaContext = schemaContext;
        this.sectionService = sectionService;
    }
    async getDiagnostics(document, selection, connectionOverride) {
        const diagnostics = [...this.sectionService.getSyntaxIssues(document)];
        const connection = connectionOverride === undefined ? this.connectionManager.getPreferredConnection() : connectionOverride;
        if (!connection) {
            return diagnostics;
        }
        diagnostics.push(...await this.getSchemaDiagnostics(document, connection));
        if (this.connectionManager.isConnected(connection.id)) {
            const executable = selection
                ? this.sectionService.detectExecutable(document, selection)
                : this.sectionService.getSections(document)[0];
            if (executable?.sql.trim()) {
                const plannerDiagnostic = await this.getPlannerDiagnostic(document, connection, executable);
                if (plannerDiagnostic) {
                    diagnostics.push(plannerDiagnostic);
                }
            }
        }
        return diagnostics;
    }
    async getSchemaDiagnostics(document, connection) {
        const diagnostics = [];
        const defaultSchema = connection.defaultSchema ?? 'public';
        const entry = this.connectionManager.isConnected(connection.id)
            ? await this.schemaContext.loadDefaultSchema(connection)
            : this.schemaContext.getCached(connection.id, defaultSchema);
        if (!entry || entry.status !== 'ready') {
            return diagnostics;
        }
        const knownRelations = new Set([...entry.tables, ...entry.views].map((item) => this.relationKey(item.schema, item.name)));
        const cteNames = this.collectCteNames(this.sectionService.getTree(document));
        for (const section of this.sectionService.getSections(document)) {
            for (const alias of section.aliases) {
                if (cteNames.has(alias.table.toLowerCase())) {
                    continue;
                }
                const schema = alias.schema ?? defaultSchema;
                if (!knownRelations.has(this.relationKey(schema, alias.table))) {
                    diagnostics.push(new vscode.Diagnostic(this.findIdentifierRange(document, section, alias.schema ? `${alias.schema}.${alias.table}` : alias.table), `Table or view "${alias.schema ? `${alias.schema}.` : ''}${alias.table}" does not exist in ${schema}.`, vscode.DiagnosticSeverity.Error));
                }
            }
            diagnostics.push(...await this.getColumnDiagnostics(document, connection, section, cteNames));
        }
        return diagnostics;
    }
    async getColumnDiagnostics(document, connection, section, cteNames) {
        const diagnostics = [];
        const defaultSchema = connection.defaultSchema ?? 'public';
        const aliases = new Map(section.aliases.map((alias) => [alias.alias.toLowerCase(), alias]));
        const seen = new Set();
        const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
        let match;
        while ((match = regex.exec(section.sql)) !== null) {
            const qualifier = match[1] ?? match[2];
            const column = match[3] ?? match[4];
            const alias = aliases.get(qualifier.toLowerCase());
            if (!alias || cteNames.has(alias.table.toLowerCase())) {
                continue;
            }
            const key = `${alias.schema ?? defaultSchema}.${alias.table}.${column}`.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const columns = await this.tryGetColumns(connection, alias.schema ?? defaultSchema, alias.table);
            if (!columns) {
                continue;
            }
            if (!columns.some((item) => item.name.toLowerCase() === column.toLowerCase())) {
                const start = section.start + match.index + match[0].lastIndexOf(column);
                diagnostics.push(new vscode.Diagnostic(new vscode.Range(document.positionAt(start), document.positionAt(start + column.length)), `Column "${column}" does not exist on ${alias.schema ? `${alias.schema}.` : ''}${alias.table}.`, vscode.DiagnosticSeverity.Error));
            }
        }
        return diagnostics;
    }
    async getPlannerDiagnostic(document, connection, section) {
        let result;
        try {
            result = await this.connectionManager.getDriver(connection.type).validateQuery({
                connectionId: connection.id,
                sql: section.sql
            });
        }
        catch {
            return undefined;
        }
        if (result.ok || !result.error) {
            return undefined;
        }
        return new vscode.Diagnostic(this.errorRange(document, section, result.error), this.errorMessage(result.error), vscode.DiagnosticSeverity.Error);
    }
    findIdentifierRange(document, section, identifier) {
        const index = section.sql.toLowerCase().indexOf(identifier.toLowerCase());
        const start = section.start + Math.max(0, index);
        return new vscode.Range(document.positionAt(start), document.positionAt(start + identifier.length));
    }
    errorRange(document, section, error) {
        const offset = Number(error.position);
        if (Number.isFinite(offset) && offset > 0) {
            const explainPrefixLength = 'explain '.length;
            const relative = Math.max(0, offset - 1 - explainPrefixLength);
            const start = Math.min(section.end, section.start + relative);
            return new vscode.Range(document.positionAt(start), document.positionAt(Math.min(section.end, start + 1)));
        }
        return section.range;
    }
    errorMessage(error) {
        return [error.message, error.detail, error.hint].filter(Boolean).join('\n');
    }
    async tryGetColumns(connection, schema, table) {
        try {
            return await this.schemaContext.getColumns(connection, schema, table);
        }
        catch {
            return undefined;
        }
    }
    relationKey(schema, table) {
        return `${schema}.${table}`.toLowerCase();
    }
    collectCteNames(sections) {
        const names = new Set();
        const visit = (section) => {
            if (section.kind === 'cte' && section.name) {
                names.add(section.name.toLowerCase());
            }
            for (const child of section.children) {
                if (child.kind === 'cte' && child.name) {
                    names.add(child.name.toLowerCase());
                }
                visit({ ...child, aliases: [], tables: [] });
            }
        };
        for (const section of sections) {
            visit(section);
        }
        return names;
    }
}
exports.SqlDiagnosticsService = SqlDiagnosticsService;
//# sourceMappingURL=sqlDiagnosticsService.js.map