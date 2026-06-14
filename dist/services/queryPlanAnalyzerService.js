"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryPlanAnalyzerService = void 0;
class QueryPlanAnalyzerService {
    connectionManager;
    ai;
    constructor(connectionManager, ai) {
        this.connectionManager = connectionManager;
        this.ai = ai;
    }
    async explain(connection, sql, options = {}) {
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
        }
        catch (error) {
            return {
                ...plan,
                aiError: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
exports.QueryPlanAnalyzerService = QueryPlanAnalyzerService;
//# sourceMappingURL=queryPlanAnalyzerService.js.map