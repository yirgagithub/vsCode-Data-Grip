import * as vscode from 'vscode';
import {
  AiSqlRequest,
  DataProfileNarrative,
  DataProfileNarrativeRequest,
  QueryPlanAiAdvice,
  QueryPlanAnnotationRequest,
  QueryMemorySummary,
  QueryMemorySummaryRequest,
  TablePerformanceAdvice,
  TablePerformanceAdviceRequest,
  TablePerformanceImpact,
  TablePerformanceRecommendationKind
} from '../types';
import { parseQueryMemorySummaryText } from './queryMemorySummaryParser';

type AiProvider = 'copilot' | 'openAiCompatible';

export class VsCodeLanguageModelSqlAdapter {
  async isAvailable(): Promise<boolean> {
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
    } catch {
      return false;
    }
  }

  async send(request: AiSqlRequest): Promise<string> {
    const prompt = this.prompt(request);
    const text = await this.sendRaw(prompt);
    const sql = this.extractSql(text);
    if (!sql.trim()) {
      throw new Error('The language model did not return SQL.');
    }
    return sql;
  }

  async summarizeQueryMemory(request: QueryMemorySummaryRequest): Promise<QueryMemorySummary> {
    const text = await this.sendRaw(this.summaryPrompt(request));
    return this.parseSummary(text);
  }

  async adviseTablePerformance(request: TablePerformanceAdviceRequest): Promise<TablePerformanceAdvice> {
    const text = await this.sendRaw(this.tablePerformancePrompt(request));
    return this.parseTablePerformanceAdvice(text);
  }

  async annotateQueryPlan(request: QueryPlanAnnotationRequest): Promise<QueryPlanAiAdvice> {
    const text = await this.sendRaw(this.queryPlanPrompt(request));
    return this.parseQueryPlanAdvice(text);
  }

  async summarizeDataProfile(request: DataProfileNarrativeRequest): Promise<DataProfileNarrative> {
    const text = await this.sendRaw(this.dataProfilePrompt(request));
    return this.parseDataProfileNarrative(text);
  }

  private prompt(request: AiSqlRequest): string {
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

  private async sendRaw(prompt: string): Promise<string> {
    const settings = this.settings();
    if (settings.provider === 'openAiCompatible') {
      return this.sendOpenAiCompatible(prompt, settings);
    }
    return this.sendCopilot(prompt, settings);
  }

  private async sendCopilot(prompt: string, settings = this.settings()): Promise<string> {
    const lm = this.languageModelNamespace();
    if (!lm?.selectChatModels) {
      throw new Error('VS Code Language Model API is not available.');
    }

    const models = await lm.selectChatModels({ vendor: settings.copilotVendor });
    const model = models[0] as {
      sendRequest: (messages: unknown[], options: Record<string, unknown>, token: vscode.CancellationToken) => Promise<{ text: AsyncIterable<string> }>;
    } | undefined;
    if (!model) {
      throw new Error('No VS Code language model is available.');
    }

    const messages = [
      (vscode as unknown as { LanguageModelChatMessage?: { User: (content: string) => unknown } }).LanguageModelChatMessage?.User(prompt) ?? { role: 'user', content: prompt }
    ];
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
    }
    return text;
  }

  private async sendOpenAiCompatible(prompt: string, settings = this.settings()): Promise<string> {
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
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('OpenAI-compatible model did not return JSON.');
    }
    const content = this.openAiCompatibleContent(json);
    if (!content.trim()) {
      throw new Error('OpenAI-compatible model returned an empty response.');
    }
    return content;
  }

  private summaryPrompt(request: QueryMemorySummaryRequest): string {
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

  private tablePerformancePrompt(request: TablePerformanceAdviceRequest): string {
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

  private queryPlanPrompt(request: QueryPlanAnnotationRequest): string {
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

  private dataProfilePrompt(request: DataProfileNarrativeRequest): string {
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

  private parseSummary(text: string): QueryMemorySummary {
    return parseQueryMemorySummaryText(text);
  }

  private parseTablePerformanceAdvice(text: string): TablePerformanceAdvice {
    const parsed = JSON.parse(this.extractJson(text)) as Partial<TablePerformanceAdvice>;
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 12)
      : [];
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((item) => item as Partial<TablePerformanceAdvice['recommendations'][number]>).flatMap((item) => {
        const kind = this.validRecommendationKind(item.kind);
        const impact = this.validImpact(item.impact);
        const rationale = typeof item.rationale === 'string' ? item.rationale.trim() : '';
        const ddl = typeof item.ddl === 'string' ? item.ddl.trim() : '';
        return kind && impact && rationale && ddl ? [{ kind, impact, rationale, ddl }] : [];
      }).slice(0, 12)
      : [];
    return { findings, recommendations };
  }

  private parseQueryPlanAdvice(text: string): QueryPlanAiAdvice {
    const parsed = JSON.parse(this.extractJson(text)) as Partial<QueryPlanAiAdvice>;
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 12)
      : [];
    const annotations = Array.isArray(parsed.annotations)
      ? parsed.annotations.flatMap((item) => {
        const record = item as Partial<QueryPlanAiAdvice['annotations'][number]>;
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

  private parseDataProfileNarrative(text: string): DataProfileNarrative {
    const parsed = JSON.parse(this.extractJson(text)) as Partial<DataProfileNarrative>;
    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 500)
        : 'Profile generated from sampled rows.',
      anomalies: Array.isArray(parsed.anomalies)
        ? parsed.anomalies.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 12)
        : []
    };
  }

  private languageModelNamespace(): { selectChatModels?: (selector?: Record<string, unknown>) => Promise<unknown[]> } | undefined {
    return (vscode as unknown as { lm?: unknown }).lm as {
      selectChatModels?: (selector?: Record<string, unknown>) => Promise<unknown[]>;
    } | undefined;
  }

  private extractSql(text: string): string {
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    return (fenced?.[1] ?? text).trim();
  }

  private extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? text).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new Error('The language model did not return JSON.');
    }
    return candidate.slice(start, end + 1);
  }

  private settings(): {
    provider: AiProvider;
    copilotVendor: string;
    openAiCompatibleBaseUrl: string;
    openAiCompatibleModel: string;
    openAiCompatibleApiKey: string;
    openAiCompatibleApiKeyEnvVar: string;
  } {
    const config = vscode.workspace.getConfiguration('database');
    const provider = config.get<string>('ai.provider', 'copilot') === 'openAiCompatible' ? 'openAiCompatible' : 'copilot';
    return {
      provider,
      copilotVendor: config.get<string>('ai.copilot.vendor', 'copilot') || 'copilot',
      openAiCompatibleBaseUrl: config.get<string>('ai.openAiCompatible.baseUrl', '').trim(),
      openAiCompatibleModel: config.get<string>('ai.openAiCompatible.model', '').trim(),
      openAiCompatibleApiKey: config.get<string>('ai.openAiCompatible.apiKey', '').trim(),
      openAiCompatibleApiKeyEnvVar: config.get<string>('ai.openAiCompatible.apiKeyEnvVar', 'DATABASE_AI_API_KEY').trim()
    };
  }

  private openAiCompatibleApiKey(settings = this.settings()): string {
    return settings.openAiCompatibleApiKey
      || (settings.openAiCompatibleApiKeyEnvVar ? process.env[settings.openAiCompatibleApiKeyEnvVar]?.trim() ?? '' : '');
  }

  private openAiCompatibleEndpoint(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
  }

  private openAiCompatibleContent(value: unknown): string {
    const record = value as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> };
    const first = record.choices?.[0];
    const content = first?.message?.content ?? first?.text;
    return typeof content === 'string' ? content : '';
  }

  private validImpact(value: unknown): TablePerformanceImpact | undefined {
    return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
  }

  private validPlanSeverity(value: unknown): 'high' | 'medium' | 'low' | undefined {
    return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
  }

  private validRecommendationKind(value: unknown): TablePerformanceRecommendationKind | undefined {
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
