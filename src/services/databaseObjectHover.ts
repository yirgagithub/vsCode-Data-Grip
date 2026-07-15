import type { ColumnInfo, ForeignKeyInfo } from '../types';
import type { ResolvedDatabaseObject } from './databaseObjectMetadata';

export function escapeMarkdownText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]()<>#+.!|~-])/g, '\\$1').replace(/[\r\n]+/g, ' ');
}

export function renderDatabaseObjectHover(object: ResolvedDatabaseObject): string {
  const title = `**${capitalize(object.kind)}** \`${qualified(object.schema, object.name)}\``;
  switch (object.kind) {
    case 'table':
      return [title, '', ...renderColumns(object.columns, object.primaryKeys.flatMap((key) => key.columns), object.foreignKeys)].join('\n');
    case 'view':
      return [title, '', ...renderColumns(object.columns, [], [])].join('\n');
    case 'function': {
      const lines = [title, '', `\`${escapeMarkdownText(routineSignature(object))}\``];
      if (object.returnType) lines.push(`Returns \`${escapeMarkdownText(object.returnType)}\``);
      return lines.join('\n');
    }
    case 'procedure':
      return [title, '', `\`${escapeMarkdownText(routineSignature(object))}\``].join('\n');
    case 'trigger': {
      const details = [object.timing, object.events?.join(', ')].filter(Boolean).join(' ');
      return [title, '', `${escapeMarkdownText(details)} on \`${qualified(object.schema, object.table)}\``].join('\n');
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
      attributes.push(`FK → \`${qualified(foreignKey.foreignSchema, `${foreignKey.foreignTable}.${foreignKey.foreignColumns[index] ?? ''}`)}\``);
    }
    return `- \`${escapeMarkdownText(column.name)}\` — \`${escapeMarkdownText(column.dataType)}\` — ${attributes.join(' — ')}`;
  });
}

function routineSignature(object: Extract<ResolvedDatabaseObject, { kind: 'function' | 'procedure' }>): string {
  return object.signature ?? `${object.name}(${object.arguments?.join(', ') ?? ''})`;
}

function qualified(schema: string, name: string): string {
  return `${escapeMarkdownText(schema)}.${escapeMarkdownText(name)}`;
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
