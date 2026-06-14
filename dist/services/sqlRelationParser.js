"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSqlAliases = extractSqlAliases;
const RELATION_KEYWORDS = new Set(['from', 'join', 'update', 'into']);
const ALIAS_BOUNDARIES = new Set([
    'where',
    'join',
    'left',
    'right',
    'inner',
    'outer',
    'full',
    'cross',
    'on',
    'using',
    'group',
    'order',
    'limit',
    'set',
    'values',
    'returning',
    'union',
    'intersect',
    'except'
]);
function extractSqlAliases(sql) {
    const aliases = [];
    let depth = 0;
    let single = false;
    let double = false;
    let lineComment = false;
    let blockComment = false;
    let dollarTag;
    for (let index = 0; index < sql.length;) {
        const char = sql[index];
        const next = sql[index + 1];
        if (lineComment) {
            lineComment = char !== '\n';
            index += 1;
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                index += 2;
            }
            else {
                index += 1;
            }
            continue;
        }
        if (dollarTag) {
            if (sql.startsWith(dollarTag, index)) {
                index += dollarTag.length;
                dollarTag = undefined;
            }
            else {
                index += 1;
            }
            continue;
        }
        if (single) {
            if (char === '\'' && next === '\'') {
                index += 2;
            }
            else {
                single = char !== '\'';
                index += 1;
            }
            continue;
        }
        if (double) {
            if (char === '"' && next === '"') {
                index += 2;
            }
            else {
                double = char !== '"';
                index += 1;
            }
            continue;
        }
        if (char === '-' && next === '-') {
            lineComment = true;
            index += 2;
            continue;
        }
        if (char === '/' && next === '*') {
            blockComment = true;
            index += 2;
            continue;
        }
        if (char === '\'') {
            single = true;
            index += 1;
            continue;
        }
        if (char === '"') {
            double = true;
            index += 1;
            continue;
        }
        if (char === '$') {
            const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
            if (tag) {
                dollarTag = tag;
                index += tag.length;
                continue;
            }
        }
        if (char === '(') {
            depth += 1;
            index += 1;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            index += 1;
            continue;
        }
        if (depth === 0 && isIdentifierStart(char)) {
            const word = readIdentifierWord(sql, index);
            if (word && RELATION_KEYWORDS.has(word.value.toLowerCase())) {
                const parsed = readRelationAlias(sql, word.end);
                if (parsed) {
                    aliases.push(parsed.alias);
                    index = parsed.end;
                    continue;
                }
            }
            index = word?.end ?? index + 1;
            continue;
        }
        index += 1;
    }
    return aliases;
}
function readRelationAlias(sql, start) {
    let index = skipWhitespace(sql, start);
    const relation = readQualifiedIdentifier(sql, index);
    if (!relation) {
        return undefined;
    }
    index = relation.end;
    let aliasIndex = skipWhitespace(sql, index);
    const maybeAs = readIdentifierWord(sql, aliasIndex);
    if (maybeAs?.value.toLowerCase() === 'as') {
        aliasIndex = skipWhitespace(sql, maybeAs.end);
    }
    const aliasToken = readIdentifier(sql, aliasIndex);
    const boundary = aliasToken ? ALIAS_BOUNDARIES.has(aliasToken.value.toLowerCase()) : true;
    if (aliasToken && !boundary) {
        return {
            alias: {
                alias: aliasToken.value,
                schema: relation.schema,
                table: relation.table,
                explicitAlias: true
            },
            end: aliasToken.end
        };
    }
    return {
        alias: {
            alias: relation.table,
            schema: relation.schema,
            table: relation.table,
            explicitAlias: false
        },
        end: index
    };
}
function readQualifiedIdentifier(sql, start) {
    const first = readIdentifier(sql, start);
    if (!first) {
        return undefined;
    }
    let end = first.end;
    if (sql[end] !== '.') {
        return { table: first.value, end };
    }
    const second = readIdentifier(sql, end + 1);
    if (!second) {
        return { table: first.value, end };
    }
    end = second.end;
    return { schema: first.value, table: second.value, end };
}
function readIdentifier(sql, start) {
    if (sql[start] === '"') {
        let value = '';
        for (let index = start + 1; index < sql.length; index += 1) {
            if (sql[index] === '"' && sql[index + 1] === '"') {
                value += '"';
                index += 1;
                continue;
            }
            if (sql[index] === '"') {
                return { value, end: index + 1 };
            }
            value += sql[index];
        }
        return undefined;
    }
    return readIdentifierWord(sql, start);
}
function readIdentifierWord(sql, start) {
    if (!isIdentifierStart(sql[start])) {
        return undefined;
    }
    let end = start + 1;
    while (isIdentifierPart(sql[end])) {
        end += 1;
    }
    return { value: sql.slice(start, end), end };
}
function skipWhitespace(sql, start) {
    let index = start;
    while (/\s/.test(sql[index] ?? '')) {
        index += 1;
    }
    return index;
}
function isIdentifierStart(char) {
    return !!char && /[A-Za-z_]/.test(char);
}
function isIdentifierPart(char) {
    return !!char && /[A-Za-z0-9_]/.test(char);
}
//# sourceMappingURL=sqlRelationParser.js.map