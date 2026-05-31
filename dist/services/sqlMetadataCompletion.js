"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationCompletionContext = relationCompletionContext;
exports.relationCompletionCandidates = relationCompletionCandidates;
exports.selectListColumnCompletionContext = selectListColumnCompletionContext;
function relationCompletionContext(linePrefix) {
    const match = linePrefix.match(/\b(?:from|join|update|into)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))(?:\.(?:"([^"]*)|([A-Za-z_][A-Za-z0-9_]*))?)?$/i);
    if (!match) {
        return undefined;
    }
    const hasQualifiedPrefix = match[1] !== undefined || match[2] !== undefined;
    const schema = match[1] ?? match[2];
    const partial = match[3] ?? match[4] ?? '';
    return hasQualifiedPrefix && linePrefix.endsWith('.') || match[3] !== undefined || match[4] !== undefined
        ? { schema, partial }
        : { partial: schema };
}
function relationCompletionCandidates(entry, context) {
    const schema = context.schema?.toLowerCase();
    const partial = context.partial.toLowerCase();
    return [...entry.tables, ...entry.views].filter((relation) => {
        if (schema && relation.schema.toLowerCase() !== schema) {
            return false;
        }
        return relation.name.toLowerCase().startsWith(partial);
    });
}
function selectListColumnCompletionContext(statementPrefix) {
    const selectMatches = [...statementPrefix.matchAll(/\bselect\b/gi)];
    const lastSelect = selectMatches.at(-1);
    if (lastSelect?.index === undefined) {
        return false;
    }
    const afterSelect = statementPrefix.slice(lastSelect.index + lastSelect[0].length);
    return !/\b(?:from|where|join|left|right|inner|outer|full|cross|on|using|group|order|having|limit|union|intersect|except)\b/i.test(afterSelect);
}
//# sourceMappingURL=sqlMetadataCompletion.js.map