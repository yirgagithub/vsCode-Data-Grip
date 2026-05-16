"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitSqlStatements = splitSqlStatements;
function splitSqlStatements(text) {
    const statements = [];
    let start = 0;
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
        if (char === ';') {
            const bounds = trimmedBounds(text, start, i);
            if (bounds) {
                statements.push({ sql: text.slice(bounds.start, bounds.end), start: bounds.start, end: bounds.end });
            }
            start = i + 1;
        }
        i += 1;
    }
    const bounds = trimmedBounds(text, start, text.length);
    if (bounds) {
        statements.push({ sql: text.slice(bounds.start, bounds.end), start: bounds.start, end: bounds.end });
    }
    return statements;
}
function trimmedBounds(text, start, end) {
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
//# sourceMappingURL=sqlSplitter.js.map