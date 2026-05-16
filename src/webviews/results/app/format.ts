export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function rowsToTsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  return [columns.join('\t'), ...rows.map((row) => columns.map((column) => formatValue(row[column])).join('\t'))].join('\n');
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csv(formatValue(row[column]))).join(','))].join('\n');
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
