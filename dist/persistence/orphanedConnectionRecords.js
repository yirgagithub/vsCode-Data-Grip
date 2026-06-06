"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orphanedConnectionRecordIds = orphanedConnectionRecordIds;
function orphanedConnectionRecordIds(records, connectionIds) {
    const knownConnectionIds = new Set(connectionIds);
    const historyIds = records.history
        .filter((item) => !knownConnectionIds.has(item.connectionId))
        .map((item) => item.id);
    const orphanedHistoryIds = new Set(historyIds);
    return {
        consoleIds: records.consoles
            .filter((record) => !knownConnectionIds.has(record.connectionId))
            .map((record) => record.id),
        sqlDocumentUris: records.sqlDocuments
            .filter((record) => !knownConnectionIds.has(record.connectionId))
            .map((record) => record.documentUri),
        historyIds,
        memoryIds: records.memory
            .filter((item) => {
            if (item.connectionId && !knownConnectionIds.has(item.connectionId)) {
                return true;
            }
            if (item.latestHistoryId && orphanedHistoryIds.has(item.latestHistoryId)) {
                return true;
            }
            return item.historyIds?.some((id) => orphanedHistoryIds.has(id)) === true;
        })
            .map((item) => item.id)
    };
}
//# sourceMappingURL=orphanedConnectionRecords.js.map