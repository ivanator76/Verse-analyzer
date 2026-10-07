import { describe, expect, it } from 'vitest';
import { detectVerses } from '../src/core/detect';
import type { Seg } from '../src/core/types';

const verses = (lines: Seg[][]) => lines.flat().filter((s) => s.t === 'verse').map((s) => (s.t === 'verse' ? `${s.c}:${s.v}` : ''));
const textOf = (segs: Seg[]) => segs.map((s) => (s.t === 'text' ? s.text : '')).join('');

describe('經節自動辨識（§7.4）', () => {
  it('行首數字：14、15、16', () => {
    const r = detectVerses(['14 Καὶ καθὼς', '15 ἵνα πᾶς', '16 γὰρ ὁ θεὸς'], 3);
    expect(verses(r.lines)).toEqual(['3:14', '3:15', '3:16']);
    expect(textOf(r.lines[0])).toBe('Καὶ καθὼς');
    expect(r.count).toBe(3);
  });
  it('數字緊接文字：16For、17神', () => {
    const r = detectVerses(['16For God so loved', '17For God sent'], 3);
    expect(verses(r.lines)).toEqual(['3:16', '3:17']);
    expect(textOf(r.lines[1])).toBe('For God sent');
    const zh = detectVerses(['16神愛世人', '17因為神'], 3);
    expect(verses(zh.lines)).toEqual(['3:16', '3:17']);
  });
  it('一行裡有多節：中間的數字也能辨識', () => {
    const r = detectVerses(['16神愛世人17因為神差他來'], 3);
    expect(verses(r.lines)).toEqual(['3:16', '3:17']);
    expect(textOf(r.lines[0])).toBe('神愛世人因為神差他來');
  });
  it('章:節直接採用，跳回 1 時章 +1', () => {
    expect(verses(detectVerses(['3:16 神愛世人', '17 因為神'], 1).lines)).toEqual(['3:16', '3:17']);
    expect(verses(detectVerses(['35 a', '36 b', '1 c', '2 d'], 7).lines)).toEqual(['7:35', '7:36', '8:1', '8:2']);
  });
  it('不連續的數字保留成一般文字', () => {
    const r = detectVerses(['40 晝夜', '14 甲', '15 乙', '他等了40天'], 3);
    expect(verses(r.lines)).toEqual(['3:14', '3:15']);
    expect(textOf(r.lines[0])).toBe('40 晝夜');
    expect(textOf(r.lines[3])).toBe('他等了40天');
  });
  it('只有一個候選時不辨識', () => {
    const r = detectVerses(['16 神愛世人'], 3);
    expect(r.count).toBe(0);
    expect(textOf(r.lines[0])).toBe('16 神愛世人');
  });
  it('不辨識時文字完全不變（連空白）', () => {
    const lines = ['  a  b ', '', 'c'];
    const r = detectVerses(lines, 1);
    expect(r.lines.map(textOf)).toEqual(lines);
  });
});

import { Builder, T, V } from '../src/core/builder';
import { verseBefore } from '../src/core/verses';

describe('verseBefore（手動「標為經節」用）', () => {
  it('取得游標前最後一個經節標記', () => {
    const b = new Builder();
    const a = b.row([V(16, 3), T('abc')]);
    const c = b.row('def');
    const d = b.build([a, c]);
    expect(verseBefore(d, c.id, 0)).toEqual({ c: 3, v: 16 });
    expect(verseBefore(d, a.id, 0)).toBeNull();
    expect(verseBefore(d, a.id, 2)).toEqual({ c: 3, v: 16 });
  });
});
