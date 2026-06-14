import { QueryPlanAnnotation, QueryPlanNode, QueryPlanResult } from '../types';

export function normalizeExplainJsonPlan(value: unknown, analyze: boolean): QueryPlanResult {
  const entry = Array.isArray(value) ? value[0] : value;
  const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
  const plan = record.Plan ?? record.plan;
  const root = plan && typeof plan === 'object' ? normalizePlanNode(plan as Record<string, unknown>, 'plan') : undefined;
  return {
    format: 'json',
    analyze,
    root,
    rawPlan: value,
    planningTimeMs: numberValue(record['Planning Time'] ?? record['planning_time']),
    executionTimeMs: numberValue(record['Execution Time'] ?? record['execution_time']),
    annotations: root ? deterministicPlanAnnotations(root) : []
  };
}

export function textExplainPlan(rawText: string, analyze: boolean): QueryPlanResult {
  return {
    format: 'text',
    analyze,
    rawText,
    annotations: []
  };
}

export function deterministicPlanAnnotations(root: QueryPlanNode): QueryPlanAnnotation[] {
  const nodes = flattenPlan(root);
  const maxCost = Math.max(...nodes.map((node) => node.totalCost ?? 0), 0);
  const annotations: QueryPlanAnnotation[] = [];
  for (const node of nodes) {
    const lower = node.nodeType.toLowerCase();
    if (lower.includes('seq scan') && (node.planRows ?? 0) > 10000) {
      annotations.push({
        nodeId: node.id,
        severity: 'high',
        message: `Sequential scan over ${node.planRows?.toLocaleString()} estimated rows.`,
        suggestion: 'Check whether the WHERE or JOIN columns need an index, sort key, or more selective predicate.'
      });
    }
    if (lower.includes('nested loop') && (node.planRows ?? 0) > 10000) {
      annotations.push({
        nodeId: node.id,
        severity: 'medium',
        message: `Nested loop estimates ${node.planRows?.toLocaleString()} rows.`,
        suggestion: 'Large nested loops often point to missing join statistics, missing indexes, or a join order problem.'
      });
    }
    if (lower.includes('sort') && maxCost > 0 && (node.totalCost ?? 0) >= maxCost * 0.35) {
      annotations.push({
        nodeId: node.id,
        severity: 'medium',
        message: 'Sort is a major cost contributor in this plan.',
        suggestion: 'Consider whether ORDER BY/GROUP BY columns match an index or Redshift sort key.'
      });
    }
  }
  return annotations.slice(0, 12);
}

export function flattenPlan(root: QueryPlanNode): QueryPlanNode[] {
  return [root, ...root.children.flatMap(flattenPlan)];
}

function normalizePlanNode(raw: Record<string, unknown>, id: string): QueryPlanNode {
  const children = Array.isArray(raw.Plans)
    ? raw.Plans.map((child, index) => normalizePlanNode(child as Record<string, unknown>, `${id}.${index + 1}`))
    : [];
  return {
    id,
    nodeType: stringValue(raw['Node Type']) ?? 'Plan Node',
    relationName: stringValue(raw['Relation Name']),
    alias: stringValue(raw.Alias),
    indexName: stringValue(raw['Index Name']),
    joinType: stringValue(raw['Join Type']),
    startupCost: numberValue(raw['Startup Cost']),
    totalCost: numberValue(raw['Total Cost']),
    planRows: numberValue(raw['Plan Rows']),
    planWidth: numberValue(raw['Plan Width']),
    actualStartupTime: numberValue(raw['Actual Startup Time']),
    actualTotalTime: numberValue(raw['Actual Total Time']),
    actualRows: numberValue(raw['Actual Rows']),
    actualLoops: numberValue(raw['Actual Loops']),
    filter: stringValue(raw.Filter),
    indexCond: stringValue(raw['Index Cond']),
    joinFilter: stringValue(raw['Join Filter']),
    hashCond: stringValue(raw['Hash Cond']),
    mergeCond: stringValue(raw['Merge Cond']),
    sortKey: stringArrayValue(raw['Sort Key']),
    groupKey: stringArrayValue(raw['Group Key']),
    raw,
    children
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : undefined;
}
