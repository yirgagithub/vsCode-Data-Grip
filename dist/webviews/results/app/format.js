"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatValue = formatValue;
exports.rowsToTsv = rowsToTsv;
exports.rowsToCsv = rowsToCsv;
exports.rowsToMarkdown = rowsToMarkdown;
exports.rowsToInsertSql = rowsToInsertSql;
const sqlDialect_1 = require("../../../services/sqlDialect");
function formatValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}
function rowsToTsv(rows) {
    if (!rows.length) {
        return '';
    }
    const columns = Object.keys(rows[0]);
    return [columns.join('\t'), ...rows.map((row) => columns.map((column) => formatValue(row[column])).join('\t'))].join('\n');
}
function rowsToCsv(rows) {
    if (!rows.length) {
        return '';
    }
    const columns = Object.keys(rows[0]);
    return [columns.join(','), ...rows.map((row) => columns.map((column) => csv(formatValue(row[column]))).join(','))].join('\n');
}
function rowsToMarkdown(rows) {
    if (!rows.length) {
        return '';
    }
    const columns = Object.keys(rows[0]);
    const header = `| ${columns.map(escapeMarkdownCell).join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${columns.map((column) => escapeMarkdownCell(formatValue(row[column]))).join(' | ')} |`);
    return [header, separator, ...body].join('\n');
}
function rowsToInsertSql(rows, schema, table, databaseType = 'postgres') {
    if (!rows.length) {
        return '';
    }
    const columns = Object.keys(rows[0]);
    return (0, sqlDialect_1.insertBatchSql)(databaseType, schema, table, columns, rows);
}
function csv(value) {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function escapeMarkdownCell(value) {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
//# sourceMappingURL=format.js.map