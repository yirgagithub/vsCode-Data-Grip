import { describe, expect, it } from 'vitest';
import { escapeMarkdownText, markdownCodeSpan, renderDatabaseObjectHover } from '../src/services/databaseObjectHover';

describe('renderDatabaseObjectHover', () => {
  it('renders a compact trusted refresh action for unavailable metadata', () => {
    expect(renderDatabaseObjectHover({ kind: 'metadata-unavailable', schema: 'public' })).toContain('Refresh database metadata');
    expect(renderDatabaseObjectHover({ kind: 'metadata-unavailable', schema: 'public' })).toContain('command:querydeck.refreshDatabaseMetadata');
  });
  it('renders compact table columns, nullability, primary and foreign keys', () => {
    const markdown = renderDatabaseObjectHover({
      kind: 'table', schema: 'public', name: 'users',
      columns: [
        { schema: 'public', table: 'users', name: 'id', ordinal: 1, dataType: 'integer', nullable: false },
        { schema: 'public', table: 'users', name: 'team_id', ordinal: 2, dataType: 'integer', nullable: true }
      ],
      primaryKeys: [{ name: 'users_pkey', columns: ['id'] }],
      foreignKeys: [{ name: 'users_team_fk', columns: ['team_id'], foreignSchema: 'public', foreignTable: 'teams', foreignColumns: ['id'] }]
    });
    expect(markdown).toContain('**Table** `public`.`users`');
    expect(markdown).toContain('`id` — `integer` — NOT NULL — PK');
    expect(markdown).toContain('`team_id` — `integer` — NULL — FK → `public`.`teams.id`');
    expect(markdown).not.toMatch(/index|row count|storage|command:/i);
  });

  it('renders views, functions, procedures, and triggers', () => {
    expect(renderDatabaseObjectHover({ kind: 'view', schema: 'public', name: 'active_users', columns: [
      { schema: 'public', table: 'active_users', name: 'email', ordinal: 1, dataType: 'text', nullable: false }
    ] })).toContain('**View** `public`.`active_users`');
    expect(renderDatabaseObjectHover({ kind: 'function', schema: 'public', name: 'lookup', signature: 'lookup(integer)', arguments: ['integer'], returnType: 'text' }))
      .toContain('Returns `text`');
    expect(renderDatabaseObjectHover({ kind: 'procedure', schema: 'public', name: 'rebuild', signature: 'rebuild(text)', arguments: ['text'] }))
      .toContain('`rebuild(text)`');
    expect(renderDatabaseObjectHover({ kind: 'trigger', schema: 'public', name: 'audit_users', table: 'users', timing: 'BEFORE', events: ['INSERT', 'UPDATE'] }))
      .toContain('BEFORE INSERT, UPDATE on `public`.`users`');
  });

  it('escapes Markdown data and never creates links', () => {
    expect(escapeMarkdownText('a_*[b](c)\\d`e')).toBe('a\\_\\*\\[b\\]\\(c\\)\\\\d\\`e');
    const markdown = renderDatabaseObjectHover({ kind: 'procedure', schema: 'pub*lic', name: 'run[all]', signature: 'run[all](text)' });
    expect(markdown).toContain('`pub*lic`.`run[all]`');
    expect(markdown).not.toMatch(/\]\(command:|command:/);
  });

  it('uses safe code spans without escaping harmless identifier punctuation', () => {
    expect(markdownCodeSpan('sales.order_items')).toBe('`sales.order_items`');
    expect(markdownCodeSpan('odd`name')).toBe('`` odd`name ``');
    expect(markdownCodeSpan('two``ticks')).toBe('``` two``ticks ```');
    expect(markdownCodeSpan('line\r\nbreak')).toBe('`line break`');
    expect(markdownCodeSpan(' padded ')).toBe('`  padded  `');

    const markdown = renderDatabaseObjectHover({ kind: 'view', schema: 'sales_data', name: 'odd`view', columns: [] });
    expect(markdown).toContain('`sales_data`');
    expect(markdown).toContain('`` odd`view ``');
    expect(markdown).not.toContain('sales\\_data');
  });
});
