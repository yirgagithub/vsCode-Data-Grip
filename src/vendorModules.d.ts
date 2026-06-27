declare module 'mssql' {
  export class ConnectionPool {
    constructor(config: Record<string, unknown>);
    connect(): Promise<ConnectionPool>;
    close(): Promise<void>;
    request(): {
      query(sql: string): Promise<{
        recordset?: Record<string, unknown>[];
        rowsAffected?: number[];
      }>;
    };
  }
}

declare module 'oracledb' {
  const oracledb: {
    OUT_FORMAT_OBJECT: number;
    createPool(config: Record<string, unknown>): Promise<{
      getConnection(): Promise<{
        execute(sql: string, binds?: unknown[], options?: Record<string, unknown>): Promise<{
          rows?: Record<string, unknown>[];
          rowsAffected?: number;
          metaData?: Array<{ name: string; dbTypeName?: string }>;
        }>;
        close(): Promise<void>;
      }>;
      close(drainTime?: number): Promise<void>;
    }>;
  };
  export = oracledb;
}
