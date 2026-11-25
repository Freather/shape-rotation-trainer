// 입체를 SVG로 그리기 위한 정사영 투영 (3D 렌더러 없이 썸네일을 빠르게 그림)
// 볼록 다면체는 앞을 향한 면만 그리면 겹침 문제가 없다.

import { CAMERA_DIR, faceCircumradius, getSolid, type SolidId } from '../engine/solids';
import { cross, dot, normalize, rotateAround, scale, type Vec3 } from '../engine/math';
import type { Labeling, Look } from '../engine/state';
import { labelFrame } from '../engine/state';

export type Mat = [number, number, number, number, number, number];
export type P2 = [number, number];

const CAM_R = normalize(cross([0, 1, 0], CAMERA_DIR));
const CAM_U = cross(CAMERA_DIR, CAM_R);

export const projectPoint = (p: Vec3): P2 => [dot(p, CAM_R), -dot(p, CAM_U)];
export const projectVec = projectPoint;

export interface FaceDraw {
  key: number;
  pts: P2[];
  depth: number;
  facing: boolean;
  symbol: string;
  matrix: Mat;
  highlight?: boolean;
  /** 0(어두움) ~ 1(밝음): 면 방향에 따른 음영 */
  shade: number;
  /** 뒤쪽에 숨은 면 (비쳐 보이게 점선과 흐린 그림으로) */
  hidden?: boolean;
}

const LIGHT = normalize([-0.35, 0.85, 0.45]);
const shadeOf = (n: Vec3) => 0.5 + 0.5 * dot(normalize(n), LIGHT);

/** 기호(100×100 상자) → 화면 좌표 변환행렬 */
export function symbolMatrix(center: P2, right: P2, up: P2, size: number): Mat {
  const k = size / 100;
  const a = right[0] * k;
  const b = right[1] * k;
  const c = -up[0] * k;
  const d = -up[1] * k;
  return [a, b, c, d, center[0] - 50 * a - 50 * c, center[1] - 50 * b - 50 * d];
}

/** 면 크기에 맞는 기호 크기 (월드 단위) */
export function symbolWorldSize(solidId: SolidId): number {
  const solid = getSolid(solidId);
  const R = faceCircumradius(solid, 0);
  const inradius = R * Math.cos(Math.PI / solid.sides);
  return inradius * (solid.sides === 3 ? 1.45 : 1.6);
}

/** 정적 모습(Look) → 그리기 목록. withHidden이면 뒤에 숨은 면도 (비쳐 보이게 그릴 용도로) 넣는다 */
export function drawsFromLook(look: Look, highlightSlots: number[] = [], cam: Vec3 = CAMERA_DIR, withHidden = false): FaceDraw[] {
  const solid = getSolid(look.solidId);
  const size = symbolWorldSize(look.solidId);
  const camR = normalize(cross([0, 1, 0], cam));
  const camU = cross(cam, camR);
  const projectPoint = (p: Vec3): P2 => [dot(p, camR), -dot(p, camU)];
  const projectVec = projectPoint;
  const out: FaceDraw[] = [];
  for (const f of solid.faces) {
    const hidden = dot(f.normal, cam) <= 1e-6;
    if (hidden && !withHidden) continue;
    const sl = look.slots[f.id];
    const up = rotateAround(f.upRef, f.normal, (sl.rot * 2 * Math.PI) / solid.sides);
    const right = scale(cross(up, f.normal), sl.flip ? -1 : 1);
    out.push({
      key: f.id,
      pts: f.vertices.map((v) => projectPoint(solid.vertices[v])),
      depth: dot(f.center, cam),
      facing: true,
      symbol: sl.symbol,
      matrix: symbolMatrix(projectPoint(f.center), projectVec(right), projectVec(up), size),
      highlight: highlightSlots.includes(f.id),
      hidden,
      shade: shadeOf(f.normal),
    });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/**
 * 임의 변환(애니메이션 중간, 펼침 중간) → 그리기 목록.
 * point/vec: 원래 도형 좌표의 점/벡터를 면별로 월드 좌표로 옮기는 함수
 */
export function drawsFromTransform(
  solidId: SolidId,
  lab: Labeling,
  point: (face: number, p: Vec3) => Vec3,
  vec: (face: number, v: Vec3) => Vec3,
  highlightFaces: number[] = [],
): FaceDraw[] {
  const solid = getSolid(solidId);
  const size = symbolWorldSize(solidId);
  const out: FaceDraw[] = solid.faces.map((f) => {
    const fr = labelFrame(solidId, f.id, lab[f.id]);
    const c = point(f.id, f.center);
    const n = vec(f.id, f.normal);
    return {
      key: f.id,
      pts: f.vertices.map((v) => projectPoint(point(f.id, solid.vertices[v]))),
      depth: dot(c, CAMERA_DIR),
      facing: dot(n, CAMERA_DIR) > 1e-6,
      symbol: lab[f.id].symbol,
      matrix: symbolMatrix(projectPoint(c), projectVec(vec(f.id, fr.right)), projectVec(vec(f.id, fr.up)), size),
      highlight: highlightFaces.includes(f.id),
      shade: shadeOf(n),
    };
  });
  return out.sort((a, b) => a.depth - b.depth);
}

/** 면 하나를 정면에서 본 2D 그림 (유형 2 보기) */
export function faceHeadOn(solidId: SolidId, slot: number, rot: number, flip: boolean): { pts: P2[]; matrix: Mat } {
  const solid = getSolid(solidId);
  const f = solid.faces[slot];
  const ex = cross(f.upRef, f.normal);
  const ey = f.upRef;
  const to2 = (p: Vec3): P2 => {
    const d: Vec3 = [p[0] - f.center[0], p[1] - f.center[1], p[2] - f.center[2]];
    return [dot(d, ex), -dot(d, ey)];
  };
  const up = rotateAround(f.upRef, f.normal, (rot * 2 * Math.PI) / solid.sides);
  const right = scale(cross(up, f.normal), flip ? -1 : 1);
  const v2 = (v: Vec3): P2 => [dot(v, ex), -dot(v, ey)];
  return {
    pts: f.vertices.map((v) => to2(solid.vertices[v])),
    matrix: symbolMatrix([0, 0], v2(right), v2(up), symbolWorldSize(solidId)),
  };
}
