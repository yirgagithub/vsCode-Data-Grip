import type { ColumnInfo, ForeignKeyInfo } from '../types';
import type { ResolvedDatabaseObject } from './databaseObjectMetadata';

export function escapeMarkdownText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]()<>#+.!|~-])/g, '\\$1').replace(/[\r\n]+/g, ' ');
}

export function markdownCodeSpan(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ');
  const longestRun = Math.max(0, ...([...normalized.matchAll(/`+/g)].map((match) => match[0].length)));
  const delimiter = '`'.repeat(longestRun + 1);
  const needsPadding = longestRun > 0 || /^\s|\s$/.test(normalized);
  return needsPadding ? `${delimiter} ${normalized} ${delimiter}` : `${delimiter}${normalized}${delimiter}`;
}

export function renderDatabaseObjectHover(object: ResolvedDatabaseObject): string {
  if (object.kind === 'metadata-unavailable') {
    return `Database metadata is unavailable for ${markdownCodeSpan(object.schema)}.`;
  }
  const title = `**${capitalize(object.kind)}** ${qualified(object.schema, object.name)}`;
  switch (object.kind) {
    case 'table':
      return [title, '', ...renderColumns(object.columns, object.primaryKeys.flatMap((key) => key.columns), object.foreignKeys)].join('\n');
    case 'view':
      return [title, '', ...renderColumns(object.columns, [], [])].join('\n');
    case 'function': {
      const lines = [title, '', markdownCodeSpan(routineSignature(object))];
      if (object.returnType) lines.push(`Returns ${markdownCodeSpan(object.returnType)}`);
      return lines.join('\n');
    }
    case 'procedure':
      return [title, '', markdownCodeSpan(routineSignature(object))].join('\n');
    case 'trigger': {
      const details = [object.timing, object.events?.join(', ')].filter(Boolean).join(' ');
      return [title, '', `${escapeMarkdownText(details)} on ${qualified(object.schema, object.table)}`].join('\n');
    }
  }
}

function renderColumns(columns: ColumnInfo[], primaryKeyColumns: string[], foreignKeys: ForeignKeyInfo[]): string[] {
  return [...columns].sort((left, right) => left.ordinal - right.ordinal).map((column) => {
    const attributes = [column.nullable ? 'NULL' : 'NOT NULL'];
    if (primaryKeyColumns.includes(column.name)) attributes.push('PK');
    const foreignKey = foreignKeys.find((key) => key.columns.includes(column.name));
    if (foreignKey) {
      const index = foreignKey.columns.indexOf(column.name);
      attributes.push(`FK → ${qualified(foreignKey.foreignSchema, `${foreignKey.foreignTable}.${foreignKey.foreignColumns[index] ?? ''}`)}`);
    }
    return `- ${markdownCodeSpan(column.name)} — ${markdownCodeSpan(column.dataType)} — ${attributes.join(' — ')}`;
  });
}

function routineSignature(object: Extract<ResolvedDatabaseObject, { kind: 'function' | 'procedure' }>): string {
  return object.signature ?? `${object.name}(${object.arguments?.join(', ') ?? ''})`;
}

function qualified(schema: string, name: string): string {
  return `${markdownCodeSpan(schema)}.${markdownCodeSpan(name)}`;
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
