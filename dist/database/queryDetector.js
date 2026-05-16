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
exports.detectQuery = detectQuery;
const vscode = __importStar(require("vscode"));
const sqlSplitter_1 = require("./sqlSplitter");
function detectQuery(document, selection) {
    if (!selection.isEmpty) {
        return {
            sql: document.getText(selection),
            range: selection
        };
    }
    const text = document.getText();
    const offset = document.offsetAt(selection.active);
    const statements = (0, sqlSplitter_1.splitSqlStatements)(text);
    const statement = statements.find((item) => offset >= item.start && offset <= item.end) ?? statements[0];
    if (!statement) {
        return undefined;
    }
    return {
        sql: statement.sql,
        range: new vscode.Range(document.positionAt(statement.start), document.positionAt(statement.end))
    };
}
//# sourceMappingURL=queryDetector.js.map