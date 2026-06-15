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
exports.QueryMemoryController = void 0;
const vscode = __importStar(require("vscode"));
const sqlSafetyClassifier_1 = require("../services/sqlSafetyClassifier");
class QueryMemoryController {
    context;
    memory;
    connectionManager;
    executor;
    ai;
    addResultTab;
    safety = new sqlSafetyClassifier_1.SqlSafetyClassifier();
    constructor(context, memory, connectionManager, executor, ai, addResultTab) {
        this.context = context;
        this.memory = memory;
        this.connectionManager = connectionManager;
        this.executor = executor;
        this.ai = ai;
        this.addResultTab = addResultTab;
    }
    register(register) {
        register('database.findPastQuery', () => this.findPastQuery());
        register('database.backfillQueryMemorySummaries', () => this.backfillSummaries());
    }
    async findPastQuery() {
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
    async handleAction(result) {
        const item = result.item;
        const safety = this.safety.classify(item.sql, { production: this.connectionManager.getConnection(item.connectionId ?? '')?.production });
        const aiAvailable = await this.ai.isAvailable();
        const actions = [
            { label: 'Open SQL', action: 'open' },
            { label: 'Copy SQL', action: 'copy' },
            aiAvailable ? { label: 'Explain', action: 'explain' } : undefined,
            aiAvailable ? { label: 'Modify...', action: 'modify' } : undefined,
            safety.previewAvailable ? { label: 'Preview Safety SQL', action: 'preview' } : undefined,
            { label: safety.requiresConfirmation ? 'Run with Safety Check' : 'Run', action: 'run' }
        ].filter((action) => action !== undefined);
        const picked = await vscode.window.showQuickPick(actions, {
            placeHolder: [item.title ?? 'Query memory', safety.reasons.join(' ')].filter(Boolean).join(' - ')
        });
        if (!picked) {
            return;
        }
        if (picked.action === 'open') {
            await this.openSql(item.sql, item.title ?? 'Query Memory');
        }
        else if (picked.action === 'copy') {
            await vscode.env.clipboard.writeText(item.sql);
        }
        else if (picked.action === 'explain') {
            await this.openAiResult('Explain Query', await this.ai.send({ action: 'explain', selectedSql: item.sql, relevantSchema: { tables: [] } }));
        }
        else if (picked.action === 'modify') {
            const instruction = await vscode.window.showInputBox({ prompt: 'How should this query change?' });
            if (instruction) {
                await this.openAiResult('Modified Query', await this.ai.send({ action: 'generate', selectedSql: item.sql, lastError: instruction, relevantSchema: { tables: [] } }));
            }
        }
        else if (picked.action === 'preview') {
            const preview = this.safety.previewSql(item.sql);
            if (preview) {
                await this.openSql(preview, 'Query Safety Preview');
            }
        }
        else if (picked.action === 'run') {
            await this.run(item.sql, item.connectionId);
        }
    }
    async run(sql, connectionId) {
        const connection = connectionId ? this.connectionManager.getConnection(connectionId) : this.connectionManager.getPreferredConnection();
        if (!connection) {
            void vscode.window.showInformationMessage('Select a database connection before running query memory SQL.');
            return;
        }
        const tab = await this.executor.execute({ connectionId: connection.id, sql });
        await this.addResultTab(tab);
    }
    async backfillSummaries() {
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
    toPick(result) {
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
    async openSql(sql, title) {
        const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: `${sql.trim()}\n` });
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }
    async openAiResult(title, text) {
        const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: `-- ${title}\n${text.trim()}\n` });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    }
}
exports.QueryMemoryController = QueryMemoryController;
//# sourceMappingURL=queryMemoryController.js.map