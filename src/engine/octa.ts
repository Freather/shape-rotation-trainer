// 그림 정팔면체: 꼭짓점이 위·아래·앞·뒤·왼쪽·오른쪽을 향한 정팔면체.
// 면마다 색 하나와 (있으면) 그림 하나. 전체 회전 말고도 한쪽 4면만 돌리기, 그림만 옮기기가 있다.
// 면 = 법선 부호 (sx, sy, sz). 그림 방향은 면 위의 정수 벡터 up(면 중심 → 꼭짓점 방향의 3배)로 들고 다닌다.

import { RADIAL_SYMBOLS } from '../symbols/library';
import { matFromAxis, type Mat3 } from './blocks';
import type { Rng } from './rng';
import { VIEW_AXIS, signedAngle, type Dir, type TextPart, type View } from './rotation';

export type V3 = [number, number, number];

export interface OctaPic {
  symbol: string;
  up: V3;
}
export interface OctaFace {
  color: number;
  pic: OctaPic | null;
}
export type OctaState = OctaFace[];

/** 면 순서: 위쪽 4면 먼저 */
export const OCTA_NORMALS: V3[] = [];
for (const sy of [1, -1]) for (const sz of [1, -1]) for (const sx of [1, -1]) OCTA_NORMALS.push([sx, sy, sz]);

export const OCTA_COLORS = ['#ffffff', '#f7d774', '#93c5ea'];

export const faceIndex = (n: V3): number => OCTA_NORMALS.findIndex((m) => m[0] === n[0] && m[1] === n[1] && m[2] === n[2]);
const mulV = (m: Mat3, v: V3): V3 => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as V3;
const dotI = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 면의 세 꼭짓점 (단위 축 방향) */
export const faceVertices = (n: V3): V3[] => [
  [n[0], 0, 0],
  [0, n[1], 0],
  [0, 0, n[2]],
];

export type OctaOp =
  /** 도형 전체 90° */
  | { kind: 'turn'; view: View; dir: Dir }
  /** 한쪽 4면(꼭짓점 하나를 둘러싼 4면)만 색·그림째 90° */
  | { kind: 'layer'; view: View; dir: Dir }
  /** 한쪽 4면의 그림만 옆 면으로 한 칸 (색은 제자리) */
  | { kind: 'movePics'; view: View; dir: Dir }
  /** 한쪽 4면의 그림을 모서리 건너 바로 맞붙은 반대쪽 면의 그림과 맞바꿈 */
  | { kind: 'swapPics'; view: View };

export const SIDE_NAME: Record<View, string> = { top: '위쪽', right: '오른쪽', front: '앞쪽' };
const OTHER_SIDE: Record<View, string> = { top: '아래쪽', right: '왼쪽', front: '뒤쪽' };
const VIEW_FROM: Record<View, string> = { top: '위', right: '오른쪽', front: '앞' };
const dirText = (d: Dir) => (d === 'cw' ? '시계방향' : '반시계방향');

export function describeOctaOp(op: OctaOp): TextPart[] {
  switch (op.kind) {
    case 'turn':
      return [`전체를 ${VIEW_FROM[op.view]}에서 볼 때 ${dirText(op.dir)} 90°`];
    case 'layer':
      return [`${SIDE_NAME[op.view]} 4면만 ${VIEW_FROM[op.view]}에서 볼 때 ${dirText(op.dir)} 90°`];
    case 'movePics':
      return [`${SIDE_NAME[op.view]} 4면의 그림만 ${VIEW_FROM[op.view]}에서 볼 때 ${dirText(op.dir)}으로 한 칸`];
    case 'swapPics':
      return [`${SIDE_NAME[op.view]} 4면의 그림과 바로 맞붙은 ${OTHER_SIDE[op.view]} 면의 그림 맞바꾸기`];
  }
}
export const describeOctaOpText = (op: OctaOp) => describeOctaOp(op).join('');

/** 이 연산에서 움직이는 면인지 */
export function opTouches(op: OctaOp, n: V3): boolean {
  if (op.kind === 'turn') return true;
  return dotI(n, VIEW_AXIS[op.view] as unknown as V3) > 0 || op.kind === 'swapPics';
}

export const viewMatrix = (view: View, dir: Dir): Mat3 => matFromAxis(VIEW_AXIS[view], signedAngle(dir, 90));

/** 맞바꾸기 짝: 면 n을 그 축 반대편으로 넘기는 180° 회전 (두 면이 맞닿은 모서리 축) */
export function swapAxis(view: View, n: V3): V3 {
  const a = VIEW_AXIS[view] as unknown as V3;
  const k = dotI(n, a);
  return [n[0] - k * a[0], n[1] - k * a[1], n[2] - k * a[2]];
}
const swapMatrix = (b: V3): Mat3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => b[i] * b[j] - (i === j ? 1 : 0)));

const movePic = (p: OctaPic | null, m: Mat3): OctaPic | null => (p ? { symbol: p.symbol, up: mulV(m, p.up) } : null);

export function applyOctaOp(st: OctaState, op: OctaOp): OctaState {
  const out: OctaState = st.map((f) => ({ color: f.color, pic: f.pic }));
  OCTA_NORMALS.forEach((n, i) => {
    const f = st[i];
    switch (op.kind) {
      case 'turn': {
        const m = viewMatrix(op.view, op.dir);
        out[faceIndex(mulV(m, n))] = { color: f.color, pic: movePic(f.pic, m) };
        break;
      }
      case 'layer':
      case 'movePics': {
        if (!opTouches(op, n)) break;
        const m = viewMatrix(op.view, op.dir);
        const j = faceIndex(mulV(m, n));
        out[j] = op.kind === 'layer' ? { color: f.color, pic: movePic(f.pic, m) } : { color: out[j].color, pic: movePic(f.pic, m) };
        break;
      }
      case 'swapPics': {
        const m = swapMatrix(swapAxis(op.view, n));
        const j = faceIndex(mulV(m, n));
        out[j] = { color: out[j].color, pic: movePic(f.pic, m) };
        break;
      }
    }
  });
  return out;
}

export const applyOctaOps = (st: OctaState, ops: OctaOp[]) => ops.reduce(applyOctaOp, st);

export const octaKey = (st: OctaState): string =>
  st.map((f) => `${f.color}${f.pic ? `${f.pic.symbol}@${f.pic.up.join(',')}` : ''}`).join('|');

export function randomOcta(rng: Rng, picCount = 5): OctaState {
  // 색 세 가지가 고루 (2~3면씩)
  const colors = rng.shuffle([0, 0, 1, 1, 1, 2, 2, 2]);
  const syms = rng.shuffle(RADIAL_SYMBOLS);
  // 위쪽과 아래쪽에 그림이 고루 가도록
  const upper = rng.shuffle([0, 1, 2, 3]);
  const lower = rng.shuffle([4, 5, 6, 7]);
  const hi = Math.ceil(picCount / 2);
  const withPic = new Set([...upper.slice(0, hi), ...lower.slice(0, picCount - hi)]);
  let s = 0;
  return OCTA_NORMALS.map((n, i) => {
    if (!withPic.has(i)) return { color: colors[i], pic: null };
    const v = rng.pick(faceVertices(n));
    const up: V3 = [3 * v[0] - n[0], 3 * v[1] - n[1], 3 * v[2] - n[2]];
    return { color: colors[i], pic: { symbol: syms[s++ % syms.length], up } };
  });
}

export interface OctaLevelConfig {
  kinds: OctaOp['kind'][];
  views: View[];
  ruleCount: number;
  steps: [number, number];
  picCount: number;
}

export const OCTA_LEVELS: Record<number, OctaLevelConfig> = {
  1: { kinds: ['turn', 'layer'], views: ['top'], ruleCount: 3, steps: [1, 2], picCount: 4 },
  2: { kinds: ['turn', 'layer', 'movePics'], views: ['top', 'right'], ruleCount: 4, steps: [2, 2], picCount: 4 },
  3: { kinds: ['turn', 'layer', 'movePics', 'swapPics'], views: ['top', 'right', 'front'], ruleCount: 4, steps: [2, 3], picCount: 5 },
  4: { kinds: ['turn', 'layer', 'movePics', 'swapPics'], views: ['top', 'right', 'front'], ruleCount: 5, steps: [3, 3], picCount: 5 },
  5: { kinds: ['turn', 'layer', 'movePics', 'swapPics'], views: ['top', 'right', 'front'], ruleCount: 5, steps: [3, 4], picCount: 6 },
};

export function octaOpCandidates(kinds: OctaOp['kind'][], views: View[]): OctaOp[] {
  const out: OctaOp[] = [];
  for (const view of views) {
    for (const kind of ['turn', 'layer', 'movePics'] as const) if (kinds.includes(kind)) for (const dir of ['cw', 'ccw'] as Dir[]) out.push({ kind, view, dir });
    if (kinds.includes('swapPics')) out.push({ kind: 'swapPics', view });
  }
  return out;
}

const PROBES: OctaState[] = (() => {
  // 효과 비교용: 면마다 색·그림이 모두 다른 상태
  const syms = RADIAL_SYMBOLS;
  return [0, 1].map((k) =>
    OCTA_NORMALS.map((n, i) => {
      const v = faceVertices(n)[(i + k) % 3];
      return { color: i, pic: { symbol: syms[(i + k) % syms.length], up: [3 * v[0] - n[0], 3 * v[1] - n[1], 3 * v[2] - n[2]] as V3 } };
    }),
  );
})();
export const octaEffect = (op: OctaOp) => PROBES.map((p) => octaKey(applyOctaOp(p, op))).join('#');
export const sameOctaEffect = (a: OctaOp, b: OctaOp) => octaEffect(a) === octaEffect(b);

/** 방향을 반대로 */
export const flipOctaDir = (op: OctaOp): OctaOp | null => (op.kind === 'swapPics' ? null : { ...op, dir: op.dir === 'cw' ? 'ccw' : 'cw' });
