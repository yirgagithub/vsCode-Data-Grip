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
exports.SqlDiagnosticsService = exports.SQL_METADATA_MISSING_COLUMN = exports.SQL_METADATA_MISSING_RELATION = exports.SQL_METADATA_DIAGNOSTIC_SOURCE = exports.SQL_GROUP_BY_DIAGNOSTIC_CODE = exports.SQL_GROUP_BY_DIAGNOSTIC_SOURCE = void 0;
const vscode = __importStar(require("vscode"));
const sqlParameters_1 = require("./sqlParameters");
const sqlGroupByError_1 = require("./sqlGroupByError");
exports.SQL_GROUP_BY_DIAGNOSTIC_SOURCE = 'QueryDeck planner';
exports.SQL_GROUP_BY_DIAGNOSTIC_CODE = 'querydeck.planner.groupBy';
const SQL_COLUMN_CONTEXT_KEYWORDS = new Set([
    'all',
    'and',
    'as',
    'asc',
    'between',
    'by',
    'case',
    'cast',
    'date',
    'desc',
    'distinct',
    'else',
    'end',
    'false',
    'from',
    'group',
    'having',
    'in',
    'is',
    'like',
    'limit',
    'not',
    'null',
    'or',
    'order',
    'select',
    'then',
    'true',
    'when',
    'where'
]);
exports.SQL_METADATA_DIAGNOSTIC_SOURCE = 'QueryDeck metadata';
exports.SQL_METADATA_MISSING_RELATION = 'querydeck.metadata.missingRelation';
exports.SQL_METADATA_MISSING_COLUMN = 'querydeck.metadata.missingColumn';
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
        const scriptRelations = this.collectCreatedRelationNames(document);
        diagnostics.push(...await this.getSchemaDiagnostics(document, connection, scriptRelations));
        if (this.connectionManager.isConnected(connection.id)) {
            const executable = selection
                ? this.sectionService.detectExecutable(document, selection)
                : this.sectionService.getSections(document)[0];
            if (executable?.sql.trim() && !(0, sqlParameters_1.hasSqlParameters)(executable.sql)) {
                const plannerDiagnostic = await this.getPlannerDiagnostic(document, connection, executable, scriptRelations);
                if (plannerDiagnostic) {
                    diagnostics.push(plannerDiagnostic);
                }
            }
        }
        return diagnostics;
    }
    async getSchemaDiagnostics(document, connection, scriptRelations) {
        const diagnostics = [];
        const defaultSchema = connection.defaultSchema ?? 'public';
        const entry = await this.schemaContext.getCachedForConnection(connection, defaultSchema);
        if (!entry || entry.status !== 'ready') {
            if (this.connectionManager.isConnected(connection.id)) {
                this.schemaContext.refreshDefaultSchemaInBackground(connection);
            }
            return diagnostics;
        }
        const knownRelations = new Set([...entry.tables, ...entry.views].map((item) => this.relationKey(item.schema, item.name)));
        const cteNames = this.collectCteNames(this.sectionService.getTree(document));
        for (const section of this.sectionService.getSections(document)) {
            for (const alias of section.aliases) {
                if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
                    continue;
                }
                const schema = alias.schema ?? defaultSchema;
                if (!knownRelations.has(this.relationKey(schema, alias.table))) {
                    diagnostics.push(this.metadataDiagnostic(this.findIdentifierRange(document, section, alias.schema ? `${alias.schema}.${alias.table}` : alias.table), `Table or view "${alias.schema ? `${alias.schema}.` : ''}${alias.table}" does not exist in ${schema}.`, exports.SQL_METADATA_MISSING_RELATION, schema));
                }
            }
            diagnostics.push(...await this.getColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
        }
        return diagnostics;
    }
    async getColumnDiagnostics(document, connection, section, cteNames, scriptRelations) {
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
            if (!alias || cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
                continue;
            }
            const key = `${alias.schema ?? defaultSchema}.${alias.table}.${column}`.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const columns = await this.schemaContext.getCachedColumns(connection, alias.schema ?? defaultSchema, alias.table);
            if (!columns) {
                if (this.connectionManager.isConnected(connection.id)) {
                    this.schemaContext.refreshSchemaInBackground(connection, alias.schema ?? defaultSchema);
                }
                continue;
            }
            if (!columns.some((item) => item.name.toLowerCase() === column.toLowerCase())) {
                const start = section.start + match.index + match[0].lastIndexOf(column);
                diagnostics.push(this.metadataDiagnostic(new vscode.Range(document.positionAt(start), document.positionAt(start + column.length)), `Column "${column}" does not exist on ${alias.schema ? `${alias.schema}.` : ''}${alias.table}.`, exports.SQL_METADATA_MISSING_COLUMN, alias.schema ?? defaultSchema));
            }
        }
        diagnostics.push(...await this.getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations));
        return diagnostics;
    }
    async getUnqualifiedColumnDiagnostics(document, connection, section, cteNames, scriptRelations) {
        const defaultSchema = connection.defaultSchema ?? 'public';
        const relationKeys = new Map();
        for (const alias of section.aliases) {
            if (cteNames.has(alias.table.toLowerCase()) || this.isScriptRelation(alias, scriptRelations)) {
                continue;
            }
            const schema = alias.schema ?? defaultSchema;
            relationKeys.set(this.relationKey(schema, alias.table), { schema, table: alias.table });
        }
        const [relation] = [...relationKeys.values()];
        if (!relation || relationKeys.size !== 1) {
            return [];
        }
        const columns = await this.schemaContext.getCachedColumns(connection, relation.schema, relation.table);
        if (!columns) {
            if (this.connectionManager.isConnected(connection.id)) {
                this.schemaContext.refreshSchemaInBackground(connection, relation.schema);
            }
            return [];
        }
        const columnNames = new Set(columns.map((column) => column.name.toLowerCase()));
        const ignored = this.unqualifiedColumnIgnoreSet(section, columns, defaultSchema);
        const parameters = (0, sqlParameters_1.findSqlParameters)(section.sql);
        const diagnostics = [];
        const seen = new Set();
        for (const [spanStart, spanEnd] of this.columnExpressionSpans(section.sql)) {
            const text = section.sql.slice(spanStart, spanEnd);
            const regex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const token = match[0];
                const tokenStart = spanStart + match.index;
                const lower = token.toLowerCase();
                if (columnNames.has(lower)
                    || ignored.has(lower)
                    || this.isInsideSingleQuotedLiteral(section.sql, tokenStart)
                    || this.isInLineComment(section.sql, tokenStart)
                    || (0, sqlParameters_1.sqlParameterSpansContain)(parameters, tokenStart, tokenStart + token.length)
                    || this.isQualifiedIdentifierPart(section.sql, tokenStart, token.length)
                    || this.isTypeCastName(section.sql, tokenStart)
                    || this.isFunctionName(section.sql, tokenStart + token.length)
                    || this.isAliasDeclaration(section.sql, tokenStart)) {
                    continue;
                }
                const key = `${lower}:${tokenStart}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                diagnostics.push(this.metadataDiagnostic(new vscode.Range(document.positionAt(section.start + tokenStart), document.positionAt(section.start + tokenStart + token.length)), `Column "${token}" does not exist on ${relation.schema}.${relation.table}.`, exports.SQL_METADATA_MISSING_COLUMN, relation.schema));
            }
        }
        return diagnostics;
    }
    async getPlannerDiagnostic(document, connection, section, scriptRelations) {
        if (section.aliases.some((alias) => this.isScriptRelation(alias, scriptRelations))) {
            return undefined;
        }
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
        const diagnostic = new vscode.Diagnostic(this.errorRange(document, section, result.error), this.errorMessage(result.error), vscode.DiagnosticSeverity.Error);
        const groupBy = (0, sqlGroupByError_1.normalizeGroupByError)(connection.type, result.error);
        if (groupBy) {
            diagnostic.source = exports.SQL_GROUP_BY_DIAGNOSTIC_SOURCE;
            diagnostic.code = `${exports.SQL_GROUP_BY_DIAGNOSTIC_CODE}:${encodeURIComponent(groupBy.expression)}`;
        }
        return diagnostic;
    }
    metadataDiagnostic(range, message, kind, schema) {
        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = exports.SQL_METADATA_DIAGNOSTIC_SOURCE;
        diagnostic.code = `${kind}:${schema}`;
        return diagnostic;
    }
    findIdentifierRange(document, section, identifier) {
        const index = section.sql.toLowerCase().indexOf(identifier.toLowerCase());
        const start = section.start + Math.max(0, index);
        return new vscode.Range(document.positionAt(start), document.positionAt(start + identifier.length));
    }
    collectCreatedRelationNames(document) {
        const relations = new Set();
        const regex = /\bcreate\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
        const text = document.getText();
        let match;
        while ((match = regex.exec(text)) !== null) {
            const [schema, table] = this.splitQualified(match[1]);
            relations.add(table.toLowerCase());
            if (schema) {
                relations.add(this.relationKey(schema, table));
            }
        }
        return relations;
    }
    isScriptRelation(alias, scriptRelations) {
        if (scriptRelations.has(alias.table.toLowerCase())) {
            return !alias.schema || alias.schema.toLowerCase() === 'pg_temp';
        }
        return alias.schema ? scriptRelations.has(this.relationKey(alias.schema, alias.table)) : false;
    }
    splitQualified(value) {
        const parts = value.split('.').map((part) => part.replace(/^"|"$/g, ''));
        return parts.length > 1 ? [parts[0], parts[1]] : [undefined, parts[0]];
    }
    errorRange(document, section, error) {
        const messageRange = this.errorIdentifierRange(document, section, error);
        if (messageRange) {
            return messageRange;
        }
        const offset = Number(error.position);
        if (Number.isFinite(offset) && offset > 0) {
            const explainPrefixLength = 'explain '.length;
            const relative = Math.max(0, offset - 1 - explainPrefixLength);
            const start = Math.min(section.end, section.start + relative);
            return this.expandIdentifierRange(document, section, start);
        }
        return section.range;
    }
    errorIdentifierRange(document, section, error) {
        const column = error.message.match(/\bcolumn\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+does not exist/i)?.[1];
        if (!column) {
            return undefined;
        }
        const regex = new RegExp(`\\b${escapeRegExp(column)}\\b`, 'i');
        const match = regex.exec(section.sql);
        if (!match) {
            return undefined;
        }
        const start = section.start + match.index;
        return new vscode.Range(document.positionAt(start), document.positionAt(start + column.length));
    }
    expandIdentifierRange(document, section, absoluteStart) {
        const sql = section.sql;
        const relative = Math.max(0, Math.min(sql.length, absoluteStart - section.start));
        let start = relative;
        let end = relative;
        while (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1])) {
            start -= 1;
        }
        while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
            end += 1;
        }
        if (start === end) {
            end = Math.min(sql.length, end + 1);
        }
        return new vscode.Range(document.positionAt(section.start + start), document.positionAt(section.start + end));
    }
    errorMessage(error) {
        return [error.message, error.detail, error.hint].filter(Boolean).join('\n');
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
    unqualifiedColumnIgnoreSet(section, columns, defaultSchema) {
        const ignored = new Set(SQL_COLUMN_CONTEXT_KEYWORDS);
        for (const alias of section.aliases) {
            ignored.add(alias.alias.toLowerCase());
            ignored.add(alias.table.toLowerCase());
            ignored.add((alias.schema ?? defaultSchema).toLowerCase());
        }
        for (const column of columns) {
            ignored.add(column.dataType.toLowerCase());
        }
        for (const alias of this.outputAliases(section.sql)) {
            ignored.add(alias.toLowerCase());
        }
        return ignored;
    }
    columnExpressionSpans(sql) {
        const spans = [];
        const select = /\bselect\b/i.exec(sql);
        const from = /\bfrom\b/i.exec(sql);
        if (select && from && from.index > select.index) {
            spans.push([select.index + select[0].length, from.index]);
        }
        for (const regex of [/\bwhere\b/gi, /\bhaving\b/gi, /\bgroup\s+by\b/gi, /\border\s+by\b/gi]) {
            for (const match of sql.matchAll(regex)) {
                if (match.index === undefined) {
                    continue;
                }
                const start = match.index + match[0].length;
                spans.push([start, this.nextClauseIndex(sql, start)]);
            }
        }
        return spans;
    }
    nextClauseIndex(sql, start) {
        const match = /\b(?:where|group\s+by|order\s+by|having|limit|union|intersect|except)\b/i.exec(sql.slice(start));
        return match?.index === undefined ? sql.length : start + match.index;
    }
    isQualifiedIdentifierPart(sql, start, length) {
        return sql.slice(0, start).trimEnd().endsWith('.') || sql.slice(start + length).trimStart().startsWith('.');
    }
    isTypeCastName(sql, start) {
        return sql.slice(0, start).trimEnd().endsWith('::');
    }
    isFunctionName(sql, end) {
        return sql.slice(end).trimStart().startsWith('(');
    }
    isAliasDeclaration(sql, start) {
        return /\bas\s+$/i.test(sql.slice(0, start));
    }
    outputAliases(sql) {
        const select = /\bselect\b/i.exec(sql);
        const from = /\bfrom\b/i.exec(sql);
        if (!select || !from || from.index <= select.index) {
            return [];
        }
        return [...sql.slice(select.index + select[0].length, from.index).matchAll(/\bas\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)]
            .map((match) => match[1] ?? match[2])
            .filter((alias) => Boolean(alias));
    }
    isInsideSingleQuotedLiteral(sql, start) {
        let inside = false;
        for (let index = 0; index < start; index += 1) {
            if (sql[index] !== '\'') {
                continue;
            }
            if (sql[index + 1] === '\'') {
                index += 1;
                continue;
            }
            inside = !inside;
        }
        return inside;
    }
    isInLineComment(sql, start) {
        const lineStart = sql.lastIndexOf('\n', start - 1) + 1;
        const commentStart = sql.indexOf('--', lineStart);
        return commentStart >= 0 && commentStart < start;
    }
}
exports.SqlDiagnosticsService = SqlDiagnosticsService;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=sqlDiagnosticsService.js.map