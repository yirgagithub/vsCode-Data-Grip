"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractQueryTables = extractQueryTables;
exports.extractQualifiedColumns = extractQualifiedColumns;
exports.outputColumnNames = outputColumnNames;
function extractQueryTables(sql) {
    const tables = new Set();
    const regex = /\b(?:from|join|update|into)\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) {
        tables.add(stripQuotes(match[1]));
    }
    return [...tables];
}
function extractQualifiedColumns(sql) {
    const columns = new Set();
    const regex = /(?:"([^"]+)"|(\b[A-Za-z_][A-Za-z0-9_]*\b))\s*\.\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
        const before = sql.slice(Math.max(0, match.index - 16), match.index);
        if (/\b(from|join|update|into)\s+$/i.test(before)) {
            continue;
        }
        columns.add(`${stripQuotes(match[1] ?? match[2])}.${stripQuotes(match[3] ?? match[4])}`);
    }
    return [...columns];
}
function outputColumnNames(fields) {
    return [...new Set((fields ?? []).map((field) => field.name).filter(Boolean))];
}
function stripQuotes(value) {
    return value.replace(/^"|"$/g, '');
}
//# sourceMappingURL=queryMemoryMetadata.js.map