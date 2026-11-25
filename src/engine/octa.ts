// 그림 정팔면체: 꼭짓점이 위·아래·앞·뒤·왼쪽·오른쪽을 향한 정팔면체.
// 면은 모두 흰색, 면마다 (있으면) 그림 하나. 그림은 검은 그림이거나 흰 그림(테두리만). 전체 회전 말고도 한쪽 4면만 돌리기, 그림 맞바꾸기, 그림 색 반전이 있다.
// 면 = 법선 부호 (sx, sy, sz). 그림 방향은 면 위의 정수 벡터 up(면 중심 → 꼭짓점 방향의 3배)로 들고 다닌다.

import { RADIAL_SYMBOLS, arrangeSymbols } from '../symbols/library';
import { matFromAxis, type Mat3 } from './blocks';
import type { Vec3 } from './math';
import type { Rng } from './rng';
import { signedAngle, type Dir, type TextPart, type View } from './rotation';

export type V3 = [number, number, number];

export interface OctaPic {
  symbol: string;
  up: V3;
  /** true = 흰 그림(테두리만), false = 검은 그림 */
  white: boolean;
}
export interface OctaFace {
  pic: OctaPic | null;
}
export type OctaState = OctaFace[];

/** 면 순서: 위쪽 4면 먼저 */
export const OCTA_NORMALS: V3[] = [];
for (const sy of [1, -1]) for (const sz of [1, -1]) for (const sx of [1, -1]) OCTA_NORMALS.push([sx, sy, sz]);


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
  /** 한쪽 4면(꼭짓점 하나를 둘러싼 4면)만 90° (그 4면의 그림이 옆 면으로 한 칸씩) */
  | { kind: 'layer'; view: Side; dir: Dir }
  /**
   * 그림 맞바꾸기: 한쪽 4면의 그림을 짝 면의 그림과 바꿈.
   * near = 모서리 건너 바로 맞붙은 면, opposite = 도형 건너 정반대편 면 (그림은 가로 모서리 방향 축으로 반 바퀴)
   */
  | { kind: 'swapPics'; view: View; target: SwapTarget }
  /** 그림 색 반전 (검은 그림 ↔ 흰 그림): 한쪽 4면만, 또는 모든 그림. 면 바탕은 그대로 */
  | { kind: 'invert'; view: Side | 'all' };

export type SwapTarget = 'near' | 'opposite';

/** 4면을 고르는 쪽: 꼭짓점 여섯 개 방향 */
export type Side = View | 'bottom' | 'left' | 'back';
export const ALL_SIDES: Side[] = ['top', 'right', 'front', 'bottom', 'left', 'back'];
export const SIDE_AXIS: Record<Side, Vec3> = { top: [0, 1, 0], right: [1, 0, 0], front: [0, 0, 1], bottom: [0, -1, 0], left: [-1, 0, 0], back: [0, 0, -1] };
const axisOf = (s: Side) => SIDE_AXIS[s] as unknown as V3;
export const SIDE_NAME: Record<Side, string> = { top: '위쪽', right: '오른쪽', front: '앞쪽', bottom: '아래쪽', left: '왼쪽', back: '뒤쪽' };
const OTHER_SIDE: Record<View, string> = { top: '아래쪽', right: '왼쪽', front: '뒤쪽' };
const VIEW_FROM: Record<Side, string> = { top: '위', right: '오른쪽', front: '앞', bottom: '아래', left: '왼쪽', back: '뒤' };
/** 그림 맞바꾸기·전체 돌리기는 위·오른쪽·앞만 (반대쪽은 같은 규칙이 됨) */
export const isMainSide = (s: Side): s is View => s === 'top' || s === 'right' || s === 'front';
const MAIN_OF: Record<Side, View> = { top: 'top', right: 'right', front: 'front', bottom: 'top', left: 'right', back: 'front' };
/** 그 쪽에서 볼 때 dir 방향으로 도형 전체를 돌리는 것 (아래에서 볼 때 시계 = 위에서 볼 때 반시계) */
export function wholeTurnFrom(side: Side, dir: Dir): OctaOp {
  const flip = !isMainSide(side);
  return { kind: 'turn', view: MAIN_OF[side], dir: flip ? (dir === 'cw' ? 'ccw' : 'cw') : dir };
}
const dirText = (d: Dir) => (d === 'cw' ? '시계방향' : '반시계방향');

export function describeOctaOp(op: OctaOp): TextPart[] {
  switch (op.kind) {
    case 'turn':
      return [`전체를 ${VIEW_FROM[op.view]}에서 볼 때 ${dirText(op.dir)} 90°`];
    case 'layer':
      return [`${SIDE_NAME[op.view]} 4면만 ${VIEW_FROM[op.view]}에서 볼 때 ${dirText(op.dir)} 90°`];
    case 'swapPics':
      return [
        op.target === 'near'
          ? `${SIDE_NAME[op.view]} 4면의 그림 맞바꾸기: 바로 맞붙은 ${OTHER_SIDE[op.view]} 면과`
          : `${SIDE_NAME[op.view]} 4면의 그림 맞바꾸기: 정반대편(마주 보는) 면과`,
      ];
    case 'invert':
      return [op.view === 'all' ? '모든 그림의 색 반전 (검은 그림 ↔ 흰 그림)' : `${SIDE_NAME[op.view]} 4면의 그림만 색 반전 (검은 그림 ↔ 흰 그림)`];
  }
}
export const describeOctaOpText = (op: OctaOp) => describeOctaOp(op).join('');

/** 이 연산에서 움직이는 면인지 */
export function opTouches(op: OctaOp, n: V3): boolean {
  if (op.kind === 'turn') return true;
  if (op.kind === 'invert') return op.view === 'all' || dotI(n, axisOf(op.view)) > 0;
  return dotI(n, axisOf(op.view)) > 0 || op.kind === 'swapPics';
}

/** 규칙이 가리키는 쪽 4면인지 (그림에 점선 표시용) */
export const onSide = (op: OctaOp, n: V3) => op.kind !== 'turn' && op.view !== 'all' && dotI(n, axisOf(op.view)) > 0;

/** 정반대편 맞바꾸기 축: 쪽 방향 a와 면 n에 모두 수직 (그 면의 가로 모서리 방향) */
export function oppositeAxis(view: Side, n: V3): V3 {
  const a = axisOf(view);
  return [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
}

export const viewMatrix = (view: Side, dir: Dir): Mat3 => matFromAxis(SIDE_AXIS[view], signedAngle(dir, 90));

/** 맞바꾸기 짝: 면 n을 그 축 반대편으로 넘기는 180° 회전 (두 면이 맞닿은 모서리 축) */
export function swapAxis(view: Side, n: V3): V3 {
  const a = axisOf(view);
  const k = dotI(n, a);
  return [n[0] - k * a[0], n[1] - k * a[1], n[2] - k * a[2]];
}
const swapMatrix = (b: V3): Mat3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => b[i] * b[j] - (i === j ? 1 : 0)));

const movePic = (p: OctaPic | null, m: Mat3): OctaPic | null => (p ? { ...p, up: mulV(m, p.up) } : null);

export function applyOctaOp(st: OctaState, op: OctaOp): OctaState {
  const out: OctaState = st.map((f) => ({ pic: f.pic }));
  OCTA_NORMALS.forEach((n, i) => {
    const f = st[i];
    switch (op.kind) {
      case 'turn': {
        const m = viewMatrix(op.view, op.dir);
        out[faceIndex(mulV(m, n))] = { pic: movePic(f.pic, m) };
        break;
      }
      case 'layer': {
        if (!opTouches(op, n)) break;
        const m = viewMatrix(op.view, op.dir);
        out[faceIndex(mulV(m, n))] = { pic: movePic(f.pic, m) };
        break;
      }
      case 'swapPics': {
        const m = swapMatrix(op.target === 'near' ? swapAxis(op.view, n) : oppositeAxis(op.view, n));
        const j = faceIndex(mulV(m, n));
        out[j] = { pic: movePic(f.pic, m) };
        break;
      }
      case 'invert':
        if (opTouches(op, n) && f.pic) out[i] = { pic: { ...f.pic, white: !f.pic.white } };
        break;
    }
  });
  return out;
}

export const applyOctaOps = (st: OctaState, ops: OctaOp[]) => ops.reduce(applyOctaOp, st);

export const octaKey = (st: OctaState): string =>
  st.map((f) => (f.pic ? `${f.pic.symbol}@${f.pic.up.join(',')}${f.pic.white ? 'w' : ''}` : '-')).join('|');

export function randomOcta(rng: Rng, picCount = 5): OctaState {
  const syms = rng.shuffle(arrangeSymbols(rng.shuffle(RADIAL_SYMBOLS), (p) => rng.chance(p)).slice(0, picCount));
  // 위쪽과 아래쪽에 그림이 고루 가도록
  const upper = rng.shuffle([0, 1, 2, 3]);
  const lower = rng.shuffle([4, 5, 6, 7]);
  const hi = Math.ceil(picCount / 2);
  const withPic = new Set([...upper.slice(0, hi), ...lower.slice(0, picCount - hi)]);
  let s = 0;
  return OCTA_NORMALS.map((n, i) => {
    if (!withPic.has(i)) return { pic: null };
    const v = rng.pick(faceVertices(n));
    const up: V3 = [3 * v[0] - n[0], 3 * v[1] - n[1], 3 * v[2] - n[2]];
    // 흰 그림은 셋 중 하나꼴
    return { pic: { symbol: syms[s++ % syms.length], up, white: rng.chance(0.35) } };
  });
}

export interface OctaLevelConfig {
  kinds: OctaOp['kind'][];
  views: Side[];
  ruleCount: number;
  steps: [number, number];
  picCount: number;
  /** 그림 맞바꾸기에 정반대편 면도 나오는지 */
  opposite: boolean;
}

export const OCTA_LEVELS: Record<number, OctaLevelConfig> = {
  1: { kinds: ['turn', 'layer', 'invert'], views: ['top'], ruleCount: 3, steps: [1, 2], picCount: 4, opposite: false },
  2: { kinds: ['turn', 'layer', 'invert'], views: ['top', 'right', 'bottom', 'left'], ruleCount: 4, steps: [2, 2], picCount: 4, opposite: false },
  3: { kinds: ['turn', 'layer', 'swapPics', 'invert'], views: ['top', 'right', 'front', 'bottom', 'left', 'back'], ruleCount: 4, steps: [2, 3], picCount: 5, opposite: false },
  4: { kinds: ['turn', 'layer', 'swapPics', 'invert'], views: ['top', 'right', 'front', 'bottom', 'left', 'back'], ruleCount: 5, steps: [3, 3], picCount: 5, opposite: true },
  5: { kinds: ['turn', 'layer', 'swapPics', 'invert'], views: ['top', 'right', 'front', 'bottom', 'left', 'back'], ruleCount: 5, steps: [3, 4], picCount: 6, opposite: true },
};

export function octaOpCandidates(kinds: OctaOp['kind'][], views: Side[], opposite = false): OctaOp[] {
  const out: OctaOp[] = [];
  for (const view of views) {
    for (const dir of ['cw', 'ccw'] as Dir[]) {
      if (kinds.includes('turn') && isMainSide(view)) out.push({ kind: 'turn', view, dir });
      if (kinds.includes('layer')) out.push({ kind: 'layer', view, dir });
    }
    if (kinds.includes('swapPics') && isMainSide(view)) {
      out.push({ kind: 'swapPics', view, target: 'near' });
      if (opposite) out.push({ kind: 'swapPics', view, target: 'opposite' });
    }
    if (kinds.includes('invert')) out.push({ kind: 'invert', view });
  }
  if (kinds.includes('invert')) out.push({ kind: 'invert', view: 'all' });
  return out;
}

const PROBES: OctaState[] = (() => {
  // 효과 비교용: 면마다 색·그림이 모두 다른 상태
  const syms = RADIAL_SYMBOLS;
  return [0, 1].map((k) =>
    OCTA_NORMALS.map((n, i) => {
      const v = faceVertices(n)[(i + k) % 3];
      return { pic: { symbol: syms[(i + k) % syms.length], up: [3 * v[0] - n[0], 3 * v[1] - n[1], 3 * v[2] - n[2]] as V3, white: (i + k) % 2 === 1 } };
    }),
  );
})();
export const octaEffect = (op: OctaOp) => PROBES.map((p) => octaKey(applyOctaOp(p, op))).join('#');
export const sameOctaEffect = (a: OctaOp, b: OctaOp) => octaEffect(a) === octaEffect(b);

/** 방향을 반대로 */
export const flipOctaDir = (op: OctaOp): OctaOp | null => (op.kind === 'swapPics' || op.kind === 'invert' ? null : { ...op, dir: op.dir === 'cw' ? 'ccw' : 'cw' });
