import { ColumnState, GridFilterState, QueryResultTab, ScrollState, SortSpec } from '../../types';

export interface ResultGridStatePatch {
  filters?: GridFilterState;
  sort?: SortSpec[];
  columnState?: ColumnState[];
  scrollState?: ScrollState;
}

export function applyResultGridState(tab: QueryResultTab, state: ResultGridStatePatch): QueryResultTab {
  return {
    ...tab,
    filters: state.filters ?? tab.filters,
    sort: state.sort ?? tab.sort,
    columnState: state.columnState ?? tab.columnState,
    scrollState: state.scrollState ?? tab.scrollState,
    updatedAt: Date.now()
  };
}

export function withPreservedResultGridState(
  next: QueryResultTab,
  previous: QueryResultTab,
  state: ResultGridStatePatch = {}
): QueryResultTab {
  return {
    ...next,
    filters: state.filters ?? previous.filters,
    sort: state.sort ?? previous.sort,
    columnState: state.columnState ?? previous.columnState,
    scrollState: state.scrollState ?? previous.scrollState
  };
}
