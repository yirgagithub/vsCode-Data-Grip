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
const vscode = __importStar(require("vscode"));
const MAX_OUTPUT_LINES_PER_CONNECTION = 600;
class QueryOutputService {
    channels = new Map();
    lineCounts = new Map();
    record(connection, tab) {
        this.channelFor(connection);
        this.ensureCapacity(connection.id, 3 + (tab.error ? 2 : 0));
        this.append(connection.id, `[${new Date(tab.executionStartedAt).toLocaleTimeString()}] ${tab.executionStatus.toUpperCase()} ${tab.executionTimeMs ?? 0}ms ${tab.rowCount ?? 0} rows - ${tab.title}`);
        if (tab.error) {
            this.append(connection.id, `ERROR ${tab.error.code ? `${tab.error.code}: ` : ''}${tab.error.message}`);
        }
        this.append(connection.id, '');
    }
    recordExecutionStarted(connection, fileName, statementCount) {
        this.channelFor(connection);
        this.ensureCapacity(connection.id, 4);
        this.append(connection.id, `[${new Date().toLocaleTimeString()}] RUNNING ${statementCount} statement${statementCount === 1 ? '' : 's'}${fileName ? ` - ${fileName}` : ''}`);
    }
    recordProgress(connection, progress) {
        this.channelFor(connection);
        if (progress.status === 'started') {
            this.ensureCapacity(connection.id, this.lineCount(progress.sql) + 4);
            this.append(connection.id, `[${new Date().toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} running`);
            this.appendMultiline(connection.id, progress.sql);
            return;
        }
        this.ensureCapacity(connection.id, 3 + (progress.errorMessage ? 1 : 0));
        const duration = progress.durationMs !== undefined ? `${progress.durationMs}ms` : 'unknown duration';
        if (progress.status === 'completed') {
            const rows = progress.rowCount !== undefined ? ` - ${progress.rowCount} rows` : '';
            const command = progress.command ? ` - ${progress.command}` : '';
            this.append(connection.id, `[${new Date().toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} completed in ${duration}${rows}${command}`);
        }
        else {
            this.append(connection.id, `[${new Date().toLocaleTimeString()}] statement ${progress.statementIndex + 1}/${progress.statementCount} failed in ${duration}`);
            if (progress.errorMessage) {
                this.append(connection.id, `ERROR ${progress.errorMessage}`);
            }
        }
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
    append(connectionId, line) {
        const channel = this.channels.get(connectionId);
        if (!channel) {
            return;
        }
        channel.appendLine(line);
        this.lineCounts.set(connectionId, (this.lineCounts.get(connectionId) ?? 0) + 1);
    }
    appendMultiline(connectionId, text) {
        for (const line of text.split(/\r?\n/)) {
            this.append(connectionId, `  ${line}`);
        }
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
        this.append(connectionId, `[${new Date().toLocaleTimeString()}] Output truncated to keep memory bounded.`);
        this.append(connectionId, '');
    }
    lineCount(text) {
        return text.split(/\r?\n/).length;
    }
}
exports.QueryOutputService = QueryOutputService;
//# sourceMappingURL=queryOutputService.js.map