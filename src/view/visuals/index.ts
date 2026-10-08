import type { Group } from 'three';
import type { PartDef } from '../../model/types';
import type { MaterialLib } from '../materials';
import {
  exhaustVisual,
  faceVisual,
  feederVisual,
  flapVisual,
  gpsVisual,
  ladderVisual,
  mirrorVisual,
  panelVisual,
  screenVisual,
  tankVisual,
} from './body';
import { VisualBuilder } from './builder';
import { cabVisual } from './cab';
import {
  cutterbarVisual,
  dividerVisual,
  endShieldVisual,
  headerBackVisual,
  headerDeckVisual,
  reelArmVisual,
  reelVisual,
} from './header';
import { unloadVisual } from './unload';
import { wheelVisual } from './wheel';

type VisualFn = (part: PartDef, vb: VisualBuilder) => void;

/** 部品 ID（末尾 * は前方一致）→ 見た目の組み立て。M1 は外装のみ。内部機構は M3。 */
const VISUALS: Array<[string, VisualFn]> = [
  ['wheel.*', wheelVisual],
  ['panel.*', panelVisual],
  ['cab', cabVisual],
  ['cab.gps', gpsVisual],
  ['cab.mirror*', mirrorVisual],
  ['cab.ladder', ladderVisual],
  ['tank', tankVisual],
  ['tank.flap*', flapVisual],
  ['unload.*', unloadVisual],
  ['feeder.housing', feederVisual],
  ['feeder.face', faceVisual],
  ['header.back', headerBackVisual],
  ['header.deck', headerDeckVisual],
  ['header.cutterbar', cutterbarVisual],
  ['header.end*', endShieldVisual],
  ['header.divider*', dividerVisual],
  ['header.reelArm*', reelArmVisual],
  ['header.reel', reelVisual],
  ['engine.exhaust', exhaustVisual],
  ['engine.screen', screenVisual],
];

function find(id: string): VisualFn | undefined {
  return VISUALS.find(([p]) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p))?.[1];
}

export function hasVisual(part: PartDef): boolean {
  return find(part.id) !== undefined;
}

/** 見た目の Group（既定姿勢のワールド座標）。見た目がない部品は null。 */
export function buildVisual(part: PartDef, lib: MaterialLib): Group | null {
  const fn = find(part.id);
  if (!fn) return null;
  const vb = new VisualBuilder();
  fn(part, vb);
  return vb.build(lib, part.id);
}
