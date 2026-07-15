import { GridFilter, QueryField } from '../../../types';
import { formatFieldValue } from './format';

export interface FilterOption {
  key: string;
  label: string;
  count: number;
}

export function filterKey(value: unknown, field?: QueryField): string {
  return value === null || value === undefined ? '<NULL>' : formatFieldValue(value, field);
}

export function filterLabel(value: unknown, field?: QueryField): string {
  if (value === null || value === undefined) return 'NULL';
  const valueText = formatFieldValue(value, field);
  return valueText === '' ? '(empty)' : valueText;
}

export function matchesColumnFilter(value: unknown, filter: GridFilter, field?: QueryField): boolean {
  if (filter.operator === 'values') return filter.values ? filter.values.includes(filterKey(value, field)) : true;
  const text = formatFieldValue(value, field).toLowerCase();
  const expected = (filter.value ?? '').toLowerCase();
  if (filter.operator === 'is null') return value === null || value === undefined;
  if (filter.operator === 'is not null') return value !== null && value !== undefined;
  if (filter.operator === 'equals') return text === expected;
  if (filter.operator === 'not equals') return text !== expected;
  if (filter.operator === 'starts with') return text.startsWith(expected);
  if (filter.operator === 'ends with') return text.endsWith(expected);
  return text.includes(expected);
}

export function rowsForColumnOptions(rows: Record<string, unknown>[], filters: GridFilter[], column: string, fields: QueryField[]): Record<string, unknown>[] {
  const fieldMap = new Map(fields.map((field) => [field.name, field]));
  return rows.filter((row) => filters.filter((filter) => filter.column !== column).every((filter) => matchesColumnFilter(row[filter.column], filter, fieldMap.get(filter.column))));
}

export function buildColumnFilterOptions(rows: Record<string, unknown>[], field: QueryField): FilterOption[] {
  const counts = new Map<string, FilterOption>();
  for (const row of rows) {
    const key = filterKey(row[field.name], field);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { key, label: filterLabel(row[field.name], field), count: 1 });
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
}

export function selectionState(selected: Set<string>, allKeys: string[]): 'none' | 'partial' | 'all' {
  const count = allKeys.filter((key) => selected.has(key)).length;
  return count === 0 ? 'none' : count === allKeys.length ? 'all' : 'partial';
}

export function toggleAllValues(selected: Set<string>, allKeys: string[]): Set<string> {
  return selectionState(selected, allKeys) === 'none' ? new Set(allKeys) : new Set();
}

export function analyzeFilterCardinality(rows: Record<string, unknown>[], field: QueryField, limits = { uniqueLimit: 10_000, memoryLimitBytes: 5 * 1024 * 1024 }) {
  const keys = new Set<string>();
  let estimatedBytes = 0;
  for (const row of rows) {
    const key = filterKey(row[field.name], field);
    if (!keys.has(key)) {
      keys.add(key);
      estimatedBytes += key.length * 2 + 64;
      if (keys.size >= limits.uniqueLimit || estimatedBytes >= limits.memoryLimitBytes) {
        return { uniqueCount: keys.size, estimatedBytes, warned: true, truncated: true };
      }
    }
  }
  return { uniqueCount: keys.size, estimatedBytes, warned: false, truncated: false };
}
