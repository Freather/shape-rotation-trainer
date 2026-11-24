// 쌓기나무: 서로 붙어 있는 정육면체 블록 덩어리.
// 칸 좌표는 정수 [x, y, z] (x 오른쪽, y 위, z 앞). 항상 최소값이 0이 되게 맞춰 둔다.

import { CAMERA_DIR } from './solids';
import { quatFromAxisAngle, quatFromMatrix, rotateVec, deg, type Quat, type Vec3 } from './math';
import { ROLL_AXIS, VIEW_AXIS, signedAngle, type RotationOp, type TextPart } from './rotation';
import type { Rng } from './rng';

export type Cell = [number, number, number];
export type Blocks = Cell[];
export type Mat3 = number[][];

/** 쌓기나무에 쓰는 회전 명령: 보는 방향 기준 회전, 넘어뜨리기, 좌우 거울 */
export type BlockOp = Extract<RotationOp, { kind: 'view' | 'roll' | 'mirror' }>;

export const DIRS6: Cell[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export const cellKey = (c: Cell) => `${c[0]},${c[1]},${c[2]}`;

/** 최소값을 0으로 맞춤 (칸 순서는 그대로: 칸별 색이 따라감) */
export function normalize(b: Blocks): Blocks {
  const m = [0, 1, 2].map((i) => Math.min(...b.map((c) => c[i])));
  return b.map((c) => [c[0] - m[0], c[1] - m[1], c[2] - m[2]] as Cell);
}

/** 방향까지 같은지 비교하는 열쇠 */
export const blocksKey = (b: Blocks): string =>
  normalize(b)
    .map(cellKey)
    .sort()
    .join(' ');

export type Side = 'right' | 'left' | 'top' | 'front' | 'back';
export const SIDE_NAMES: Record<Side, string> = { right: '오른쪽', left: '왼쪽', top: '위', front: '앞', back: '뒤' };
export const SIDE_ALIGN: Record<Side, string> = {
  right: '바닥과 앞면을 맞춰요',
  left: '바닥과 앞면을 맞춰요',
  top: '왼쪽과 앞면을 맞춰요',
  front: '바닥과 왼쪽을 맞춰요',
  back: '바닥과 왼쪽을 맞춰요',
};

/** b를 a의 한쪽 옆에 붙인 덩어리. 앞쪽은 a의 칸, 뒤쪽은 b의 칸 (붙지 않으면 null) */
export function attach(a: Blocks, b: Blocks, side: Side): Blocks | null {
  const A = normalize(a);
  const B = normalize(b);
  const [wa, ha, da] = dims(A);
  const [wb, , db] = dims(B);
  let off: Cell = [0, 0, 0];
  let offA: Cell = [0, 0, 0];
  if (side === 'right') off = [wa, 0, da - db];
  else if (side === 'left') {
    offA = [wb, 0, 0];
    off = [0, 0, da - db];
  } else if (side === 'top') off = [0, ha, da - db];
  else if (side === 'front') off = [0, 0, da];
  else offA = [0, 0, db];
  const cells: Blocks = [...A.map((c) => [c[0] + offA[0], c[1] + offA[1], c[2] + offA[2]] as Cell), ...B.map((c) => [c[0] + off[0], c[1] + off[1], c[2] + off[2]] as Cell)];
  const n = normalize(cells);
  return isConnected(n) ? n : null;
}

export function dims(b: Blocks): Cell {
  const n = normalize(b);
  return [0, 1, 2].map((i) => Math.max(...n.map((c) => c[i])) + 1) as Cell;
}

// ---------------- 회전 ----------------

const matMul = (a: Mat3, b: Mat3): Mat3 => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const matKey = (m: Mat3) => m.flat().join(',');
export const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function matFromAxis(axis: Vec3, angleDeg: number): Mat3 {
  const q = quatFromAxisAngle(axis, deg(angleDeg));
  const cols = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map((e) => rotateVec(q, e as unknown as Vec3));
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => Math.round(cols[j][i])));
}

/** 정육면체 회전 24가지 */
export const ROTATIONS: Mat3[] = (() => {
  const gens = [matFromAxis([1, 0, 0], 90), matFromAxis([0, 1, 0], 90)];
  const seen = new Map<string, Mat3>([[matKey(IDENTITY), IDENTITY]]);
  const queue = [IDENTITY];
  while (queue.length) {
    const m = queue.shift()!;
    for (const g of gens) {
      const n = matMul(g, m);
      if (!seen.has(matKey(n))) {
        seen.set(matKey(n), n);
        queue.push(n);
      }
    }
  }
  return [...seen.values()];
})();

export const MIRROR_X: Mat3 = [
  [-1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** 칸 중심 기준으로 변환 (정수 유지를 위해 좌표를 두 배로) */
export function transform(b: Blocks, m: Mat3): Blocks {
  return normalize(
    b.map((c) => {
      const p = [2 * c[0] + 1, 2 * c[1] + 1, 2 * c[2] + 1];
      const r = m.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
      return [(r[0] - 1) / 2, (r[1] - 1) / 2, (r[2] - 1) / 2] as Cell;
    }),
  );
}

export const mirrorBlocks = (b: Blocks) => transform(b, MIRROR_X);

/** 돌려서 같아지는지 비교하는 열쇠 (24가지 방향 중 가장 작은 것) */
export function shapeKey(b: Blocks): string {
  let best = '';
  for (const m of ROTATIONS) {
    const k = blocksKey(transform(b, m));
    if (!best || k < best) best = k;
  }
  return best;
}

export const isChiral = (b: Blocks) => shapeKey(b) !== shapeKey(mirrorBlocks(b));

export function opMatrix(op: BlockOp): Mat3 {
  switch (op.kind) {
    case 'view':
      return matFromAxis(VIEW_AXIS[op.view], signedAngle(op.dir, op.angle));
    case 'roll':
      return matFromAxis(ROLL_AXIS[op.dir].axis, ROLL_AXIS[op.dir].angle);
    case 'mirror':
      return MIRROR_X;
  }
}

export const applyBlockOp = (b: Blocks, op: BlockOp) => transform(b, opMatrix(op));
export const applyBlockOps = (b: Blocks, ops: BlockOp[]) => ops.reduce(applyBlockOp, b);

/** 회전 행렬 → 쿼터니언 (풀이 애니메이션) */
export const matToQuat = (m: Mat3): Quat => quatFromMatrix(m);

export function describeBlockOp(op: BlockOp): TextPart[] {
  const dirText = op.kind === 'view' ? (op.dir === 'cw' ? '시계방향' : '반시계방향') : '';
  switch (op.kind) {
    case 'view': {
      const v = { front: '앞', top: '위', right: '오른쪽' }[op.view];
      return [op.angle === 180 ? `${v}에서 볼 때 180° 돌리기` : `${v}에서 볼 때 ${dirText} 90°`];
    }
    case 'roll':
      return [{ forward: '앞으로 넘어뜨리기', backward: '뒤로 넘어뜨리기', right: '오른쪽으로 넘어뜨리기', left: '왼쪽으로 넘어뜨리기' }[op.dir]];
    case 'mirror':
      return ['거울에 비친 모습으로 좌우 뒤집기'];
  }
}

/** 쌓기나무에 쓸 수 있는 명령 후보 */
export function blockOpCandidates(opts: { views: ('front' | 'top' | 'right')[]; half: boolean; rolls: boolean; mirror: boolean }): BlockOp[] {
  const out: BlockOp[] = [];
  for (const view of opts.views) {
    out.push({ kind: 'view', view, dir: 'cw', angle: 90 }, { kind: 'view', view, dir: 'ccw', angle: 90 });
    if (opts.half) out.push({ kind: 'view', view, dir: 'cw', angle: 180 });
  }
  if (opts.rolls) for (const dir of ['forward', 'backward', 'right', 'left'] as const) out.push({ kind: 'roll', dir });
  if (opts.mirror) out.push({ kind: 'mirror' });
  return out;
}

export const sameEffect = (a: BlockOp, b: BlockOp) => matKey(opMatrix(a)) === matKey(opMatrix(b));

// ---------------- 만들기 ----------------

const inBox = (c: Cell, box: number) => c.every((v) => v >= 0 && v < box);

export function isConnected(b: Blocks): boolean {
  if (!b.length) return false;
  const set = new Set(b.map(cellKey));
  const seen = new Set([cellKey(b[0])]);
  const st = [b[0]];
  while (st.length) {
    const c = st.pop()!;
    for (const d of DIRS6) {
      const n: Cell = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      const k = cellKey(n);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        st.push(n);
      }
    }
  }
  return seen.size === b.length;
}

/** 붙어 있는 블록 n개를 box 안에서 무작위로 */
export function randomBlocks(rng: Rng, n: number, box = 3): Blocks {
  const start: Cell = [rng.int(box), 0, rng.int(box)];
  const cells: Blocks = [start];
  const set = new Set([cellKey(start)]);
  let guard = 0;
  while (cells.length < n && guard++ < 500) {
    const c = rng.pick(cells);
    const d = rng.pick(DIRS6);
    // 위로 쌓는 쪽을 조금 덜 고르게 (납작하고 넓은 모양이 잘 보임)
    if (d[1] === 1 && rng.chance(0.35)) continue;
    const nc: Cell = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
    if (!inBox(nc, box) || set.has(cellKey(nc))) continue;
    cells.push(nc);
    set.add(cellKey(nc));
  }
  return normalize(cells);
}

/** 블록 하나를 다른 자리로 옮긴 모양 (붙어 있어야 함) */
export function moveOne(b: Blocks, rng: Rng, box = 4): Blocks | null {
  for (let t = 0; t < 60; t++) {
    const i = rng.int(b.length);
    const rest = b.filter((_, j) => j !== i);
    if (!isConnected(rest)) continue;
    const set = new Set(rest.map(cellKey));
    const c = rng.pick(rest);
    const d = rng.pick(DIRS6);
    const nc: Cell = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
    if (set.has(cellKey(nc)) || cellKey(nc) === cellKey(b[i])) continue;
    const out = normalize([...rest, nc]);
    if (dims(out).some((v) => v > box)) continue;
    return out;
  }
  return null;
}

// ---------------- 보이는 모습 ----------------

/** 칸 중심이 원점에서 얼마나 떨어져 있는지 (그림 중심 맞추기) */
export function center(b: Blocks): Vec3 {
  const d = dims(b);
  return [d[0] / 2, d[1] / 2, d[2] / 2];
}

function rayHitsBox(o: Vec3, dir: Vec3, c: Cell): boolean {
  let tmin = 1e-6;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const lo = c[i];
    const hi = c[i] + 1;
    if (Math.abs(dir[i]) < 1e-12) {
      if (o[i] <= lo || o[i] >= hi) return false;
      continue;
    }
    let t1 = (lo - o[i]) / dir[i];
    let t2 = (hi - o[i]) / dir[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin >= tmax) return false;
  }
  return true;
}

/** 모든 블록이 그림에서 적어도 한 면은 보이는지 (숨은 블록이 있으면 그림만으로 알 수 없음) */
export function allVisible(b: Blocks): boolean {
  const set = new Set(b.map(cellKey));
  return b.every((c) =>
    DIRS6.some((d) => {
      if (d[0] * CAMERA_DIR[0] + d[1] * CAMERA_DIR[1] + d[2] * CAMERA_DIR[2] <= 0) return false;
      if (set.has(cellKey([c[0] + d[0], c[1] + d[1], c[2] + d[2]]))) return false;
      const o: Vec3 = [c[0] + 0.5 + d[0] * 0.501, c[1] + 0.5 + d[1] * 0.501, c[2] + 0.5 + d[2] * 0.501];
      return b.every((x) => x === c || !rayHitsBox(o, CAMERA_DIR, x));
    }),
  );
}

export type ViewDir = 'front' | 'top' | 'right';
export const VIEW_NAMES: Record<ViewDir, string> = { front: '앞', top: '위', right: '오른쪽' };

/**
 * 한 방향에서 본 모양 (칸이 있으면 true). grid[row][col], row 0이 종이 위쪽.
 * 앞: 가로 x, 세로 y / 위: 가로 x, 세로 z(앞이 아래) / 오른쪽: 가로 −z(앞이 왼쪽), 세로 y
 */
export function viewGrid(b: Blocks, v: ViewDir): boolean[][] {
  const [w, h, d] = dims(b);
  const n = normalize(b);
  const size = v === 'front' ? [h, w] : v === 'top' ? [d, w] : [h, d];
  const g = Array.from({ length: size[0] }, () => Array(size[1]).fill(false));
  for (const [x, y, z] of n) {
    if (v === 'front') g[h - 1 - y][x] = true;
    else if (v === 'top') g[z][x] = true;
    else g[h - 1 - y][d - 1 - z] = true;
  }
  return g;
}

export const gridKey = (g: boolean[][]) => g.map((r) => r.map((x) => (x ? 1 : 0)).join('')).join('/');

/** 2D 모양을 좌우로 뒤집기 */
export const flipGrid = (g: boolean[][]) => g.map((r) => [...r].reverse());

/** 칸 하나를 켜거나 끈 모양 (비어 있는 줄·칸이 생기지 않게) */
export function toggleOne(g: boolean[][], rng: Rng): boolean[][] | null {
  for (let t = 0; t < 40; t++) {
    const r = rng.int(g.length);
    const c = rng.int(g[0].length);
    const n = g.map((row) => [...row]);
    n[r][c] = !n[r][c];
    const rowsOk = n.every((row) => row.some(Boolean));
    const colsOk = n[0].every((_, j) => n.some((row) => row[j]));
    if (rowsOk && colsOk) return n;
  }
  return null;
}

// ---------------- 조각 나누기 ----------------

/** 덩어리를 붙어 있는 두 조각으로 나눔 (조각 크기는 둘 다 min 이상) */
export function splitTwo(b: Blocks, rng: Rng, min = 2): [Blocks, Blocks] | null {
  for (let t = 0; t < 200; t++) {
    const k = rng.range(min, b.length - min);
    // 한 칸에서 자라는 조각
    const startIdx = rng.int(b.length);
    const set = new Set(b.map(cellKey));
    const a = new Set([cellKey(b[startIdx])]);
    const aCells: Blocks = [b[startIdx]];
    let guard = 0;
    while (aCells.length < k && guard++ < 200) {
      const c = rng.pick(aCells);
      const d = rng.pick(DIRS6);
      const nc: Cell = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      const kk = cellKey(nc);
      if (!set.has(kk) || a.has(kk)) continue;
      a.add(kk);
      aCells.push(nc);
    }
    const bCells = b.filter((c) => !a.has(cellKey(c)));
    if (aCells.length < min || bCells.length < min || !isConnected(bCells)) continue;
    return [aCells, bCells];
  }
  return null;
}

/** 조각 piece를 돌리고 옮겨 target 안에 넣었을 때 남는 칸들이 rest와 같은 모양이 되는지 */
export function completes(target: Blocks, piece: Blocks, rest: Blocks): boolean {
  if (piece.length + rest.length !== target.length) return false;
  const T = normalize(target);
  const set = new Set(T.map(cellKey));
  const restKey = shapeKey(rest);
  const [tw, th, td] = dims(T);
  for (const m of ROTATIONS) {
    const p = transform(piece, m);
    const [pw, ph, pd] = dims(p);
    for (let x = 0; x <= tw - pw; x++)
      for (let y = 0; y <= th - ph; y++)
        for (let z = 0; z <= td - pd; z++) {
          const placed = p.map((c) => cellKey([c[0] + x, c[1] + y, c[2] + z]));
          if (!placed.every((k) => set.has(k))) continue;
          const ps = new Set(placed);
          const remain = T.filter((c) => !ps.has(cellKey(c)));
          if (isConnected(remain) && shapeKey(remain) === restKey) return true;
        }
  }
  return false;
}

/** 무작위 방향으로 돌린 모양 */
export const randomTurn = (b: Blocks, rng: Rng) => transform(b, rng.pick(ROTATIONS));
