import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

/**
 * 配色（design §1.3）。実在ブランドの配色は置かない。
 * 色は「ティール＋オフホワイト＋足回りダークグレー」。
 */
export interface Livery {
  body: number; // 外板・タンク・フィーダ・ヘッダ・排出オーガ
  accent: number; // キャブ屋根・リールのバット・フラップ
  frame: number; // フレーム・車軸・カッターバー・ラダー
  rubber: number;
  rim: number;
  steel: number;
  glass: number;
  lamp: number;
  hazard: number; // デバイダ先端などの注意色
}

export const DEFAULT_LIVERY: Livery = {
  body: 0x2a7b78,
  accent: 0xecead4,
  frame: 0x2b2e31,
  rubber: 0x1b1d1e,
  rim: 0xd9d6c4,
  steel: 0xa7afb2,
  glass: 0x9fc9cf,
  lamp: 0xfff4d6,
  hazard: 0xe8b23a,
};

/** blur = 高速で動く部品のブラー表示（半透明） */
export type MaterialKey = keyof Livery | 'blur';

/** 外装の共通材質。X線・断面の切り替えはこの材質に対して行う。 */
export class MaterialLib {
  readonly mats: Record<MaterialKey, MeshStandardMaterial>;

  constructor(l: Livery = DEFAULT_LIVERY) {
    const paint = (c: number) => new MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.25 });
    this.mats = {
      body: paint(l.body),
      accent: paint(l.accent),
      frame: new MeshStandardMaterial({ color: l.frame, roughness: 0.6, metalness: 0.35 }),
      rubber: new MeshStandardMaterial({ color: l.rubber, roughness: 0.92, metalness: 0 }),
      rim: paint(l.rim),
      steel: new MeshStandardMaterial({ color: l.steel, roughness: 0.3, metalness: 0.85 }),
      // 既定はガラスを transmission なしの半透明＋環境反射にする（R-16）
      glass: new MeshPhysicalMaterial({
        color: l.glass,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 1.4,
        depthWrite: false,
      }),
      lamp: new MeshStandardMaterial({ color: l.lamp, emissive: new Color(l.lamp), emissiveIntensity: 0.6, roughness: 0.2 }),
      hazard: paint(l.hazard),
      blur: new MeshStandardMaterial({ color: l.steel, roughness: 0.6, transparent: true, opacity: 0.28, depthWrite: false }),
    };
    for (const [k, m] of Object.entries(this.mats)) m.name = `mat:${k}`;
  }

  get all(): MeshStandardMaterial[] {
    return Object.values(this.mats);
  }
}
