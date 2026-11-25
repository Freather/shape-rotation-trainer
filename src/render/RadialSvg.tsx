// 평면 방사형 도형 SVG + 연산 애니메이션 프레임
// 정답 상태는 항상 cells 배열 연산 결과. 애니메이션은 "이전 상태를 움직여 보여주는 것"일 뿐.

import type { ReactNode } from 'react';
import { cellAnchor, cellPath, polar } from '../engine/radial/geometry';
import { sectorWidth, type Cell, type Cells, type RadialShape } from '../engine/radial/model';
import type { RadialOp } from '../engine/radial/ops';
import { Glyph } from './Glyph';

const BLACK = '#1f1f1f';

function SymbolAt({ x, y, size, cell, rot, scaleX = 1, color }: { x: number; y: number; size: number; cell: Cell; rot?: number; scaleX?: number; color?: string }) {
  if (!cell.symbol) return null;
  const r = rot ?? cell.rot;
  const k = size / 100;
  const fg = color ?? (cell.fill ? '#fff' : BLACK);
  const halo = cell.fill ? BLACK : '#fff';
  return (
    <g transform={`translate(${x} ${y}) scale(${scaleX} 1) rotate(${r}) scale(${cell.mirrored ? -k : k} ${k}) translate(-50 -50)`}>
      <Glyph id={cell.symbol} color={fg} halo={halo} />
    </g>
  );
}

export interface RadialAnim {
  op: RadialOp;
  /** 0 → 1 */
  p: number;
}

const sgn = (d: 'cw' | 'ccw') => (d === 'cw' ? 1 : -1);

export function RadialSvg({
  shape,
  cells,
  size = 180,
  anim,
  onCellClick,
  highlight,
}: {
  shape: RadialShape;
  cells: Cells;
  size?: number;
  anim?: RadialAnim | null;
  onCellClick?: (ring: number, k: number) => void;
  highlight?: [number, number] | null;
}) {
  const op = anim?.op;
  const p = anim?.p ?? 0;
  const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

  // 층별 회전각 (회전 연산 애니메이션)
  const ringAngle = (r: number): number => {
    if (!op) return 0;
    if (op.kind === 'rotate') return sgn(op.dir) * op.angle * ease;
    if (op.kind === 'rotateRing' && op.ring === r) return sgn(op.dir) * op.steps * sectorWidth(shape, r) * ease;
    if (op.kind === 'rotateOpposite') {
      const s = r === 0 ? sgn(op.dir) : r === 2 ? -sgn(op.dir) : 0;
      return s * op.steps * sectorWidth(shape, r) * ease;
    }
    return 0;
  };
  const inverts = (r: number, c: Cell): boolean =>
    !!op && (op.kind === 'invert' || (op.kind === 'invertRing' && op.ring === r) || (op.kind === 'invertSymbolCells' && !!c.symbol));
  const symbolsMove = op && (op.kind === 'moveSymbols' || op.kind === 'swapSymbolRings' || op.kind === 'shiftSymbolRings');

  const rings: ReactNode[] = cells.map((ring, r) => {
    const cellsEls = ring.map((c, k) => {
      const flip = inverts(r, c);
      const fill = flip ? (p < 0.5 ? c.fill : 1 - c.fill) : c.fill;
      const a = cellAnchor(shape, r, k);
      const sx = flip ? Math.max(0.02, Math.abs(Math.cos(Math.PI * ease))) : 1;
      const hl = highlight && highlight[0] === r && highlight[1] === k;
      return (
        <g
          key={k}
          transform={flip ? `translate(${a.x} ${a.y}) scale(${sx} 1) translate(${-a.x} ${-a.y})` : undefined}
          onClick={onCellClick ? () => onCellClick(r, k) : undefined}
          style={onCellClick ? { cursor: 'pointer' } : undefined}
        >
          <path d={cellPath(shape, r, k)} fill={fill ? BLACK : '#fff'} stroke={hl ? '#f08c00' : '#555'} strokeWidth={hl ? 0.03 : 0.012} strokeLinejoin="round" />
        </g>
      );
    });
    const symEls = symbolsMove
      ? null
      : ring.map((c, k) => {
          const a = cellAnchor(shape, r, k);
          const flipCell = inverts(r, c);
          const shown: Cell = { ...c, fill: flipCell ? (p < 0.5 ? c.fill : 1 - c.fill) : c.fill };
          let rot = c.rot;
          let scaleX = 1;
          if (op?.kind === 'spinSymbols') rot = c.rot + sgn(op.dir) * op.angle * ease;
          if (op?.kind === 'flipSymbols') scaleX = Math.cos(Math.PI * ease) || 0.001;
          return <SymbolAt key={k} x={a.x} y={a.y} size={a.size} cell={shown} rot={rot} scaleX={scaleX} />;
        });
    return (
      <g key={r} transform={`rotate(${ringAngle(r)})`}>
        {cellsEls}
        {symEls}
      </g>
    );
  });

  // 그림 이동 애니메이션: 그림만 따로 움직임
  let moving: ReactNode = null;
  if (op && symbolsMove) {
    moving = cells.flatMap((ring, r) =>
      ring.map((c, k) => {
        if (!c.symbol) return null;
        const a = cellAnchor(shape, r, k);
        if (op.kind === 'moveSymbols') {
          const phi = sgn(op.dir) * op.steps * sectorWidth(shape, r) * ease;
          const rad = (phi * Math.PI) / 180;
          const x = a.x * Math.cos(rad) - a.y * Math.sin(rad);
          const y = a.x * Math.sin(rad) + a.y * Math.cos(rad);
          return <SymbolAt key={`${r}-${k}`} x={x} y={y} size={a.size} cell={c} rot={c.rot + (op.withRot ? phi : 0)} color={BLACK} />;
        }
        if (op.kind === 'swapSymbolRings' && (r === op.a || r === op.b)) {
          const other = r === op.a ? op.b : op.a;
          const b = cellAnchor(shape, other, k);
          return (
            <SymbolAt key={`${r}-${k}`} x={a.x + (b.x - a.x) * ease} y={a.y + (b.y - a.y) * ease} size={a.size + (b.size - a.size) * ease} cell={c} color={BLACK} />
          );
        }
        if (op.kind === 'shiftSymbolRings') {
          const to = (r + (op.dir === 'out' ? 1 : 2)) % 3;
          const b = cellAnchor(shape, to, k);
          return (
            <SymbolAt key={`${r}-${k}`} x={a.x + (b.x - a.x) * ease} y={a.y + (b.y - a.y) * ease} size={a.size + (b.size - a.size) * ease} cell={c} color={BLACK} />
          );
        }
        return <SymbolAt key={`${r}-${k}`} x={a.x} y={a.y} size={a.size} cell={c} />;
      }),
    );
  }

  let body: ReactNode = (
    <>
      {rings}
      {moving}
    </>
  );
  let axisLine: ReactNode = null;
  if (op?.kind === 'mirror') {
    const [x1, y1] = polar(op.axis, 1.15);
    const [x2, y2] = polar(op.axis + 180, 1.15);
    axisLine = <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8590c" strokeWidth={0.025} strokeDasharray="0.06 0.04" />;
    const s = Math.cos(Math.PI * Math.min(1, ease * 1.0)) || 0.001;
    body = <g transform={`rotate(${op.axis}) scale(${s} 1) rotate(${-op.axis})`}>{body}</g>;
  }

  return (
    <svg width={size} height={size} viewBox="-1.2 -1.2 2.4 2.4" className="radial-svg">
      {body}
      {axisLine}
    </svg>
  );
}
