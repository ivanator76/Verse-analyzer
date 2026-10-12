import { describe, expect, it } from 'vitest';
import { Builder } from '../src/core/builder';
import { computeLayout, type Layout, type Measurer } from '../src/core/layout';
import { DEFAULT_RELATION_TYPES } from '../src/core/relations';
import { sampleJohn3 } from '../src/core/sample';
import type { Doc } from '../src/core/types';

const H = 5.3;
const meas: Measurer = {
  labelWidth: (t) => Math.max(1, t.length) * 2,
  labelHeight: 2.5,
  lineH: H,
  measureVerses: (items) => items.length * H,
  measureRow: () => ({ h: H, firstLineMid: H / 2 }),
};

/** 使用者回報的結構：2、3 一個括號 A；1、A、4 一個括號 B；B 套用關係 */
function make(typeB: string, typeA?: string): Doc {
  const b = new Builder();
  const r1 = b.row('一'), r2 = b.row('二'), r3 = b.row('三'), r4 = b.row('四');
  const A = b.bracket(typeA ? [typeA] : [], [[r2], [r3]]);
  const B = b.bracket([typeB], [[r1], [A], [r4, [typeB]]]);
  return b.build([B]);
}

const pitches = (L: Layout) => L.rows.slice(1).map((r, i) => r.y - L.rows[i].y);

/** 標記方塊是否壓到某條水平線 */
function labelsHitLines(L: Layout): string[] {
  const bad: string[] = [];
  for (const lab of L.labels) {
    for (const ln of L.lines) {
      if (ln.vertical || ln.page !== lab.page) continue;
      if (ln.y1 > lab.y && ln.y1 < lab.y + lab.h && ln.x1 < lab.x + lab.w && ln.x2 > lab.x) bad.push(`${lab.text}@${lab.y.toFixed(1)}`);
    }
  }
  return bad;
}

describe('標記的碰撞：行距不能被無限拉大', () => {
  for (const type of DEFAULT_RELATION_TYPES.map((t) => t.id)) {
    it(`外層括號套用「${type}」：行距不變、標記不壓線`, () => {
      const L = computeLayout(make(type), meas);
      const p = pitches(L);
      expect(Math.max(...p) - Math.min(...p)).toBeLessThan(1e-6); // 每一行的間距都一樣，沒有突然空出一大塊
      expect(L.warnings.unresolvedLabels).toBe(0);
      expect(labelsHitLines(L)).toEqual([]);
    });
  }

  it('內外兩層都有關係（含沒有主句的關係）：也不會把行距拉開', () => {
    for (const [a, b] of [['and', 'and'], ['or', 'compare'], ['cause-effect', 'none'], ['none', 'cause-effect'], ['and', 'cause-effect']]) {
      const L = computeLayout(make(b, a), meas);
      const p = pitches(L);
      expect(Math.max(...p) - Math.min(...p), `${a}/${b}`).toBeLessThan(1e-6);
      expect(labelsHitLines(L), `${a}/${b}`).toEqual([]);
    }
  });

  it('共用標記（以及、相比…）仍然放在括號的垂直線旁邊，而且在第一個與最後一個分支之間', () => {
    const L = computeLayout(make('and'), meas);
    const lab = L.labels.find((x) => x.shared)!;
    const vert = L.lines.find((l) => l.vertical && l.bracketId === lab.bracketId)!;
    expect(lab.x).toBeGreaterThan(vert.x1);
    expect(lab.y).toBeGreaterThanOrEqual(vert.y1);
    expect(lab.y + lab.h).toBeLessThanOrEqual(vert.y2);
  });

  it('約翰福音範例（很多巢狀括號）：每一列額外加大的列距不超過上限', () => {
    const L = computeLayout(sampleJohn3(), meas);
    const p = pitches(L);
    expect(Math.max(...p)).toBeLessThanOrEqual(H + 0.2 + 4 + 1e-6);
    expect(L.warnings.unresolvedLabels).toBe(0);
  });
});
