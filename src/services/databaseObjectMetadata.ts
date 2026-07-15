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
  | { kind: 'metadata-unavailable'; schema: string }
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
  getForeignKeys(connection: ConnectionConfig, schemaName: string, tableName: string): Promise<ForeignKeyInfo[]>;
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
  if (!hasUsableMetadata(metadata)) return { kind: 'metadata-unavailable', schema: schemaName };

  if (reference.context === 'relation') {
    const relations = preferExactMatches([
      ...metadata.tables.map((item) => ({ item, kind: 'table' as const })),
      ...metadata.views.map((item) => ({ item, kind: 'view' as const }))
    ], requestedName, connection.type, (candidate) => candidate.item.name);
    if (relations.length !== 1) return undefined;
    const { item: relation, kind } = relations[0];
    const columns = await cachedOrEmpty(() => schemaContext.getCachedColumns(connection, relation.schema, relation.name), [] as ColumnInfo[])
      ?? await cachedOrEmpty(() => schemaContext.getColumns(connection, relation.schema, relation.name), [] as ColumnInfo[]);
    if (kind === 'table') {
      const [primaryKeys, foreignKeys] = await Promise.all([
        cachedOrEmpty(() => schemaContext.getPrimaryKeys(connection, relation.schema, relation.name), [] as KeyInfo[]),
        cachedOrEmpty(() => schemaContext.getForeignKeys(connection, relation.schema, relation.name), [] as ForeignKeyInfo[])
      ]);
      return { kind: 'table', schema: relation.schema, name: relation.name, columns, primaryKeys, foreignKeys };
    }
    return { kind: 'view', schema: relation.schema, name: relation.name, columns };
  }

  if (reference.context === 'trigger') {
    const matches = preferExactMatches(metadata.triggers, requestedName, connection.type, (item) => item.name);
    if (matches.length !== 1) return undefined;
    const trigger = matches[0];
    return { kind: 'trigger', schema: trigger.schema, name: trigger.name, table: trigger.table,
      timing: trigger.timing, events: trigger.events, orientation: trigger.orientation, enabled: trigger.enabled };
  }

  const namedRoutines = preferExactMatches([...metadata.functions, ...metadata.procedures], requestedName, connection.type, (item) => item.name);
  const countMatches = namedRoutines.filter((item) => reference.argumentCount === undefined || routineArgumentCount(item) === reference.argumentCount);
  const routines = countMatches.length > 0 ? countMatches
    : namedRoutines.length === 1 && routineArgumentCount(namedRoutines[0]) === undefined ? namedRoutines : [];
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

function preferExactMatches<T>(items: T[], requested: string, type: ConnectionConfig['type'], nameOf: (item: T) => string): T[] {
  const exact = items.filter((item) => nameOf(item) === requested);
  return exact.length ? exact : items.filter((item) => identifiersEqual(nameOf(item), requested, type));
}

function routineArgumentCount(routine: RoutineInfo): number | undefined {
  if (routine.arguments) return routine.arguments.length;
  if (!routine.signature) return undefined;
  const open = routine.signature.indexOf('(');
  const close = routine.signature.lastIndexOf(')');
  if (open < 0 || close < open) return undefined;
  const body = routine.signature.slice(open + 1, close).trim();
  if (!body) return 0;
  let depth = 0;
  let commas = 0;
  let quote = '';
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === quote && body[index + 1] === quote) index += 1;
      else if (char === quote) quote = '';
    } else if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(' || char === '[' || char === '<') depth += 1;
    else if (char === ')' || char === ']' || char === '>') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) commas += 1;
  }
  return commas + 1;
}

async function cachedOrEmpty<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}
