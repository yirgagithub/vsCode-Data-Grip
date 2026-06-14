import { ConnectionManager } from '../database/connectionManager';
import {
  ConnectionConfig,
  DataProfileColumn,
  DataProfileNarrative,
  DataProfileNarrativeRequest,
  DataProfileReport,
  DataProfileTopValue
} from '../types';

export interface DataProfileAiNarrator {
  isAvailable(): Promise<boolean>;
  summarizeDataProfile(request: DataProfileNarrativeRequest): Promise<DataProfileNarrative>;
}

export class DataProfileService {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly ai: DataProfileAiNarrator
  ) {}

  async profileTable(connection: ConnectionConfig, schema: string, table: string, sampleRows: number): Promise<DataProfileReport> {
    if (!this.connectionManager.isConnected(connection.id)) {
      await this.connectionManager.connect(connection.id);
    }
    const driver = this.connectionManager.getDriver(connection.type);
    const [columns, preview] = await Promise.all([
      driver.getColumns(connection.id, schema, table),
      driver.getTablePreview(connection.id, schema, table, sampleRows)
    ]);
    const rows = preview.rows.slice(0, sampleRows);
    const profileColumns = columns.map((column) => profileColumn(
      column.name,
      column.dataType,
      column.nullable,
      rows.map((row) => row[column.name])
    ));
    const report: DataProfileReport = {
      connectionName: connection.name,
      databaseType: connection.type,
      databaseName: connection.database,
      schema,
      table,
      sampleRows: rows.length,
      sampledAt: Date.now(),
      columns: profileColumns
    };

    if (!await this.ai.isAvailable()) {
      return { ...report, narrative: deterministicNarrative(profileColumns, rows.length) };
    }
    try {
      return {
        ...report,
        narrative: await this.ai.summarizeDataProfile({
          connectionName: connection.name,
          databaseType: connection.type,
          databaseName: connection.database,
          schema,
          table,
          sampleRows: rows.length,
          columns: profileColumns
        })
      };
    } catch (error) {
      return {
        ...report,
        narrative: deterministicNarrative(profileColumns, rows.length),
        aiError: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export function profileColumn(name: string, dataType: string | undefined, nullable: boolean | undefined, values: unknown[]): DataProfileColumn {
  const rowCount = values.length;
  const present = values.filter((value) => value !== null && value !== undefined);
  const displayValues = present.map(displayValue);
  const distinct = new Map<string, number>();
  for (const value of displayValues) {
    distinct.set(value, (distinct.get(value) ?? 0) + 1);
  }
  const numeric = present.map(numericValue).filter((value): value is number => value !== undefined);
  const dates = present.map(dateValue).filter((value): value is Date => value !== undefined);
  const minMax = numeric.length >= Math.max(2, present.length * 0.75)
    ? numericMinMax(numeric)
    : dates.length >= Math.max(2, present.length * 0.75)
      ? dateMinMax(dates)
      : stringMinMax(displayValues);
  return {
    name,
    dataType,
    nullable,
    rowCount,
    nullCount: rowCount - present.length,
    nullPct: rowCount ? roundPct((rowCount - present.length) / rowCount) : 0,
    distinctCount: distinct.size,
    min: minMax.min,
    max: minMax.max,
    topValues: topValues(distinct),
    histogram: numeric.length >= Math.max(2, present.length * 0.75)
      ? numericHistogram(numeric)
      : dates.length >= Math.max(2, present.length * 0.75)
        ? dateHistogram(dates)
        : categoricalHistogram(distinct)
  };
}

function deterministicNarrative(columns: DataProfileColumn[], sampleRows: number): DataProfileNarrative {
  const anomalies: string[] = [];
  for (const column of columns) {
    if (column.nullPct >= 50) {
      anomalies.push(`${column.name} is ${column.nullPct}% null in the sample.`);
    }
    if (sampleRows > 0 && column.distinctCount === 1) {
      anomalies.push(`${column.name} has only one distinct sampled value.`);
    }
    const top = column.topValues[0];
    if (top && sampleRows > 0 && top.count / sampleRows >= 0.8) {
      anomalies.push(`${column.name} is dominated by ${top.value} (${top.count}/${sampleRows}).`);
    }
  }
  return {
    summary: `Profiled ${columns.length} columns across ${sampleRows} sampled rows.`,
    anomalies: anomalies.slice(0, 8)
  };
}

function topValues(counts: Map<string, number>): DataProfileTopValue[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, 8)
    .map(([value, count]) => ({ value, count }));
}

function numericMinMax(values: number[]): { min?: string; max?: string } {
  return {
    min: String(Math.min(...values)),
    max: String(Math.max(...values))
  };
}

function dateMinMax(values: Date[]): { min?: string; max?: string } {
  const times = values.map((value) => value.getTime());
  return {
    min: new Date(Math.min(...times)).toISOString(),
    max: new Date(Math.max(...times)).toISOString()
  };
}

function stringMinMax(values: string[]): { min?: string; max?: string } {
  const sorted = [...values].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  return {
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function numericHistogram(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ label: String(min), count: values.length }];
  }
  const bucketCount = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / bucketCount;
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const value of values) {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }
  return counts.map((count, index) => ({
    label: `${formatNumber(min + width * index)}-${formatNumber(index === bucketCount - 1 ? max : min + width * (index + 1))}`,
    count
  }));
}

function dateHistogram(values: Date[]) {
  const times = values.map((value) => value.getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (min === max) {
    return [{ label: new Date(min).toISOString().slice(0, 10), count: values.length }];
  }
  const bucketCount = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / bucketCount;
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const value of times) {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }
  return counts.map((count, index) => {
    const start = min + width * index;
    const end = index === bucketCount - 1 ? max : min + width * (index + 1);
    return {
      label: `${new Date(start).toISOString().slice(0, 10)}-${new Date(end).toISOString().slice(0, 10)}`,
      count
    };
  });
}

function categoricalHistogram(counts: Map<string, number>) {
  return topValues(counts).map((item) => ({ label: item.value, count: item.count }));
}

function displayValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'bigint') {
    const next = Number(value);
    return Number.isFinite(next) ? next : undefined;
  }
  if (typeof value === 'string' && /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    const next = Number(value);
    return Number.isFinite(next) ? next : undefined;
  }
  return undefined;
}

function dateValue(value: unknown): Date | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function roundPct(value: number): number {
  return Math.round(value * 1000) / 10;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
