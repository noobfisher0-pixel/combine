/**
 * 決定的な乱数とノイズ（docs/game-design.md §6、G-R-13）。
 * マップの生成には Math.sin などの超越関数を使わない（ブラウザの実装で最後の桁がずれることがあるため）。
 * 整数演算（Math.imul）と四則演算だけで作るので、どのブラウザでも同じ畑になる。
 */

/** 文字列のハッシュ（FNV-1a 32 bit） */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 0 以上 1 未満の一様乱数（mulberry32） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 整数の格子点のハッシュ → 0〜1 */
function lattice(seed: number, ix: number, iz: number): number {
  let h = seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** 値ノイズ（波長 lambda [m]）。−1〜1 */
export function valueNoise(seed: number, lambda: number): (x: number, z: number) => number {
  return (x, z) => {
    const fx = x / lambda;
    const fz = z / lambda;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fade(fx - ix);
    const tz = fade(fz - iz);
    const a = lattice(seed, ix, iz);
    const b = lattice(seed, ix + 1, iz);
    const c = lattice(seed, ix, iz + 1);
    const d = lattice(seed, ix + 1, iz + 1);
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return (top + (bot - top) * tz) * 2 - 1;
  };
}

/** いくつかの波長の値ノイズの和（振幅は 1 / 2^i）。およそ −1〜1 */
export function fractalNoise(seed: number, lambdas: number[]): (x: number, z: number) => number {
  const layers = lambdas.map((l, i) => ({ f: valueNoise((seed + Math.imul(i + 1, 0x9e3779b9)) >>> 0, l), a: 1 / 2 ** i }));
  const norm = layers.reduce((s, l) => s + l.a, 0);
  return (x, z) => layers.reduce((s, l) => s + l.f(x, z) * l.a, 0) / norm;
}
