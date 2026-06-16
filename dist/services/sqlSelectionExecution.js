"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRunSelectionForStatement = shouldRunSelectionForStatement;
function shouldRunSelectionForStatement(selected, statementRange) {
    return selected.some((selection) => rangesOverlap(selection.range, statementRange) && looksExecutableSelection(selection.sql));
}
function looksExecutableSelection(sql) {
    const text = sql.trim();
    return /^(select|with|begin|commit|rollback|lock|create|alter|drop|insert|update|delete|merge|analyze|explain|grant|revoke|truncate|call)\b/i.test(text) ||
        /;\s*\S/.test(text);
}
function rangesOverlap(a, b) {
    return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0;
}
function comparePositions(a, b) {
    return a.line - b.line || a.character - b.character;
}
//# sourceMappingURL=sqlSelectionExecution.js.map