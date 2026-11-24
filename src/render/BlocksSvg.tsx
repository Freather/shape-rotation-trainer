// 쌓기나무 그림 (SVG). 돌아가는 중간 모습도 그릴 수 있다.
import type { ReactNode } from 'react';
import { DIRS6, cellKey, dims, type Blocks } from '../engine/blocks';
import { CAMERA_DIR } from '../engine/solids';
import { QUAT_IDENTITY, dot, normalize as norm, rotateVec, type Quat, type Vec3 } from '../engine/math';
import { projectPoint } from './project';

const LIGHT = norm([-0.35, 0.85, 0.45]);

export interface BlocksDrawOptions {
  /** 덩어리 중심 기준 회전 */
  q?: Quat;
  /** 좌우 거울 진행도: 1 → −1 */
  sx?: number;
  /** 칸별 색 (없으면 회색) */
  colors?: (string | null | undefined)[];
}

/** 그림 크기 기준 (덩어리가 어떻게 돌아도 들어가는 반지름) */
export const blocksRadius = (b: Blocks) => {
  const d = dims(b);
  return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) / 2;
};

export function BlocksSvg({ cells, size = 160, view, q = QUAT_IDENTITY, sx = 1, colors, children }: { cells: Blocks; size?: number; view?: number; children?: ReactNode } & BlocksDrawOptions) {
  const d = dims(cells);
  const c: Vec3 = [d[0] / 2, d[1] / 2, d[2] / 2];
  const set = new Set(cells.map(cellKey));
  const V = view ?? Math.max(1.9, blocksRadius(cells) * 1.08);
  const tf = (p: Vec3): Vec3 => {
    const r = rotateVec(q, [(p[0] - c[0]) * sx, p[1] - c[1], p[2] - c[2]]);
    return r;
  };
  const tn = (n: Vec3): Vec3 => rotateVec(q, [n[0] * sx, n[1], n[2]]);
  const cubes = cells.map((cell, i) => ({ cell, i, depth: dot(tf([cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5]), CAMERA_DIR) }));
  cubes.sort((a, b) => a.depth - b.depth);
  const polys: ReactNode[] = [];
  for (const { cell, i } of cubes) {
    for (const dir of DIRS6) {
      if (set.has(cellKey([cell[0] + dir[0], cell[1] + dir[1], cell[2] + dir[2]]))) continue;
      const n = tn(dir as unknown as Vec3);
      if (dot(n, CAMERA_DIR) <= 1e-6) continue;
      // 면의 네 꼭짓점
      const axis = dir.findIndex((v) => v !== 0);
      const [u, w] = [0, 1, 2].filter((k) => k !== axis);
      const base = [cell[0], cell[1], cell[2]];
      if (dir[axis] > 0) base[axis] += 1;
      const corners: Vec3[] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([a, b]) => {
        const p = [...base];
        p[u] += a;
        p[w] += b;
        return p as unknown as Vec3;
      });
      const pts = corners.map((p) => projectPoint(tf(p)).map((v) => v.toFixed(3)).join(',')).join(' ');
      const shade = 0.5 + 0.5 * dot(norm(n), LIGHT);
      const col = colors?.[i];
      const fill = col ? col : `hsl(40 6% ${Math.round(62 + 36 * shade)}%)`;
      polys.push(
        <g key={`${i}-${dir.join('')}`}>
          <polygon points={pts} fill={fill} />
          {col && <polygon points={pts} fill="#000" opacity={(1 - shade) * 0.3} />}
          <polygon points={pts} fill="none" stroke="#1d1d1f" strokeWidth={0.035} strokeLinejoin="round" />
        </g>,
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox={`${-V} ${-V} ${V * 2} ${V * 2}`} className="solid-svg">
      {polys}
      {children}
    </svg>
  );
}

/** 한 방향에서 본 모양 (네모 칸) */
export function GridSvg({ grid, size = 110 }: { grid: boolean[][]; size?: number }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const n = Math.max(rows, cols, 4);
  const cell = 100 / (n + 0.6);
  const ox = (100 - cols * cell) / 2;
  const oy = (100 - rows * cell) / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {grid.flatMap((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={ox + c * cell} y={oy + r * cell} width={cell} height={cell} fill="#d9d6cf" stroke="#1d1d1f" strokeWidth={1.4} /> : null,
        ),
      )}
    </svg>
  );
}
