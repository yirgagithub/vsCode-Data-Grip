"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteIdentifier = quoteIdentifier;
exports.qualifiedName = qualifiedName;
function quoteIdentifier(identifier, quote) {
    const marker = typeof quote === 'string' && quote ? quote : '"';
    if (marker === '`') {
        return `\`${identifier.replace(/`/g, '``')}\``;
    }
    return `${marker}${identifier.replace(new RegExp(escapeRegExp(marker), 'g'), marker + marker)}${marker}`;
}
function qualifiedName(schema, name, quote) {
    return `${quoteIdentifier(schema, quote)}.${quoteIdentifier(name, quote)}`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=identifiers.js.map