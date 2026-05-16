"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatValue = formatValue;
exports.rowsToTsv = rowsToTsv;
exports.rowsToCsv = rowsToCsv;
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
function csv(value) {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
//# sourceMappingURL=format.js.map