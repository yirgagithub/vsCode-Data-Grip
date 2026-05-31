import { QueryConsoleRecord } from '../types';

export interface QueryConsoleRecordPruneResult {
  existing: QueryConsoleRecord[];
  missing: QueryConsoleRecord[];
}

export async function partitionExistingConsoleRecords(
  records: QueryConsoleRecord[],
  documentExists: (documentUri: string) => Promise<boolean>
): Promise<QueryConsoleRecordPruneResult> {
  const existing: QueryConsoleRecord[] = [];
  const missing: QueryConsoleRecord[] = [];

  for (const record of records) {
    if (await documentExists(record.documentUri)) {
      existing.push(record);
    } else {
      missing.push(record);
    }
  }

  return { existing, missing };
}
