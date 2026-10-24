/**
 * ゲーム G3：ガイドライン・設定・記録（docs/game-design.md §3・§4.6・§7）。
 */
import { describe, expect, it } from 'vitest';
import { CUT } from '../src/field/field';
import { BALANCE_VERSION } from '../src/game/balance';
import { computeGuide, standingBox } from '../src/game/guide';
import { standardMap } from '../src/game/map';
import { bestKey, bindKey, DEFAULT_KEYS, keyLabel, loadBest, loadKeys, loadOptions, recordBest, saveKeys, saveOptions, shareText } from '../src/game/settings';
import { spec } from '../src/spec/spec';

/** localStorage の代わり */
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
const HW = spec.header.width / 2;
const R = spec.field.turnRadius;

describe('ガイドライン（回り刈り）', () => {
  it('立毛の外接長方形：最初は畑全体、下の帯を刈ると縮む', () => {
    const m = standardMap();
    expect(standingBox(m.field)).toEqual({ x0: 0, x1: 120, z0: 0, z1: 70 });
    const f = m.field;
    for (let k = 0; k < 24; k++) for (let i = 0; i < f.nx; i++) f.set(k * f.nx + i, CUT);
    expect(standingBox(f)!.z0).toBe(12);
    for (let j = 0; j < f.state.length; j++) f.set(j, CUT);
    expect(standingBox(f)).toBeNull();
  });

  it('向きで辺を選び、刈幅の左端が立毛の縁と 0.2 m 重なる中心線を引く', () => {
    const box = { x0: 0, x1: 120, z0: 0, z1: 70 };
    const inset = HW - 0.2;
    const g = computeGuide(box, { x: 10, z: 6, psi: 0.1 })!;
    expect(g.side).toBe('bottom');
    expect(g.a[1]).toBeCloseTo(inset);
    expect(g.b[0]).toBeCloseTo(120 - inset + R);
    expect(computeGuide(box, { x: 0, z: 0, psi: -Math.PI / 2 })!.side).toBe('right');
    expect(computeGuide(box, { x: 0, z: 0, psi: Math.PI })!.side).toBe('top');
    expect(computeGuide(box, { x: 0, z: 0, psi: Math.PI / 2 + 0.2 })!.side).toBe('left');
    expect(computeGuide(null, { x: 0, z: 0, psi: 0 })).toBeNull();
  });

  it('辺の終わりの左 270° のループは、次の辺（右の辺）の中心線に入る', () => {
    const box = { x0: 0, x1: 120, z0: 0, z1: 70 };
    const g = computeGuide(box, { x: 10, z: 6, psi: 0 })!;
    const end = g.loop[g.loop.length - 1];
    const right = computeGuide(box, { x: 0, z: 0, psi: -Math.PI / 2 })!;
    expect(end[0]).toBeCloseTo(right.a[0], 0);
    expect(g.loop.length).toBeGreaterThan(25);
  });
});

describe('設定と記録', () => {
  it('キーの割り当て：使っているキーなら入れ替え、Esc などは割り当てない', () => {
    const k = { ...DEFAULT_KEYS };
    expect(bindKey(k, 'up', 'KeyI')).toBe(true);
    expect(k.up).toBe('KeyI');
    expect(bindKey(k, 'down', 'KeyI')).toBe(true);
    expect(k.down).toBe('KeyI');
    expect(k.up).toBe('KeyS'); // 入れ替わった
    expect(bindKey(k, 'hold', 'Escape')).toBe(false);
    expect(bindKey(k, 'hold', 'Tab')).toBe(false);
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Space')).toBe('Space');
  });

  it('保存と読み込み。壊れた値・使えない保存先では既定値', () => {
    const st = memStorage();
    const k = { ...DEFAULT_KEYS, cart: 'KeyT' };
    saveKeys(k, st);
    expect(loadKeys(st).cart).toBe('KeyT');
    saveOptions({ guide: false, mouseSteer: true, quality: 'low' }, st);
    expect(loadOptions(st)).toEqual({ guide: false, mouseSteer: true, quality: 'low' });
    st.setItem('combine-game:keys', '{壊れた');
    expect(loadKeys(st)).toEqual(DEFAULT_KEYS);
    expect(loadKeys(null)).toEqual(DEFAULT_KEYS);
  });

  it('ベスト記録：よいときだけ更新。キーは版・難易度・マップで分ける', () => {
    const st = memStorage();
    const key = bestKey('normal', 'abc', false);
    expect(key).toContain(`v${BALANCE_VERSION}`);
    expect(bestKey('hard', 'abc', false)).not.toBe(key);
    expect(bestKey('normal', 'x', true)).toBe(bestKey('normal', 'y', true));
    expect(recordBest(key, { score: 20000, rank: 'B', date: '2026-10-24' }, st)).toEqual({ improved: true, prev: null });
    expect(recordBest(key, { score: 15000, rank: 'C', date: '2026-10-24' }, st).improved).toBe(false);
    const r = recordBest(key, { score: 26000, rank: 'A', date: '2026-10-25' }, st);
    expect(r.improved).toBe(true);
    expect(r.prev!.score).toBe(20000);
    expect(loadBest(key, st)!.rank).toBe('A');
  });

  it('共有用の文字列に、版・難易度・マップ・得点が入る', () => {
    expect(shareText('hard', 'abc', false, 26912, 'A')).toBe(`コンバイン収穫ゲーム v${BALANCE_VERSION}-hard-abc 26.9 t（A）`);
    expect(shareText('normal', 'x', true, 1000, 'C')).toContain('-normal-standard ');
  });
});
