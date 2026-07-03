import { describe, expect, it } from 'vitest';
import { isReadOnlySql } from '../src/services/readOnlySql';

describe('isReadOnlySql', () => {
  it('allows select and read-only common table expressions', () => {
    expect(isReadOnlySql('select * from orders')).toBe(true);
    expect(isReadOnlySql('with recent_orders as (select * from orders) select * from recent_orders')).toBe(true);
  });

  it('rejects direct write and destructive statements', () => {
    expect(isReadOnlySql('delete from orders')).toBe(false);
    expect(isReadOnlySql('update orders set status = ?')).toBe(false);
    expect(isReadOnlySql('insert into orders(id) values (1)')).toBe(false);
    expect(isReadOnlySql('drop table orders')).toBe(false);
  });

  it('rejects writable common table expression bypasses', () => {
    expect(isReadOnlySql('with deleted as (delete from orders returning *) select * from deleted')).toBe(false);
    expect(isReadOnlySql('with updated as (update orders set status = \'paid\' returning *) select * from updated')).toBe(false);
    expect(isReadOnlySql('with inserted as (insert into orders(id) values (1) returning *) select * from inserted')).toBe(false);
    expect(isReadOnlySql('with cte as (select * from orders) delete from cte')).toBe(false);
  });

  it('rejects explain analyze around write statements', () => {
    expect(isReadOnlySql('explain analyze delete from orders')).toBe(false);
  });
});
