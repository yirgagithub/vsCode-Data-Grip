export interface QuerySnippet {
  id: string;
  label: string;
  description: string;
  snippet: string;
}

export function querySnippets(): QuerySnippet[] {
  return [
    {
      id: 'select-by-id',
      label: 'Select by ID',
      description: 'Template for fetching one row by primary key.',
      snippet: [
        'select *',
        'from ${1:table_name}',
        'where ${2:id_column} = ${3:value};'
      ].join('\n')
    },
    {
      id: 'filtered-select',
      label: 'Filtered Select',
      description: 'Template for a constrained query with ordering.',
      snippet: [
        'select ${1:columns}',
        'from ${2:table_name}',
        'where ${3:filter_expression}',
        'order by ${4:sort_column} ${5|asc,desc|};'
      ].join('\n')
    },
    {
      id: 'join-query',
      label: 'Join Query',
      description: 'Template for joining two relations.',
      snippet: [
        'select ${1:left_alias}.*, ${2:right_alias}.*',
        'from ${3:left_table} ${1:left_alias}',
        'join ${4:right_table} ${2:right_alias}',
        '  on ${5:join_condition};'
      ].join('\n')
    },
    {
      id: 'cte-query',
      label: 'CTE Query',
      description: 'Template for a common table expression.',
      snippet: [
        'with ${1:base} as (',
        '  select ${2:columns}',
        '  from ${3:table_name}',
        ')',
        'select *',
        'from ${1:base};'
      ].join('\n')
    },
    {
      id: 'insert-row',
      label: 'Insert Row',
      description: 'Template for inserting a single row.',
      snippet: [
        'insert into ${1:table_name} (${2:column_list})',
        'values (${3:value_list});'
      ].join('\n')
    },
    {
      id: 'update-row',
      label: 'Update Row',
      description: 'Template for updating rows with a predicate.',
      snippet: [
        'update ${1:table_name}',
        'set ${2:column} = ${3:value}',
        'where ${4:predicate};'
      ].join('\n')
    },
    {
      id: 'delete-row',
      label: 'Delete Row',
      description: 'Template for deleting rows with a predicate.',
      snippet: [
        'delete from ${1:table_name}',
        'where ${2:predicate};'
      ].join('\n')
    }
  ];
}
