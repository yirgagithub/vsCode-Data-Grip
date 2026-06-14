import { ConnectionManager } from '../database/connectionManager';
import { ConnectionConfig, QueryPlanAiAdvice, QueryPlanAnnotationRequest, QueryPlanResult } from '../types';

export interface QueryPlanAiAdvisor {
  isAvailable(): Promise<boolean>;
  annotateQueryPlan(request: QueryPlanAnnotationRequest): Promise<QueryPlanAiAdvice>;
}

export class QueryPlanAnalyzerService {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly ai: QueryPlanAiAdvisor
  ) {}

  async explain(connection: ConnectionConfig, sql: string, options: { analyze?: boolean } = {}): Promise<QueryPlanResult> {
    if (!this.connectionManager.isConnected(connection.id)) {
      await this.connectionManager.connect(connection.id);
    }
    const plan = await this.connectionManager.getDriver(connection.type).explainQuery({
      connectionId: connection.id,
      sql
    }, { analyze: options.analyze });

    if (!await this.ai.isAvailable()) {
      return plan;
    }

    try {
      const advice = await this.ai.annotateQueryPlan({
        connectionName: connection.name,
        databaseType: connection.type,
        databaseName: connection.database,
        sql,
        plan
      });
      return {
        ...plan,
        annotations: [...plan.annotations, ...advice.annotations],
        aiFindings: advice.findings,
        rewrittenSql: advice.rewrittenSql
      };
    } catch (error) {
      return {
        ...plan,
        aiError: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
