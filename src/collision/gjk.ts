/**
 * 凸形状の交差判定（GJK、ブール版）。
 * 形状はサポート関数 support(d) → 方向 d に最も遠い点 で与える。
 * 隙間の検査は、片方の形状を「余裕ぶん膨らませた」サポート関数で交差判定して行う。
 */

export type V3 = [number, number, number];
export type Support = (d: V3) => V3;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const triple = (a: V3, b: V3, c: V3): V3 => cross(cross(a, b), c);
const len2 = (a: V3) => dot(a, a);

const EPS = 1e-12;

export function intersects(sa: Support, sb: Support, initial: V3 = [1, 0, 0], maxIter = 64): boolean {
  const support = (d: V3): V3 => sub(sa(d), sb(neg(d)));
  let d: V3 = len2(initial) > EPS ? initial : [1, 0, 0];
  let simplex: V3[] = [support(d)];
  d = neg(simplex[0]);
  if (len2(d) < EPS) return true;

  for (let i = 0; i < maxIter; i++) {
    const a = support(d);
    if (dot(a, d) < 0) return false;
    simplex.push(a);
    const res = doSimplex(simplex);
    if (res === true) return true;
    simplex = res.simplex;
    d = res.d;
    if (len2(d) < EPS) return true; // 原点が単体の上にある
  }
  // 収束しない場合は安全側（交差あり）に倒す
  return true;
}

type Step = { simplex: V3[]; d: V3 } | true;

function line(b: V3, a: V3): Step {
  const ab = sub(b, a);
  const ao = neg(a);
  if (dot(ab, ao) > 0) return { simplex: [b, a], d: triple(ab, ao, ab) };
  return { simplex: [a], d: ao };
}

function triangle(c: V3, b: V3, a: V3): Step {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ao = neg(a);
  const abc = cross(ab, ac);
  if (dot(cross(abc, ac), ao) > 0) {
    if (dot(ac, ao) > 0) return { simplex: [c, a], d: triple(ac, ao, ac) };
    return line(b, a);
  }
  if (dot(cross(ab, abc), ao) > 0) return line(b, a);
  if (dot(abc, ao) > 0) return { simplex: [c, b, a], d: abc };
  return { simplex: [b, c, a], d: neg(abc) };
}

function tetra(dd: V3, c: V3, b: V3, a: V3): Step {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ad = sub(dd, a);
  const ao = neg(a);
  const abc = cross(ab, ac);
  const acd = cross(ac, ad);
  const adb = cross(ad, ab);
  if (dot(abc, ao) > 0) return triangle(c, b, a);
  if (dot(acd, ao) > 0) return triangle(dd, c, a);
  if (dot(adb, ao) > 0) return triangle(b, dd, a);
  return true;
}

function doSimplex(s: V3[]): Step {
  switch (s.length) {
    case 2:
      return line(s[0], s[1]);
    case 3:
      return triangle(s[0], s[1], s[2]);
    default:
      return tetra(s[0], s[1], s[2], s[3]);
  }
}
