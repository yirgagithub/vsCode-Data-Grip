"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TablePerformanceAdvisorService = void 0;
exports.buildTablePerformancePrepassFlags = buildTablePerformancePrepassFlags;
const sqlDialect_1 = require("./sqlDialect");
class TablePerformanceAdvisorService {
    connectionManager;
    memory;
    ai;
    constructor(connectionManager, memory, ai) {
        this.connectionManager = connectionManager;
        this.memory = memory;
        this.ai = ai;
    }
    async analyzeTable(connection, schema, table) {
        if (!this.connectionManager.isConnected(connection.id)) {
            await this.connectionManager.connect(connection.id);
        }
        const driver = this.connectionManager.getDriver(connection.type);
        const tableRef = `${schema}.${table}`;
        const [tableDdl, stats, workload] = await Promise.all([
            driver.getTableDDL(connection.id, schema, table),
            driver.getTableStats(connection.id, schema, table),
            this.memory.getTableWorkload(connection.id, tableRef)
        ]);
        const prepassFlags = buildTablePerformancePrepassFlags(stats, workload);
        const request = {
            connectionName: connection.name,
            databaseType: connection.type,
            databaseName: connection.database,
            schema,
            table,
            tableDdl,
            stats,
            prepassFlags,
            workload
        };
        try {
            const advice = await this.ai.adviseTablePerformance(request);
            return { request, advice: mergeDeterministicRecommendations(advice, prepassFlags) };
        }
        catch (error) {
            return {
                request,
                advice: deterministicAdvice(prepassFlags),
                aiError: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
exports.TablePerformanceAdvisorService = TablePerformanceAdvisorService;
function buildTablePerformancePrepassFlags(stats, workload) {
    const flags = [];
    const databaseType = stats.databaseType;
    if (databaseType === 'redis') {
        return flags;
    }
    const table = (0, sqlDialect_1.qualifiedSqlName)(databaseType, stats.schema, stats.table);
    const redshift = stats.redshift;
    if (redshift) {
        const joinColumn = topWorkloadColumn(workload, 'join');
        const filterColumn = topWorkloadColumn(workload, 'filter') ?? topWorkloadColumn(workload, 'orderBy');
        if ((redshift.skewRows ?? 0) > 4) {
            flags.push({
                kind: 'redshift_distribution_skew',
                impact: 'high',
                message: 'Distribution skew is high for this Redshift table.',
                evidence: `skew_rows=${redshift.skewRows}`,
                recommendationKind: 'distkey',
                ddl: joinColumn ? `alter table ${table} alter distkey ${(0, sqlDialect_1.quoteSqlIdentifier)(databaseType, joinColumn)};` : undefined
            });
        }
        if ((redshift.unsortedPct ?? 0) > 20) {
            flags.push({
                kind: 'redshift_unsorted_rows',
                impact: 'medium',
                message: 'A large share of rows are unsorted; sort-sensitive scans can slow down.',
                evidence: `unsorted=${redshift.unsortedPct}%`,
                recommendationKind: 'vacuum',
                ddl: `vacuum sort only ${table};`
            });
        }
        if ((redshift.statsOffPct ?? 0) > 10) {
            flags.push({
                kind: 'redshift_stale_stats',
                impact: 'medium',
                message: 'Redshift statistics are stale enough to affect plan quality.',
                evidence: `stats_off=${redshift.statsOffPct}%`,
                recommendationKind: 'analyze',
                ddl: `analyze ${table};`
            });
        }
        if (filterColumn && !redshift.sortKey1) {
            flags.push({
                kind: 'redshift_missing_sortkey_candidate',
                impact: 'medium',
                message: 'The workload repeatedly filters or orders this table without a leading sort key.',
                evidence: workloadEvidence(workload, filterColumn),
                recommendationKind: 'sortkey',
                ddl: `alter table ${table} alter sortkey (${(0, sqlDialect_1.quoteSqlIdentifier)(databaseType, filterColumn)});`
            });
        }
        return flags;
    }
    if (databaseType !== 'postgres') {
        return flags;
    }
    const rowCount = stats.liveRows ?? stats.rowEstimate ?? 0;
    const seqScan = stats.seqScan ?? 0;
    const idxScan = stats.idxScan ?? 0;
    const filterColumn = topWorkloadColumn(workload, 'filter');
    if (rowCount > 10_000 && seqScan > 50 && seqScan > idxScan * 5) {
        flags.push({
            kind: 'postgres_sequential_scan_pressure',
            impact: 'high',
            message: 'Sequential scans dominate index scans on a large table.',
            evidence: `seq_scan=${seqScan}, idx_scan=${idxScan}, rows=${rowCount}`,
            recommendationKind: 'index',
            ddl: filterColumn
                ? `create index concurrently if not exists ${(0, sqlDialect_1.quoteSqlIdentifier)(databaseType, `${stats.table}_${filterColumn}_idx`)} on ${table} (${(0, sqlDialect_1.quoteSqlIdentifier)(databaseType, filterColumn)});`
                : undefined
        });
    }
    return flags;
}
function deterministicAdvice(flags) {
    return {
        findings: flags.length
            ? flags.map((flag) => `${flag.message} (${flag.evidence})`)
            : ['No deterministic performance issues were found from cached stats and query memory.'],
        recommendations: deterministicRecommendations(flags)
    };
}
function mergeDeterministicRecommendations(advice, flags) {
    const recommendations = [...advice.recommendations];
    const existing = new Set(recommendations.map((item) => `${item.kind}:${item.ddl.trim().toLowerCase()}`));
    for (const recommendation of deterministicRecommendations(flags)) {
        const key = `${recommendation.kind}:${recommendation.ddl.trim().toLowerCase()}`;
        if (!existing.has(key)) {
            existing.add(key);
            recommendations.push(recommendation);
        }
    }
    return { findings: advice.findings, recommendations };
}
function deterministicRecommendations(flags) {
    return flags
        .filter((flag) => flag.recommendationKind && flag.ddl)
        .map((flag) => ({
        kind: flag.recommendationKind,
        impact: flag.impact,
        rationale: `${flag.message} Evidence: ${flag.evidence}`,
        ddl: flag.ddl
    }));
}
function topWorkloadColumn(workload, role) {
    return workload.columns
        .filter((column) => column.role === role)
        .sort((left, right) => right.durationMs - left.durationMs || right.runCount - left.runCount || right.queryCount - left.queryCount)[0]?.column;
}
function workloadEvidence(workload, column) {
    const uses = workload.columns.filter((item) => item.column.toLowerCase() === column.toLowerCase());
    const runCount = uses.reduce((total, item) => total + item.runCount, 0);
    const durationMs = uses.reduce((total, item) => total + item.durationMs, 0);
    return `${column} appears in ${runCount} weighted runs totaling ${durationMs}ms`;
}
//# sourceMappingURL=tablePerformanceAdvisorService.js.map