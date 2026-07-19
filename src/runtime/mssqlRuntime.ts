import * as mssql from 'mssql';

type MssqlTemporalRuntime = {
  valueHandler: Map<unknown, (value: Date | null) => unknown>;
  Date: unknown;
  Time: unknown;
  DateTime: unknown;
  DateTime2: unknown;
  SmallDateTime: unknown;
  DateTimeOffset: unknown;
};

const temporalRuntime = mssql as unknown as MssqlTemporalRuntime;

export const ConnectionPool = mssql.ConnectionPool;
export const valueHandler = temporalRuntime.valueHandler;
export const Date = temporalRuntime.Date;
export const Time = temporalRuntime.Time;
export const DateTime = temporalRuntime.DateTime;
export const DateTime2 = temporalRuntime.DateTime2;
export const SmallDateTime = temporalRuntime.SmallDateTime;
export const DateTimeOffset = temporalRuntime.DateTimeOffset;
