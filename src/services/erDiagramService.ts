import { ConnectionConfig, ForeignKeyInfo, KeyInfo, SchemaCacheEntry, TableInfo, ViewInfo } from '../types';
import { qualifiedName, quoteIdentifier } from '../utils/identifiers';
import { SchemaContextService } from './schemaContextService';
import { ConnectionManager } from '../database/connectionManager';

export interface ErDiagramRequest {
  connection: ConnectionConfig;
  schemaName: string;
}

export interface ErDiagramTable {
  schema: string;
  name: string;
  type: TableInfo['type'] | ViewInfo['type'];
  rowEstimate?: number;
  primaryKeys: string[];
  columns: Array<{
    name: string;
    dataType: string;
    nullable: boolean;
    primary: boolean;
  }>;
  outgoing: ErDiagramRelation[];
  incoming: ErDiagramRelation[];
}

export interface ErDiagramRelation {
  name: string;
  fromSchema: string;
  fromTable: string;
  fromColumns: string[];
  toSchema: string;
  toTable: string;
  toColumns: string[];
}

export interface ErDiagramReport {
  connectionName: string;
  schemaName: string;
  tables: ErDiagramTable[];
  relations: ErDiagramRelation[];
}

export class ErDiagramService {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly schemaContext: SchemaContextService
  ) {}

  async build(request: ErDiagramRequest): Promise<ErDiagramReport> {
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

    const relations: ErDiagramRelation[] = [];
    const tableMap = new Map(tables.map((relation) => [relation.name, relation]));
    const mappedTables: ErDiagramTable[] = [];
    for (const table of tables) {
      if ('type' in table && table.type === 'view') {
        const columnInfos = entry.columns[tableKey(table.schema, table.name)] ?? [];
        mappedTables.push({
          schema: table.schema,
          name: table.name,
          type: table.type,
          rowEstimate: 'rowEstimate' in table ? (table as TableInfo).rowEstimate : undefined,
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
        rowEstimate: 'rowEstimate' in table ? (table as TableInfo).rowEstimate : undefined,
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

export function schemaTablesCount(entry: SchemaCacheEntry, schemaName: string): number {
  return entry.tables.filter((table) => table.schema === schemaName).length;
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

export function schemaDiagramTitle(connection: ConnectionConfig, schemaName: string): string {
  return `${connection.name} - ${qualifiedName(schemaName, '')}`.replace(/\.$/, '');
}
