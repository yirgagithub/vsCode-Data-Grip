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
exports.SqlSectionHighlighter = void 0;
exports.rangeFromPlain = rangeFromPlain;
const vscode = __importStar(require("vscode"));
class SqlSectionHighlighter {
    decoration = vscode.window.createTextEditorDecorationType({
        border: '1px solid',
        borderColor: new vscode.ThemeColor('focusBorder'),
        borderRadius: '3px',
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        overviewRulerColor: new vscode.ThemeColor('focusBorder'),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    });
    activeRanges = new Map();
    async reveal(documentUri, range, expectedSql) {
        let document;
        try {
            document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
        }
        catch {
            void vscode.window.showWarningMessage('Source SQL file no longer exists.');
            return undefined;
        }
        const editor = await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Active
        });
        const targetRange = this.resolveRange(document, range, expectedSql);
        this.activeRanges.set(document.uri.toString(), targetRange);
        editor.setDecorations(this.decoration, [targetRange]);
        editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        return editor;
    }
    refreshVisibleEditors() {
        for (const editor of vscode.window.visibleTextEditors) {
            const range = this.activeRanges.get(editor.document.uri.toString());
            editor.setDecorations(this.decoration, range ? [range] : []);
        }
    }
    clear(documentUri) {
        if (documentUri) {
            this.activeRanges.delete(documentUri);
        }
        else {
            this.activeRanges.clear();
        }
        this.refreshVisibleEditors();
    }
    dispose() {
        this.decoration.dispose();
    }
    resolveRange(document, range, expectedSql) {
        const direct = this.clampRange(document, range);
        const directText = document.getText(direct);
        if (!expectedSql || normalizeSql(directText) === normalizeSql(expectedSql)) {
            return direct;
        }
        const text = document.getText();
        const normalizedExpected = normalizeSql(expectedSql);
        const index = text.toLowerCase().indexOf(expectedSql.trim().toLowerCase());
        if (index >= 0) {
            return new vscode.Range(document.positionAt(index), document.positionAt(index + expectedSql.trim().length));
        }
        for (const line of text.split(/\r?\n/).entries()) {
            if (normalizeSql(line[1]).includes(normalizedExpected.slice(0, 48))) {
                const start = new vscode.Position(line[0], 0);
                return new vscode.Range(start, start.translate(0, line[1].length));
            }
        }
        void vscode.window.showWarningMessage('Source SQL range changed; showing the last known location.');
        return direct;
    }
    clampRange(document, range) {
        const maxLine = Math.max(0, document.lineCount - 1);
        const startLine = Math.min(Math.max(0, range.startLine), maxLine);
        const endLine = Math.min(Math.max(startLine, range.endLine), maxLine);
        const startColumn = Math.min(Math.max(0, range.startColumn), document.lineAt(startLine).text.length);
        const endColumn = Math.min(Math.max(0, range.endColumn), document.lineAt(endLine).text.length);
        return new vscode.Range(new vscode.Position(startLine, startColumn), new vscode.Position(endLine, endColumn));
    }
}
exports.SqlSectionHighlighter = SqlSectionHighlighter;
function rangeFromPlain(range) {
    return new vscode.Range(new vscode.Position(range.startLine, range.startColumn), new vscode.Position(range.endLine, range.endColumn));
}
function normalizeSql(sql) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
//# sourceMappingURL=sqlSectionHighlighter.js.map