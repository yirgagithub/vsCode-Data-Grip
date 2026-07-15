import { describe, expect, it } from 'vitest';
import { findSqlObjectReference } from '../src/services/sqlObjectReference';

function at(sql: string, text: string, occurrence = 0) {
  let start = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    start = sql.indexOf(text, start + 1);
  }
  expect(start).toBeGreaterThanOrEqual(0);
  return { start, middle: start + Math.floor(text.length / 2), end: start + text.length };
}

describe('findSqlObjectReference', () => {
  it.each([
    ['select * from sales.orders o', 'sales.orders'],
    ['select * from users u join audit.events e on e.user_id = u.id', 'audit.events'],
    ['update app.users set active = true', 'app.users'],
    ['insert into app.users(id) values (1)', 'app.users'],
    ['delete from app.users where id = 1', 'app.users'],
  ])('finds relation references in %s', (sql, identifier) => {
    const range = at(sql, identifier);
    expect(findSqlObjectReference(sql, range.middle)).toEqual({
      range: { start: range.start, end: range.end },
      parts: identifier.split('.'),
      context: 'relation',
    });
  });

  it('normalizes quoted qualified identifiers while preserving their source range', () => {
    const sql = 'select * from "Sales".`Order``Items` join [dbo].[User]]Log] on 1 = 1';
    const first = at(sql, '"Sales".`Order``Items`');
    const second = at(sql, '[dbo].[User]]Log]');
    expect(findSqlObjectReference(sql, first.middle)).toEqual({
      range: { start: first.start, end: first.end },
      parts: ['Sales', 'Order`Items'],
      context: 'relation',
    });
    expect(findSqlObjectReference(sql, second.middle)?.parts).toEqual(['dbo', 'User]Log']);
  });

  it('finds each relation in a comma-separated FROM list', () => {
    const sql = 'select * from sales.orders o, crm.customers c';
    const range = at(sql, 'crm.customers');
    expect(findSqlObjectReference(sql, range.middle)).toEqual({
      range: { start: range.start, end: range.end },
      parts: ['crm', 'customers'],
      context: 'relation',
    });
  });

  it('finds routine calls and counts only top-level arguments', () => {
    const sql = 'select analytics.score(user_id, coalesce(weight, 1), \'a,b\') from users';
    const range = at(sql, 'analytics.score');
    expect(findSqlObjectReference(sql, range.middle)).toEqual({
      range: { start: range.start, end: range.end },
      parts: ['analytics', 'score'],
      context: 'routine',
      argumentCount: 3,
    });
  });

  it.each([
    'create trigger audit.users_changed after update on users begin select 1; end',
    'alter trigger audit.users_changed enable',
    'drop trigger audit.users_changed',
  ])('finds trigger names in DDL: %s', (sql) => {
    const range = at(sql, 'audit.users_changed');
    expect(findSqlObjectReference(sql, range.middle)).toEqual({
      range: { start: range.start, end: range.end },
      parts: ['audit', 'users_changed'],
      context: 'trigger',
    });
  });

  it('rejects aliases and common table expression names but finds nested base relations', () => {
    const sql = 'with recent as (select * from audit.events) select * from recent r join users u on u.id = r.user_id';
    expect(findSqlObjectReference(sql, at(sql, 'recent', 1).middle)).toBeUndefined();
    const aliasOffset = sql.indexOf(' r join') + 1;
    expect(findSqlObjectReference(sql, aliasOffset)).toBeUndefined();
    expect(findSqlObjectReference(sql, at(sql, 'audit.events').middle)?.parts).toEqual(['audit', 'events']);
    expect(findSqlObjectReference(sql, at(sql, 'users').middle)?.context).toBe('relation');
  });

  it('ignores identifiers and routine-shaped text in strings and comments', () => {
    const sql = "select 'from secret.users, fake_call(1)' -- join hidden.table\nfrom real.users /* other_call(2) */";
    for (const text of ['secret.users', 'fake_call', 'hidden.table', 'other_call']) {
      expect(findSqlObjectReference(sql, at(sql, text).middle)).toBeUndefined();
    }
    expect(findSqlObjectReference(sql, at(sql, 'real.users').middle)?.parts).toEqual(['real', 'users']);
  });

  it.each(['count', 'coalesce', 'cast', 'current_date'])('rejects the built-in %s', (name) => {
    const sql = `select ${name}(value) from metrics`;
    expect(findSqlObjectReference(sql, at(sql, name).middle)).toBeUndefined();
  });

  it('uses an end-exclusive exact range', () => {
    const sql = 'select * from sales.orders as o';
    const range = at(sql, 'sales.orders');
    expect(findSqlObjectReference(sql, range.start)?.range).toEqual({ start: range.start, end: range.end });
    expect(findSqlObjectReference(sql, range.end - 1)?.range).toEqual({ start: range.start, end: range.end });
    expect(findSqlObjectReference(sql, range.end)).toBeUndefined();
  });
});
