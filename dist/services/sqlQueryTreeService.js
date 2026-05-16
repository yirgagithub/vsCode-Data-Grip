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
exports.SqlQueryTreeService = void 0;
const vscode = __importStar(require("vscode"));
const sqlSplitter_1 = require("../database/sqlSplitter");
class SqlQueryTreeService {
    getTree(document) {
        const text = document.getText();
        const counter = { value: 0 };
        return (0, sqlSplitter_1.splitSqlStatements)(text).map((statement) => {
            const sql = text.slice(statement.start, statement.end);
            const range = new vscode.Range(document.positionAt(statement.start), document.positionAt(statement.end));
            const index = counter.value;
            counter.value += 1;
            const node = {
                id: this.nodeId(document.uri.toString(), 'statement', statement.start, statement.end),
                index,
                kind: 'statement',
                sql,
                range,
                start: statement.start,
                end: statement.end,
                children: [],
                aliasNames: this.extractAliases(sql)
            };
            node.children = this.parseChildren(document, sql, statement.start, counter);
            return node;
        });
    }
    findNode(document, selection) {
        const roots = this.getTree(document);
        if (!roots.length) {
            return undefined;
        }
        if (!selection.isEmpty) {
            const trimmed = this.trimRange(document, selection);
            if (trimmed.isEmpty) {
                return undefined;
            }
            return this.findSmallestContainingNode(roots, document.offsetAt(trimmed.start), document.offsetAt(trimmed.end));
        }
        const offset = document.offsetAt(selection.active);
        const token = this.wordAt(document.getText(), offset);
        const root = roots.find((node) => offset >= node.start && offset <= node.end);
        if (root && token) {
            const cte = this.findReferencedCte(root, token);
            if (cte) {
                return cte;
            }
        }
        return this.findSmallestContainingNode(roots, offset, offset);
    }
    getRootNodes(document) {
        return this.getTree(document);
    }
    parseChildren(document, text, baseOffset, counter) {
        const children = [];
        let i = 0;
        let single = false;
        let double = false;
        let lineComment = false;
        let blockComment = false;
        let dollarTag;
        while (i < text.length) {
            const char = text[i];
            const next = text[i + 1];
            if (lineComment) {
                if (char === '\n') {
                    lineComment = false;
                }
                i += 1;
                continue;
            }
            if (blockComment) {
                if (char === '*' && next === '/') {
                    blockComment = false;
                    i += 2;
                }
                else {
                    i += 1;
                }
                continue;
            }
            if (dollarTag) {
                if (text.startsWith(dollarTag, i)) {
                    i += dollarTag.length;
                    dollarTag = undefined;
                }
                else {
                    i += 1;
                }
                continue;
            }
            if (single) {
                if (char === "'" && next === "'") {
                    i += 2;
                }
                else if (char === "'") {
                    single = false;
                    i += 1;
                }
                else {
                    i += 1;
                }
                continue;
            }
            if (double) {
                if (char === '"' && next === '"') {
                    i += 2;
                }
                else if (char === '"') {
                    double = false;
                    i += 1;
                }
                else {
                    i += 1;
                }
                continue;
            }
            if (char === '-' && next === '-') {
                lineComment = true;
                i += 2;
                continue;
            }
            if (char === '/' && next === '*') {
                blockComment = true;
                i += 2;
                continue;
            }
            if (char === "'") {
                single = true;
                i += 1;
                continue;
            }
            if (char === '"') {
                double = true;
                i += 1;
                continue;
            }
            if (char === '$') {
                const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
                if (match) {
                    dollarTag = match[0];
                    i += dollarTag.length;
                    continue;
                }
            }
            const withMatch = this.matchWord(text, i, 'with');
            if (withMatch) {
                const parsed = this.parseWithClause(document, text, baseOffset, i, counter);
                if (parsed) {
                    children.push(...parsed.nodes);
                    i = parsed.nextIndex;
                    continue;
                }
            }
            if (char === '(') {
                const close = this.findMatchingParen(text, i);
                if (close > i) {
                    const inner = text.slice(i + 1, close);
                    const trimmed = this.trimBounds(inner, 0, inner.length);
                    if (trimmed) {
                        const innerSql = inner.slice(trimmed.start, trimmed.end);
                        if (this.isQueryStart(innerSql)) {
                            const start = baseOffset + i + 1 + trimmed.start;
                            const end = baseOffset + i + 1 + trimmed.end;
                            const child = {
                                id: this.nodeId(document.uri.toString(), 'subquery', start, end),
                                index: counter.value += 1,
                                kind: 'subquery',
                                sql: innerSql,
                                range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
                                start,
                                end,
                                children: [],
                                aliasNames: this.extractAliases(innerSql)
                            };
                            child.children = this.parseChildren(document, innerSql, start, counter);
                            children.push(child);
                        }
                    }
                    i = close + 1;
                    continue;
                }
            }
            i += 1;
        }
        return children;
    }
    parseWithClause(document, text, baseOffset, withIndex, counter) {
        let i = withIndex + 4;
        i = this.skipWhitespace(text, i);
        if (this.matchWord(text, i, 'recursive')) {
            i += 'recursive'.length;
            i = this.skipWhitespace(text, i);
        }
        const nodes = [];
        while (i < text.length) {
            i = this.skipWhitespace(text, i);
            const nameMatch = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*|"[^"]+"/);
            if (!nameMatch) {
                break;
            }
            const name = this.stripQuotes(nameMatch[0]);
            const nameStart = i;
            i += nameMatch[0].length;
            i = this.skipWhitespace(text, i);
            if (text[i] === '(') {
                const columnsClose = this.findMatchingParen(text, i);
                if (columnsClose > i) {
                    i = columnsClose + 1;
                    i = this.skipWhitespace(text, i);
                }
            }
            if (!this.matchWord(text, i, 'as')) {
                break;
            }
            i += 2;
            i = this.skipWhitespace(text, i);
            if (text[i] !== '(') {
                break;
            }
            const open = i;
            const close = this.findMatchingParen(text, open);
            if (close <= open) {
                break;
            }
            const nodeStart = nameStart;
            const nodeEnd = close + 1;
            const sql = text.slice(nodeStart, nodeEnd);
            const start = baseOffset + nodeStart;
            const end = baseOffset + nodeEnd;
            const node = {
                id: this.nodeId(document.uri.toString(), 'cte', start, end, name),
                index: counter.value += 1,
                kind: 'cte',
                name,
                sql,
                range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
                start,
                end,
                children: [],
                aliasNames: this.extractAliases(sql)
            };
            const body = text.slice(open + 1, close);
            node.children = this.parseChildren(document, body, baseOffset + open + 1, counter);
            nodes.push(node);
            i = close + 1;
            i = this.skipWhitespace(text, i);
            if (text[i] === ',') {
                i += 1;
                continue;
            }
            break;
        }
        return nodes.length ? { nodes, nextIndex: i } : undefined;
    }
    findSmallestContainingNode(nodes, startOffset, endOffset) {
        const flat = this.flatten(nodes).filter((node) => startOffset >= node.start && endOffset <= node.end);
        if (!flat.length) {
            return nodes.find((node) => startOffset >= node.start && endOffset <= node.end);
        }
        flat.sort((a, b) => (a.end - a.start) - (b.end - b.start));
        return flat[0];
    }
    flatten(nodes) {
        const flat = [];
        for (const node of nodes) {
            flat.push(node);
            flat.push(...this.flatten(node.children));
        }
        return flat;
    }
    findReferencedCte(root, token) {
        const tokenLower = token.toLowerCase();
        return this.flatten(root.children).find((node) => node.kind === 'cte' && node.name?.toLowerCase() === tokenLower);
    }
    extractAliases(sql) {
        const aliases = [];
        const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)\s*(?:as\s+)?(?!(?:where|join|left|right|inner|outer|full|cross|on|using|group|order|limit|set)\b)(?:"([^"]+)"|(\w+))?/gi;
        let match;
        while ((match = regex.exec(sql)) !== null) {
            const alias = match[2] ?? match[3];
            if (alias) {
                aliases.push(this.stripQuotes(alias));
            }
        }
        return aliases;
    }
    matchWord(text, index, word) {
        const slice = text.slice(index, index + word.length);
        if (slice.toLowerCase() !== word.toLowerCase()) {
            return false;
        }
        const before = index > 0 ? text[index - 1] : '';
        const after = text[index + word.length] ?? '';
        return !this.isWordChar(before) && !this.isWordChar(after);
    }
    isQueryStart(sql) {
        return /^(with|select|values|insert|update|delete)\b/i.test(sql.trim());
    }
    wordAt(text, offset) {
        let start = offset;
        let end = offset;
        while (start > 0 && this.isWordChar(text[start - 1])) {
            start -= 1;
        }
        while (end < text.length && this.isWordChar(text[end])) {
            end += 1;
        }
        const word = text.slice(start, end).trim();
        return word || undefined;
    }
    findMatchingParen(text, openIndex) {
        let depth = 0;
        let single = false;
        let double = false;
        let lineComment = false;
        let blockComment = false;
        let dollarTag;
        for (let i = openIndex; i < text.length; i += 1) {
            const char = text[i];
            const next = text[i + 1];
            if (lineComment) {
                if (char === '\n') {
                    lineComment = false;
                }
                continue;
            }
            if (blockComment) {
                if (char === '*' && next === '/') {
                    blockComment = false;
                    i += 1;
                }
                continue;
            }
            if (dollarTag) {
                if (text.startsWith(dollarTag, i)) {
                    i += dollarTag.length - 1;
                    dollarTag = undefined;
                }
                continue;
            }
            if (single) {
                if (char === "'" && next === "'") {
                    i += 1;
                }
                else if (char === "'") {
                    single = false;
                }
                continue;
            }
            if (double) {
                if (char === '"' && next === '"') {
                    i += 1;
                }
                else if (char === '"') {
                    double = false;
                }
                continue;
            }
            if (char === '-' && next === '-') {
                lineComment = true;
                i += 1;
                continue;
            }
            if (char === '/' && next === '*') {
                blockComment = true;
                i += 1;
                continue;
            }
            if (char === "'") {
                single = true;
                continue;
            }
            if (char === '"') {
                double = true;
                continue;
            }
            if (char === '$') {
                const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
                if (match) {
                    dollarTag = match[0];
                    i += dollarTag.length - 1;
                    continue;
                }
            }
            if (char === '(') {
                depth += 1;
            }
            else if (char === ')') {
                depth -= 1;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    }
    trimBounds(text, start, end) {
        let nextStart = start;
        let nextEnd = end;
        while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
            nextStart += 1;
        }
        while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
            nextEnd -= 1;
        }
        return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : undefined;
    }
    trimRange(document, range) {
        const text = document.getText(range);
        const trimmed = this.trimBounds(text, 0, text.length);
        if (!trimmed) {
            return new vscode.Range(range.start, range.start);
        }
        const base = document.offsetAt(range.start);
        return new vscode.Range(document.positionAt(base + trimmed.start), document.positionAt(base + trimmed.end));
    }
    skipWhitespace(text, index) {
        let i = index;
        while (i < text.length && /\s/.test(text[i])) {
            i += 1;
        }
        return i;
    }
    isWordChar(char) {
        return !!char && /[A-Za-z0-9_]/.test(char);
    }
    stripQuotes(value) {
        return value.replace(/^"|"$/g, '');
    }
    nodeId(documentUri, kind, start, end, name) {
        return `${documentUri}:${kind}:${start}-${end}${name ? `:${name}` : ''}`;
    }
}
exports.SqlQueryTreeService = SqlQueryTreeService;
//# sourceMappingURL=sqlQueryTreeService.js.map