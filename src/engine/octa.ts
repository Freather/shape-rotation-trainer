// 그림 정팔면체: 꼭짓점이 위·아래·앞·뒤·왼쪽·오른쪽을 향한 정팔면체.
// 면마다 색 하나와 (있으면) 그림 하나. 전체 회전 말고도 한쪽 4면만 돌리기, 그림만 옮기기가 있다.
// 면 = 법선 부호 (sx, sy, sz). 그림 방향은 면 위의 정수 벡터 up(면 중심 → 꼭짓점 방향의 3배)로 들고 다닌다.

import { RADIAL_SYMBOLS, arrangeSymbols } from '../symbols/library';
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

/** 시험지는 흑백: 흰 면과 검은 면 */
export const OCTA_COLORS = ['#ffffff', '#1d1d1f'];

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
  /**
   * 그림 맞바꾸기: 한쪽 4면의 그림을 짝 면의 그림과 바꿈 (색은 제자리).
   * near = 모서리 건너 바로 맞붙은 면, opposite = 도형 건너 정반대편 면 (그림은 가로 모서리 방향 축으로 반 바퀴)
   */
  | { kind: 'swapPics'; view: View; target: SwapTarget }
  /** 색 반전: 한쪽 4면만, 또는 모든 면 (그림은 그대로) */
  | { kind: 'invert'; view: View | 'all' };

export type SwapTarget = 'near' | 'opposite';

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
      return [
        op.target === 'near'
          ? `${SIDE_NAME[op.view]} 4면의 그림 맞바꾸기: 바로 맞붙은 ${OTHER_SIDE[op.view]} 면과`
          : `${SIDE_NAME[op.view]} 4면의 그림 맞바꾸기: 정반대편(마주 보는) 면과`,
      ];
    case 'invert':
      return [op.view === 'all' ? '모든 면의 색 반전 (흰 면 ↔ 검은 면)' : `${SIDE_NAME[op.view]} 4면만 색 반전 (흰 면 ↔ 검은 면)`];
  }
}
export const describeOctaOpText = (op: OctaOp) => describeOctaOp(op).join('');

/** 이 연산에서 움직이는 면인지 */
export function opTouches(op: OctaOp, n: V3): boolean {
  if (op.kind === 'turn') return true;
  if (op.kind === 'invert') return op.view === 'all' || dotI(n, VIEW_AXIS[op.view] as unknown as V3) > 0;
  return dotI(n, VIEW_AXIS[op.view] as unknown as V3) > 0 || op.kind === 'swapPics';
}

/** 규칙이 가리키는 쪽 4면인지 (그림에 점선 표시용) */
export const onSide = (op: OctaOp, n: V3) => op.kind !== 'turn' && op.view !== 'all' && dotI(n, VIEW_AXIS[op.view] as unknown as V3) > 0;

/** 정반대편 맞바꾸기 축: 쪽 방향 a와 면 n에 모두 수직 (그 면의 가로 모서리 방향) */
export function oppositeAxis(view: View, n: V3): V3 {
  const a = VIEW_AXIS[view] as unknown as V3;
  return [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
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
        const m = swapMatrix(op.target === 'near' ? swapAxis(op.view, n) : oppositeAxis(op.view, n));
        const j = faceIndex(mulV(m, n));
        out[j] = { color: out[j].color, pic: movePic(f.pic, m) };
        break;
      }
      case 'invert':
        if (opTouches(op, n)) out[i] = { color: 1 - f.color, pic: out[i].pic };
        break;
    }
  });
  return out;
}

export const applyOctaOps = (st: OctaState, ops: OctaOp[]) => ops.reduce(applyOctaOp, st);

export const octaKey = (st: OctaState): string =>
  st.map((f) => `${f.color}${f.pic ? `${f.pic.symbol}@${f.pic.up.join(',')}` : ''}`).join('|');

export function randomOcta(rng: Rng, picCount = 5): OctaState {
  // 흰 면 4개, 검은 면 4개
  const colors = rng.shuffle([0, 0, 0, 0, 1, 1, 1, 1]);
  const syms = rng.shuffle(arrangeSymbols(rng.shuffle(RADIAL_SYMBOLS), (p) => rng.chance(p)).slice(0, picCount));
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
  /** 그림 맞바꾸기에 정반대편 면도 나오는지 */
  opposite: boolean;
}

export const OCTA_LEVELS: Record<number, OctaLevelConfig> = {
  1: { kinds: ['turn', 'layer', 'invert'], views: ['top'], ruleCount: 3, steps: [1, 2], picCount: 4, opposite: false },
  2: { kinds: ['turn', 'layer', 'movePics', 'invert'], views: ['top', 'right'], ruleCount: 4, steps: [2, 2], picCount: 4, opposite: false },
  3: { kinds: ['turn', 'layer', 'movePics', 'swapPics', 'invert'], views: ['top', 'right', 'front'], ruleCount: 4, steps: [2, 3], picCount: 5, opposite: false },
  4: { kinds: ['turn', 'layer', 'movePics', 'swapPics', 'invert'], views: ['top', 'right', 'front'], ruleCount: 5, steps: [3, 3], picCount: 5, opposite: true },
  5: { kinds: ['turn', 'layer', 'movePics', 'swapPics', 'invert'], views: ['top', 'right', 'front'], ruleCount: 5, steps: [3, 4], picCount: 6, opposite: true },
};

export function octaOpCandidates(kinds: OctaOp['kind'][], views: View[], opposite = false): OctaOp[] {
  const out: OctaOp[] = [];
  for (const view of views) {
    for (const kind of ['turn', 'layer', 'movePics'] as const) if (kinds.includes(kind)) for (const dir of ['cw', 'ccw'] as Dir[]) out.push({ kind, view, dir });
    if (kinds.includes('swapPics')) {
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
      return { color: i, pic: { symbol: syms[(i + k) % syms.length], up: [3 * v[0] - n[0], 3 * v[1] - n[1], 3 * v[2] - n[2]] as V3 } };
    }),
  );
})();
export const octaEffect = (op: OctaOp) => PROBES.map((p) => octaKey(applyOctaOp(p, op))).join('#');
export const sameOctaEffect = (a: OctaOp, b: OctaOp) => octaEffect(a) === octaEffect(b);

/** 방향을 반대로 */
export const flipOctaDir = (op: OctaOp): OctaOp | null => (op.kind === 'swapPics' || op.kind === 'invert' ? null : { ...op, dir: op.dir === 'cw' ? 'ccw' : 'cw' });
