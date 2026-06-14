import { QueryPlanAnnotation, QueryPlanNode, QueryPlanResult } from '../../../../types';
import { vscode } from '../vscode';

export function PlanView({ plan }: { plan: QueryPlanResult }) {
  const annotationsByNode = new Map<string, QueryPlanAnnotation[]>();
  for (const annotation of plan.annotations) {
    if (annotation.nodeId) {
      annotationsByNode.set(annotation.nodeId, [...(annotationsByNode.get(annotation.nodeId) ?? []), annotation]);
    }
  }

  return (
    <section className="plan-shell">
      <div className="plan-header">
        <span className={`chart-kind ${plan.analyze ? 'bar' : 'line'}`}>{plan.analyze ? 'analyze' : 'explain'}</span>
        <strong>{plan.format === 'json' ? 'Query Plan Tree' : 'Query Plan Text'}</strong>
        {plan.planningTimeMs !== undefined && <span className="muted">Planning {formatMs(plan.planningTimeMs)}</span>}
        {plan.executionTimeMs !== undefined && <span className="muted">Execution {formatMs(plan.executionTimeMs)}</span>}
      </div>
      <div className="plan-content">
        {plan.aiError && <div className="plan-note">AI plan annotations unavailable: {plan.aiError}</div>}
        {!!plan.aiFindings?.length && (
          <section className="plan-section">
            <h2>Findings</h2>
            <ul className="plan-list">
              {plan.aiFindings.map((finding, index) => <li key={`${finding}-${index}`}>{finding}</li>)}
            </ul>
          </section>
        )}
        {plan.rewrittenSql && (
          <section className="plan-section">
            <div className="plan-section-title">
              <h2>Rewritten SQL</h2>
              <button onClick={() => vscode.postMessage({ type: 'copy', text: plan.rewrittenSql ?? '' })}>Copy SQL</button>
            </div>
            <pre className="plan-sql">{plan.rewrittenSql}</pre>
          </section>
        )}
        {plan.root ? (
          <section className="plan-tree" aria-label="Query plan tree">
            <PlanNodeView node={plan.root} annotationsByNode={annotationsByNode} depth={0} />
          </section>
        ) : (
          <pre className="plan-text">{plan.rawText || JSON.stringify(plan.rawPlan, null, 2)}</pre>
        )}
      </div>
    </section>
  );
}

function PlanNodeView({
  node,
  annotationsByNode,
  depth
}: {
  node: QueryPlanNode;
  annotationsByNode: Map<string, QueryPlanAnnotation[]>;
  depth: number;
}) {
  const annotations = annotationsByNode.get(node.id) ?? [];
  return (
    <details className="plan-node" open>
      <summary>
        <span className="plan-indent" style={{ width: `${depth * 1.25}rem` }} />
        <span className="plan-node-type">{node.nodeType}</span>
        {node.relationName && <span className="plan-node-relation">{node.relationName}</span>}
        {node.indexName && <span className="plan-node-relation">{node.indexName}</span>}
        {node.totalCost !== undefined && <span className="plan-metric">cost {formatNumber(node.totalCost)}</span>}
        {node.planRows !== undefined && <span className="plan-metric">{formatNumber(node.planRows)} rows</span>}
        {node.actualTotalTime !== undefined && <span className="plan-metric">{formatMs(node.actualTotalTime)}</span>}
        {!!annotations.length && <span className={`plan-badge ${annotations[0].severity}`}>{annotations[0].severity}</span>}
      </summary>
      <div className="plan-node-body">
        <div className="plan-details">
          {node.startupCost !== undefined && <span>startup {formatNumber(node.startupCost)}</span>}
          {node.planWidth !== undefined && <span>width {formatNumber(node.planWidth)}</span>}
          {node.actualRows !== undefined && <span>actual rows {formatNumber(node.actualRows)}</span>}
          {node.actualLoops !== undefined && <span>loops {formatNumber(node.actualLoops)}</span>}
          {node.joinType && <span>join {node.joinType}</span>}
        </div>
        {[node.filter, node.indexCond, node.hashCond, node.mergeCond, node.joinFilter].filter(Boolean).map((condition, index) => (
          <pre className="plan-condition" key={`${node.id}-condition-${index}`}>{condition}</pre>
        ))}
        {!!annotations.length && (
          <div className="plan-annotations">
            {annotations.map((annotation, index) => (
              <div className={`plan-annotation ${annotation.severity}`} key={`${node.id}-annotation-${index}`}>
                <strong>{annotation.message}</strong>
                {annotation.suggestion && <span>{annotation.suggestion}</span>}
              </div>
            ))}
          </div>
        )}
        {node.children.map((child) => (
          <PlanNodeView key={child.id} node={child} annotationsByNode={annotationsByNode} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatMs(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}ms`;
}
