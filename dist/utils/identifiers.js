"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteIdentifier = quoteIdentifier;
exports.qualifiedName = qualifiedName;
function quoteIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}
function qualifiedName(schema, name) {
    return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}
//# sourceMappingURL=identifiers.js.map