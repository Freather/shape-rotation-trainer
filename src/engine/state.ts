// 도형 상태 = 자세(쿼터니언) + 거울상 여부.
// 정답 비교용 정규화 상태(시그니처): 각 면 슬롯(월드 기준 법선 방향)에
// 어떤 원래 면이 와 있고, 그 기호가 몇 번째 방향으로 돌아가 있는지.

import {
  QUAT_IDENTITY,
  cross,
  dot,
  quatMul,
  rotateVec,
  vecClose,
  type Quat,
  type Vec3,
} from './math';
import { opToQuat, snapToGroup, type RotationOp } from './rotation';
import { getSolid, type SolidId } from './solids';

export interface SolidState {
  solidId: SolidId;
  /** 원래 자세 → 현재 자세 회전 (거울 반사 뒤에 적용됨) */
  q: Quat;
  /** true면 원래 도형을 x=0 평면에 비친 거울상으로 본다 */
  mirrored: boolean;
}

export const initialState = (solidId: SolidId): SolidState => ({
  solidId,
  q: QUAT_IDENTITY,
  mirrored: false,
});

/** 원래 도형 위의 벡터를 현재 월드 방향으로 변환 */
export function transformVec(s: SolidState, v: Vec3): Vec3 {
  const m: Vec3 = s.mirrored ? [-v[0], v[1], v[2]] : v;
  return rotateVec(s.q, m);
}

/** 회전 명령 적용 (월드 축 기준) + 대칭군 스냅 */
export function applyOp(s: SolidState, op: RotationOp): SolidState {
  return applyQuat(s, opToQuat(op));
}

export function applyQuat(s: SolidState, r: Quat, snap = true): SolidState {
  const q = quatMul(r, s.q);
  return { ...s, q: snap ? snapToGroup(s.solidId, q) : q };
}

export const applyOps = (s: SolidState, ops: RotationOp[]): SolidState =>
  ops.reduce(applyOp, s);

/**
 * 월드 기준 거울 반사(x → −x).
 * M·R(q)·Mprev = (M·R(q)·M)·(M·Mprev),  M·R(w,x,y,z)·M = R(w,x,−y,−z)
 */
export function mirror(s: SolidState): SolidState {
  const [w, x, y, z] = s.q;
  return { ...s, q: [w, x, -y, -z], mirrored: !s.mirrored };
}

export interface SlotInfo {
  /** 슬롯 = 원래 면 번호가 차지하던 위치(월드 법선 방향) */
  slot: number;
  /** 지금 그 슬롯에 와 있는 원래 면 */
  face: number;
  /** 기호 방향: 슬롯 기준 upRef에서 반시계로 몇 칸(360°/n 단위) 돌아갔는지 */
  rot: number;
  /** 기호가 좌우 반전되어 보이는지 (거울상) */
  flipped: boolean;
}

/** 각 슬롯의 상태 계산 */
export function slots(s: SolidState): SlotInfo[] {
  const solid = getSolid(s.solidId);
  const n = solid.sides;
  const result: SlotInfo[] = new Array(solid.faces.length);
  for (const f of solid.faces) {
    const wn = transformVec(s, f.normal);
    const slotFace = solid.faces.find((g) => vecClose(g.normal, wn, 1e-6));
    if (!slotFace) throw new Error('면이 슬롯에 맞지 않음: 대칭이 아닌 회전');
    const wUp = transformVec(s, f.upRef);
    const wRight = transformVec(s, cross(f.upRef, f.normal));
    const flipped = dot(wRight, cross(wUp, wn)) < 0;
    const sUp = slotFace.upRef;
    const sRight = cross(sUp, slotFace.normal);
    // 바깥에서 볼 때 반시계가 + (반시계로 돌면 up이 왼쪽(−right)으로 감)
    const angle = Math.atan2(-dot(wUp, sRight), dot(wUp, sUp));
    const step = (2 * Math.PI) / n;
    const rot = (((Math.round(angle / step) % n) + n) % n);
    result[slotFace.id] = { slot: slotFace.id, face: f.id, rot, flipped };
  }
  return result;
}

/** 정답 비교 · 보기 중복 제거용 문자열 */
export function signature(s: SolidState): string {
  return (
    s.solidId +
    ':' +
    slots(s)
      .map((x) => `${x.face}.${x.rot}${x.flipped ? 'm' : ''}`)
      .join('|')
  );
}

/** 특정 월드 방향 슬롯에 와 있는 원래 면 번호 */
export function faceAtSlot(s: SolidState, slot: number): number {
  return slots(s)[slot].face;
}
