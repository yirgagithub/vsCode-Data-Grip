import * as vscode from 'vscode';
import { AiSqlRequest, QueryMemorySummary, QueryMemorySummaryRequest } from '../types';
import { parseQueryMemorySummaryText } from './queryMemorySummaryParser';

export class VsCodeLanguageModelSqlAdapter {
  async isAvailable(): Promise<boolean> {
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
    const lm = this.languageModelNamespace();
    if (!lm?.selectChatModels) {
      throw new Error('VS Code Language Model API is not available.');
    }

    const models = await lm.selectChatModels({ vendor: 'copilot' });
    const model = models[0] as {
      sendRequest: (messages: unknown[], options: Record<string, unknown>, token: vscode.CancellationToken) => Promise<{ text: AsyncIterable<string> }>;
    } | undefined;
    if (!model) {
      throw new Error('No VS Code language model is available.');
    }

    const prompt = this.prompt(request);
    const messages = [
      (vscode as unknown as { LanguageModelChatMessage?: { User: (content: string) => unknown } }).LanguageModelChatMessage?.User(prompt) ?? { role: 'user', content: prompt }
    ];
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
    }
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
    const lm = this.languageModelNamespace();
    if (!lm?.selectChatModels) {
      throw new Error('VS Code Language Model API is not available.');
    }

    const models = await lm.selectChatModels({ vendor: 'copilot' });
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

  private parseSummary(text: string): QueryMemorySummary {
    return parseQueryMemorySummaryText(text);
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
      throw new Error('The language model did not return summary JSON.');
    }
    return candidate.slice(start, end + 1);
  }
}
