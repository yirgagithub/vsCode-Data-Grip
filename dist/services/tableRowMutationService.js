"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableRowMutationService = void 0;
const identifiers_1 = require("../utils/identifiers");
const sqlRelationParser_1 = require("./sqlRelationParser");
class TableRowMutationService {
    schemaContext;
    constructor(schemaContext) {
        this.schemaContext = schemaContext;
    }
    async preview(request) {
        const target = request.target;
        const primaryKeys = await this.primaryKeys(target.connection, target.schema, target.table);
        const table = (0, identifiers_1.qualifiedName)(target.schema, target.table);
        if (request.kind === 'delete-row') {
            const originalRow = request.originalRow ?? parseRowText(request.rowText);
            const where = this.whereClause(primaryKeys, originalRow, target.table);
            return {
                kind: request.kind,
                sql: `delete from ${table}\nwhere ${where};`,
                title: `Delete ${target.table}`,
                primaryKeys
            };
        }
        if (request.kind === 'insert-row') {
            const row = request.updatedRow ?? parseRowText(request.rowText);
            const columns = this.orderedColumns(target.columns, row);
            if (!columns.length) {
                throw new Error('No values were provided for the new row.');
            }
            return {
                kind: request.kind,
                sql: `insert into ${table} (${columns.map(identifiers_1.quoteIdentifier).join(', ')})\nvalues (${columns.map((column) => formatLiteral(row[column])).join(', ')});`,
                title: `Insert into ${target.table}`,
                primaryKeys
            };
        }
        const originalRow = request.originalRow ?? parseRowText(request.rowText);
        const updatedRow = request.kind === 'edit-cell'
            ? {
                ...originalRow,
                ...(request.column ? { [request.column]: parseScalar(request.valueText ?? '') } : {})
            }
            : request.updatedRow ?? originalRow;
        const changedColumns = this.changedColumns(primaryKeys, originalRow, updatedRow);
        if (!changedColumns.length) {
            throw new Error('No editable columns changed.');
        }
        const where = this.whereClause(primaryKeys, originalRow, target.table);
        return {
            kind: request.kind,
            sql: `update ${table}\nset ${changedColumns.map((column) => `${(0, identifiers_1.quoteIdentifier)(column)} = ${formatLiteral(updatedRow[column])}`).join(', ')}\nwhere ${where};`,
            title: `Update ${target.table}`,
            primaryKeys
        };
    }
    async inferTargetFromQuery(connection, sql) {
        if (/\b(with|join|union|intersect|except)\b/i.test(sql) || /\bfrom\s*\(/i.test(sql)) {
            return undefined;
        }
        const aliases = (0, sqlRelationParser_1.extractSqlAliases)(sql);
        if (aliases.length !== 1) {
            return undefined;
        }
        const [unique] = aliases;
        const schema = unique.schema ?? connection.defaultSchema ?? 'public';
        const columns = await this.schemaContext.getColumns(connection, schema, unique.table);
        return {
            connection,
            schema,
            table: unique.table,
            columns: columns.map((column) => column.name),
            queryText: sql
        };
    }
    async primaryKeys(connection, schema, table) {
        const keys = await this.schemaContext.getPrimaryKeys(connection, schema, table);
        return keys.flatMap((key) => key.columns).filter((column, index, all) => all.findIndex((item) => item === column) === index);
    }
    orderedColumns(columns, row) {
        const existing = new Set(columns ?? Object.keys(row));
        return [...(columns ?? Object.keys(row)), ...Object.keys(row).filter((column) => !existing.has(column))].filter((column, index, all) => all.indexOf(column) === index);
    }
    changedColumns(primaryKeys, originalRow, updatedRow) {
        const allColumns = new Set([...Object.keys(originalRow), ...Object.keys(updatedRow)]);
        return [...allColumns].filter((column) => !primaryKeys.includes(column) && !valuesEqual(originalRow[column], updatedRow[column]));
    }
    whereClause(primaryKeys, row, table) {
        if (!primaryKeys.length) {
            throw new Error(`Cannot edit ${table} safely because no primary key is cached.`);
        }
        return primaryKeys.map((column) => {
            if (!(column in row)) {
                throw new Error(`Cannot edit ${table} safely because the primary key column ${column} is missing from the row.`);
            }
            const value = row[column];
            return value === null || value === undefined
                ? `${(0, identifiers_1.quoteIdentifier)(column)} is null`
                : `${(0, identifiers_1.quoteIdentifier)(column)} = ${formatLiteral(value)}`;
        }).join(' and ');
    }
}
exports.TableRowMutationService = TableRowMutationService;
function parseRowText(valueText) {
    if (!valueText || !valueText.trim()) {
        return {};
    }
    const trimmed = valueText.trim();
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
    }
    throw new Error('Insert row input must be a JSON object.');
}
function parseScalar(text) {
    if (!text.trim())
        return null;
    if (/^null$/i.test(text))
        return null;
    if (/^true$/i.test(text))
        return true;
    if (/^false$/i.test(text))
        return false;
    if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
        const next = Number(text);
        return Number.isFinite(next) ? next : text;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function valuesEqual(left, right) {
    if (left === right) {
        return true;
    }
    if (left instanceof Date && right instanceof Date) {
        return left.getTime() === right.getTime();
    }
    return JSON.stringify(left) === JSON.stringify(right);
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
//# sourceMappingURL=tableRowMutationService.js.map