"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeExplainJsonPlan = normalizeExplainJsonPlan;
exports.textExplainPlan = textExplainPlan;
exports.deterministicPlanAnnotations = deterministicPlanAnnotations;
exports.flattenPlan = flattenPlan;
function normalizeExplainJsonPlan(value, analyze) {
    const entry = Array.isArray(value) ? value[0] : value;
    const record = entry && typeof entry === 'object' ? entry : {};
    const plan = record.Plan ?? record.plan;
    const root = plan && typeof plan === 'object' ? normalizePlanNode(plan, 'plan') : undefined;
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
function textExplainPlan(rawText, analyze) {
    return {
        format: 'text',
        analyze,
        rawText,
        annotations: []
    };
}
function deterministicPlanAnnotations(root) {
    const nodes = flattenPlan(root);
    const maxCost = Math.max(...nodes.map((node) => node.totalCost ?? 0), 0);
    const annotations = [];
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
function flattenPlan(root) {
    return [root, ...root.children.flatMap(flattenPlan)];
}
function normalizePlanNode(raw, id) {
    const children = Array.isArray(raw.Plans)
        ? raw.Plans.map((child, index) => normalizePlanNode(child, `${id}.${index + 1}`))
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
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value : undefined;
}
function stringArrayValue(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : undefined;
}
function numberValue(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const next = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(next) ? next : undefined;
}
//# sourceMappingURL=queryPlanService.js.map