"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSqlParameters = findSqlParameters;
exports.hasSqlParameters = hasSqlParameters;
exports.uniqueSqlParameterNames = uniqueSqlParameterNames;
exports.applySqlParameterValues = applySqlParameterValues;
exports.sqlParameterSpansContain = sqlParameterSpansContain;
function findSqlParameters(sql) {
    const parameters = [];
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
        const brace = readBraceParameter(sql, index, single);
        if (brace) {
            parameters.push(brace);
            index = brace.end;
            continue;
        }
        const colon = readColonParameter(sql, index, single);
        if (colon) {
            parameters.push(colon);
            index = colon.end;
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
        index += 1;
    }
    return parameters;
}
function hasSqlParameters(sql) {
    return findSqlParameters(sql).length > 0;
}
function uniqueSqlParameterNames(parameters) {
    const names = [];
    const seen = new Set();
    for (const parameter of parameters) {
        if (!seen.has(parameter.name)) {
            seen.add(parameter.name);
            names.push(parameter.name);
        }
    }
    return names;
}
function applySqlParameterValues(sql, values) {
    const parameters = findSqlParameters(sql);
    let nextSql = sql;
    for (const parameter of [...parameters].reverse()) {
        if (!(parameter.name in values)) {
            throw new Error(`Missing SQL parameter value for ${parameter.name}.`);
        }
        const replacement = sqlParameterReplacement(values[parameter.name], parameter.inSingleQuotedString);
        nextSql = `${nextSql.slice(0, parameter.start)}${replacement}${nextSql.slice(parameter.end)}`;
    }
    return nextSql;
}
function sqlParameterSpansContain(parameters, start, end = start + 1) {
    return parameters.some((parameter) => start >= parameter.start && end <= parameter.end);
}
function readBraceParameter(sql, start, inSingleQuotedString) {
    if (sql[start] !== '{') {
        return undefined;
    }
    const match = sql.slice(start).match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}/);
    if (!match) {
        return undefined;
    }
    return {
        name: match[1],
        placeholder: match[0],
        kind: 'brace',
        start,
        end: start + match[0].length,
        inSingleQuotedString
    };
}
function readColonParameter(sql, start, inSingleQuotedString) {
    if (sql[start] !== ':' || sql[start - 1] === ':' || !isIdentifierStart(sql[start + 1])) {
        return undefined;
    }
    let end = start + 2;
    while (isIdentifierPart(sql[end])) {
        end += 1;
    }
    const name = sql.slice(start + 1, end);
    return {
        name,
        placeholder: sql.slice(start, end),
        kind: 'colon',
        start,
        end,
        inSingleQuotedString
    };
}
function sqlParameterReplacement(value, inSingleQuotedString) {
    if (inSingleQuotedString) {
        return escapeSingleQuotedSql(value);
    }
    const trimmed = value.trim();
    if (/^sql:/i.test(trimmed)) {
        return trimmed.slice(4).trim();
    }
    if (/^null$/i.test(trimmed)) {
        return 'NULL';
    }
    if (/^(true|false)$/i.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
        return trimmed;
    }
    if (isSingleQuotedSqlLiteral(trimmed)) {
        return trimmed;
    }
    return `'${escapeSingleQuotedSql(value)}'`;
}
function isSingleQuotedSqlLiteral(value) {
    if (!value.startsWith('\'') || !value.endsWith('\'') || value.length < 2) {
        return false;
    }
    for (let index = 1; index < value.length - 1; index += 1) {
        if (value[index] === '\'' && value[index + 1] !== '\'') {
            return false;
        }
        if (value[index] === '\'' && value[index + 1] === '\'') {
            index += 1;
        }
    }
    return true;
}
function escapeSingleQuotedSql(value) {
    return value.replace(/'/g, '\'\'');
}
function isIdentifierStart(char) {
    return !!char && /[A-Za-z_]/.test(char);
}
function isIdentifierPart(char) {
    return !!char && /[A-Za-z0-9_]/.test(char);
}
//# sourceMappingURL=sqlParameters.js.map