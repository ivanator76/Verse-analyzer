import { describe, expect, it } from 'vitest';
import { parseDoc, serialize } from '../src/core/file';
import { sampleJohn3 } from '../src/core/sample';

describe('檔案', () => {
  it('存檔再開檔一致', () => {
    const d = sampleJohn3();
    const r = parseDoc(serialize(d));
    expect('doc' in r && r.doc).toEqual(d);
  });
  it('壞檔不會開啟', () => {
    expect('errors' in parseDoc('{')).toBe(true);
    const d = JSON.parse(serialize(sampleJohn3()));
    d.items[0].item.children[0].labels = {};
    const r = parseDoc(JSON.stringify(d));
    expect('errors' in r && r.errors.length).toBeGreaterThan(0);
    expect('errors' in parseDoc(JSON.stringify({ ...JSON.parse(serialize(sampleJohn3())), formatVersion: 9 }))).toBe(true);
  });
});
