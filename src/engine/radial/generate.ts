// 방사형 도형 랜덤 생성 + 레벨별 연산 후보

import { RADIAL_SYMBOLS } from '../../symbols/library';
import type { Rng } from '../rng';
import type { Dir } from '../rotation';
import {
  FAMILY_SECTORS,
  allowedMirrors,
  allowedRotations,
  emptyCells,
  type Cells,
  type Family,
  type RadialShape,
} from './model';
import type { RadialOp } from './ops';

export function randomCells(shape: RadialShape, rng: Rng, opts: { symbolCount?: number } = {}): Cells {
  const cells = emptyCells(shape);
  for (const ring of cells) for (const c of ring) c.fill = rng.chance(0.45) ? 1 : 0;
  const slots: [number, number][] = [];
  shape.sectors.forEach((n, r) => {
    for (let k = 0; k < n; k++) slots.push([r, k]);
  });
  // 안쪽 층은 칸이 작아서 그림을 최대 1개만
  const outerSlots = rng.shuffle(slots.filter(([r]) => r > 0));
  const innerSlots = rng.shuffle(slots.filter(([r]) => r === 0));
  const count = opts.symbolCount ?? 4;
  const picked = [...innerSlots.slice(0, shape.sectors[0] >= 6 ? 0 : 1), ...outerSlots].slice(0, count);
  const syms = rng.shuffle(RADIAL_SYMBOLS);
  picked.forEach(([r, k], i) => {
    cells[r][k] = { ...cells[r][k], symbol: syms[i % syms.length], rot: rng.pick([0, 90, 180, 270]), mirrored: false };
  });
  return cells;
}

export interface RadialLevelConfig {
  families: Family[];
  /** 허용 칸 수 (가족별 목록 중 이 칸 수와 맞는 것만) */
  sectorFilter?: (s: [number, number, number]) => boolean;
  kinds: RadialOp['kind'][];
  steps: [number, number];
  ruleCount: number;
  symbolCount: number;
  confusing: number;
}

export const RADIAL_LEVELS: Record<number, RadialLevelConfig> = {
  1: { families: ['dart'], sectorFilter: (s) => s[0] === 4, kinds: ['rotate', 'invert'], steps: [1, 2], ruleCount: 3, symbolCount: 3, confusing: 0 },
  2: {
    families: ['dart', 'square'],
    kinds: ['rotate', 'rotateRing', 'invert', 'invertRing'],
    steps: [2, 3], ruleCount: 4, symbolCount: 4, confusing: 0.3,
  },
  3: {
    families: ['dart', 'square', 'hex', 'tri'],
    kinds: ['rotate', 'rotateRing', 'rotateOpposite', 'mirror', 'invertRing', 'moveSymbols', 'spinSymbols', 'flipSymbols', 'swapSymbolRings'],
    steps: [3, 4], ruleCount: 4, symbolCount: 5, confusing: 0.5,
  },
  4: {
    families: ['flower', 'dart', 'square', 'hex'],
    kinds: ['rotate', 'rotateRing', 'rotateOpposite', 'mirror', 'invert', 'invertRing', 'invertSymbolCells', 'moveSymbols', 'spinSymbols', 'flipSymbols', 'swapSymbolRings'],
    steps: [3, 5], ruleCount: 5, symbolCount: 5, confusing: 0.6,
  },
};

export function pickShape(level: number, rng: Rng, family?: Family): RadialShape {
  const cfg = RADIAL_LEVELS[level];
  const fam = family ?? rng.pick(cfg.families);
  const opts = FAMILY_SECTORS[fam].filter((s) => !cfg.sectorFilter || cfg.sectorFilter(s));
  return { family: fam, sectors: rng.pick(opts.length ? opts : FAMILY_SECTORS[fam]) };
}

/** 도형에서 가능한 모든 연산 (주어진 종류만) */
export function radialOpCandidates(shape: RadialShape, kinds: RadialOp['kind'][]): RadialOp[] {
  const out: RadialOp[] = [];
  const dirs: Dir[] = ['cw', 'ccw'];
  const has = (k: RadialOp['kind']) => kinds.includes(k);
  if (has('rotate'))
    for (const angle of allowedRotations(shape))
      for (const dir of dirs) if (angle <= 180 && !(angle === 180 && dir === 'ccw')) out.push({ kind: 'rotate', dir, angle });
  if (has('rotateRing'))
    for (const ring of [0, 1, 2]) for (const dir of dirs) out.push({ kind: 'rotateRing', ring, dir, steps: 1 });
  if (has('rotateOpposite')) for (const dir of dirs) out.push({ kind: 'rotateOpposite', dir, steps: 1 });
  if (has('mirror')) for (const axis of allowedMirrors(shape)) out.push({ kind: 'mirror', axis });
  if (has('invert')) out.push({ kind: 'invert' });
  if (has('invertRing')) for (const ring of [0, 1, 2]) out.push({ kind: 'invertRing', ring });
  if (has('invertSymbolCells')) out.push({ kind: 'invertSymbolCells' });
  if (has('moveSymbols'))
    for (const dir of dirs) {
      out.push({ kind: 'moveSymbols', dir, steps: 1, withRot: false });
      if (kinds.includes('invertSymbolCells')) out.push({ kind: 'moveSymbols', dir, steps: 1, withRot: true });
    }
  if (has('swapSymbolRings'))
    for (const [a, b] of [[0, 2], [1, 2], [0, 1]] as const) if (shape.sectors[a] === shape.sectors[b]) out.push({ kind: 'swapSymbolRings', a, b });
  if (has('spinSymbols')) for (const dir of dirs) out.push({ kind: 'spinSymbols', dir, angle: 90 });
  if (has('flipSymbols')) out.push({ kind: 'flipSymbols' });
  return out;
}
