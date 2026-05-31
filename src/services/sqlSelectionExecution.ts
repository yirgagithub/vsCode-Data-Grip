import { splitSqlStatements } from '../database/sqlSplitter';

export interface TextPositionLike {
  line: number;
  character: number;
}

export interface TextRangeLike {
  start: TextPositionLike;
  end: TextPositionLike;
}

export interface SelectedSqlLike {
  sql: string;
  range: TextRangeLike;
}

export function shouldRunSelectionForStatement(selected: SelectedSqlLike[], statementRange: TextRangeLike): boolean {
  return selected.some((selection) => rangesOverlap(selection.range, statementRange) && splitSqlStatements(selection.sql).length > 1);
}

function rangesOverlap(a: TextRangeLike, b: TextRangeLike): boolean {
  return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0;
}

function comparePositions(a: TextPositionLike, b: TextPositionLike): number {
  return a.line - b.line || a.character - b.character;
}
