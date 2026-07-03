import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { rowsToXlsxBuffer } from '../src/services/xlsxExport';

describe('xlsx export writer', () => {
  it('writes a minimal workbook with headers, values, booleans, and escaped text', () => {
    const workbook = rowsToXlsxBuffer([
      { id: 1, active: true, name: 'Ada & Bob' }
    ], ['id', 'active', 'name'], 'bad:name/with*chars');
    const files = unzipSync(new Uint8Array(workbook));

    expect(Object.keys(files).sort()).toContain('xl/worksheets/sheet1.xml');
    const worksheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    const workbookXml = strFromU8(files['xl/workbook.xml']);

    expect(workbookXml).toContain('name="bad name with chars"');
    expect(worksheet).toContain('<c r="A1" t="inlineStr"><is><t>id</t></is></c>');
    expect(worksheet).toContain('<c r="A2"><v>1</v></c>');
    expect(worksheet).toContain('<c r="B2" t="b"><v>1</v></c>');
    expect(worksheet).toContain('<c r="C2" t="inlineStr"><is><t>Ada &amp; Bob</t></is></c>');
  });

  it('removes XML-invalid control characters from cell text', () => {
    const workbook = rowsToXlsxBuffer([{ value: 'bad\u0001value' }], ['value'], 'Sheet1');
    const files = unzipSync(new Uint8Array(workbook));
    const worksheet = strFromU8(files['xl/worksheets/sheet1.xml']);

    expect(worksheet).toContain('badvalue');
    expect(worksheet).not.toContain('\u0001');
  });
});
