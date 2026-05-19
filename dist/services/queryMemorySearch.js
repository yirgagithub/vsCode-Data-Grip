"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryMemorySearch = void 0;
const sqlSafetyClassifier_1 = require("./sqlSafetyClassifier");
class QueryMemorySearch {
    safety;
    constructor(safety = new sqlSafetyClassifier_1.SqlSafetyClassifier()) {
        this.safety = safety;
    }
    search(items, request) {
        const terms = this.terms(request.query);
        const limit = request.limit && request.limit > 0 ? request.limit : 20;
        return items
            .filter((item) => this.matchesFilters(item, request))
            .map((item) => this.score(item, terms))
            .filter((result) => request.query.trim().length === 0 || result.score > 0)
            .sort((a, b) => b.score - a.score || (b.item.executedAt ?? b.item.updatedAt) - (a.item.executedAt ?? a.item.updatedAt))
            .slice(0, limit);
    }
    matchesFilters(item, request) {
        if (request.connectionId && item.connectionId !== request.connectionId) {
            return false;
        }
        if (!request.includeFailed && item.status === 'failed') {
            return false;
        }
        return true;
    }
    score(item, terms) {
        const reasons = [];
        let score = 0;
        const fields = [
            ['title', item.title ?? '', 12],
            ['summary', item.summary ?? '', 8],
            ['sql', item.sql, 5],
            ['source', item.sourceFile ?? item.documentUri ?? '', 4],
            ['connection', `${item.connectionName ?? ''} ${item.databaseName ?? ''}`, 3],
            ['status', item.status ?? '', 2]
        ];
        const arrays = [
            ['table', item.tables, 10],
            ['column', item.columns, 7],
            ['output column', item.outputColumns, 9]
        ];
        for (const term of terms) {
            for (const [name, value, weight] of fields) {
                if (this.includes(value, term)) {
                    score += weight;
                    reasons.push(`${name}: ${term}`);
                }
            }
            for (const [name, values, weight] of arrays) {
                if (values.some((value) => this.includes(value, term))) {
                    score += weight;
                    reasons.push(`${name}: ${term}`);
                }
            }
        }
        if (item.favorite) {
            score += 5;
            reasons.push('favorite');
        }
        if (item.executedAt && Date.now() - item.executedAt < 7 * 24 * 60 * 60 * 1000) {
            score += 2;
            reasons.push('recent');
        }
        return {
            item,
            score,
            reasons: [...new Set(reasons)].slice(0, 6),
            safety: this.safety.classify(item.sql)
        };
    }
    terms(query) {
        return [...new Set(query.toLowerCase().split(/[^a-z0-9_.$"]+/).map((term) => term.replace(/^"|"$/g, '')).filter((term) => term.length >= 2))];
    }
    includes(value, term) {
        return value.toLowerCase().includes(term);
    }
}
exports.QueryMemorySearch = QueryMemorySearch;
//# sourceMappingURL=queryMemorySearch.js.map