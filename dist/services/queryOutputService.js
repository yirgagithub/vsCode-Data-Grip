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
exports.QueryOutputService = void 0;
exports.formatQueryExecutionStartedOutput = formatQueryExecutionStartedOutput;
exports.formatQueryProgressOutput = formatQueryProgressOutput;
exports.formatQueryResultOutput = formatQueryResultOutput;
exports.formatDuration = formatDuration;
const vscode = __importStar(require("vscode"));
const MAX_OUTPUT_LINES_PER_CONNECTION = 600;
class QueryOutputService {
    channels = new Map();
    lineCounts = new Map();
    record(connection, tab) {
        this.channelFor(connection);
        this.appendBlock(connection.id, formatQueryResultOutput(tab));
    }
    recordExecutionStarted(connection, fileName, statementCount, startedAt = Date.now()) {
        this.channelFor(connection);
        this.appendBlock(connection.id, formatQueryExecutionStartedOutput(fileName, statementCount, startedAt));
    }
    recordExecutionElapsed(connection, startedAt, now = Date.now()) {
        this.channelFor(connection);
        this.appendBlock(connection.id, [`${timestamp(now)} ${statusText('running')} for ${formatDuration(now - startedAt)}`]);
    }
    recordProgress(connection, progress) {
        this.channelFor(connection);
        this.appendBlock(connection.id, formatQueryProgressOutput(progress));
    }
    show(connection, preserveFocus = true) {
        this.channelFor(connection).show(preserveFocus);
    }
    disposeConnection(connectionId) {
        this.channels.get(connectionId)?.dispose();
        this.channels.delete(connectionId);
        this.lineCounts.delete(connectionId);
    }
    dispose() {
        for (const channel of this.channels.values()) {
            channel.dispose();
        }
        this.channels.clear();
        this.lineCounts.clear();
    }
    channelFor(connection) {
        const existing = this.channels.get(connection.id);
        if (existing) {
            return existing;
        }
        const channel = vscode.window.createOutputChannel(`Database: ${connection.name}`);
        this.channels.set(connection.id, channel);
        this.lineCounts.set(connection.id, 0);
        return channel;
    }
    appendBlock(connectionId, lines) {
        this.ensureCapacity(connectionId, lines.length);
        for (const line of lines) {
            this.append(connectionId, line);
        }
    }
    append(connectionId, line) {
        const channel = this.channels.get(connectionId);
        if (!channel) {
            return;
        }
        channel.appendLine(line);
        this.lineCounts.set(connectionId, (this.lineCounts.get(connectionId) ?? 0) + 1);
    }
    ensureCapacity(connectionId, incomingLines) {
        const channel = this.channels.get(connectionId);
        if (!channel) {
            return;
        }
        const nextLineCount = (this.lineCounts.get(connectionId) ?? 0) + incomingLines;
        if (nextLineCount <= MAX_OUTPUT_LINES_PER_CONNECTION) {
            return;
        }
        channel.clear();
        this.lineCounts.set(connectionId, 0);
        this.append(connectionId, `${timestamp(Date.now())} OUTPUT truncated to keep memory bounded`);
        this.append(connectionId, '');
    }
}
exports.QueryOutputService = QueryOutputService;
function formatQueryExecutionStartedOutput(fileName, statementCount, startedAt = Date.now()) {
    const lines = [
        '',
        `${timestamp(startedAt)} ${statusText('running')} ${statementCount} statement${statementCount === 1 ? '' : 's'}`
    ];
    if (fileName) {
        lines.push(`  file: ${fileName}`);
    }
    return lines;
}
function formatQueryProgressOutput(progress, now = Date.now()) {
    const statement = `statement ${progress.statementIndex + 1}/${progress.statementCount}`;
    if (progress.status === 'started') {
        return [
            `${timestamp(now)} ${statusText('running')} ${statement} started`,
            '  sql:',
            ...progress.sql.trimEnd().split(/\r?\n/).map((line) => `    ${line}`)
        ];
    }
    const duration = progress.durationMs !== undefined ? formatDuration(progress.durationMs) : 'unknown duration';
    if (progress.status === 'completed') {
        const details = [
            `completed in ${duration}`,
            progress.rowCount !== undefined ? `${progress.rowCount} rows` : undefined,
            progress.command
        ].filter(Boolean).join(' | ');
        return [`${timestamp(now)} ${statusText('completed')} ${statement} ${details}`];
    }
    const lines = [`${timestamp(now)} ${statusText('failed')} ${statement} failed after ${duration}`];
    if (progress.errorMessage) {
        lines.push(`  error: ${progress.errorMessage}`);
    }
    return lines;
}
function formatQueryResultOutput(tab) {
    const duration = formatDuration(tab.executionTimeMs ?? 0);
    const status = statusText(tab.executionStatus);
    const lines = [
        `${timestamp(tab.executionFinishedAt ?? Date.now())} ${status} total ${duration} | ${tab.rowCount ?? 0} rows | ${tab.title}`
    ];
    if (tab.error) {
        lines.push(`  error: ${tab.error.code ? `${tab.error.code}: ` : ''}${tab.error.message}`);
    }
    lines.push('');
    return lines;
}
function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return '0s';
    }
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}
function timestamp(value) {
    return `[${new Date(value).toLocaleTimeString()}]`;
}
function statusText(status) {
    switch (status.toLowerCase()) {
        case 'completed':
            return 'COMPLETED';
        case 'failed':
            return 'FAILED';
        case 'cancelled':
            return 'CANCELLED';
        case 'running':
            return 'RUNNING';
        default:
            return status.toUpperCase();
    }
}
//# sourceMappingURL=queryOutputService.js.map