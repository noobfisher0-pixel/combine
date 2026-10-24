/**
 * 基準のボットを裏で走らせる（docs/game-design.md §8.5・§9、G-R-07）。タイトル画面の「このマップの目安」に使う。
 * メインのページには `?worker&inline` で埋め込む（1 ファイルのページのまま）。
 */
import type { Difficulty } from './balance';
import { runBot } from './bot';
import { generateMap, standardMap } from './map';
import { GameSim } from './sim/game';

export interface BotRequest {
  id: number;
  seed: string;
  difficulty: Difficulty;
  standard: boolean;
}
export interface BotReply {
  id: number;
  score: number;
  ratio: number;
  rank: string;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<BotRequest>) => void) | null; postMessage(m: BotReply): void };
ctx.onmessage = (e) => {
  const { id, seed, difficulty, standard } = e.data;
  const map = standard ? standardMap() : generateMap(seed, difficulty);
  const r = runBot(new GameSim(map, { difficulty }));
  ctx.postMessage({ id, score: r.score, ratio: r.ratio, rank: r.rank });
};
