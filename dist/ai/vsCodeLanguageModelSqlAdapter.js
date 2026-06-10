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
        const lm = this.languageModelNamespace();
        if (!lm?.selectChatModels) {
            throw new Error('VS Code Language Model API is not available.');
        }
        const models = await lm.selectChatModels({ vendor: 'copilot' });
        const model = models[0];
        if (!model) {
            throw new Error('No VS Code language model is available.');
        }
        const prompt = this.prompt(request);
        const messages = [
            vscode.LanguageModelChatMessage?.User(prompt) ?? { role: 'user', content: prompt }
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
    async summarizeQueryMemory(request) {
        const text = await this.sendRaw(this.summaryPrompt(request));
        return this.parseSummary(text);
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
        const lm = this.languageModelNamespace();
        if (!lm?.selectChatModels) {
            throw new Error('VS Code Language Model API is not available.');
        }
        const models = await lm.selectChatModels({ vendor: 'copilot' });
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
    parseSummary(text) {
        return (0, queryMemorySummaryParser_1.parseQueryMemorySummaryText)(text);
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
            throw new Error('The language model did not return summary JSON.');
        }
        return candidate.slice(start, end + 1);
    }
}
exports.VsCodeLanguageModelSqlAdapter = VsCodeLanguageModelSqlAdapter;
//# sourceMappingURL=vsCodeLanguageModelSqlAdapter.js.map