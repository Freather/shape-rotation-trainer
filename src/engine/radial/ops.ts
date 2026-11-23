// 평면 방사형 도형 변환 연산 (순수 함수)

import type { Dir, TextPart } from '../rotation';
import {
  MIRROR_AXIS_NAMES,
  RING_NAMES,
  normalizeCells,
  normRot,
  sectorWidth,
  type Cell,
  type Cells,
  type MirrorAxis,
  type RadialShape,
} from './model';

export type RadialOp =
  /** 도형 전체 회전: 칸·색·그림이 한 덩어리로 돌아서 그림 방향도 같이 돈다 */
  | { kind: 'rotate'; dir: Dir; angle: number }
  /** 특정 층만 회전 */
  | { kind: 'rotateRing'; ring: number; dir: Dir; steps: number }
  /** 안쪽 층은 dir, 바깥 층은 반대 방향으로 steps칸 */
  | { kind: 'rotateOpposite'; dir: Dir; steps: number }
  | { kind: 'mirror'; axis: MirrorAxis }
  | { kind: 'invert' }
  | { kind: 'invertRing'; ring: number }
  /** 그림이 있는 칸만 색반전 */
  | { kind: 'invertSymbolCells' }
  /** 그림만 옆 칸으로 이동 (색은 제자리). withRot=true면 그림 방향도 같이 회전 */
  | { kind: 'moveSymbols'; dir: Dir; steps: number; withRot: boolean }
  /** 두 층의 그림 교환 */
  | { kind: 'swapSymbolRings'; a: number; b: number }
  /** 각 그림 제자리 회전 */
  | { kind: 'spinSymbols'; dir: Dir; angle: number }
  /** 각 그림만 좌우 반전 (화면 기준 세로축) */
  | { kind: 'flipSymbols' };

const mod = (a: number, n: number) => ((a % n) + n) % n;
const sgn = (d: Dir) => (d === 'cw' ? 1 : -1);
const clone = (cells: Cells): Cells => cells.map((r) => r.map((c) => ({ ...c })));

function shiftRing(ring: Cell[], steps: number, w: number, part: 'all' | 'symbol', withRot: boolean): Cell[] {
  const n = ring.length;
  const out = ring.map((c) => ({ ...c }));
  for (let k = 0; k < n; k++) {
    const src = ring[k];
    const dst = out[mod(k + steps, n)];
    if (part === 'all') {
      Object.assign(dst, src, { rot: src.rot + (withRot ? steps * w : 0) });
    } else {
      dst.symbol = src.symbol;
      dst.rot = src.rot + (withRot ? steps * w : 0);
      dst.mirrored = src.mirrored;
    }
  }
  return out;
}

export function applyRadialOp(shape: RadialShape, cells: Cells, op: RadialOp): Cells {
  let out: Cells;
  switch (op.kind) {
    case 'rotate':
      out = cells.map((ring, r) => {
        const w = sectorWidth(shape, r);
        return shiftRing(ring, (sgn(op.dir) * op.angle) / w, w, 'all', true);
      });
      break;
    case 'rotateRing':
      out = cells.map((ring, r) =>
        r === op.ring ? shiftRing(ring, sgn(op.dir) * op.steps, sectorWidth(shape, r), 'all', true) : ring.map((c) => ({ ...c })),
      );
      break;
    case 'rotateOpposite':
      out = cells.map((ring, r) => {
        const s = r === 0 ? sgn(op.dir) : r === 2 ? -sgn(op.dir) : 0;
        return shiftRing(ring, s * op.steps, sectorWidth(shape, r), 'all', true);
      });
      break;
    case 'mirror':
      out = cells.map((ring, r) => {
        const n = ring.length;
        const w = sectorWidth(shape, r);
        const res = ring.map((c) => ({ ...c }));
        for (let k = 0; k < n; k++) {
          const src = ring[k];
          // 칸 [kw, (k+1)w] → [2α − (k+1)w, 2α − kw]
          const j = mod((2 * op.axis) / w - k - 1, n);
          res[j] = { ...src, rot: 2 * op.axis - src.rot, mirrored: !src.mirrored };
        }
        return res;
      });
      break;
    case 'invert':
      out = cells.map((ring) => ring.map((c) => ({ ...c, fill: 1 - c.fill })));
      break;
    case 'invertRing':
      out = cells.map((ring, r) => ring.map((c) => ({ ...c, fill: r === op.ring ? 1 - c.fill : c.fill })));
      break;
    case 'invertSymbolCells':
      out = cells.map((ring) => ring.map((c) => ({ ...c, fill: c.symbol ? 1 - c.fill : c.fill })));
      break;
    case 'moveSymbols':
      out = cells.map((ring, r) => shiftRing(ring, sgn(op.dir) * op.steps, sectorWidth(shape, r), 'symbol', op.withRot));
      break;
    case 'swapSymbolRings': {
      if (shape.sectors[op.a] !== shape.sectors[op.b]) throw new Error('칸 수가 다른 층끼리는 교환 불가');
      out = clone(cells);
      for (let k = 0; k < shape.sectors[op.a]; k++) {
        const A = cells[op.a][k];
        const B = cells[op.b][k];
        Object.assign(out[op.a][k], { symbol: B.symbol, rot: B.rot, mirrored: B.mirrored });
        Object.assign(out[op.b][k], { symbol: A.symbol, rot: A.rot, mirrored: A.mirrored });
      }
      break;
    }
    case 'spinSymbols':
      out = cells.map((ring) => ring.map((c) => (c.symbol ? { ...c, rot: c.rot + sgn(op.dir) * op.angle } : { ...c })));
      break;
    case 'flipSymbols':
      // 화면 세로축 반사: R0·Rot(r)·S^m = Rot(−r)·S^(m+1)
      out = cells.map((ring) => ring.map((c) => (c.symbol ? { ...c, rot: -c.rot, mirrored: !c.mirrored } : { ...c })));
      break;
  }
  return normalizeCells(out.map((ring) => ring.map((c) => ({ ...c, rot: normRot(c.rot) }))));
}

export const applyRadialOps = (shape: RadialShape, cells: Cells, ops: RadialOp[]): Cells =>
  ops.reduce((acc, op) => applyRadialOp(shape, acc, op), cells);

export function radialHistory(shape: RadialShape, cells: Cells, ops: RadialOp[]): Cells[] {
  const out = [cells];
  for (const op of ops) out.push(applyRadialOp(shape, out[out.length - 1], op));
  return out;
}

const dirText = (d: Dir) => (d === 'cw' ? '시계방향' : '반시계방향');

export function describeRadialOp(op: RadialOp): TextPart[] {
  switch (op.kind) {
    case 'rotate':
      return [`도형 전체를 ${dirText(op.dir)} ${op.angle}° 회전`];
    case 'rotateRing':
      return [`${RING_NAMES[op.ring]} 층만 ${dirText(op.dir)} ${op.steps}칸 회전`];
    case 'rotateOpposite':
      return [`안쪽 층은 ${dirText(op.dir)}, 바깥 층은 ${dirText(op.dir === 'cw' ? 'ccw' : 'cw')}으로 ${op.steps}칸씩 회전`];
    case 'mirror':
      return [MIRROR_AXIS_NAMES[op.axis]];
    case 'invert':
      return ['전체 색반전 (흰 칸 ↔ 검은 칸)'];
    case 'invertRing':
      return [`${RING_NAMES[op.ring]} 층만 색반전`];
    case 'invertSymbolCells':
      return ['그림이 있는 칸만 색반전'];
    case 'moveSymbols':
      return [
        `모든 그림을 ${dirText(op.dir)} 옆 칸으로 ${op.steps}칸 이동 (색은 제자리, ${op.withRot ? '그림 방향도 같이 회전' : '그림 방향은 그대로'})`,
      ];
    case 'swapSymbolRings':
      return [`${RING_NAMES[op.a]} 층 그림 ↔ ${RING_NAMES[op.b]} 층 그림 교환`];
    case 'spinSymbols':
      return [`각 그림을 제자리에서 ${dirText(op.dir)} ${op.angle}° 회전`];
    case 'flipSymbols':
      return ['각 그림만 좌우 반전 (칸 배치는 그대로)'];
  }
}

export const describeRadialOpText = (op: RadialOp): string => describeRadialOp(op).join('');
