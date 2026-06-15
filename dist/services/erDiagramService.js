"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErDiagramService = void 0;
exports.schemaTablesCount = schemaTablesCount;
exports.schemaDiagramTitle = schemaDiagramTitle;
const identifiers_1 = require("../utils/identifiers");
class ErDiagramService {
    connectionManager;
    schemaContext;
    constructor(connectionManager, schemaContext) {
        this.connectionManager = connectionManager;
        this.schemaContext = schemaContext;
    }
    async build(request) {
        if (!this.connectionManager.isConnected(request.connection.id)) {
            await this.connectionManager.connect(request.connection.id);
        }
        const entry = await this.schemaContext.loadSchema(request.connection, request.schemaName);
        if (entry.status !== 'ready') {
            throw new Error(entry.errorMessage ?? `Could not load schema ${request.schemaName}.`);
        }
        const tables = [...entry.tables, ...entry.views]
            .filter((relation) => relation.schema === request.schemaName)
            .sort((left, right) => left.name.localeCompare(right.name));
        const relations = [];
        const tableMap = new Map(tables.map((relation) => [relation.name, relation]));
        const mappedTables = [];
        for (const table of tables) {
            if ('type' in table && table.type === 'view') {
                const columnInfos = entry.columns[tableKey(table.schema, table.name)] ?? [];
                mappedTables.push({
                    schema: table.schema,
                    name: table.name,
                    type: table.type,
                    rowEstimate: 'rowEstimate' in table ? table.rowEstimate : undefined,
                    primaryKeys: [],
                    columns: columnInfos.map((column) => ({
                        name: column.name,
                        dataType: column.dataType,
                        nullable: column.nullable,
                        primary: false
                    })),
                    outgoing: [],
                    incoming: []
                });
                continue;
            }
            const primaryKeyList = await this.schemaContext.getPrimaryKeys(request.connection, table.schema, table.name);
            const foreignKeyList = await this.connectionManager.getDriver(request.connection.type).getForeignKeys(request.connection.id, table.schema, table.name);
            const pkColumns = primaryKeyList[0]?.columns ?? [];
            const columnInfos = entry.columns[tableKey(table.schema, table.name)] ?? [];
            const outgoing = foreignKeyList.filter((fk) => fk.foreignSchema === request.schemaName && tableMap.has(fk.foreignTable));
            relations.push(...outgoing.map((fk) => ({
                name: fk.name,
                fromSchema: table.schema,
                fromTable: table.name,
                fromColumns: fk.columns,
                toSchema: fk.foreignSchema,
                toTable: fk.foreignTable,
                toColumns: fk.foreignColumns
            })));
            mappedTables.push({
                schema: table.schema,
                name: table.name,
                type: table.type,
                rowEstimate: 'rowEstimate' in table ? table.rowEstimate : undefined,
                primaryKeys: pkColumns,
                columns: columnInfos.map((column) => ({
                    name: column.name,
                    dataType: column.dataType,
                    nullable: column.nullable,
                    primary: pkColumns.includes(column.name)
                })),
                outgoing: [],
                incoming: []
            });
        }
        const tableIndex = new Map(mappedTables.map((table) => [table.name, table]));
        for (const relation of relations) {
            const from = tableIndex.get(relation.fromTable);
            const to = tableIndex.get(relation.toTable);
            if (from) {
                from.outgoing.push(relation);
            }
            if (to) {
                to.incoming.push(relation);
            }
        }
        return {
            connectionName: request.connection.name,
            schemaName: request.schemaName,
            tables: mappedTables,
            relations
        };
    }
}
exports.ErDiagramService = ErDiagramService;
function schemaTablesCount(entry, schemaName) {
    return entry.tables.filter((table) => table.schema === schemaName).length;
}
function tableKey(schema, table) {
    return `${schema}.${table}`;
}
function schemaDiagramTitle(connection, schemaName) {
    return `${connection.name} - ${(0, identifiers_1.qualifiedName)(schemaName, '')}`.replace(/\.$/, '');
}
//# sourceMappingURL=erDiagramService.js.map