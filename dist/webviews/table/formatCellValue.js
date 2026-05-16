"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCellValue = formatCellValue;
function formatCellValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}
//# sourceMappingURL=formatCellValue.js.map