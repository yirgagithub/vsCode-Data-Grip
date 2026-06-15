export function quoteIdentifier(identifier: string, quote?: string | number): string {
  const marker = typeof quote === 'string' && quote ? quote : '"';
  if (marker === '`') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
  return `${marker}${identifier.replace(new RegExp(escapeRegExp(marker), 'g'), marker + marker)}${marker}`;
}

export function qualifiedName(schema: string, name: string, quote?: string | number): string {
  return `${quoteIdentifier(schema, quote)}.${quoteIdentifier(name, quote)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
