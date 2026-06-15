import { describe, expect, it } from 'vitest';
import { formatSqlText, sqlFormatterDialect } from '../src/services/sqlFormattingService';

describe('sqlFormattingService', () => {
  it('chooses redshift formatting for redshift connections', () => {
    expect(sqlFormatterDialect({ type: 'redshift' } as never)).toBe('redshift');
  });

  it('defaults to postgres formatting for other connections', () => {
    expect(sqlFormatterDialect({ type: 'postgres' } as never)).toBe('postgresql');
    expect(sqlFormatterDialect(undefined)).toBe('postgresql');
  });

  it('chooses mysql formatting for mysql connections', () => {
    expect(sqlFormatterDialect({ type: 'mysql' } as never)).toBe('mysql');
  });

  it('formats SQL with stable keyword and clause layout', async () => {
    await expect(formatSqlText('select * from users where id=1', 'postgresql')).resolves.toBe(
      'select\n  *\nfrom\n  users\nwhere\n  id = 1'
    );
  });
});
