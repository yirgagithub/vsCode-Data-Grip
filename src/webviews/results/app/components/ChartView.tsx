import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as Plot from '@observablehq/plot';
import { QueryField, ResultSet } from '../../../../types';
import { formatValue } from '../format';
import { Icon } from './Icon';

type ChartKind = 'line' | 'bar' | 'scatter';

interface ChartSpec {
  kind: ChartKind;
  title: string;
  x: string;
  y: string;
  data: Array<Record<string, string | number | Date>>;
}

const NUMERIC_TYPE_IDS = new Set([20, 21, 23, 700, 701, 790, 1700]);
const TEMPORAL_TYPE_IDS = new Set([1082, 1083, 1114, 1184, 1266]);
const STRING_TYPE_IDS = new Set([18, 19, 25, 1042, 1043]);
const NUMERIC_TYPE_NAMES = [
  'bigint',
  'decimal',
  'double precision',
  'float',
  'int',
  'integer',
  'numeric',
  'real',
  'smallint'
];
const TEMPORAL_TYPE_NAMES = ['date', 'time', 'timestamp'];
const STRING_TYPE_NAMES = ['char', 'character', 'name', 'text', 'varchar'];

export function ChartView({ resultSet }: { resultSet?: ResultSet }) {
  const host = useRef<HTMLDivElement>(null);
  const size = useElementSize(host);
  const spec = useMemo(() => inferChart(resultSet), [resultSet]);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    element.innerHTML = '';
    if (!spec) {
      return;
    }
    const width = Math.max(520, Math.floor(size.width || element.clientWidth || 720));
    const height = Math.max(320, Math.floor(size.height || element.clientHeight || 420));
    const plot = Plot.plot({
      width,
      height,
      marginLeft: 64,
      marginRight: 24,
      marginTop: 24,
      marginBottom: 56,
      style: {
        background: 'transparent',
        color: 'var(--text-main)',
        fontFamily: 'var(--vscode-font-family)'
      },
      grid: true,
      x: { label: spec.x },
      y: { label: spec.y },
      marks: chartMarks(spec)
    });
    element.append(plot);
    return () => plot.remove();
  }, [spec, size.width, size.height]);

  if (!resultSet) {
    return <section className="grid-empty">No result set.</section>;
  }

  if (!spec) {
    return (
      <section className="chart-empty">
        <div className="empty-panel">
          <Icon name="graph-line" className="empty-icon" />
          <span>No chartable columns in this result set</span>
        </div>
      </section>
    );
  }

  return (
    <section className="chart-shell" aria-label={spec.title}>
      <div className="chart-header">
        <span className={`chart-kind ${spec.kind}`}>{spec.kind}</span>
        <strong>{spec.title}</strong>
        <span className="muted">{spec.data.length.toLocaleString()} points</span>
      </div>
      <div ref={host} className="chart-canvas" />
    </section>
  );
}

function chartMarks(spec: ChartSpec): Plot.Markish[] {
  if (spec.kind === 'bar') {
    return [
      Plot.ruleY([0]),
      Plot.barY(spec.data, {
        x: 'x',
        y: 'y',
        fill: 'var(--vscode-charts-blue)',
        title: (datum) => `${formatValue(datum.x)}\n${spec.y}: ${formatValue(datum.y)}`
      })
    ];
  }
  if (spec.kind === 'scatter') {
    return [
      Plot.dot(spec.data, {
        x: 'x',
        y: 'y',
        r: 3,
        fill: 'var(--vscode-charts-purple)',
        fillOpacity: 0.72,
        title: (datum) => `${spec.x}: ${formatValue(datum.x)}\n${spec.y}: ${formatValue(datum.y)}`
      })
    ];
  }
  return [
    Plot.lineY(spec.data, {
      x: 'x',
      y: 'y',
      stroke: 'var(--vscode-charts-green)',
      strokeWidth: 2
    }),
    Plot.dot(spec.data, {
      x: 'x',
      y: 'y',
      r: 2.5,
      fill: 'var(--vscode-charts-green)',
      title: (datum) => `${spec.x}: ${formatValue(datum.x)}\n${spec.y}: ${formatValue(datum.y)}`
    })
  ];
}

function inferChart(resultSet: ResultSet | undefined): ChartSpec | undefined {
  const rows = resultSet?.rows ?? [];
  const fields = resultSet?.fields ?? [];
  if (!rows.length || fields.length < 2) {
    return undefined;
  }

  const numericFields = fields.filter((field) => isNumericField(field, rows)).sort((left, right) => {
    return Number(isIdentifierColumn(left.name)) - Number(isIdentifierColumn(right.name));
  });
  const temporal = fields.find((field) => isTemporalField(field, rows));
  const lowCardString = fields.find((field) => isStringField(field, rows) && lowCardinality(field.name, rows));

  if (temporal && numericFields.length) {
    const y = numericFields[0];
    const data = rows.map((row) => {
      const x = dateValue(row[temporal.name]);
      const yValue = numericValue(row[y.name]);
      return x && yValue !== undefined ? { x, y: yValue } : undefined;
    }).filter((item): item is { x: Date; y: number } => !!item)
      .sort((left, right) => left.x.getTime() - right.x.getTime())
      .slice(0, 1200);
    return data.length ? { kind: 'line', title: `${y.name} over ${temporal.name}`, x: temporal.name, y: y.name, data } : undefined;
  }

  if (lowCardString && numericFields.length) {
    const y = numericFields[0];
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const key = formatValue(row[lowCardString.name]) || '(empty)';
      const value = numericValue(row[y.name]);
      if (value !== undefined) {
        grouped.set(key, (grouped.get(key) ?? 0) + value);
      }
    }
    const data = [...grouped.entries()]
      .map(([x, yValue]) => ({ x, y: yValue }))
      .sort((left, right) => Math.abs(right.y) - Math.abs(left.y))
      .slice(0, 30);
    return data.length ? { kind: 'bar', title: `${y.name} by ${lowCardString.name}`, x: lowCardString.name, y: y.name, data } : undefined;
  }

  if (numericFields.length >= 2) {
    const [xField, yField] = numericFields;
    const data = rows.map((row) => {
      const x = numericValue(row[xField.name]);
      const y = numericValue(row[yField.name]);
      return x !== undefined && y !== undefined ? { x, y } : undefined;
    }).filter((item): item is { x: number; y: number } => !!item).slice(0, 1200);
    return data.length ? { kind: 'scatter', title: `${yField.name} vs ${xField.name}`, x: xField.name, y: yField.name, data } : undefined;
  }

  return undefined;
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function isNumericField(field: QueryField, rows: Record<string, unknown>[]): boolean {
  if (typeof field.dataTypeId === 'number' && NUMERIC_TYPE_IDS.has(field.dataTypeId)) {
    return true;
  }
  const typeName = normalizedTypeName(field);
  if (NUMERIC_TYPE_NAMES.some((name) => typeName === name || typeName.startsWith(`${name}(`) || typeName.startsWith(`${name} `))) {
    return true;
  }
  return rows.some((row) => numericValue(row[field.name]) !== undefined);
}

function isTemporalField(field: QueryField, rows: Record<string, unknown>[]): boolean {
  if (typeof field.dataTypeId === 'number' && TEMPORAL_TYPE_IDS.has(field.dataTypeId)) {
    return true;
  }
  const typeName = normalizedTypeName(field);
  if (TEMPORAL_TYPE_NAMES.some((name) => typeName === name || typeName.startsWith(`${name} `))) {
    return true;
  }
  return rows.some((row) => dateValue(row[field.name]) !== undefined);
}

function isStringField(field: QueryField, rows: Record<string, unknown>[]): boolean {
  if (typeof field.dataTypeId === 'number' && STRING_TYPE_IDS.has(field.dataTypeId)) {
    return true;
  }
  const typeName = normalizedTypeName(field);
  if (STRING_TYPE_NAMES.some((name) => typeName === name || typeName.startsWith(`${name}(`) || typeName.startsWith(`${name} `))) {
    return true;
  }
  return rows.some((row) => typeof row[field.name] === 'string');
}

function lowCardinality(column: string, rows: Record<string, unknown>[]): boolean {
  const values = new Set(rows.map((row) => formatValue(row[column])).filter(Boolean));
  return values.size > 1 && values.size <= Math.min(30, Math.max(4, Math.floor(rows.length / 2)));
}

function normalizedTypeName(field: QueryField): string {
  return (field.dataTypeName ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
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

function isIdentifierColumn(column: string): boolean {
  return column.toLowerCase() === 'id'
    || /^id[_\-\s]/i.test(column)
    || /[_\-\s]id$/i.test(column)
    || /Id$/.test(column)
    || /ID$/.test(column);
}
