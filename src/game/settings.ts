/**
 * 設定と記録（docs/game-design.md §3・§7.2）：キーの割り当て、表示の設定、ベスト記録、共有用の文字列。
 * ブラウザの localStorage に保存する。使えない環境（プライベートウィンドウなど）では、保存しないだけにする。
 */
import { BALANCE_VERSION, type Difficulty } from './balance';

export type Action = 'up' | 'down' | 'left' | 'right' | 'header' | 'auger' | 'hold' | 'cart' | 'camera' | 'guide';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'header', 'auger', 'hold', 'cart', 'camera', 'guide'];
export const ACTION_NAMES: Record<Action, string> = {
  up: '加速', down: '減速・後退', left: 'ハンドル左', right: 'ハンドル右', header: 'ヘッダの上げ下げ',
  auger: '排出オーガ', hold: '負荷ホールド', cart: 'カートを呼ぶ／帰す（Shift で強行）', camera: 'カメラの切り替え', guide: 'ガイドラインの表示',
};
export const DEFAULT_KEYS: Record<Action, string> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', header: 'Space', auger: 'KeyQ', hold: 'KeyF', cart: 'KeyE', camera: 'KeyC', guide: 'KeyG',
};
/** 割り当てられないキー（一時停止・やり直し・ミニマップ・修飾キー） */
export const RESERVED = new Set(['Escape', 'KeyR', 'Tab', 'ShiftLeft', 'ShiftRight', 'Enter']);

export interface Options {
  guide: boolean;
  mouseSteer: boolean;
  quality: 'high' | 'low';
}
export const DEFAULT_OPTIONS: Options = { guide: true, mouseSteer: false, quality: 'high' };

export interface BestRecord {
  score: number; // kg（ゲームの重さ）
  rank: string;
  date: string; // ISO
}

/** localStorage（使えなければ null） */
export function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const k = '__combine_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

function read<T>(storage: Storage | null, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function write(storage: Storage | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できないときは何もしない
  }
}

const KEYS_KEY = 'combine-game:keys';
const OPTIONS_KEY = 'combine-game:options';

export function loadKeys(storage = safeStorage()): Record<Action, string> {
  return read(storage, KEYS_KEY, { ...DEFAULT_KEYS });
}
export function saveKeys(keys: Record<Action, string>, storage = safeStorage()) {
  write(storage, KEYS_KEY, keys);
}
export function loadOptions(storage = safeStorage()): Options {
  return read(storage, OPTIONS_KEY, { ...DEFAULT_OPTIONS });
}
export function saveOptions(o: Options, storage = safeStorage()) {
  write(storage, OPTIONS_KEY, o);
}

/** キーを割り当てる。ほかの操作に使われていたら入れ替える。割り当てられないキーなら false */
export function bindKey(keys: Record<Action, string>, action: Action, code: string): boolean {
  if (RESERVED.has(code)) return false;
  const other = ACTIONS.find((a) => a !== action && keys[a] === code);
  if (other) keys[other] = keys[action];
  keys[action] = code;
  return true;
}

/** キーの表示名（KeyW → W、ArrowUp → ↑） */
export function keyLabel(code: string): string {
  const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (ARROWS[code]) return ARROWS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** ベスト記録のキー：バランスの版・難易度・マップ（版が変われば別の記録） */
export function bestKey(difficulty: Difficulty, seed: string, standard: boolean): string {
  return `combine-game:best:v${BALANCE_VERSION}:${difficulty}:${standard ? 'standard' : `seed:${seed}`}`;
}
export function loadBest(key: string, storage = safeStorage()): BestRecord | null {
  const r = read<BestRecord | null>(storage, key, null as unknown as BestRecord);
  return r && typeof r.score === 'number' ? r : null;
}
/** 記録を比べて、よければ保存する。戻り値：更新したか、前の記録 */
export function recordBest(key: string, rec: BestRecord, storage = safeStorage()): { improved: boolean; prev: BestRecord | null } {
  const prev = loadBest(key, storage);
  const improved = !prev || rec.score > prev.score;
  if (improved) write(storage, key, rec);
  return { improved, prev };
}

/** 共有用の文字列（§7.2）：版・難易度・マップ・得点 */
export function shareText(difficulty: Difficulty, seed: string, standard: boolean, scoreKg: number, rank: string): string {
  const map = standard ? 'standard' : seed;
  return `コンバイン収穫ゲーム v${BALANCE_VERSION}-${difficulty}-${map} ${(scoreKg / 1000).toFixed(1)} t（${rank}）`;
}
