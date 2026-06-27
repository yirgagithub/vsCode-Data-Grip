"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTableCopyPreview = buildTableCopyPreview;
const sqlDialect_1 = require("./sqlDialect");
function buildTableCopyPreview(sourceSchema, sourceTable, targetSchema, targetTable, columns, rows, sourceLabel, targetLabel, targetDatabaseType = 'postgres') {
    if (!columns.length) {
        throw new Error('No table columns were found to copy.');
    }
    const columnNames = columns.map((column) => column.name);
    const warnings = [
        sourceLabel ? `Source connection: ${sourceLabel}` : undefined,
        targetLabel ? `Target connection: ${targetLabel}` : undefined,
        rows.length === 0 ? 'No data rows were found; only the table structure will be copied.' : undefined,
        rows.length > 5000 ? `Copy preview includes ${rows.length.toLocaleString()} rows.` : undefined
    ].filter(Boolean);
    const ddl = (0, sqlDialect_1.createTableSql)(targetDatabaseType, targetSchema, targetTable, columns);
    const inserts = chunk(rows, 100).map((batch) => (0, sqlDialect_1.insertBatchSql)(targetDatabaseType, targetSchema, targetTable, columnNames, batch));
    return {
        sourceRowCount: rows.length,
        targetSchema,
        targetTable,
        sql: [
            `-- Source table: ${(0, sqlDialect_1.qualifiedSqlName)(targetDatabaseType, sourceSchema, sourceTable)}`,
            `-- Target table: ${(0, sqlDialect_1.qualifiedSqlName)(targetDatabaseType, targetSchema, targetTable)}`,
            ...warnings.map((warning) => `-- ${warning}`),
            '',
            ddl,
            '',
            ...inserts
        ].join('\n'),
        warnings
    };
}
function chunk(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
}
//# sourceMappingURL=tableCopyService.js.map