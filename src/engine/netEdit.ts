// 전개도 직접 만들기: 면을 떼어 다른 모서리에 (돌려서) 붙인 뒤, 접으면 어떤 입체가 되는지 계산한다.
//
// 평면 위의 칸(정다각형)들이 모서리로 이어져 있을 때, 한 칸을 입체의 한 면에 대응시키고
// 이웃한 칸을 차례로 따라가며 "그 모서리 건너편 면"을 찾는다. 두 칸이 같은 면으로 가면
// 접었을 때 겹친다는 뜻이므로 입체가 만들어지지 않는다.

import { add, cross, dot, normalize, scale, sub, type Vec3 } from './math';
import { net2D, polygonsOverlap, type Pt } from './net';
import { getSolid, type SolidId } from './solids';
import type { Labeling } from './state';

export interface NetCell {
  id: number;
  symbol: string;
  /** 꼭짓점 (반시계 순서, y 위가 +) */
  pts: Pt[];
  /** 기호의 위쪽 방향 (단위벡터) */
  up: Pt;
}

const EPS = 1e-4;
const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const centerOf = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/** 엔진의 전개도(신장 트리)에서 편집용 칸 목록을 만든다 */
export function cellsFromNet(solidId: SolidId, edges: number[], root: number, lab: Labeling): NetCell[] {
  const net = net2D(solidId, edges, root, lab);
  return net.faces.map((f) => ({ id: f.id, symbol: lab[f.id].symbol, pts: f.pts, up: f.up }));
}

/** 두 칸이 공유하는 모서리: a의 i번 모서리 = b의 j번 모서리 (방향 반대) */
function sharedEdge(a: NetCell, b: NetCell): { i: number; j: number } | null {
  const n = a.pts.length;
  for (let i = 0; i < n; i++) {
    const p = a.pts[i];
    const q = a.pts[(i + 1) % n];
    for (let j = 0; j < b.pts.length; j++) {
      if (same(b.pts[j], q) && same(b.pts[(j + 1) % b.pts.length], p)) return { i, j };
    }
  }
  return null;
}

/** 칸들이 모서리로 모두 이어져 있는지 */
export function isConnected(cells: NetCell[]): boolean {
  if (cells.length <= 1) return true;
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const a = stack.pop()!;
    cells.forEach((c, k) => {
      if (!seen.has(k) && sharedEdge(cells[a], c)) {
        seen.add(k);
        stack.push(k);
      }
    });
  }
  return seen.size === cells.length;
}

/** 이 칸을 떼어도 나머지가 이어져 있는지 */
export const canDetach = (cells: NetCell[], id: number): boolean => isConnected(cells.filter((c) => c.id !== id));

/** 모서리 p→q 의 바깥쪽에 붙는 새 칸 (반시계 순서, 0번 모서리 = q→p) */
function attachPolygon(owner: NetCell, i: number): Pt[] {
  const n = owner.pts.length;
  const p = owner.pts[i];
  const q = owner.pts[(i + 1) % n];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len2 = dx * dx + dy * dy;
  const reflect = (r: Pt): Pt => {
    const t = ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / len2;
    const fx = p[0] + t * dx;
    const fy = p[1] + t * dy;
    return [2 * fx - r[0], 2 * fy - r[1]];
  };
  // 반사하면 순서가 뒤집히므로 거꾸로 읽어 반시계로 만들고, q 부터 시작하게 돌린다
  const refl = owner.pts.map(reflect).reverse();
  const k = refl.findIndex((r) => same(r, q));
  return refl.slice(k).concat(refl.slice(0, k));
}

export interface Slot {
  key: string;
  pts: Pt[];
  center: Pt;
}

/** 떼어 든 칸을 붙일 수 있는 자리들 (다른 칸과 겹치지 않는 빈 모서리) */
export function freeSlots(cells: NetCell[], heldId: number): Slot[] {
  const rest = cells.filter((c) => c.id !== heldId);
  const out: Slot[] = [];
  for (const c of rest) {
    for (let i = 0; i < c.pts.length; i++) {
      const pts = attachPolygon(c, i);
      const center = centerOf(pts);
      if (rest.some((o) => polygonsOverlap(o.pts, pts, 1e-3))) continue;
      if (out.some((s) => same(s.center, center))) continue;
      out.push({ key: `${c.id}-${i}`, pts, center });
    }
  }
  return out;
}

/** 위쪽 벡터를 반시계로 한 칸 돌림 (n각형이면 360/n 도) */
export function rotateUp(up: Pt, sides: number, steps: number): Pt {
  const a = (steps * 2 * Math.PI) / sides;
  return [up[0] * Math.cos(a) - up[1] * Math.sin(a), up[0] * Math.sin(a) + up[1] * Math.cos(a)];
}

/** 칸을 자리에 붙인다. 기호 방향은 화면에서 보던 방향을 최대한 유지 */
export function placeCell(cells: NetCell[], heldId: number, slot: Slot, up: Pt): NetCell[] {
  const solidSides = slot.pts.length;
  const feats = features(slot.pts, solidSides === 4);
  const c = centerOf(slot.pts);
  let best = feats[0];
  let bestDot = -Infinity;
  for (const f of feats) {
    const d = normalize2([f[0] - c[0], f[1] - c[1]]);
    const v = d[0] * up[0] + d[1] * up[1];
    if (v > bestDot) {
      bestDot = v;
      best = f;
    }
  }
  const newUp = normalize2([best[0] - c[0], best[1] - c[1]]);
  return cells.map((x) => (x.id === heldId ? { ...x, pts: slot.pts, up: newUp } : x));
}

const normalize2 = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};

/** 기호가 가리킬 수 있는 지점: 정사각형은 변의 가운데, 나머지는 꼭짓점 (solids.ts 의 upRef 규칙과 같음) */
function features(pts: Pt[], edgeMid: boolean): Pt[] {
  return edgeMid ? pts.map((p, i) => [(p[0] + pts[(i + 1) % pts.length][0]) / 2, (p[1] + pts[(i + 1) % pts.length][1]) / 2] as Pt) : pts;
}

export type FoldResult =
  | { ok: true; labeling: Labeling; edges: number[]; root: number; faceOfCell: Record<number, number> }
  | { ok: false; collide: [number, number] };

/** 칸들을 접어서 입체의 면에 대응시킨다 */
export function foldCells(solidId: SolidId, cells: NetCell[]): FoldResult {
  const solid = getSolid(solidId);
  const n = solid.sides;
  const rootCell = cells[0];
  const root = solid.id === 'cube' ? 2 : 0;
  // 칸의 꼭짓점 번호 → 입체 꼭짓점 번호
  const vmap = new Map<number, number[]>();
  const faceOf = new Map<number, number>();
  const cellOfFace = new Map<number, number>();
  vmap.set(rootCell.id, [...solid.faces[root].vertices]);
  faceOf.set(rootCell.id, root);
  cellOfFace.set(root, rootCell.id);
  const treeEdges: number[] = [];
  const queue = [rootCell];
  while (queue.length) {
    const a = queue.shift()!;
    const ma = vmap.get(a.id)!;
    const fa = faceOf.get(a.id)!;
    for (const b of cells) {
      if (b.id === a.id) continue;
      const se = sharedEdge(a, b);
      if (!se) continue;
      const va = ma[se.i];
      const vb = ma[(se.i + 1) % n];
      const edge = solid.edges.find((e) => (e.a === va && e.b === vb) || (e.a === vb && e.b === va))!;
      const g = edge.faces[0] === fa ? edge.faces[1] : edge.faces[0];
      if (faceOf.has(b.id)) {
        if (faceOf.get(b.id) !== g) return { ok: false, collide: [b.id, cellOfFace.get(g) ?? a.id] };
        continue;
      }
      if (cellOfFace.has(g)) return { ok: false, collide: [b.id, cellOfFace.get(g)!] };
      const gv = solid.faces[g].vertices;
      const m = gv.findIndex((v, k) => v === vb && gv[(k + 1) % n] === va);
      const mb: number[] = new Array(n);
      for (let t = 0; t < n; t++) mb[(se.j + t) % n] = gv[(m + t) % n];
      vmap.set(b.id, mb);
      faceOf.set(b.id, g);
      cellOfFace.set(g, b.id);
      treeEdges.push(edge.id);
      queue.push(b);
    }
  }
  if (faceOf.size !== solid.faces.length) return { ok: false, collide: [cells[0].id, cells[0].id] };

  // 기호 방향: 2D 위쪽이 가리키는 지점을 3D 로 옮겨 upRef 기준 몇 칸 돌았는지 계산
  const labeling: Labeling = new Array(solid.faces.length);
  for (const c of cells) {
    const g = faceOf.get(c.id)!;
    const f = solid.faces[g];
    const mv = vmap.get(c.id)!;
    const cc = centerOf(c.pts);
    const edgeMid = solid.id === 'cube';
    const feats = features(c.pts, edgeMid);
    let k = 0;
    let bestDot = -Infinity;
    feats.forEach((p, idx) => {
      const d = normalize2([p[0] - cc[0], p[1] - cc[1]]);
      const v = d[0] * c.up[0] + d[1] * c.up[1];
      if (v > bestDot) {
        bestDot = v;
        k = idx;
      }
    });
    const V = solid.vertices;
    const target: Vec3 = edgeMid ? scale(add(V[mv[k]], V[mv[(k + 1) % n]]), 0.5) : V[mv[k]];
    const up3 = normalize(sub(target, f.center));
    const ang = Math.atan2(dot(cross(f.upRef, up3), f.normal), dot(f.upRef, up3));
    const rot = (((Math.round(ang / ((2 * Math.PI) / n)) % n) + n) % n);
    labeling[g] = { symbol: c.symbol, rot, flip: false };
  }
  const faceOfCell: Record<number, number> = {};
  faceOf.forEach((v, k) => (faceOfCell[k] = v));
  return { ok: true, labeling, edges: treeEdges.sort((x, y) => x - y), root, faceOfCell };
}
