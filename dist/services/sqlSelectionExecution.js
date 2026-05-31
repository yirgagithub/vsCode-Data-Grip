"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRunSelectionForStatement = shouldRunSelectionForStatement;
const sqlSplitter_1 = require("../database/sqlSplitter");
function shouldRunSelectionForStatement(selected, statementRange) {
    return selected.some((selection) => rangesOverlap(selection.range, statementRange) && (0, sqlSplitter_1.splitSqlStatements)(selection.sql).length > 1);
}
function rangesOverlap(a, b) {
    return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0;
}
function comparePositions(a, b) {
    return a.line - b.line || a.character - b.character;
}
//# sourceMappingURL=sqlSelectionExecution.js.map