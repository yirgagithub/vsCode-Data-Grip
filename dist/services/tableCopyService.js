"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTableCopyPreview = buildTableCopyPreview;
const identifiers_1 = require("../utils/identifiers");
function buildTableCopyPreview(sourceSchema, sourceTable, targetSchema, targetTable, columns, rows, sourceLabel, targetLabel) {
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
    const ddl = buildCreateTableSql(targetSchema, targetTable, columns);
    const inserts = chunk(rows, 100).map((batch) => buildInsertBatch(targetSchema, targetTable, columnNames, batch));
    return {
        sourceRowCount: rows.length,
        targetSchema,
        targetTable,
        sql: [
            `-- Source table: ${(0, identifiers_1.qualifiedName)(sourceSchema, sourceTable)}`,
            `-- Target table: ${(0, identifiers_1.qualifiedName)(targetSchema, targetTable)}`,
            ...warnings.map((warning) => `-- ${warning}`),
            '',
            ddl,
            '',
            ...inserts
        ].join('\n'),
        warnings
    };
}
function buildCreateTableSql(schema, table, columns) {
    const lines = columns.map((column) => {
        const nullable = column.nullable ? '' : ' not null';
        const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : '';
        return `  ${(0, identifiers_1.quoteIdentifier)(column.name)} ${column.dataType}${defaultValue}${nullable}`;
    });
    return `create table ${(0, identifiers_1.qualifiedName)(schema, table)} (\n${lines.join(',\n')}\n);`;
}
function buildInsertBatch(schema, table, columns, rows) {
    return `insert into ${(0, identifiers_1.qualifiedName)(schema, table)} (${columns.map(identifiers_1.quoteIdentifier).join(', ')})\nvalues\n${rows.map((row) => `  (${columns.map((column) => formatLiteral(row[column])).join(', ')})`).join(',\n')};`;
}
function formatLiteral(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (value instanceof Date) {
        return `'${value.toISOString().replace(/'/g, "''")}'`;
    }
    if (typeof value === 'object') {
        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}
function chunk(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
}
//# sourceMappingURL=tableCopyService.js.map