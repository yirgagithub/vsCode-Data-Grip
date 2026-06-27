import * as vscode from 'vscode';
import { QueryExecutor } from '../database/queryExecutor';
import { ConnectionManager } from '../database/connectionManager';
import { QueryMemorySearchResult } from '../types';
import { QueryMemoryService } from '../services/queryMemoryService';
import { SqlSafetyClassifier } from '../services/sqlSafetyClassifier';
import { VsCodeLanguageModelSqlAdapter } from '../ai/vsCodeLanguageModelSqlAdapter';

export class QueryMemoryController {
  private readonly safety = new SqlSafetyClassifier();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly memory: QueryMemoryService,
    private readonly connectionManager: ConnectionManager,
    private readonly executor: QueryExecutor,
    private readonly ai: VsCodeLanguageModelSqlAdapter,
    private readonly addResultTab: (tab: Awaited<ReturnType<QueryExecutor['execute']>>) => Promise<void>
  ) {}

  register(register: (command: string, callback: (...args: unknown[]) => unknown) => void): void {
    register('database.findPastQuery', () => this.findPastQuery());
    register('database.backfillQueryMemorySummaries', () => this.backfillSummaries());
  }

  private async findPastQuery(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Find past query',
      placeHolder: 'duplicate invoices, monthly churn, customer email last_login'
    });
    if (query === undefined) {
      return;
    }
    const connection = this.connectionManager.getPreferredConnection();
    const results = await this.memory.search({
      query,
      connectionId: connection?.id,
      limit: 20,
      includeFailed: true
    });
    if (!results.length) {
      void vscode.window.showInformationMessage('No matching query memory found.');
      return;
    }

    const picked = await vscode.window.showQuickPick(results.map((result) => this.toPick(result)), {
      placeHolder: 'Query memory results',
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!picked) {
      return;
    }
    await this.handleAction(picked.result);
  }

  private async handleAction(result: QueryMemorySearchResult): Promise<void> {
    const item = result.item;
    const safety = this.safety.classify(item.sql, { production: this.connectionManager.getConnection(item.connectionId ?? '')?.production });
    const aiAvailable = await this.ai.isAvailable();
    const actions = [
      { label: 'Open SQL', action: 'open' as const },
      { label: 'Copy SQL', action: 'copy' as const },
      aiAvailable ? { label: 'Explain', action: 'explain' as const } : undefined,
      aiAvailable ? { label: 'Modify...', action: 'modify' as const } : undefined,
      safety.previewAvailable ? { label: 'Preview Safety SQL', action: 'preview' as const } : undefined,
      { label: safety.requiresConfirmation ? 'Run with Safety Check' : 'Run', action: 'run' as const }
    ].filter((action): action is Exclude<typeof action, undefined> => action !== undefined);
    const picked = await vscode.window.showQuickPick(actions, {
      placeHolder: [item.title ?? 'Query memory', safety.reasons.join(' ')].filter(Boolean).join(' - ')
    });
    if (!picked) {
      return;
    }
    if (picked.action === 'open') {
      await this.openSql(item.sql, item.title ?? 'Query Memory');
    } else if (picked.action === 'copy') {
      await vscode.env.clipboard.writeText(item.sql);
    } else if (picked.action === 'explain') {
      await this.openAiResult('Explain Query', await this.ai.send({ action: 'explain', selectedSql: item.sql, relevantSchema: { tables: [] } }));
    } else if (picked.action === 'modify') {
      const instruction = await vscode.window.showInputBox({ prompt: 'How should this query change?' });
      if (instruction) {
        await this.openAiResult('Modified Query', await this.ai.send({ action: 'generate', selectedSql: item.sql, lastError: instruction, relevantSchema: { tables: [] } }));
      }
    } else if (picked.action === 'preview') {
      const preview = this.safety.previewSql(item.sql, item.databaseType);
      if (preview) {
        await this.openSql(preview, 'Query Safety Preview');
      }
    } else if (picked.action === 'run') {
      await this.run(item.sql, item.connectionId);
    }
  }

  private async run(sql: string, connectionId?: string): Promise<void> {
    const connection = connectionId ? this.connectionManager.getConnection(connectionId) : this.connectionManager.getPreferredConnection();
    if (!connection) {
      void vscode.window.showInformationMessage('Select a database connection before running query memory SQL.');
      return;
    }
    const tab = await this.executor.execute({ connectionId: connection.id, sql });
    await this.addResultTab(tab);
  }

  private async backfillSummaries(): Promise<void> {
    if (!await this.ai.isAvailable()) {
      void vscode.window.showInformationMessage('Query memory summaries need a VS Code language model provider or configured database.ai.openAiCompatible settings.');
      return;
    }
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Summarizing query memory',
      cancellable: true
    }, async (_progress, token) => {
      const result = await this.memory.backfillSummaries({ limit: 25, token });
      void vscode.window.showInformationMessage(`Query memory backfill: ${result.succeeded} summarized, ${result.failed} failed, ${result.skipped} skipped.`);
    });
  }

  private toPick(result: QueryMemorySearchResult): vscode.QuickPickItem & { result: QueryMemorySearchResult } {
    const item = result.item;
    const title = item.title ?? item.sql.replace(/\s+/g, ' ').slice(0, 80);
    const meta = [
      item.connectionName ?? item.databaseName,
      item.status,
      item.runCount && item.runCount > 1 ? `${item.runCount} runs` : undefined,
      item.rowCount !== undefined ? `${item.rowCount} rows` : undefined,
      item.executedAt ? new Date(item.executedAt).toLocaleString() : undefined
    ].filter(Boolean).join(' - ');
    return {
      label: title,
      description: `${Math.round(result.score)} pts${result.safety.risk !== 'safe' ? ` - ${result.safety.risk}` : ''}`,
      detail: [item.summary, meta, result.reasons.join(', '), item.sql.replace(/\s+/g, ' ').slice(0, 180)].filter(Boolean).join('\n'),
      result
    };
  }

  private async openSql(sql: string, title: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: `${sql.trim()}\n` });
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
  }

  private async openAiResult(title: string, text: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: `-- ${title}\n${text.trim()}\n` });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }
}
