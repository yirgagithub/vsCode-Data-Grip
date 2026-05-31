"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partitionExistingConsoleRecords = partitionExistingConsoleRecords;
async function partitionExistingConsoleRecords(records, documentExists) {
    const existing = [];
    const missing = [];
    for (const record of records) {
        if (await documentExists(record.documentUri)) {
            existing.push(record);
        }
        else {
            missing.push(record);
        }
    }
    return { existing, missing };
}
//# sourceMappingURL=queryConsoleRecords.js.map