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
  return selected.some((selection) => rangesOverlap(selection.range, statementRange) && looksExecutableSelection(selection.sql));
}

function looksExecutableSelection(sql: string): boolean {
  const text = sql.trim();
  return /^(select|with|begin|commit|rollback|lock|create|alter|drop|insert|update|delete|merge|analyze|explain|grant|revoke|truncate|call)\b/i.test(text) ||
    /;\s*\S/.test(text);
}

function rangesOverlap(a: TextRangeLike, b: TextRangeLike): boolean {
  return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0;
}

function comparePositions(a: TextPositionLike, b: TextPositionLike): number {
  return a.line - b.line || a.character - b.character;
}
