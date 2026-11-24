// 쌓기나무 명령 하나의 애니메이션 중간 모습 (돌리기, 거울, 블록 더하기·빼기)
import { applyBlockOp, dims, isEditOp, opMatrix, type BlockOp, type Blocks } from '../engine/blocks';
import { QUAT_IDENTITY, quatFromMatrix, quatSlerp, type Quat, type Vec3 } from '../engine/math';
import { ROLL_AXIS, VIEW_AXIS, signedAngle } from '../engine/rotation';
import { CAMERA_DIR } from '../engine/solids';
import type { AxisMark } from './AxisMarks';
import { easeInOut } from './usePlayer';

const ADD = '#7cc48a';
const REMOVE = '#e57373';

function fullQuat(op: BlockOp): Quat {
  let q = quatFromMatrix(opMatrix(op));
  if (q[0] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
  return q;
}

/** 이 명령의 회전축 표시 (돌리기만) */
export function blockOpMarks(op: BlockOp, label?: string): AxisMark[] {
  if (op.kind === 'mirror' || isEditOp(op)) return [];
  // 이름 붙은 축은 그 쪽(앞·위·오른쪽)에서 나오게
  if (op.kind === 'view') return [{ dir: VIEW_AXIS[op.view], angle: signedAngle(op.dir, op.angle), label }];
  if (op.kind === 'roll') return [{ dir: ROLL_AXIS[op.dir].axis, angle: ROLL_AXIS[op.dir].angle, label }];
  const q = fullQuat(op);
  const s = Math.sqrt(Math.max(0, 1 - q[0] * q[0]));
  if (s < 1e-6) return [];
  let dir: Vec3 = [q[1] / s, q[2] / s, q[3] / s];
  let angle = (2 * Math.acos(Math.min(1, q[0])) * 180) / Math.PI;
  // 보는 사람 쪽으로 나오는 끝을 쓰면 화살표가 잘 보임
  if (dir[0] * CAMERA_DIR[0] + dir[1] * CAMERA_DIR[1] + dir[2] * CAMERA_DIR[2] < 0) {
    dir = [-dir[0], -dir[1], -dir[2]];
    angle = -angle;
  }
  return [{ dir, angle, label }];
}

export interface BlockFrame {
  cells: Blocks;
  colors?: (string | undefined)[];
  q: Quat;
  sx: number;
}

/** 진행도 p(0~1)일 때 그릴 모습. 더하기·빼기는 앞 절반에 뺄 칸을 빨갛게, 뒤 절반에 더한 칸을 초록으로 */
export function blockFrame(cells: Blocks, op: BlockOp | null, p: number, colors?: (string | undefined)[]): BlockFrame {
  if (!op || p <= 0) return { cells, colors, q: QUAT_IDENTITY, sx: 1 };
  const e = easeInOut(p);
  if (op.kind === 'mirror') return { cells, colors, q: QUAT_IDENTITY, sx: Math.cos(Math.PI * e) || 0.001 };
  if (!isEditOp(op)) return { cells, colors, q: quatSlerp(QUAT_IDENTITY, fullQuat(op), e), sx: 1 };
  if (op.kind === 'dropTop') {
    const h = dims(cells)[1];
    if (p < 0.6) return { cells, colors: cells.map((c, i) => (c[1] === h - 1 ? REMOVE : colors?.[i])), q: QUAT_IDENTITY, sx: 1 };
    const after = applyBlockOp(cells, op);
    return { cells: after, colors: colorsAfter(cells, op, colors), q: QUAT_IDENTITY, sx: 1 };
  }
  if (p < 0.3) return { cells, colors, q: QUAT_IDENTITY, sx: 1 };
  const after = applyBlockOp(cells, op);
  return { cells: after, colors: after.map((_, i) => (i < cells.length ? colors?.[i] : ADD)), q: QUAT_IDENTITY, sx: 1 };
}

/** 명령 뒤의 칸별 색 (더한 칸은 색 없음) */
export function colorsAfter(cells: Blocks, op: BlockOp, colors?: (string | undefined)[]): (string | undefined)[] | undefined {
  if (!colors) return undefined;
  if (op.kind === 'dropTop') {
    const h = dims(cells)[1];
    return cells.map((c, i) => (c[1] < h - 1 ? colors[i] : null)).filter((x) => x !== null) as (string | undefined)[];
  }
  const after = applyBlockOp(cells, op);
  return after.map((_, i) => colors[i]);
}
