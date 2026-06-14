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
exports.SqlParameterPrompt = void 0;
const vscode = __importStar(require("vscode"));
const sqlParameters_1 = require("./sqlParameters");
class SqlParameterPrompt {
    async resolve(sql) {
        const names = (0, sqlParameters_1.uniqueSqlParameterNames)((0, sqlParameters_1.findSqlParameters)(sql));
        if (!names.length) {
            return sql;
        }
        const values = await this.collectValues(sql, names);
        return values ? (0, sqlParameters_1.applySqlParameterValues)(sql, values) : undefined;
    }
    async collectValues(sql, names) {
        const values = {};
        const preview = this.sqlPreview(sql);
        while (true) {
            const picked = await vscode.window.showQuickPick(this.pickItems(names, values, preview), {
                title: 'SQL Parameters',
                placeHolder: `Current SQL query: ${preview}`,
                ignoreFocusOut: true,
                matchOnDescription: true,
                matchOnDetail: true
            });
            if (!picked || picked.action === 'cancel') {
                return undefined;
            }
            if (picked.action === 'preview') {
                continue;
            }
            if (picked.action === 'run') {
                const missing = names.find((name) => values[name] === undefined);
                if (!missing) {
                    return values;
                }
                const value = await this.promptValue(missing, preview, values[missing]);
                if (value === undefined) {
                    return undefined;
                }
                values[missing] = value;
                continue;
            }
            if (picked.name) {
                const value = await this.promptValue(picked.name, preview, values[picked.name]);
                if (value === undefined) {
                    return undefined;
                }
                values[picked.name] = value;
            }
        }
    }
    pickItems(names, values, preview) {
        const missing = names.filter((name) => values[name] === undefined).length;
        return [
            {
                label: '$(code) Current SQL query',
                detail: preview,
                action: 'preview'
            },
            ...names.map((name) => ({
                label: `$(symbol-variable) ${name}`,
                description: values[name] === undefined ? 'missing' : this.valuePreview(values[name]),
                detail: `Set value for ${name}`,
                action: 'parameter',
                name
            })),
            {
                label: '$(play) Run SQL',
                description: missing ? `${missing} missing` : 'ready',
                detail: missing ? 'Set all parameter values before running.' : 'Run the current SQL query with these values.',
                action: 'run'
            },
            {
                label: '$(close) Cancel',
                action: 'cancel'
            }
        ];
    }
    async promptValue(name, preview, currentValue) {
        return vscode.window.showInputBox({
            title: `SQL Parameter: ${name}`,
            prompt: `Current SQL query: ${preview}`,
            placeHolder: `Value for ${name}`,
            value: currentValue,
            ignoreFocusOut: true
        });
    }
    sqlPreview(sql) {
        const compact = sql.replace(/\s+/g, ' ').trim();
        return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
    }
    valuePreview(value) {
        return value.length > 80 ? `${value.slice(0, 77)}...` : value;
    }
}
exports.SqlParameterPrompt = SqlParameterPrompt;
//# sourceMappingURL=sqlParameterPrompt.js.map