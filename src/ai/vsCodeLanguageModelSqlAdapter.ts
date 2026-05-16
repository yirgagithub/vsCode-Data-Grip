import * as vscode from 'vscode';
import { AiSqlRequest } from '../types';

export class VsCodeLanguageModelSqlAdapter {
  async send(request: AiSqlRequest): Promise<string> {
    const lm = (vscode as unknown as { lm?: unknown }).lm as {
      selectChatModels?: (selector?: Record<string, unknown>) => Promise<unknown[]>;
    } | undefined;
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

  private extractSql(text: string): string {
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    return (fenced?.[1] ?? text).trim();
  }
}
