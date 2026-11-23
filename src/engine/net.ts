// 전개도 엔진
// 면 = 점, 맞닿은 모서리 = 선인 "면 인접 그래프"에서 신장 트리 하나를 고르면 전개도 하나.
// 트리에 포함된 모서리 = 접히는 선(경첩), 나머지 = 잘리는 선.
// 펼침은 3D 입체와 같은 데이터에서 계산하므로 접었을 때와 펼쳤을 때 기호 방향이 항상 일치한다.

import {
  QUAT_IDENTITY,
  add,
  cross,
  dot,
  quatFromAxisAngle,
  quatMul,
  rotateVec,
  sub,
  vecClose,
  type Quat,
  type Vec3,
} from './math';
import type { Rng } from './rng';
import { getSolid, type Solid, type SolidId } from './solids';
import { labelFrame, type Labeling } from './state';

/** 강체 변환 x' = q·x + p (원래 도형 좌표계) */
export interface RigidTransform {
  q: Quat;
  p: Vec3;
}
const IDENTITY_T: RigidTransform = { q: QUAT_IDENTITY, p: [0, 0, 0] };

export const applyT = (t: RigidTransform, x: Vec3): Vec3 => add(rotateVec(t.q, x), t.p);
export const rotateT = (t: RigidTransform, v: Vec3): Vec3 => rotateVec(t.q, v);
/** a∘b : b 먼저 */
const composeT = (a: RigidTransform, b: RigidTransform): RigidTransform => ({
  q: quatMul(a.q, b.q),
  p: add(rotateVec(a.q, b.p), a.p),
});

export interface NetTree {
  solidId: SolidId;
  /** 경첩이 되는 모서리 id 목록 (면 수 − 1 개) */
  edges: number[];
}

export interface TreeInfo {
  root: number;
  parent: number[];
  /** 부모와 이어진 모서리 id (루트는 −1) */
  hinge: number[];
  /** 루트부터 너비 우선 순서 */
  order: number[];
  /** 펼칠 때 회전 방향 부호 */
  sign: number[];
}

/** 트리 구조 계산. 연결이 안 되거나 사이클이 있으면 에러 */
export function buildTree(solid: Solid, edges: number[], root: number): TreeInfo {
  const n = solid.faces.length;
  if (edges.length !== n - 1) throw new Error('신장 트리 간선 수는 면 수 − 1');
  const parent = new Array(n).fill(-2);
  const hinge = new Array(n).fill(-1);
  const sign = new Array(n).fill(0);
  parent[root] = -1;
  const order = [root];
  for (let i = 0; i < order.length; i++) {
    const f = order[i];
    for (const eid of edges) {
      const e = solid.edges[eid];
      const other = e.faces[0] === f ? e.faces[1] : e.faces[1] === f ? e.faces[0] : -1;
      if (other < 0 || hinge[f] === eid) continue; // 부모로 가는 모서리
      if (parent[other] !== -2) throw new Error('사이클이 있음');
      parent[other] = f;
      hinge[other] = eid;
      order.push(other);
    }
  }
  if (order.length !== n) throw new Error('모든 면이 연결되지 않음');
  for (const c of order.slice(1)) {
    const e = solid.edges[hinge[c]];
    const axis = sub(solid.vertices[e.b], solid.vertices[e.a]);
    const rc = rotateVec(quatFromAxisAngle(axis, solid.foldAngle), solid.faces[c].normal);
    sign[c] = vecClose(rc, solid.faces[parent[c]].normal, 1e-6) ? 1 : -1;
  }
  return { root, parent, hinge, order, sign };
}

export type UnfoldMode = 'all' | 'sequential';

/** 면마다 펼침 진행도 (0 = 접힘, 1 = 펼침) */
export function faceProgress(info: TreeInfo, t: number, mode: UnfoldMode): number[] {
  const n = info.order.length;
  const prog = new Array(n).fill(0);
  info.order.forEach((f, i) => {
    if (i === 0) prog[f] = 0;
    else if (mode === 'all') prog[f] = t;
    else prog[f] = Math.max(0, Math.min(1, t * (n - 1) - (i - 1)));
  });
  return prog;
}

/**
 * 진행도 t에서 각 면의 강체 변환.
 * 자식 면 = 부모 변환 ∘ (경첩 모서리 축 기준 회전). 트리 모양 그대로 중첩.
 */
export function foldTransforms(solidId: SolidId, edges: number[], root: number, t: number, mode: UnfoldMode = 'all'): RigidTransform[] {
  const solid = getSolid(solidId);
  const info = buildTree(solid, edges, root);
  const prog = faceProgress(info, t, mode);
  const out: RigidTransform[] = new Array(solid.faces.length);
  out[root] = IDENTITY_T;
  for (const c of info.order.slice(1)) {
    const e = solid.edges[info.hinge[c]];
    const a = solid.vertices[e.a];
    const axis = sub(solid.vertices[e.b], a);
    const q = quatFromAxisAngle(axis, info.sign[c] * solid.foldAngle * prog[c]);
    const h: RigidTransform = { q, p: sub(a, rotateVec(q, a)) };
    out[c] = composeT(out[info.parent[c]], h);
  }
  return out;
}

// ---------------- 2D 전개도 ----------------

export type Pt = [number, number];

export interface NetFace2D {
  id: number;
  pts: Pt[];
  center: Pt;
  /** 기호 위쪽 방향 (2D, y 위가 +) */
  up: Pt;
  /** 기호 오른쪽 방향 (뒤집힌 기호면 반대) */
  right: Pt;
}

export interface Net2D {
  solidId: SolidId;
  root: number;
  edges: number[];
  faces: NetFace2D[];
  /** 접히는 선(경첩) 2D 선분 */
  folds: [Pt, Pt][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 완전히 펼친 전개도의 2D 좌표 (루트 면 기준: x = 루트 오른쪽, y = 루트 위쪽) */
export function net2D(solidId: SolidId, edges: number[], root: number, lab?: Labeling): Net2D {
  const solid = getSolid(solidId);
  const T = foldTransforms(solidId, edges, root, 1);
  const rf = solid.faces[root];
  const ex = cross(rf.upRef, rf.normal);
  const ey = rf.upRef;
  const to2 = (p: Vec3): Pt => {
    const d = sub(p, rf.center);
    return [dot(d, ex), dot(d, ey)];
  };
  const dir2 = (v: Vec3): Pt => [dot(v, ex), dot(v, ey)];
  const faces = solid.faces.map((f): NetFace2D => {
    const fr = lab ? labelFrame(solidId, f.id, lab[f.id]) : { up: f.upRef, right: cross(f.upRef, f.normal) };
    return {
      id: f.id,
      pts: f.vertices.map((v) => to2(applyT(T[f.id], solid.vertices[v]))),
      center: to2(applyT(T[f.id], f.center)),
      up: dir2(rotateT(T[f.id], fr.up)),
      right: dir2(rotateT(T[f.id], fr.right)),
    };
  });
  const info = buildTree(solid, edges, root);
  const folds = info.order.slice(1).map((c): [Pt, Pt] => {
    const e = solid.edges[info.hinge[c]];
    return [to2(applyT(T[c], solid.vertices[e.a])), to2(applyT(T[c], solid.vertices[e.b]))];
  });
  const xs = faces.flatMap((f) => f.pts.map((p) => p[0]));
  const ys = faces.flatMap((f) => f.pts.map((p) => p[1]));
  return {
    solidId,
    root,
    edges,
    faces,
    folds,
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** 볼록 다각형 두 개가 (넓이를 가지고) 겹치는지 — 분리축 정리 */
export function polygonsOverlap(a: Pt[], b: Pt[], eps = 1e-6): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = -(q[1] - p[1]);
      const ny = q[0] - p[0];
      const len = Math.hypot(nx, ny);
      const proj = (pts: Pt[]) => pts.map((r) => (r[0] * nx + r[1] * ny) / len);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  }
  return true;
}

export function netOverlaps(net: Net2D): boolean {
  for (let i = 0; i < net.faces.length; i++)
    for (let j = i + 1; j < net.faces.length; j++) if (polygonsOverlap(net.faces[i].pts, net.faces[j].pts)) return true;
  return false;
}

/** 간선 집합이 신장 트리인지 */
export function isSpanningTree(solid: Solid, edges: number[]): boolean {
  if (edges.length !== solid.faces.length - 1) return false;
  const uf = solid.faces.map((_, i) => i);
  const find = (x: number): number => (uf[x] === x ? x : (uf[x] = find(uf[x])));
  for (const eid of edges) {
    const [a, b] = solid.edges[eid].faces;
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    uf[ra] = rb;
  }
  return true;
}

/** 모든 신장 트리 (정육면체·정팔면체처럼 작은 도형용) */
export function enumerateSpanningTrees(solid: Solid): number[][] {
  const need = solid.faces.length - 1;
  const E = solid.edges.length;
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === need) {
      if (isSpanningTree(solid, cur)) out.push([...cur]);
      return;
    }
    for (let e = start; e <= E - (need - cur.length); e++) {
      cur.push(e);
      // 사이클이 생기면 가지치기
      if (isForest(solid, cur)) rec(e + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

function isForest(solid: Solid, edges: number[]): boolean {
  const uf = solid.faces.map((_, i) => i);
  const find = (x: number): number => (uf[x] === x ? x : (uf[x] = find(uf[x])));
  for (const eid of edges) {
    const [a, b] = solid.edges[eid].faces;
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    uf[ra] = rb;
  }
  return true;
}

/** 전개도 모양의 표준 키: 회전(30° 단위)·뒤집기·평행이동을 무시하고 같은 모양이면 같은 값 */
export function netShapeKey(net: Net2D): string {
  const s = getSolid(net.solidId);
  const edgeLen = Math.hypot(
    s.vertices[s.edges[0].a][0] - s.vertices[s.edges[0].b][0],
    s.vertices[s.edges[0].a][1] - s.vertices[s.edges[0].b][1],
    s.vertices[s.edges[0].a][2] - s.vertices[s.edges[0].b][2],
  );
  const pts = net.faces.map((f) => [f.center[0] / edgeLen, f.center[1] / edgeLen] as Pt);
  let best = '';
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    for (const refl of [1, -1]) {
      const tp = pts.map(([x, y]) => {
        const xx = x * refl;
        return [xx * Math.cos(a) - y * Math.sin(a), xx * Math.sin(a) + y * Math.cos(a)] as Pt;
      });
      const mx = Math.min(...tp.map((p) => p[0]));
      const my = Math.min(...tp.map((p) => p[1]));
      const key = tp
        .map(([x, y]) => `${Math.round((x - mx) * 100)},${Math.round((y - my) * 100)}`)
        .map((s2) => s2.replace('-0', '0'))
        .sort()
        .join(';');
      if (best === '' || key < best) best = key;
    }
  }
  return best;
}

/** 기본 루트 면: 정육면체는 앞면(F), 나머지는 0번(정면) */
export const defaultRoot = (solidId: SolidId): number => (solidId === 'cube' ? 2 : 0);

const presetCache = new Map<SolidId, number[][]>();
/** 서로 다른 모양의 전개도 프리셋 (정육면체 11종, 정팔면체 11종, 정사면체 2종) */
export function netPresets(solidId: SolidId): number[][] {
  const cached = presetCache.get(solidId);
  if (cached) return cached;
  const solid = getSolid(solidId);
  if (solid.faces.length > 8) throw new Error('이 도형은 프리셋 대신 랜덤 전개도를 사용');
  const seen = new Map<string, number[]>();
  for (const tree of enumerateSpanningTrees(solid)) {
    const key = netShapeKey(net2D(solidId, tree, defaultRoot(solidId)));
    if (!seen.has(key)) seen.set(key, tree);
  }
  // 보기 좋은 순서: 가로·세로 폭이 작은 것(정사각형에 가까운 것) 먼저
  const list = [...seen.values()].sort((a, b) => {
    const na = net2D(solidId, a, defaultRoot(solidId));
    const nb = net2D(solidId, b, defaultRoot(solidId));
    const sa = Math.max(na.maxX - na.minX, na.maxY - na.minY);
    const sb = Math.max(nb.maxX - nb.minX, nb.maxY - nb.minY);
    return sa - sb;
  });
  presetCache.set(solidId, list);
  return list;
}

export const hasPresets = (solidId: SolidId): boolean => getSolid(solidId).faces.length <= 8;

/** 랜덤 신장 트리 (겹침 검사를 통과한 것만) */
export function randomSpanningTree(solidId: SolidId, rng: Rng, root = defaultRoot(solidId)): number[] {
  const solid = getSolid(solidId);
  for (let attempt = 0; attempt < 500; attempt++) {
    const order = rng.shuffle(solid.edges.map((e) => e.id));
    const uf = solid.faces.map((_, i) => i);
    const find = (x: number): number => (uf[x] === x ? x : (uf[x] = find(uf[x])));
    const tree: number[] = [];
    for (const eid of order) {
      const [a, b] = solid.edges[eid].faces;
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        uf[ra] = rb;
        tree.push(eid);
      }
    }
    if (!netOverlaps(net2D(solidId, tree, root))) return tree.sort((x, y) => x - y);
  }
  throw new Error('겹치지 않는 전개도를 찾지 못함');
}

/** 전개도 하나 고르기: 프리셋이 있으면 그중 하나, 없으면 랜덤 */
export function pickNet(solidId: SolidId, rng: Rng): number[] {
  return hasPresets(solidId) ? rng.pick(netPresets(solidId)) : randomSpanningTree(solidId, rng);
}

/** 펼침 중인 도형의 중심과 반지름 (화면에 맞추기용) */
export function foldBounds(solidId: SolidId, T: RigidTransform[]): { center: Vec3; radius: number } {
  const solid = getSolid(solidId);
  const pts = solid.faces.flatMap((f) => f.vertices.map((v) => applyT(T[f.id], solid.vertices[v])));
  const c = pts.reduce<Vec3>((acc, p) => add(acc, p), [0, 0, 0]).map((x) => x / pts.length) as unknown as Vec3;
  const radius = Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
  return { center: c, radius };
}
