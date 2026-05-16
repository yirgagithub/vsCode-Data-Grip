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
exports.SqlSectionService = void 0;
const vscode = __importStar(require("vscode"));
const sqlQueryTreeService_1 = require("./sqlQueryTreeService");
class SqlSectionService {
    treeService = new sqlQueryTreeService_1.SqlQueryTreeService();
    getSections(document) {
        return this.treeService.getRootNodes(document).map((node) => this.toSection(node));
    }
    getTree(document) {
        return this.treeService.getTree(document).map((node) => this.toSection(node));
    }
    detect(document, selection) {
        const node = this.treeService.findNode(document, selection);
        return node ? this.toSection(node) : undefined;
    }
    detectExecutable(document, selection) {
        const node = this.treeService.findExecutableNode(document, selection);
        return node ? this.toSection(node) : undefined;
    }
    getSyntaxIssues(document) {
        return this.treeService.getSyntaxIssues(document).map((issue) => new vscode.Diagnostic(issue.range, issue.message, vscode.DiagnosticSeverity.Error));
    }
    outline(document) {
        return this.getSections(document).map((section) => new vscode.SymbolInformation(section.kind === 'cte' && section.name ? `CTE ${section.name}` : `SQL section ${section.index + 1}`, vscode.SymbolKind.Function, section.sql.replace(/\s+/g, ' ').slice(0, 80), new vscode.Location(document.uri, section.range)));
    }
    extractAliases(sql) {
        const aliases = [];
        const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)\s*(?:as\s+)?(?!(?:where|join|left|right|inner|outer|full|cross|on|using|group|order|limit|set)\b)(?:"([^"]+)"|(\w+))?/gi;
        let match;
        while ((match = regex.exec(sql)) !== null) {
            const [schema, table] = splitQualified(match[1]);
            const alias = stripQuotes(match[2] ?? match[3] ?? table);
            aliases.push({ alias, schema, table });
        }
        return aliases;
    }
    extractTables(sql) {
        return this.extractAliases(sql).map(({ schema, table }) => ({ schema, table }));
    }
    toSection(node) {
        return {
            ...node,
            aliases: this.extractAliases(node.sql),
            tables: this.extractTables(node.sql)
        };
    }
}
exports.SqlSectionService = SqlSectionService;
function splitQualified(value) {
    const parts = value.split('.').map(stripQuotes);
    return parts.length > 1 ? [parts[0], parts[1]] : [undefined, parts[0]];
}
function stripQuotes(value) {
    return value.replace(/^"|"$/g, '');
}
//# sourceMappingURL=sqlSectionService.js.map