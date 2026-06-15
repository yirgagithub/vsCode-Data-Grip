"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSchemas = compareSchemas;
exports.formatSchemaDiffMarkdown = formatSchemaDiffMarkdown;
const identifiers_1 = require("../utils/identifiers");
function compareSchemas(request) {
    const sourceTables = tableMap(request.sourceSchema.tables);
    const targetTables = tableMap(request.targetSchema.tables);
    const sourceViews = viewMap(request.sourceSchema.views);
    const targetViews = viewMap(request.targetSchema.views);
    const createTables = [...sourceTables.values()]
        .filter((table) => !targetTables.has(tableKey(table.schema, table.name)))
        .map((table) => ({
        schema: table.schema,
        name: table.name,
        ddl: buildCreateTableSql(table.schema, table.name, request.sourceSchema.columns[tableKey(table.schema, table.name)] ?? [])
    }));
    const dropTables = [...targetTables.values()]
        .filter((table) => !sourceTables.has(tableKey(table.schema, table.name)))
        .map((table) => ({ schema: table.schema, name: table.name }));
    const createViews = [...sourceViews.values()]
        .filter((view) => !targetViews.has(viewKey(view.schema, view.name)))
        .map((view) => ({
        schema: view.schema,
        name: view.name,
        ddl: buildCreateViewSql(view.schema, view.name)
    }));
    const dropViews = [...targetViews.values()]
        .filter((view) => !sourceViews.has(viewKey(view.schema, view.name)))
        .map((view) => ({ schema: view.schema, name: view.name }));
    const alterTables = [...sourceTables.values()]
        .filter((table) => targetTables.has(tableKey(table.schema, table.name)))
        .map((table) => compareTableColumns(table.schema, table.name, request.sourceSchema.columns[tableKey(table.schema, table.name)] ?? [], request.targetSchema.columns[tableKey(table.schema, table.name)] ?? []))
        .filter((change) => change.addedColumns.length || change.removedColumns.length || change.typeChanges.length || change.nullableChanges.length);
    const migrationSql = buildMigrationSql({ createTables, dropTables, createViews, dropViews, alterTables });
    return {
        sourceConnectionName: request.sourceConnectionName,
        targetConnectionName: request.targetConnectionName,
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
    appendObjects(lines, '## Create Tables', report.createTables.map((item) => `${(0, identifiers_1.qualifiedName)(item.schema, item.name)}\n\`\`\`sql\n${item.ddl}\n\`\`\``));
    appendSimple(lines, '## Drop Tables', report.dropTables.map((item) => (0, identifiers_1.qualifiedName)(item.schema, item.name)));
    appendObjects(lines, '## Create Views', report.createViews.map((item) => `${(0, identifiers_1.qualifiedName)(item.schema, item.name)}\n\`\`\`sql\n${item.ddl}\n\`\`\``));
    appendSimple(lines, '## Drop Views', report.dropViews.map((item) => (0, identifiers_1.qualifiedName)(item.schema, item.name)));
    if (report.alterTables.length) {
        lines.push('');
        lines.push('## Table Changes');
        for (const table of report.alterTables) {
            lines.push('');
            lines.push(`### ${(0, identifiers_1.qualifiedName)(table.schema, table.name)}`);
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
function compareTableColumns(schema, name, sourceColumns, targetColumns) {
    const targetByName = new Map(targetColumns.map((column) => [column.name, column]));
    const sourceByName = new Map(sourceColumns.map((column) => [column.name, column]));
    const addedColumns = sourceColumns
        .filter((column) => !targetByName.has(column.name))
        .map((column) => ({
        name: column.name,
        ddl: `alter table ${(0, identifiers_1.qualifiedName)(schema, name)} add column ${(0, identifiers_1.quoteIdentifier)(column.name)} ${column.dataType}${column.defaultValue ? ` default ${column.defaultValue}` : ''}${column.nullable ? '' : ' not null'};`
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
function buildMigrationSql(report) {
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
        statements.push(`drop view if exists ${(0, identifiers_1.qualifiedName)(item.schema, item.name)};`);
    }
    for (const item of report.dropTables) {
        statements.push(`drop table if exists ${(0, identifiers_1.qualifiedName)(item.schema, item.name)};`);
    }
    return statements.join('\n');
}
function buildCreateTableSql(schema, table, columns) {
    const ddlColumns = columns.length
        ? columns.map((column) => `  ${(0, identifiers_1.quoteIdentifier)(column.name)} ${column.dataType}${column.defaultValue ? ` default ${column.defaultValue}` : ''}${column.nullable ? '' : ' not null'}`)
        : ['  id integer'];
    return `create table ${(0, identifiers_1.qualifiedName)(schema, table)} (\n${ddlColumns.join(',\n')}\n);`;
}
function buildCreateViewSql(schema, view) {
    return `create view ${(0, identifiers_1.qualifiedName)(schema, view)} as\nselect 1 as placeholder;\n`;
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