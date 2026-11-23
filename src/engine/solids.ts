// 다면체 정의: 꼭짓점 좌표 + 면(꼭짓점 인덱스 배열, 바깥에서 볼 때 반시계 순서)
// 면 하나 = 정다각형 하나 (정십이면체면 오각형 12개). 삼각형으로 쪼개지 않는다.
// 각 면은 기호의 "위쪽"을 나타내는 upRef 벡터를 가진다.

import {
  add,
  cross,
  dot,
  length,
  normalize,
  quatFromAxisAngle,
  quatFromTo,
  rotateVec,
  scale,
  sub,
  type Vec3,
} from './math';

export type SolidId = 'tetra' | 'cube' | 'octa' | 'dodeca' | 'icosa';
export const SOLID_IDS: SolidId[] = ['cube', 'octa', 'dodeca', 'tetra', 'icosa'];

export interface Face {
  id: number;
  name: string;
  vertices: number[];
  center: Vec3;
  normal: Vec3;
  /** 면 평면 위 단위벡터. 기호의 위쪽 방향 */
  upRef: Vec3;
}

export interface Edge {
  id: number;
  /** 꼭짓점 인덱스 */
  a: number;
  b: number;
  /** 이 모서리를 공유하는 두 면 */
  faces: [number, number];
}

export interface Solid {
  id: SolidId;
  name: string;
  vertices: Vec3[];
  faces: Face[];
  edges: Edge[];
  /** 면이 몇 각형인지 */
  sides: number;
  /** 한 꼭짓점에 모이는 면 수 */
  vertexDegree: number;
  /** 이웃한 두 면의 법선 사이 각 = 펼침 각도(라디안) = 180° − 이면각 */
  foldAngle: number;
  /** 꼭짓점별로 모이는 면 목록 */
  vertexFaces: number[][];
}

export const SOLID_NAMES: Record<SolidId, string> = {
  tetra: '정사면체',
  cube: '정육면체',
  octa: '정팔면체',
  dodeca: '정십이면체',
  icosa: '정이십면체',
};

const PHI = (1 + Math.sqrt(5)) / 2;
const CIRCUMRADIUS = Math.sqrt(3);

function rawVertices(id: SolidId): Vec3[] {
  const v: Vec3[] = [];
  switch (id) {
    case 'tetra':
      return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case 'cube':
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      return v;
    case 'octa':
      // 꼭짓점이 ±X, ±Y, ±Z
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'dodeca':
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      for (const a of [-1, 1])
        for (const b of [-1, 1]) {
          v.push([0, a / PHI, b * PHI]);
          v.push([a / PHI, b * PHI, 0]);
          v.push([a * PHI, 0, b / PHI]);
        }
      return v;
    case 'icosa':
      for (const a of [-1, 1])
        for (const b of [-1, 1]) {
          v.push([0, a, b * PHI]);
          v.push([a, b * PHI, 0]);
          v.push([a * PHI, 0, b]);
        }
      return v;
  }
}

interface RawFace {
  vertices: number[];
  normal: Vec3;
}

/** 모든 꼭짓점이 한쪽에 있는 평면을 찾아 면을 구성 (볼록 다면체) */
function findFaces(vs: Vec3[]): RawFace[] {
  const faces: RawFace[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        let nrm = cross(sub(vs[j], vs[i]), sub(vs[k], vs[i]));
        if (length(nrm) < 1e-9) continue;
        nrm = normalize(nrm);
        let d = dot(nrm, vs[i]);
        if (d < 0) {
          nrm = scale(nrm, -1);
          d = -d;
        }
        if (d < 1e-9) continue;
        if (!vs.every((v) => dot(nrm, v) <= d + 1e-9)) continue;
        if (faces.some((f) => dot(f.normal, nrm) > 1 - 1e-9)) continue;
        const idx = vs.map((v, m) => (Math.abs(dot(nrm, v) - d) < 1e-9 ? m : -1)).filter((m) => m >= 0);
        faces.push({ vertices: idx, normal: nrm });
      }
  return faces;
}

function centerOf(vs: Vec3[], idx: number[]): Vec3 {
  return scale(
    idx.reduce<Vec3>((acc, i) => add(acc, vs[i]), [0, 0, 0]),
    1 / idx.length,
  );
}

/** 면 중심 주위로 꼭짓점들을 바깥에서 볼 때 반시계 순서로 정렬 */
function sortCCW(vs: Vec3[], idx: number[], center: Vec3, normal: Vec3): number[] {
  const ref = normalize(sub(vs[idx[0]], center));
  const ref2 = cross(normal, ref);
  const angle = (i: number) => {
    const d = sub(vs[i], center);
    return Math.atan2(dot(d, ref2), dot(d, ref));
  };
  return [...idx].sort((a, b) => angle(a) - angle(b));
}

/** 면의 "위쪽" 기준 방향: +Y 를 면 평면에 투영한 쪽 (윗면/아랫면이면 뒤/앞 쪽) */
function preferredUp(normal: Vec3): Vec3 {
  const tie: Vec3 = [0.0013, 0, 0.0007];
  const base: Vec3 = Math.abs(normal[1]) < 0.95 ? [0, 1, 0] : normal[1] > 0 ? [0, 0, -1] : [0, 0, 1];
  const p = add(base, tie);
  return normalize(sub(p, scale(normal, dot(p, normal))));
}

function makeSolid(id: SolidId): Solid {
  let vs = rawVertices(id);
  const r = length(vs[0]);
  vs = vs.map((v) => scale(v, CIRCUMRADIUS / r));

  // 정사면체·정십이면체·정이십면체: 면 하나가 정면(+Z)을 보고, 그 면의 꼭짓점 하나가 정확히 위를 향하게 배치
  if (id === 'tetra' || id === 'dodeca' || id === 'icosa') {
    const raw = findFaces(vs);
    const front = [...raw].sort((a, b) => b.normal[2] - a.normal[2] || b.normal[1] - a.normal[1])[0];
    const q1 = quatFromTo(front.normal, [0, 0, 1]);
    vs = vs.map((v) => rotateVec(q1, v));
    const fc = centerOf(vs, front.vertices);
    const top = [...front.vertices].sort((a, b) => vs[b][1] - vs[a][1])[0];
    const d = sub(vs[top], fc);
    const ang = Math.atan2(d[0], d[1]); // +Y 에서 시계방향 각
    const q2 = quatFromAxisAngle([0, 0, 1], ang);
    vs = vs.map((v) => rotateVec(q2, v));
  }

  const raw = findFaces(vs);
  const sides = raw[0].vertices.length;

  let ordered: RawFace[];
  let names: string[];
  if (id === 'cube') {
    const order: Vec3[] = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
    ordered = order.map((n) => raw.find((f) => dot(f.normal, n) > 0.99)!);
    names = ['U', 'D', 'F', 'B', 'R', 'L'];
  } else {
    const key = (n: Vec3) => [-n[2], -n[1], -n[0]].map((x) => Math.round(x * 1e6));
    ordered = [...raw].sort((a, b) => {
      const ka = key(a.normal);
      const kb = key(b.normal);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
    });
    names = ordered.map((_, i) => String(i + 1));
  }

  const faces: Face[] = ordered.map((f, i) => {
    const center = centerOf(vs, f.vertices);
    const verts = sortCCW(vs, f.vertices, center, f.normal);
    // 정육면체는 모서리 중점 방향, 나머지는 꼭짓점 방향을 "위"로 쓴다 (한 도형 안에서 일관되면 됨)
    const cands: Vec3[] =
      id === 'cube'
        ? verts.map((v, k) => normalize(sub(scale(add(vs[v], vs[verts[(k + 1) % verts.length]]), 0.5), center)))
        : verts.map((v) => normalize(sub(vs[v], center)));
    const pref = preferredUp(f.normal);
    const upRef = cands.reduce((best, c) => (dot(c, pref) > dot(best, pref) ? c : best));
    return { id: i, name: names[i], vertices: verts, center, normal: f.normal, upRef };
  });

  const edges: Edge[] = [];
  for (let i = 0; i < faces.length; i++)
    for (let j = i + 1; j < faces.length; j++) {
      const shared = faces[i].vertices.filter((v) => faces[j].vertices.includes(v));
      if (shared.length === 2) edges.push({ id: edges.length, a: shared[0], b: shared[1], faces: [i, j] });
    }

  const vertexFaces = vs.map((_, vi) => faces.filter((f) => f.vertices.includes(vi)).map((f) => f.id));
  const e0 = edges[0];
  const foldAngle = Math.acos(Math.max(-1, Math.min(1, dot(faces[e0.faces[0]].normal, faces[e0.faces[1]].normal))));

  return {
    id,
    name: SOLID_NAMES[id],
    vertices: vs,
    faces,
    edges,
    sides,
    vertexDegree: vertexFaces[0].length,
    foldAngle,
    vertexFaces,
  };
}

const cache = new Map<SolidId, Solid>();
export function getSolid(id: SolidId): Solid {
  let s = cache.get(id);
  if (!s) {
    s = makeSolid(id);
    cache.set(id, s);
  }
  return s;
}

/** 정반대편 면 (정사면체는 없음 → null) */
export function oppositeFace(solid: Solid, face: number): number | null {
  const n = solid.faces[face].normal;
  const f = solid.faces.find((g) => dot(g.normal, n) < -1 + 1e-6);
  return f ? f.id : null;
}

/** 두 면이 모서리를 공유하는지 */
export const adjacentFaces = (solid: Solid, a: number, b: number): boolean =>
  solid.edges.some((e) => (e.faces[0] === a && e.faces[1] === b) || (e.faces[0] === b && e.faces[1] === a));

/** 면의 외접원 반지름 */
export const faceCircumradius = (solid: Solid, f: number): number =>
  length(sub(solid.vertices[solid.faces[f].vertices[0]], solid.faces[f].center));

/** 기본 시점 카메라 방향 (원점 → 카메라). +Z 쪽에서 약간 위·오른쪽 */
export const CAMERA_DIR: Vec3 = normalize([0.55, 0.62, 1]);

/**
 * 기본 시점에서 "읽을 수 있게" 보이는 슬롯(면 번호).
 * 너무 비스듬한 면은 그림이 잘 안 보이므로 정답 구분(시그니처)에는 쓰지 않는다.
 */
export function visibleSlots(solid: Solid, minDot = 0.25): number[] {
  return solid.faces.filter((f) => dot(f.normal, CAMERA_DIR) > minDot).map((f) => f.id);
}
