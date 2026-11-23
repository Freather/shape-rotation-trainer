// 회전 연산: 시험식 표현 → 축/각도, 회전대칭군, 스냅

import {
  cross,
  dot,
  length,
  normalize,
  quatCanonicalSign,
  quatDot,
  quatFromMatrix,
  quatSameRotation,
  scale,
  sub,
  type Quat,
  type Vec3,
} from './math';
import { getSolid, type SolidId } from './solids';

export type View = 'front' | 'top' | 'right';
export type Dir = 'cw' | 'ccw';
export type RollDir = 'forward' | 'backward' | 'right' | 'left';

/**
 * 회전 명령 (시험 문구 단위)
 * - view : 월드 고정 축 ("앞에서 볼 때 시계방향 90°")
 * - roll : 굴리기
 * - face / vertex / edge : 도형에 붙은 축. 기호로 면을 가리킴
 *   ("★ 면을 바라볼 때 시계방향 72°", "★·◆·● 면이 만나는 꼭짓점 기준 …", "★ 면과 ◆ 면 사이 모서리 기준 180°")
 * - mirror : 좌우 반전(거울) — 확장 규칙
 */
export type RotationOp =
  | { kind: 'view'; view: View; dir: Dir; angle: number }
  | { kind: 'roll'; dir: RollDir }
  | { kind: 'face'; symbol: string; dir: Dir; angle: number }
  | { kind: 'vertex'; symbols: string[]; dir: Dir; angle: number }
  | { kind: 'edge'; symbols: [string, string]; dir: Dir; angle: number }
  | { kind: 'axis'; axis: Vec3; angle: number }
  | { kind: 'mirror' };

export const VIEW_AXIS: Record<View, Vec3> = {
  front: [0, 0, 1],
  top: [0, 1, 0],
  right: [1, 0, 0],
};

/** cw/ccw + 각도 → 부호 있는 각도 ("시계방향" = 그 축 기준 −θ) */
export const signedAngle = (dir: Dir, angle: number): number => (dir === 'cw' ? -angle : angle);

export const ROLL_AXIS: Record<RollDir, { axis: Vec3; angle: number }> = {
  forward: { axis: [1, 0, 0], angle: 90 }, // 윗면이 앞으로
  backward: { axis: [1, 0, 0], angle: -90 },
  right: { axis: [0, 0, 1], angle: -90 }, // 윗면이 오른쪽으로
  left: { axis: [0, 0, 1], angle: 90 },
};

/** 역회전 명령 */
export function inverseOp(op: RotationOp): RotationOp {
  switch (op.kind) {
    case 'view':
    case 'face':
    case 'vertex':
    case 'edge':
      return { ...op, dir: op.dir === 'cw' ? 'ccw' : 'cw' };
    case 'roll': {
      const inv: Record<RollDir, RollDir> = { forward: 'backward', backward: 'forward', right: 'left', left: 'right' };
      return { kind: 'roll', dir: inv[op.dir] };
    }
    case 'axis':
      return { ...op, angle: -op.angle };
    case 'mirror':
      return op;
  }
}

/** 설명 문구 조각: 문자열 또는 기호 */
export type TextPart = string | { symbol: string };

export function describeOp(op: RotationOp): TextPart[] {
  const dirText = (d: Dir) => (d === 'cw' ? '시계방향' : '반시계방향');
  switch (op.kind) {
    case 'view': {
      const v = { front: '앞', top: '위', right: '오른쪽' }[op.view];
      return [`${v}에서 볼 때 ${dirText(op.dir)} ${op.angle}°`];
    }
    case 'roll':
      return [
        {
          forward: '앞으로 굴리기 (윗면이 앞으로)',
          backward: '뒤로 굴리기 (윗면이 뒤로)',
          right: '오른쪽으로 굴리기 (윗면이 오른쪽으로)',
          left: '왼쪽으로 굴리기 (윗면이 왼쪽으로)',
        }[op.dir],
      ];
    case 'face':
      return [{ symbol: op.symbol }, ` 면을 바라볼 때 ${dirText(op.dir)} ${op.angle}°`];
    case 'vertex': {
      const parts: TextPart[] = [];
      op.symbols.forEach((s, i) => {
        if (i > 0) parts.push('·');
        parts.push({ symbol: s });
      });
      parts.push(` 면이 만나는 꼭짓점을 바라볼 때 ${dirText(op.dir)} ${op.angle}°`);
      return parts;
    }
    case 'edge':
      return [
        { symbol: op.symbols[0] },
        ' 면과 ',
        { symbol: op.symbols[1] },
        ` 면 사이 모서리를 바라볼 때 ${dirText(op.dir)} ${op.angle}°`,
      ];
    case 'axis':
      return [`축 [${op.axis.map((n) => n.toFixed(2)).join(', ')}] 기준 ${op.angle}°`];
    case 'mirror':
      return ['좌우 반전 (거울에 비친 모습)'];
  }
}

export const describeOpText = (op: RotationOp, name: (symbol: string) => string = (s) => s): string =>
  describeOp(op)
    .map((p) => (typeof p === 'string' ? p : `‘${name(p.symbol)}’`))
    .join('');

// ---------------- 회전대칭군 ----------------

/** 직교 기준틀: e1 = a 방향, e2 = b에서 a 성분을 뺀 방향 */
function frame(a: Vec3, b: Vec3): [Vec3, Vec3, Vec3] {
  const e1 = normalize(a);
  const e2 = normalize(sub(b, scale(e1, dot(b, e1))));
  return [e1, e2, cross(e1, e2)];
}

/**
 * 다면체의 회전대칭군: 꼭짓점 집합을 자기 자신으로 보내는 회전 전부.
 * 꼭짓점 하나와 이웃 꼭짓점 하나를 어디로 보내는지 정하면 회전이 하나로 정해진다.
 */
function computeGroup(id: SolidId): Quat[] {
  const solid = getSolid(id);
  const vs = solid.vertices;
  const e = solid.edges[0];
  const a = vs[e.a];
  const b = vs[e.b];
  const edgeLen = length(sub(a, b));
  const F = frame(a, b);
  const group: Quat[] = [];
  for (let i = 0; i < vs.length; i++)
    for (let j = 0; j < vs.length; j++) {
      if (i === j || Math.abs(length(sub(vs[i], vs[j])) - edgeLen) > 1e-6) continue;
      const G = frame(vs[i], vs[j]);
      // M = Σ G_k F_kᵀ
      const m = [0, 1, 2].map((r) => [0, 1, 2].map((c) => G[0][r] * F[0][c] + G[1][r] * F[1][c] + G[2][r] * F[2][c]));
      const q = quatCanonicalSign(quatFromMatrix(m));
      if (!group.some((g) => quatSameRotation(g, q, 1e-9))) group.push(q);
    }
  return group;
}

const groupCache = new Map<SolidId, Quat[]>();
export function symmetryGroup(id: SolidId): Quat[] {
  let g = groupCache.get(id);
  if (!g) {
    g = computeGroup(id);
    groupCache.set(id, g);
  }
  return g;
}

/** 대칭군 원소 중 가장 가까운 것으로 스냅 (오차 누적 방지) */
export function snapToGroup(id: SolidId, q: Quat): Quat {
  const group = symmetryGroup(id);
  let best = group[0];
  let bestDot = -1;
  for (const g of group) {
    const d = Math.abs(quatDot(g, q));
    if (d > bestDot) {
      bestDot = d;
      best = g;
    }
  }
  return best;
}

/** 이 회전이 해당 다면체의 대칭 회전인지 */
export const isSymmetry = (id: SolidId, q: Quat, eps = 1e-6): boolean =>
  symmetryGroup(id).some((g) => quatSameRotation(g, q, eps));
