// 평면 방사형 도형(다트판형): 가운데부터 안쪽·중간·바깥 3개 층, 층마다 N개 칸.
// 칸 경계 하나가 항상 12시 방향. 각도는 12시에서 시계방향(도).
// 모든 변환은 cells 배열을 받아 새 배열을 돌려주는 순수 함수.

import { getSymbol } from '../../symbols/library';

export type Family = 'dart' | 'square' | 'hex' | 'tri' | 'flower';

export interface RadialShape {
  family: Family;
  /** 층별 칸 수 [안쪽, 중간, 바깥] */
  sectors: [number, number, number];
}

export interface Cell {
  /** 0 = 흰색, 1 = 검은색 */
  fill: number;
  symbol: string | null;
  /** 그림 방향: 시계방향 각도(도) */
  rot: number;
  /** 그림 좌우 반전 (그림 자신의 세로축 기준, 회전보다 먼저 적용) */
  mirrored: boolean;
}

export type Cells = Cell[][];

export const FAMILY_NAMES: Record<Family, string> = {
  dart: '다트판',
  square: '사각 과녁',
  hex: '육각 과녁',
  tri: '삼각 과녁',
  flower: '꽃잎형',
};

export const RING_NAMES = ['안쪽', '중간', '바깥'];

/** 도형 가족별 허용 칸 수 */
export const FAMILY_SECTORS: Record<Family, [number, number, number][]> = {
  dart: [[4, 4, 4], [6, 6, 6], [8, 8, 8]],
  square: [[4, 4, 4], [8, 8, 8]],
  hex: [[6, 6, 6]],
  tri: [[3, 3, 3], [6, 6, 6]],
  flower: [[4, 8, 8], [4, 4, 8], [3, 6, 6]],
};

/** 외곽선이 정다각형이면 변의 수, 원이면 0 */
export const polygonSides = (f: Family): number => ({ dart: 0, flower: 0, square: 4, hex: 6, tri: 3 })[f];

/** 정다각형 꼭짓점 하나의 각도 (12시 기준 시계방향) */
export const polygonVertexAngle = (f: Family): number => (f === 'square' ? 45 : 0);

export const sectorWidth = (shape: RadialShape, ring: number): number => 360 / shape.sectors[ring];

const mod = (a: number, n: number) => ((a % n) + n) % n;
export const normRot = (r: number): number => mod(Math.round(r), 360);

/** 그림 정규화: 좌우 대칭 그림은 뒤집힘이 의미 없음 */
export function normalizeCell(c: Cell): Cell {
  if (!c.symbol) return { fill: c.fill, symbol: null, rot: 0, mirrored: false };
  const chiral = getSymbol(c.symbol).chiral;
  return { fill: c.fill, symbol: c.symbol, rot: normRot(c.rot), mirrored: chiral ? c.mirrored : false };
}

export const normalizeCells = (cells: Cells): Cells => cells.map((ring) => ring.map(normalizeCell));

export function radialSignature(shape: RadialShape, cells: Cells): string {
  return (
    `${shape.family}:${shape.sectors.join(',')}:` +
    normalizeCells(cells)
      .map((ring) =>
        ring.map((c) => `${c.fill}${c.symbol ? `${c.symbol}@${c.rot}${c.mirrored ? 'm' : ''}` : ''}`).join(','),
      )
      .join('/')
  );
}

export const emptyCells = (shape: RadialShape): Cells =>
  shape.sectors.map((n) => Array.from({ length: n }, (): Cell => ({ fill: 0, symbol: null, rot: 0, mirrored: false })));

/** 전체 회전에 허용되는 각도 (도형 모양과 모든 층의 칸이 딱 맞는 각도) */
export function allowedRotations(shape: RadialShape): number[] {
  const m = polygonSides(shape.family);
  const out: number[] = [];
  for (let a = 1; a < 360; a++) {
    if (!shape.sectors.every((n) => a % (360 / n) === 0)) continue;
    if (m > 0 && a % (360 / m) !== 0) continue;
    out.push(a);
  }
  return out;
}

/** 대칭축(12시 기준 시계방향 각도): 0 = 세로축, 90 = 가로축, 45 = ↗ 대각선, 135 = ↘ 대각선 */
export type MirrorAxis = 0 | 45 | 90 | 135;
export const MIRROR_AXIS_NAMES: Record<MirrorAxis, string> = {
  0: '세로선을 기준으로 좌우 뒤집기',
  90: '가로선을 기준으로 상하 뒤집기',
  45: '↗ 대각선을 기준으로 뒤집기',
  135: '↘ 대각선을 기준으로 뒤집기',
};

export function allowedMirrors(shape: RadialShape): MirrorAxis[] {
  const m = polygonSides(shape.family);
  return ([0, 90, 45, 135] as MirrorAxis[]).filter(
    (a) => shape.sectors.every((n) => (2 * a) % (360 / n) === 0) && (m === 0 || a % (180 / m) === 0),
  );
}
