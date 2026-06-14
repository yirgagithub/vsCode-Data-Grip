"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VsCodeLanguageModelSqlAdapter = void 0;
const vscode = __importStar(require("vscode"));
const queryMemorySummaryParser_1 = require("./queryMemorySummaryParser");
class VsCodeLanguageModelSqlAdapter {
    async isAvailable() {
        const settings = this.settings();
        if (settings.provider === 'openAiCompatible') {
            return !!(settings.openAiCompatibleBaseUrl && settings.openAiCompatibleModel && this.openAiCompatibleApiKey(settings));
        }
        const lm = this.languageModelNamespace();
        if (!lm?.selectChatModels) {
            return false;
        }
        try {
            const models = await lm.selectChatModels({ vendor: 'copilot' });
            return models.length > 0;
        }
        catch {
            return false;
        }
    }
    async send(request) {
        const prompt = this.prompt(request);
        const text = await this.sendRaw(prompt);
        const sql = this.extractSql(text);
        if (!sql.trim()) {
            throw new Error('The language model did not return SQL.');
        }
        return sql;
    }
    async summarizeQueryMemory(request) {
        const text = await this.sendRaw(this.summaryPrompt(request));
        return this.parseSummary(text);
    }
    async adviseTablePerformance(request) {
        const text = await this.sendRaw(this.tablePerformancePrompt(request));
        return this.parseTablePerformanceAdvice(text);
    }
    async annotateQueryPlan(request) {
        const text = await this.sendRaw(this.queryPlanPrompt(request));
        return this.parseQueryPlanAdvice(text);
    }
    async summarizeDataProfile(request) {
        const text = await this.sendRaw(this.dataProfilePrompt(request));
        return this.parseDataProfileNarrative(text);
    }
    prompt(request) {
        const schema = request.relevantSchema.tables.map((table) => {
            const columns = table.columns?.map((column) => `${column.name} ${column.dataType}${column.nullable ? '' : ' not null'}`).join(', ');
            return `${table.schema}.${table.name}${columns ? ` (${columns})` : ''}`;
        }).join('\n');
        return [
            'You are helping write PostgreSQL/Redshift SQL inside VS Code.',
            'Return only SQL or concise SQL comments plus SQL. Do not execute anything.',
            `Action: ${request.action}`,
            request.selectedSql ? `Selected SQL:\n${request.selectedSql}` : '',
            request.lastError ? `Last error:\n${request.lastError}` : '',
            `Visible database context: ${request.relevantSchema.connectionName ?? 'connection'} ${request.relevantSchema.databaseName ?? ''}`,
            `Schema:\n${schema || '(no schema metadata available)'}`
        ].filter(Boolean).join('\n\n');
    }
    async sendRaw(prompt) {
        const settings = this.settings();
        if (settings.provider === 'openAiCompatible') {
            return this.sendOpenAiCompatible(prompt, settings);
        }
        return this.sendCopilot(prompt, settings);
    }
    async sendCopilot(prompt, settings = this.settings()) {
        const lm = this.languageModelNamespace();
        if (!lm?.selectChatModels) {
            throw new Error('VS Code Language Model API is not available.');
        }
        const models = await lm.selectChatModels({ vendor: settings.copilotVendor });
        const model = models[0];
        if (!model) {
            throw new Error('No VS Code language model is available.');
        }
        const messages = [
            vscode.LanguageModelChatMessage?.User(prompt) ?? { role: 'user', content: prompt }
        ];
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        let text = '';
        for await (const chunk of response.text) {
            text += chunk;
        }
        return text;
    }
    async sendOpenAiCompatible(prompt, settings = this.settings()) {
        const apiKey = this.openAiCompatibleApiKey(settings);
        if (!settings.openAiCompatibleBaseUrl || !settings.openAiCompatibleModel || !apiKey) {
            throw new Error('OpenAI-compatible AI settings require base URL, model, and API key.');
        }
        const endpoint = this.openAiCompatibleEndpoint(settings.openAiCompatibleBaseUrl);
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: settings.openAiCompatibleModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1
            })
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`OpenAI-compatible model request failed (${response.status}): ${text.slice(0, 300)}`);
        }
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            throw new Error('OpenAI-compatible model did not return JSON.');
        }
        const content = this.openAiCompatibleContent(json);
        if (!content.trim()) {
            throw new Error('OpenAI-compatible model returned an empty response.');
        }
        return content;
    }
    summaryPrompt(request) {
        return [
            'Summarize this SQL query for local query-memory search inside VS Code.',
            'Return only JSON with this shape: {"title":"short title","summary":"one sentence","tables":["schema.table"],"columns":["table.column"]}.',
            'Do not include result row values. Do not include secrets.',
            `Connection: ${request.connectionName ?? 'connection'} ${request.databaseName ?? ''} ${request.databaseType ?? ''}`,
            request.outputColumns?.length ? `Output columns: ${request.outputColumns.join(', ')}` : '',
            request.errorMessage ? `Execution error: ${request.errorMessage}` : '',
            `SQL:\n${request.sql}`
        ].filter(Boolean).join('\n\n');
    }
    tablePerformancePrompt(request) {
        return [
            'You are a PostgreSQL and Amazon Redshift performance advisor inside VS Code.',
            'Return only JSON with this exact shape: {"findings":["..."],"recommendations":[{"kind":"sortkey|distkey|index|partition|vacuum|analyze","impact":"high|medium|low","rationale":"...","ddl":"..."}]}.',
            'Use only the supplied DDL, table stats, deterministic flags, and workload summary. Do not invent columns, indexes, or runtime facts not present in the input.',
            'Never suggest auto-executing DDL. DDL must be ready to paste into a SQL editor for user review.',
            `Connection: ${request.connectionName ?? 'connection'} ${request.databaseName ?? ''} ${request.databaseType}`,
            `Table: ${request.schema}.${request.table}`,
            `DDL:\n${request.tableDdl}`,
            `Stats JSON:\n${JSON.stringify(request.stats, null, 2)}`,
            `Deterministic flags JSON:\n${JSON.stringify(request.prepassFlags, null, 2)}`,
            `Workload summary JSON:\n${JSON.stringify({
                queryCount: request.workload.queryCount,
                totalRunCount: request.workload.totalRunCount,
                totalDurationMs: request.workload.totalDurationMs,
                columns: request.workload.columns,
                topQueries: request.workload.topQueries.map((query) => ({
                    title: query.title,
                    runCount: query.runCount,
                    durationMs: query.durationMs,
                    sql: query.sql.slice(0, 1600)
                }))
            }, null, 2)}`
        ].filter(Boolean).join('\n\n');
    }
    queryPlanPrompt(request) {
        return [
            'You are a PostgreSQL and Amazon Redshift query-plan advisor inside VS Code.',
            'Return only JSON with this exact shape: {"findings":["..."],"annotations":[{"nodeId":"plan.1","severity":"high|medium|low","message":"...","suggestion":"..."}],"rewrittenSql":"optional rewritten SQL"}.',
            'Use only the supplied SQL and plan. Do not invent schema objects. Keep suggestions actionable and concise.',
            'Focus on hot nodes: sequential scans over large relations, bad nested loops, expensive sorts, hash joins with large row estimates, and stale statistics symptoms.',
            `Connection: ${request.connectionName ?? 'connection'} ${request.databaseName ?? ''} ${request.databaseType}`,
            `SQL:\n${request.sql}`,
            `Plan JSON:\n${JSON.stringify(request.plan, null, 2)}`
        ].filter(Boolean).join('\n\n');
    }
    dataProfilePrompt(request) {
        return [
            'You are summarizing a sampled database table profile inside VS Code.',
            'Return only JSON with this exact shape: {"summary":"one sentence","anomalies":["..."]}.',
            'Use only the supplied sample profile. Do not claim exact full-table facts unless the sample says so.',
            `Connection: ${request.connectionName ?? 'connection'} ${request.databaseName ?? ''} ${request.databaseType}`,
            `Table: ${request.schema}.${request.table}`,
            `Sample rows: ${request.sampleRows}`,
            `Column profiles JSON:\n${JSON.stringify(request.columns, null, 2)}`
        ].filter(Boolean).join('\n\n');
    }
    parseSummary(text) {
        return (0, queryMemorySummaryParser_1.parseQueryMemorySummaryText)(text);
    }
    parseTablePerformanceAdvice(text) {
        const parsed = JSON.parse(this.extractJson(text));
        const findings = Array.isArray(parsed.findings)
            ? parsed.findings.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 12)
            : [];
        const recommendations = Array.isArray(parsed.recommendations)
            ? parsed.recommendations.map((item) => item).flatMap((item) => {
                const kind = this.validRecommendationKind(item.kind);
                const impact = this.validImpact(item.impact);
                const rationale = typeof item.rationale === 'string' ? item.rationale.trim() : '';
                const ddl = typeof item.ddl === 'string' ? item.ddl.trim() : '';
                return kind && impact && rationale && ddl ? [{ kind, impact, rationale, ddl }] : [];
            }).slice(0, 12)
            : [];
        return { findings, recommendations };
    }
    parseQueryPlanAdvice(text) {
        const parsed = JSON.parse(this.extractJson(text));
        const findings = Array.isArray(parsed.findings)
            ? parsed.findings.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 12)
            : [];
        const annotations = Array.isArray(parsed.annotations)
            ? parsed.annotations.flatMap((item) => {
                const record = item;
                const severity = this.validPlanSeverity(record.severity);
                const message = typeof record.message === 'string' ? record.message.trim() : '';
                const suggestion = typeof record.suggestion === 'string' ? record.suggestion.trim() : undefined;
                const nodeId = typeof record.nodeId === 'string' ? record.nodeId.trim() : undefined;
                return severity && message ? [{ nodeId, severity, message, suggestion }] : [];
            }).slice(0, 20)
            : [];
        const rewrittenSql = typeof parsed.rewrittenSql === 'string' && parsed.rewrittenSql.trim()
            ? parsed.rewrittenSql.trim()
            : undefined;
        return { findings, annotations, rewrittenSql };
    }
    parseDataProfileNarrative(text) {
        const parsed = JSON.parse(this.extractJson(text));
        return {
            summary: typeof parsed.summary === 'string' && parsed.summary.trim()
                ? parsed.summary.trim().slice(0, 500)
                : 'Profile generated from sampled rows.',
            anomalies: Array.isArray(parsed.anomalies)
                ? parsed.anomalies.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 12)
                : []
        };
    }
    languageModelNamespace() {
        return vscode.lm;
    }
    extractSql(text) {
        const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
        return (fenced?.[1] ?? text).trim();
    }
    extractJson(text) {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = (fenced?.[1] ?? text).trim();
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start === -1 || end === -1 || end < start) {
            throw new Error('The language model did not return JSON.');
        }
        return candidate.slice(start, end + 1);
    }
    settings() {
        const config = vscode.workspace.getConfiguration('database');
        const provider = config.get('ai.provider', 'copilot') === 'openAiCompatible' ? 'openAiCompatible' : 'copilot';
        return {
            provider,
            copilotVendor: config.get('ai.copilot.vendor', 'copilot') || 'copilot',
            openAiCompatibleBaseUrl: config.get('ai.openAiCompatible.baseUrl', '').trim(),
            openAiCompatibleModel: config.get('ai.openAiCompatible.model', '').trim(),
            openAiCompatibleApiKey: config.get('ai.openAiCompatible.apiKey', '').trim(),
            openAiCompatibleApiKeyEnvVar: config.get('ai.openAiCompatible.apiKeyEnvVar', 'DATABASE_AI_API_KEY').trim()
        };
    }
    openAiCompatibleApiKey(settings = this.settings()) {
        return settings.openAiCompatibleApiKey
            || (settings.openAiCompatibleApiKeyEnvVar ? process.env[settings.openAiCompatibleApiKeyEnvVar]?.trim() ?? '' : '');
    }
    openAiCompatibleEndpoint(baseUrl) {
        const trimmed = baseUrl.trim().replace(/\/+$/, '');
        return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
    }
    openAiCompatibleContent(value) {
        const record = value;
        const first = record.choices?.[0];
        const content = first?.message?.content ?? first?.text;
        return typeof content === 'string' ? content : '';
    }
    validImpact(value) {
        return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
    }
    validPlanSeverity(value) {
        return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
    }
    validRecommendationKind(value) {
        return value === 'sortkey'
            || value === 'distkey'
            || value === 'index'
            || value === 'partition'
            || value === 'vacuum'
            || value === 'analyze'
            ? value
            : undefined;
    }
}
exports.VsCodeLanguageModelSqlAdapter = VsCodeLanguageModelSqlAdapter;
//# sourceMappingURL=vsCodeLanguageModelSqlAdapter.js.map