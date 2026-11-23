// 회전 연산: 시험식 표현 → 축/각도, 회전대칭군, 스냅

import {
  deg,
  quatCanonicalSign,
  quatDot,
  quatFromAxisAngle,
  quatMul,
  quatSameRotation,
  type Quat,
  type Vec3,
} from './math';
import type { SolidId } from './solids';

export type View = 'front' | 'top' | 'right';
export type Dir = 'cw' | 'ccw';
export type RollDir = 'forward' | 'backward' | 'right' | 'left';

/** 회전 명령 (시험 문구 단위) */
export type RotationOp =
  | { kind: 'view'; view: View; dir: Dir; angle: number }
  | { kind: 'roll'; dir: RollDir }
  | { kind: 'axis'; axis: Vec3; angle: number }; // angle: 도, + = 축 끝에서 볼 때 반시계

const VIEW_AXIS: Record<View, Vec3> = {
  front: [0, 0, 1],
  top: [0, 1, 0],
  right: [1, 0, 0],
};

/** 명령 → (축, 부호 있는 각도[도]). 애니메이션도 이 값 그대로 사용(지시 방향대로 돈다). */
export function opToAxisAngle(op: RotationOp): { axis: Vec3; angle: number } {
  switch (op.kind) {
    case 'view':
      // "~에서 볼 때 시계방향 θ" = 그 축 기준 −θ
      return { axis: VIEW_AXIS[op.view], angle: op.dir === 'cw' ? -op.angle : op.angle };
    case 'roll':
      switch (op.dir) {
        case 'forward': // 윗면이 앞으로
          return { axis: [1, 0, 0], angle: 90 };
        case 'backward':
          return { axis: [1, 0, 0], angle: -90 };
        case 'right': // 윗면이 오른쪽으로
          return { axis: [0, 0, 1], angle: -90 };
        case 'left':
          return { axis: [0, 0, 1], angle: 90 };
      }
      break;
    case 'axis':
      return { axis: op.axis, angle: op.angle };
  }
}

export const opToQuat = (op: RotationOp): Quat => {
  const { axis, angle } = opToAxisAngle(op);
  return quatFromAxisAngle(axis, deg(angle));
};

/** 역회전 명령 */
export function inverseOp(op: RotationOp): RotationOp {
  switch (op.kind) {
    case 'view':
      return { ...op, dir: op.dir === 'cw' ? 'ccw' : 'cw' };
    case 'roll': {
      const inv: Record<RollDir, RollDir> = {
        forward: 'backward',
        backward: 'forward',
        right: 'left',
        left: 'right',
      };
      return { kind: 'roll', dir: inv[op.dir] };
    }
    case 'axis':
      return { ...op, angle: -op.angle };
  }
}

/** 시험 문구 */
export function describeOp(op: RotationOp): string {
  switch (op.kind) {
    case 'view': {
      const v = { front: '앞', top: '위', right: '오른쪽' }[op.view];
      return `${v}에서 볼 때 ${op.dir === 'cw' ? '시계' : '반시계'}방향 ${op.angle}°`;
    }
    case 'roll':
      return {
        forward: '앞으로 굴리기',
        backward: '뒤로 굴리기',
        right: '오른쪽으로 굴리기',
        left: '왼쪽으로 굴리기',
      }[op.dir];
    case 'axis':
      return `축 [${op.axis.map((n) => n.toFixed(2)).join(', ')}] 기준 ${op.angle}°`;
  }
}

// ---------------- 회전대칭군 ----------------

/** 생성원들로부터 군을 닫힘(closure)으로 만든다. */
export function generateGroup(generators: Quat[]): Quat[] {
  const group: Quat[] = [[1, 0, 0, 0]];
  const has = (q: Quat) => group.some((g) => quatSameRotation(g, q, 1e-6));
  for (let i = 0; i < group.length; i++) {
    for (const g of generators) {
      const p = quatCanonicalSign(quatMul(g, group[i]));
      if (!has(p)) group.push(p);
    }
    if (group.length > 200) throw new Error('군이 너무 큼: 생성원 확인 필요');
  }
  // 계산 오차를 줄이기 위해 원소를 정확한 값으로 정리 (작은 값 → 0)
  return group.map((q) => q.map((c) => (Math.abs(c) < 1e-12 ? 0 : c)) as unknown as Quat);
}

const GROUP_GENERATORS: Record<SolidId, Quat[]> = {
  cube: [
    quatFromAxisAngle([1, 0, 0], deg(90)),
    quatFromAxisAngle([0, 1, 0], deg(90)),
    quatFromAxisAngle([0, 0, 1], deg(90)),
  ],
};

const groupCache = new Map<SolidId, Quat[]>();
export function symmetryGroup(id: SolidId): Quat[] {
  let g = groupCache.get(id);
  if (!g) {
    g = generateGroup(GROUP_GENERATORS[id]);
    groupCache.set(id, g);
  }
  return g;
}

/** 대칭군 원소 중 가장 가까운 것으로 스냅 (오차 누적 방지) */
export function snapToGroup(id: SolidId, q: Quat): Quat {
  let best = symmetryGroup(id)[0];
  let bestDot = -1;
  for (const g of symmetryGroup(id)) {
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
