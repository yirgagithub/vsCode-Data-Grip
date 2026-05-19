import { QueryMemorySummary } from '../types';

export function parseQueryMemorySummaryText(text: string): QueryMemorySummary {
  const json = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The language model did not return valid summary JSON.');
  }
  const maybe = parsed as Partial<QueryMemorySummary>;
  if (typeof maybe.title !== 'string' || typeof maybe.summary !== 'string') {
    throw new Error('The language model summary is missing title or summary.');
  }
  return {
    title: maybe.title.trim().slice(0, 80),
    summary: maybe.summary.trim().slice(0, 300),
    tables: Array.isArray(maybe.tables) ? maybe.tables.filter((value): value is string => typeof value === 'string').slice(0, 20) : [],
    columns: Array.isArray(maybe.columns) ? maybe.columns.filter((value): value is string => typeof value === 'string').slice(0, 40) : []
  };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('The language model did not return summary JSON.');
  }
  return candidate.slice(start, end + 1);
}
