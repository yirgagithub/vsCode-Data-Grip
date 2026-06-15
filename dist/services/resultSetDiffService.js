"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareResultSets = compareResultSets;
exports.formatResultSetDiffMarkdown = formatResultSetDiffMarkdown;
function compareResultSets(left, right, leftTitle = left.title, rightTitle = right.title) {
    const leftColumns = left.fields.map((field) => field.name);
    const rightColumns = right.fields.map((field) => field.name);
    const rightColumnSet = new Set(rightColumns);
    const sharedColumns = leftColumns.filter((column) => rightColumnSet.has(column));
    const leftOnlyColumns = leftColumns.filter((column) => !rightColumnSet.has(column));
    const rightOnlyColumns = rightColumns.filter((column) => !leftColumns.includes(column));
    const identityColumns = pickIdentityColumns(sharedColumns);
    const leftRows = left.rows.map((row, index) => ({ row, index }));
    const rightRows = right.rows.map((row, index) => ({ row, index }));
    const comparisonColumns = sharedColumns.length ? sharedColumns : [...new Set([...leftColumns, ...rightColumns])];
    const leftGroups = groupRows(leftRows, identityColumns, comparisonColumns);
    const rightGroups = groupRows(rightRows, identityColumns, comparisonColumns);
    const addedRows = [];
    const removedRows = [];
    const changedRows = [];
    let sameRows = 0;
    const allKeys = [...new Set([...leftGroups.keys(), ...rightGroups.keys()])].sort();
    for (const key of allKeys) {
        const leftGroup = leftGroups.get(key) ?? [];
        const rightGroup = rightGroups.get(key) ?? [];
        const pairCount = Math.min(leftGroup.length, rightGroup.length);
        for (let index = 0; index < pairCount; index += 1) {
            const leftRow = leftGroup[index];
            const rightRow = rightGroup[index];
            const changes = compareRows(leftRow.row, rightRow.row, sharedColumns);
            if (changes.length) {
                changedRows.push({
                    key,
                    leftRow: leftRow.row,
                    rightRow: rightRow.row,
                    changes
                });
            }
            else {
                sameRows += 1;
            }
        }
        for (let index = pairCount; index < leftGroup.length; index += 1) {
            removedRows.push({ key, row: leftGroup[index].row });
        }
        for (let index = pairCount; index < rightGroup.length; index += 1) {
            addedRows.push({ key, row: rightGroup[index].row });
        }
    }
    return {
        leftTitle,
        rightTitle,
        leftRowCount: left.rows.length,
        rightRowCount: right.rows.length,
        sharedColumns,
        leftOnlyColumns,
        rightOnlyColumns,
        identityColumns,
        addedRows,
        removedRows,
        changedRows,
        sameRows
    };
}
function formatResultSetDiffMarkdown(report) {
    const lines = [
        '# Result Set Diff',
        '',
        `Comparing **${report.leftTitle}** to **${report.rightTitle}**.`,
        '',
        `- Left rows: ${report.leftRowCount}`,
        `- Right rows: ${report.rightRowCount}`,
        `- Shared columns: ${report.sharedColumns.length ? report.sharedColumns.join(', ') : 'none'}`,
        `- Identity columns: ${report.identityColumns.length ? report.identityColumns.join(', ') : 'row order fallback'}`,
        `- Added rows: ${report.addedRows.length}`,
        `- Removed rows: ${report.removedRows.length}`,
        `- Changed rows: ${report.changedRows.length}`,
        `- Unchanged pairs: ${report.sameRows}`
    ];
    if (report.leftOnlyColumns.length || report.rightOnlyColumns.length) {
        lines.push('');
        lines.push('## Column Differences');
        if (report.leftOnlyColumns.length) {
            lines.push(`- Only in left: ${report.leftOnlyColumns.join(', ')}`);
        }
        if (report.rightOnlyColumns.length) {
            lines.push(`- Only in right: ${report.rightOnlyColumns.join(', ')}`);
        }
    }
    if (report.changedRows.length) {
        lines.push('');
        lines.push('## Changed Rows');
        for (const change of report.changedRows.slice(0, 20)) {
            lines.push('');
            lines.push(`### ${change.key}`);
            for (const field of change.changes) {
                lines.push(`- \`${field.column}\`: ${formatValue(field.leftValue)} -> ${formatValue(field.rightValue)}`);
            }
        }
        if (report.changedRows.length > 20) {
            lines.push('');
            lines.push(`_… ${report.changedRows.length - 20} more changed rows omitted._`);
        }
    }
    if (report.addedRows.length) {
        lines.push('');
        lines.push('## Added Rows');
        for (const delta of report.addedRows.slice(0, 10)) {
            lines.push(`- ${delta.key}`);
            lines.push('```json');
            lines.push(stringifyRow(delta.row));
            lines.push('```');
        }
        if (report.addedRows.length > 10) {
            lines.push(`_… ${report.addedRows.length - 10} more added rows omitted._`);
        }
    }
    if (report.removedRows.length) {
        lines.push('');
        lines.push('## Removed Rows');
        for (const delta of report.removedRows.slice(0, 10)) {
            lines.push(`- ${delta.key}`);
            lines.push('```json');
            lines.push(stringifyRow(delta.row));
            lines.push('```');
        }
        if (report.removedRows.length > 10) {
            lines.push(`_… ${report.removedRows.length - 10} more removed rows omitted._`);
        }
    }
    return lines.join('\n');
}
function compareRows(left, right, columns) {
    const changes = [];
    for (const column of columns) {
        if (!isDeepEqual(left[column], right[column])) {
            changes.push({
                column,
                leftValue: left[column],
                rightValue: right[column]
            });
        }
    }
    return changes;
}
function groupRows(rows, identityColumns, comparisonColumns) {
    const groups = new Map();
    const keyColumns = identityColumns.length ? identityColumns : comparisonColumns.slice(0, Math.min(2, comparisonColumns.length));
    const sorted = [...rows].sort((left, right) => {
        const leftKey = rowKey(left.row, keyColumns, left.index);
        const rightKey = rowKey(right.row, keyColumns, right.index);
        return leftKey.localeCompare(rightKey);
    });
    for (const entry of sorted) {
        const key = rowKey(entry.row, keyColumns, entry.index);
        const list = groups.get(key) ?? [];
        list.push(entry);
        groups.set(key, list);
    }
    return groups;
}
function pickIdentityColumns(columns) {
    const preferred = columns.filter((column) => /(^id$)|(^.+_id$)|(^.+id$)/i.test(column));
    if (preferred.length) {
        return preferred.slice(0, 3);
    }
    return columns.slice(0, Math.min(2, columns.length));
}
function rowKey(row, columns, index) {
    if (!columns.length) {
        return `${index}:${stringifyValue(row)}`;
    }
    return columns.map((column) => `${column}=${stringifyValue(row[column])}`).join(' | ') || `${index}`;
}
function stringifyValue(value) {
    if (value === undefined) {
        return 'undefined';
    }
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    return stableStringify(value);
}
function stringifyRow(row) {
    return stableStringify(row);
}
function stableStringify(value) {
    return JSON.stringify(normalizeValue(value));
}
function normalizeValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeValue(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeValue(value[key])]));
    }
    return value;
}
function isDeepEqual(left, right) {
    return stableStringify(left) === stableStringify(right);
}
function formatValue(value) {
    if (value === undefined) {
        return '`undefined`';
    }
    if (value === null) {
        return '`null`';
    }
    const text = typeof value === 'string' ? value : stableStringify(value);
    const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    return `\`${preview.replace(/`/g, '\\`')}\``;
}
//# sourceMappingURL=resultSetDiffService.js.map