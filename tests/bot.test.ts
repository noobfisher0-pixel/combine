/**
 * ゲーム G2：基準のボットとバランス（docs/game-design.md §5・§9・§10）。
 */
import { describe, expect, it } from 'vitest';
import { runBot } from '../src/game/bot';
import { generateMap, standardMap } from '../src/game/map';
import { GameSim, RANKS } from '../src/game/sim/game';

describe('標準マップ（ふつう）', () => {
  const r = runBot(new GameSim(standardMap()));
  it('ボットの得点は 24〜30 t（§5 の見込み 26〜30 t）、上限の 70〜85 %（ランク A）', () => {
    expect(r.score / 1000).toBeGreaterThan(24);
    expect(r.score / 1000).toBeLessThan(30);
    expect(r.ratio).toBeGreaterThanOrEqual(0.7);
    expect(r.ratio).toBeLessThan(0.85);
    expect(r.rank).toBe('A');
    expect(r.collisions).toBe(0);
  });
  it('回り刈りは往復刈りよりよい。往復刈りは −X の行程でカートが来られず、あふれとタンクの残りが出る（G4 で測り直し、§19）', () => {
    const b = runBot(new GameSim(standardMap()), { pattern: 'backforth' });
    expect(r.score).toBeGreaterThan(b.score);
    expect(b.losses.overflow).toBeGreaterThan(1000);
    expect(r.losses.overflow).toBe(0);
  });
  it('遅すぎる（4 km/h）・速すぎる（7 km/h）運転は、負荷ホールドのボットより点が低い', () => {
    const slow = runBot(new GameSim(standardMap()), { speed: 4 });
    const fast = runBot(new GameSim(standardMap()), { speed: 7 });
    expect(slow.score).toBeLessThan(r.score * 0.8);
    expect(fast.score).toBeLessThan(r.score * 0.8);
    expect(fast.losses.rotor).toBeGreaterThan(10_000); // 取りこぼし
  });
  it('同じマップなら同じ点（決定的）', () => {
    expect(runBot(new GameSim(standardMap())).score).toBe(r.score);
  });
});

describe('自動生成のマップ（各 8 シード）', () => {
  // むずかしいは G4 で倒れた小麦・水たまりを増やしたので、ボットでも 4 割台のマップがある
  for (const [d, floor] of [['normal', 0.5], ['hard', 0.4]] as const) {
    it(`${d}：ボットはぶつからずに走り切り、上限の ${floor * 100} % 以上を取る`, () => {
      for (let i = 0; i < 8; i++) {
        const r = runBot(new GameSim(generateMap(`bot-${i}`, d), { difficulty: d }));
        expect(r.collisions, `bot-${i}`).toBe(0);
        expect(r.ratio, `bot-${i}`).toBeGreaterThan(floor);
        expect(r.losses.spill, `bot-${i}`).toBeLessThan(500);
      }
    });
  }
});

it('ランクのしきい値（ボットの平均 0.7 前後が A、それより 2 割ほどよければ S）', () => {
  expect(RANKS.map(([k, v]) => `${k}${v}`)).toEqual(['S0.85', 'A0.7', 'B0.55', 'C0']);
});
