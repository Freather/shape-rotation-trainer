// 도형 상태 = 자세(쿼터니언) + 거울상 여부.
// 라벨(Labeling) = 원래 면마다 어떤 기호가 어떤 방향으로 그려져 있는지.
// 모습(Look) = 월드 기준 각 면 자리(슬롯)에 어떤 기호가 몇 번째 방향으로 보이는지 → 정답 비교용.

import {
  QUAT_IDENTITY,
  add,
  cross,
  deg,
  dot,
  quatFromAxisAngle,
  quatMul,
  rotateAround,
  rotateVec,
  scale,
  vecClose,
  type Quat,
  type Vec3,
} from './math';
import { ROLL_AXIS, VIEW_AXIS, signedAngle, snapToGroup, type RotationOp } from './rotation';
import { getSolid, visibleSlots, type SolidId } from './solids';
import { getSymbol } from '../symbols/library';

export interface SolidState {
  solidId: SolidId;
  /** 원래 자세 → 현재 자세 회전 (거울 반사 뒤에 적용됨) */
  q: Quat;
  /** true면 원래 도형을 x=0 평면에 비친 거울상으로 본다 */
  mirrored: boolean;
}

/** 원래 면 하나에 그려진 기호. rot = upRef 기준 반시계 몇 칸(360°/n), flip = 기호 좌우 반전 */
export interface FaceLabel {
  symbol: string;
  rot: number;
  flip: boolean;
}
export type Labeling = FaceLabel[];

export const initialState = (solidId: SolidId): SolidState => ({ solidId, q: QUAT_IDENTITY, mirrored: false });

/** 원래 도형 위의 벡터를 현재 월드 방향으로 변환 */
export function transformVec(s: SolidState, v: Vec3): Vec3 {
  const m: Vec3 = s.mirrored ? [-v[0], v[1], v[2]] : v;
  return rotateVec(s.q, m);
}

export const faceOfSymbol = (lab: Labeling | undefined, symbol: string): number => {
  const i = lab ? lab.findIndex((l) => l.symbol === symbol) : -1;
  if (i < 0) throw new Error(`라벨에 없는 기호: ${symbol}`);
  return i;
};

export type ResolvedOp = { kind: 'rotate'; axis: Vec3; angle: number } | { kind: 'mirror' };

/** 명령을 현재 상태 기준 월드 축/각도(도)로 바꾼다. 도형에 붙은 축은 지금 그 면이 있는 방향을 쓴다. */
export function resolveOp(s: SolidState, op: RotationOp, lab?: Labeling): ResolvedOp {
  const solid = getSolid(s.solidId);
  const bodyAxis = (symbols: string[]): Vec3 =>
    transformVec(
      s,
      symbols.reduce<Vec3>((acc, sym) => add(acc, solid.faces[faceOfSymbol(lab, sym)].normal), [0, 0, 0]),
    );
  switch (op.kind) {
    case 'view':
      return { kind: 'rotate', axis: VIEW_AXIS[op.view], angle: signedAngle(op.dir, op.angle) };
    case 'roll':
      return { kind: 'rotate', ...ROLL_AXIS[op.dir] };
    case 'face':
      return { kind: 'rotate', axis: bodyAxis([op.symbol]), angle: signedAngle(op.dir, op.angle) };
    case 'vertex':
    case 'edge':
      return { kind: 'rotate', axis: bodyAxis(op.symbols), angle: signedAngle(op.dir, op.angle) };
    case 'axis':
      return { kind: 'rotate', axis: op.axis, angle: op.angle };
    case 'mirror':
      return { kind: 'mirror' };
  }
}

/** 명령 적용 + 대칭군 스냅 */
export function applyOp(s: SolidState, op: RotationOp, lab?: Labeling): SolidState {
  const r = resolveOp(s, op, lab);
  if (r.kind === 'mirror') return mirror(s);
  return applyQuat(s, quatFromAxisAngle(r.axis, deg(r.angle)));
}

export function applyQuat(s: SolidState, r: Quat, snap = true): SolidState {
  const q = quatMul(r, s.q);
  return { ...s, q: snap ? snapToGroup(s.solidId, q) : q };
}

export const applyOps = (s: SolidState, ops: RotationOp[], lab?: Labeling): SolidState =>
  ops.reduce((acc, op) => applyOp(acc, op, lab), s);

/** 단계별 상태 목록 [시작, 1단계 후, 2단계 후, …] */
export function stateHistory(s: SolidState, ops: RotationOp[], lab?: Labeling): SolidState[] {
  const out = [s];
  for (const op of ops) out.push(applyOp(out[out.length - 1], op, lab));
  return out;
}

/**
 * 월드 기준 거울 반사(x → −x).
 * M·R(q)·Mprev = (M·R(q)·M)·(M·Mprev),  M·R(w,x,y,z)·M = R(w,x,−y,−z)
 */
export function mirror(s: SolidState): SolidState {
  const [w, x, y, z] = s.q;
  return { ...s, q: [w, x, -y, -z], mirrored: !s.mirrored };
}

export interface SlotInfo {
  slot: number;
  face: number;
  /** 원래 면의 upRef가 슬롯 기준 upRef에서 반시계로 몇 칸 돌아갔는지 */
  rot: number;
  /** 면이 뒤집혀 보이는지 (거울상) */
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
    const angle = Math.atan2(-dot(wUp, sRight), dot(wUp, sUp));
    const step = (2 * Math.PI) / n;
    const rot = ((Math.round(angle / step) % n) + n) % n;
    result[slotFace.id] = { slot: slotFace.id, face: f.id, rot, flipped };
  }
  return result;
}

/** 라벨 없이 면 번호만으로 만든 시그니처 (엔진 테스트용) */
export function signature(s: SolidState): string {
  return (
    s.solidId +
    ':' +
    slots(s)
      .map((x) => `${x.face}.${x.rot}${x.flipped ? 'm' : ''}`)
      .join('|')
  );
}

export const faceAtSlot = (s: SolidState, slot: number): number => slots(s)[slot].face;

// ---------------- 라벨 & 모습(Look) ----------------

export interface SlotLook {
  symbol: string;
  rot: number;
  flip: boolean;
}
export interface Look {
  solidId: SolidId;
  slots: SlotLook[];
}

export const plainLabeling = (symbols: string[]): Labeling => symbols.map((symbol) => ({ symbol, rot: 0, flip: false }));

/** 기호가 좌우 대칭이면 뒤집힘 표시는 의미 없음 → 지운다 */
const normFlip = (symbol: string, flip: boolean): boolean => flip && getSymbol(symbol).chiral;

/** 상태 + 라벨 → 월드 슬롯별 모습 */
export function lookOf(s: SolidState, lab: Labeling): Look {
  const n = getSolid(s.solidId).sides;
  return {
    solidId: s.solidId,
    slots: slots(s).map((x) => {
      const l = lab[x.face];
      const rot = (((x.rot + (x.flipped ? -l.rot : l.rot)) % n) + n) % n;
      return { symbol: l.symbol, rot, flip: normFlip(l.symbol, x.flipped !== l.flip) };
    }),
  };
}

const slotKey = (l: SlotLook) => `${l.symbol}.${l.rot}${l.flip ? 'm' : ''}`;

/** 기본 시점에서 읽을 수 있는 면만으로 만든 시그니처 (보기 비교용) */
export function visibleSignature(look: Look): string {
  const solid = getSolid(look.solidId);
  return look.solidId + ':' + visibleSlots(solid).map((i) => slotKey(look.slots[i])).join('|');
}

/** 모든 면 시그니처 */
export const fullSignature = (look: Look): string => look.solidId + ':' + look.slots.map(slotKey).join('|');

/** 라벨을 회전과 무관하게 비교하기 위한 표준 시그니처 (같은 입체면 같은 값) */
export function canonicalLabelSignature(solidId: SolidId, lab: Labeling, group: Quat[]): string {
  let best = '';
  for (const g of group) {
    const sig = fullSignature(lookOf({ solidId, q: g, mirrored: false }, lab));
    if (best === '' || sig < best) best = sig;
  }
  return best;
}

/** 모습(Look)을 원래 면 기준 라벨로 되돌림 (항등 자세일 때) */
export const lookToLabeling = (look: Look): Labeling => look.slots.map((s) => ({ ...s }));

/** 거울상 라벨: 거울에 비친 입체를 원래 면 기준으로 */
export const mirrorLabeling = (solidId: SolidId, lab: Labeling): Labeling =>
  lookToLabeling(lookOf(mirror({ solidId, q: QUAT_IDENTITY, mirrored: false }), lab));

/** 면의 기호 방향 벡터 (원래 도형 좌표, 라벨의 rot/flip 반영) */
export function labelFrame(solidId: SolidId, face: number, l: FaceLabel): { up: Vec3; right: Vec3 } {
  const solid = getSolid(solidId);
  const f = solid.faces[face];
  const up = rotateAround(f.upRef, f.normal, (l.rot * 2 * Math.PI) / solid.sides);
  const right = scale(cross(up, f.normal), l.flip ? -1 : 1);
  return { up, right };
}
