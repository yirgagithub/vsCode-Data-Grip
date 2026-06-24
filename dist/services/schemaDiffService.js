"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSchemas = compareSchemas;
exports.formatSchemaDiffMarkdown = formatSchemaDiffMarkdown;
const sqlDialect_1 = require("./sqlDialect");
function compareSchemas(request) {
    const targetDatabaseType = (0, sqlDialect_1.assertSqlGeneratingType)(request.targetDatabaseType ?? 'postgres', 'Schema diff migration SQL');
    const sourceTables = tableMap(request.sourceSchema.tables);
    const targetTables = tableMap(request.targetSchema.tables);
    const sourceViews = viewMap(request.sourceSchema.views);
    const targetViews = viewMap(request.targetSchema.views);
    const createTables = [...sourceTables.values()]
        .filter((table) => !targetTables.has(tableKey(table.schema, table.name)))
        .map((table) => ({
        schema: table.schema,
        name: table.name,
        ddl: (0, sqlDialect_1.createTableSql)(targetDatabaseType, table.schema, table.name, request.sourceSchema.columns[tableKey(table.schema, table.name)] ?? [])
    }));
    const dropTables = [...targetTables.values()]
        .filter((table) => !sourceTables.has(tableKey(table.schema, table.name)))
        .map((table) => ({ schema: table.schema, name: table.name }));
    const createViews = [...sourceViews.values()]
        .filter((view) => !targetViews.has(viewKey(view.schema, view.name)))
        .map((view) => ({
        schema: view.schema,
        name: view.name,
        ddl: (0, sqlDialect_1.createPlaceholderViewSql)(targetDatabaseType, view.schema, view.name)
    }));
    const dropViews = [...targetViews.values()]
        .filter((view) => !sourceViews.has(viewKey(view.schema, view.name)))
        .map((view) => ({ schema: view.schema, name: view.name }));
    const alterTables = [...sourceTables.values()]
        .filter((table) => targetTables.has(tableKey(table.schema, table.name)))
        .map((table) => compareTableColumns(table.schema, table.name, targetDatabaseType, request.sourceSchema.columns[tableKey(table.schema, table.name)] ?? [], request.targetSchema.columns[tableKey(table.schema, table.name)] ?? []))
        .filter((change) => change.addedColumns.length || change.removedColumns.length || change.typeChanges.length || change.nullableChanges.length);
    const migrationSql = buildMigrationSql(targetDatabaseType, { createTables, dropTables, createViews, dropViews, alterTables });
    return {
        sourceConnectionName: request.sourceConnectionName,
        targetConnectionName: request.targetConnectionName,
        targetDatabaseType,
        sourceSchema: request.sourceSchema.schemaName,
        targetSchema: request.targetSchema.schemaName,
        createTables,
        dropTables,
        createViews,
        dropViews,
        alterTables,
        migrationSql
    };
}
function formatSchemaDiffMarkdown(report) {
    const lines = [
        '# Schema Diff',
        '',
        `Source: **${report.sourceConnectionName}** / schema **${report.sourceSchema}**`,
        `Target: **${report.targetConnectionName}** / schema **${report.targetSchema}**`,
        '',
        `- Tables to create: ${report.createTables.length}`,
        `- Tables to drop: ${report.dropTables.length}`,
        `- Views to create: ${report.createViews.length}`,
        `- Views to drop: ${report.dropViews.length}`,
        `- Tables to alter: ${report.alterTables.length}`
    ];
    appendObjects(lines, '## Create Tables', report.createTables.map((item) => `${(0, sqlDialect_1.qualifiedSqlName)(report.targetDatabaseType, item.schema, item.name)}\n\`\`\`sql\n${item.ddl}\n\`\`\``));
    appendSimple(lines, '## Drop Tables', report.dropTables.map((item) => (0, sqlDialect_1.qualifiedSqlName)(report.targetDatabaseType, item.schema, item.name)));
    appendObjects(lines, '## Create Views', report.createViews.map((item) => `${(0, sqlDialect_1.qualifiedSqlName)(report.targetDatabaseType, item.schema, item.name)}\n\`\`\`sql\n${item.ddl}\n\`\`\``));
    appendSimple(lines, '## Drop Views', report.dropViews.map((item) => (0, sqlDialect_1.qualifiedSqlName)(report.targetDatabaseType, item.schema, item.name)));
    if (report.alterTables.length) {
        lines.push('');
        lines.push('## Table Changes');
        for (const table of report.alterTables) {
            lines.push('');
            lines.push(`### ${(0, sqlDialect_1.qualifiedSqlName)(report.targetDatabaseType, table.schema, table.name)}`);
            if (table.addedColumns.length) {
                lines.push(`- Added columns: ${table.addedColumns.map((item) => `${item.name}`).join(', ')}`);
            }
            if (table.removedColumns.length) {
                lines.push(`- Removed columns: ${table.removedColumns.map((item) => item.name).join(', ')}`);
            }
            if (table.typeChanges.length) {
                lines.push(`- Type changes: ${table.typeChanges.map((item) => `${item.name} ${item.from} -> ${item.to}`).join(', ')}`);
            }
            if (table.nullableChanges.length) {
                lines.push(`- Nullability changes: ${table.nullableChanges.map((item) => `${item.name} ${item.from ? 'nullable' : 'not null'} -> ${item.to ? 'nullable' : 'not null'}`).join(', ')}`);
            }
        }
    }
    lines.push('');
    lines.push('## Migration SQL');
    lines.push('```sql');
    lines.push(report.migrationSql || '-- No migration SQL generated.');
    lines.push('```');
    return lines.join('\n');
}
function compareTableColumns(schema, name, targetDatabaseType, sourceColumns, targetColumns) {
    const targetByName = new Map(targetColumns.map((column) => [column.name, column]));
    const sourceByName = new Map(sourceColumns.map((column) => [column.name, column]));
    const addedColumns = sourceColumns
        .filter((column) => !targetByName.has(column.name))
        .map((column) => ({
        name: column.name,
        ddl: addColumnMigrationSql(targetDatabaseType, schema, name, column)
    }));
    const removedColumns = targetColumns
        .filter((column) => !sourceByName.has(column.name))
        .map((column) => ({ name: column.name }));
    const typeChanges = sourceColumns
        .filter((column) => {
        const target = targetByName.get(column.name);
        return !!target && target.dataType !== column.dataType;
    })
        .map((column) => ({
        name: column.name,
        from: targetByName.get(column.name)?.dataType ?? '',
        to: column.dataType
    }));
    const nullableChanges = sourceColumns
        .filter((column) => {
        const target = targetByName.get(column.name);
        return !!target && target.nullable !== column.nullable;
    })
        .map((column) => ({
        name: column.name,
        from: targetByName.get(column.name)?.nullable ?? false,
        to: column.nullable
    }));
    return { schema, name, addedColumns, removedColumns, typeChanges, nullableChanges };
}
function buildMigrationSql(targetDatabaseType, report) {
    const statements = [];
    for (const item of report.createTables) {
        statements.push(item.ddl);
    }
    for (const item of report.createViews) {
        statements.push(item.ddl);
    }
    for (const item of report.alterTables) {
        for (const added of item.addedColumns) {
            statements.push(added.ddl);
        }
    }
    for (const item of report.dropViews) {
        statements.push((0, sqlDialect_1.dropViewIfExistsSql)(targetDatabaseType, item.schema, item.name));
    }
    for (const item of report.dropTables) {
        statements.push((0, sqlDialect_1.dropTableIfExistsSql)(targetDatabaseType, item.schema, item.name));
    }
    return statements.join('\n');
}
function addColumnMigrationSql(type, schema, table, column) {
    const dataType = column.dataType?.trim();
    if (!dataType) {
        throw new Error(`Missing data type for ${column.schema}.${column.table}.${column.name}.`);
    }
    const addKeyword = type === 'sqlserver' || type === 'oracle' ? 'add' : 'add column';
    const defaultValue = column.defaultValue ? ` default ${column.defaultValue}` : '';
    const nullable = column.nullable ? '' : ' not null';
    return `alter table ${(0, sqlDialect_1.qualifiedSqlName)(type, schema, table)}\n  ${addKeyword} ${(0, sqlDialect_1.quoteSqlIdentifier)(type, column.name)} ${dataType}${defaultValue}${nullable};`;
}
function tableMap(items) {
    return new Map(items.map((item) => [tableKey(item.schema, item.name), item]));
}
function viewMap(items) {
    return new Map(items.map((item) => [viewKey(item.schema, item.name), item]));
}
function tableKey(schema, table) {
    return `${schema}.${table}`;
}
function viewKey(schema, view) {
    return `${schema}.${view}`;
}
function appendObjects(lines, title, values) {
    if (!values.length) {
        return;
    }
    lines.push('');
    lines.push(title);
    for (const value of values) {
        lines.push('');
        lines.push(value);
    }
}
function appendSimple(lines, title, values) {
    if (!values.length) {
        return;
    }
    lines.push('');
    lines.push(title);
    for (const value of values) {
        lines.push(`- ${value}`);
    }
}
//# sourceMappingURL=schemaDiffService.js.map