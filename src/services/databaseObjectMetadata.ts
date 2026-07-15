import type { SqlObjectReference } from './sqlObjectReference';
import type {
  ColumnInfo,
  ConnectionConfig,
  ForeignKeyInfo,
  KeyInfo,
  RoutineInfo,
  SchemaCacheEntry,
  TriggerInfo
} from '../types';

export type ResolvedDatabaseObject =
  | { kind: 'table'; schema: string; name: string; columns: ColumnInfo[]; primaryKeys: KeyInfo[]; foreignKeys: ForeignKeyInfo[] }
  | { kind: 'view'; schema: string; name: string; columns: ColumnInfo[] }
  | ({ kind: 'function'; schema: string; name: string } & Pick<RoutineInfo, 'signature' | 'arguments' | 'returnType' | 'language' | 'comment'>)
  | ({ kind: 'procedure'; schema: string; name: string } & Pick<RoutineInfo, 'signature' | 'arguments' | 'language' | 'comment'>)
  | ({ kind: 'trigger'; schema: string; name: string; table: string } & Pick<TriggerInfo, 'timing' | 'events' | 'orientation' | 'enabled'>);

interface DatabaseObjectSchemaContext {
  getCachedForConnection(connection: ConnectionConfig, schemaName: string): Promise<SchemaCacheEntry | undefined>;
  loadSchema(connection: ConnectionConfig, schemaName: string): Promise<SchemaCacheEntry>;
  getCachedColumns(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<ColumnInfo[] | undefined>;
  getColumns(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<ColumnInfo[]>;
  getPrimaryKeys(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<KeyInfo[]>;
  getForeignKeys?(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<ForeignKeyInfo[]>;
}

export async function resolveDatabaseObject(
  reference: SqlObjectReference,
  connection: ConnectionConfig,
  schemaContext: DatabaseObjectSchemaContext
): Promise<ResolvedDatabaseObject | undefined> {
  if (connection.type === 'redis' || reference.parts.length < 1 || reference.parts.length > 2) return undefined;

  const schemaName = reference.parts.length === 2
    ? reference.parts[0]
    : connection.defaultSchema ?? 'public';
  const requestedName = reference.parts[reference.parts.length - 1];
  const cached = await schemaContext.getCachedForConnection(connection, schemaName);
  const metadata = hasUsableMetadata(cached) ? cached : await schemaContext.loadSchema(connection, schemaName);

  if (reference.context === 'relation') {
    const tables = metadata.tables.filter((item) => identifiersEqual(item.name, requestedName, connection.type));
    const views = metadata.views.filter((item) => identifiersEqual(item.name, requestedName, connection.type));
    if (tables.length + views.length !== 1) return undefined;
    const relation = (tables[0] ?? views[0]);
    const columns = await cachedOrEmpty(() => schemaContext.getCachedColumns(connection, relation.schema, relation.name), [] as ColumnInfo[])
      ?? await cachedOrEmpty(() => schemaContext.getColumns(connection, relation.schema, relation.name), [] as ColumnInfo[]);
    if (tables[0]) {
      const primaryKeys = await cachedOrEmpty(() => schemaContext.getPrimaryKeys(connection, relation.schema, relation.name), [] as KeyInfo[]);
      const foreignKeys = schemaContext.getForeignKeys
        ? await cachedOrEmpty(() => schemaContext.getForeignKeys!(connection, relation.schema, relation.name), [] as ForeignKeyInfo[])
        : [];
      return { kind: 'table', schema: relation.schema, name: relation.name, columns, primaryKeys, foreignKeys };
    }
    return { kind: 'view', schema: relation.schema, name: relation.name, columns };
  }

  if (reference.context === 'trigger') {
    const matches = metadata.triggers.filter((item) => identifiersEqual(item.name, requestedName, connection.type));
    if (matches.length !== 1) return undefined;
    const trigger = matches[0];
    return { kind: 'trigger', schema: trigger.schema, name: trigger.name, table: trigger.table,
      timing: trigger.timing, events: trigger.events, orientation: trigger.orientation, enabled: trigger.enabled };
  }

  const routines = [...metadata.functions, ...metadata.procedures]
    .filter((item) => identifiersEqual(item.name, requestedName, connection.type))
    .filter((item) => reference.argumentCount === undefined || routineArgumentCount(item) === reference.argumentCount);
  if (routines.length !== 1) return undefined;
  const routine = routines[0];
  if (routine.kind === 'function') {
    return { kind: 'function', schema: routine.schema, name: routine.name, signature: routine.signature,
      arguments: routine.arguments, returnType: routine.returnType, language: routine.language, comment: routine.comment };
  }
  return { kind: 'procedure', schema: routine.schema, name: routine.name, signature: routine.signature,
    arguments: routine.arguments, language: routine.language, comment: routine.comment };
}

function hasUsableMetadata(entry: SchemaCacheEntry | undefined): entry is SchemaCacheEntry {
  return !!entry && (entry.status === 'ready' || entry.status === 'stale');
}

function identifiersEqual(actual: string, requested: string, type: ConnectionConfig['type']): boolean {
  if (actual === requested) return true;
  if (type === 'oracle' || type === 'snowflake') return actual.toUpperCase() === requested.toUpperCase();
  return actual.toLowerCase() === requested.toLowerCase();
}

function routineArgumentCount(routine: RoutineInfo): number | undefined {
  if (routine.arguments) return routine.arguments.length;
  if (!routine.signature) return undefined;
  const open = routine.signature.indexOf('(');
  const close = routine.signature.lastIndexOf(')');
  if (open < 0 || close < open) return undefined;
  const body = routine.signature.slice(open + 1, close).trim();
  return body ? body.split(',').length : 0;
}

async function cachedOrEmpty<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}
