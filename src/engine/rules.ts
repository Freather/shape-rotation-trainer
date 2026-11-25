// 번호 규칙 시스템: 규칙 = 번호 + 연산. 세트는 매번 랜덤 생성 (같은 번호가 매번 다른 연산).
// 입체 세트와 평면 방사형 세트를 같은 형식으로 다룬다.

import { arrangeSymbols, symbolsForSides } from '../symbols/library';
import { makeRng, type Rng } from './rng';
import { inverseOp, symmetryGroup, type Dir, type RotationOp, type View } from './rotation';
import { getSolid, type SolidId } from './solids';
import { applyOp, initialState, signature, type Labeling } from './state';
import { RADIAL_LEVELS, pickShape, radialOpCandidates, randomCells } from './radial/generate';
import { radialSignature, type Cells, type Family, type RadialShape } from './radial/model';
import { applyRadialOp, type RadialOp } from './radial/ops';
import { OCTA_LEVELS, octaEffect, octaOpCandidates, randomOcta, type OctaOp, type OctaState } from './octa';
import { allVisible, blockOpCandidates, isChiral, isEditOp, isIdentityOp, randomBlocks, sameEffect, type BlockOp, type Blocks } from './blocks';

export interface Rule<Op> {
  id: number;
  label: string;
  op: Op;
}

export interface SolidRuleSet {
  kind: 'solid';
  seed: number;
  level: number;
  solidId: SolidId;
  rules: Rule<RotationOp>[];
  /** 규칙이 기호로 면을 가리키면 세트 전체에서 라벨 고정 */
  fixedLabeling: Labeling | null;
  /** 규칙 설명 페이지 예시용 라벨 */
  exampleLabeling: Labeling;
}

export interface RadialRuleSet {
  kind: 'radial';
  seed: number;
  level: number;
  shape: RadialShape;
  rules: Rule<RadialOp>[];
  exampleCells: Cells;
}

export interface BlockRuleSet {
  kind: 'block';
  seed: number;
  level: number;
  rules: Rule<BlockOp>[];
  example: Blocks;
}

export interface OctaRuleSet {
  kind: 'octa';
  seed: number;
  level: number;
  rules: Rule<OctaOp>[];
  example: OctaState;
}

export type RuleSet = SolidRuleSet | RadialRuleSet | BlockRuleSet | OctaRuleSet;

// ---------------- 입체 레벨 ----------------

export interface SolidLevelConfig {
  solids: SolidId[];
  steps: [number, number];
  ruleCount: number;
  confusing: number;
  /** 정육면체: 90°만 / 180° 포함 / 굴리기 포함 */
  cubeAngles: number[];
  rolls: boolean;
  timeScale: number;
}

export const SOLID_LEVELS: Record<number, SolidLevelConfig> = {
  1: { solids: ['cube'], steps: [1, 1], ruleCount: 3, confusing: 0, cubeAngles: [90], rolls: false, timeScale: 1 },
  2: { solids: ['cube'], steps: [2, 3], ruleCount: 4, confusing: 0.3, cubeAngles: [90, 180], rolls: true, timeScale: 1 },
  3: { solids: ['octa'], steps: [2, 3], ruleCount: 4, confusing: 0.4, cubeAngles: [90, 180], rolls: true, timeScale: 1 },
  4: { solids: ['dodeca'], steps: [2, 3], ruleCount: 4, confusing: 0.4, cubeAngles: [90, 180], rolls: true, timeScale: 1 },
  5: { solids: ['cube', 'octa', 'dodeca'], steps: [3, 5], ruleCount: 5, confusing: 0.6, cubeAngles: [90, 180], rolls: true, timeScale: 0.75 },
};

export function randomLabeling(solidId: SolidId, rng: Rng): Labeling {
  const solid = getSolid(solidId);
  const pool = rng.shuffle(symbolsForSides(solid.sides).map((s) => s.id));
  const syms = rng.shuffle(arrangeSymbols(pool, (p) => rng.chance(p)).slice(0, solid.faces.length));
  return syms.map((id) => ({ symbol: id, rot: rng.int(solid.sides), flip: false }));
}

export const opUsesSymbols = (op: RotationOp): boolean => op.kind === 'face' || op.kind === 'vertex' || op.kind === 'edge';

/** 다면체별로 대칭이 성립하는 회전 명령 후보 (4-4 표) */
export function solidOpCandidates(solidId: SolidId, lab: Labeling, cfg: Pick<SolidLevelConfig, 'cubeAngles' | 'rolls'>, allowMirror = false): RotationOp[] {
  const solid = getSolid(solidId);
  const dirs: Dir[] = ['cw', 'ccw'];
  const views: View[] = ['front', 'top', 'right'];
  const out: RotationOp[] = [];
  const sym = (f: number) => lab[f].symbol;
  const pickVertexes = () => solid.vertexFaces.map((fs) => fs.map(sym));
  switch (solidId) {
    case 'cube':
      for (const view of views) for (const dir of dirs) for (const angle of cfg.cubeAngles) if (!(angle === 180 && dir === 'ccw')) out.push({ kind: 'view', view, dir, angle });
      if (cfg.rolls) for (const dir of ['forward', 'backward', 'right', 'left'] as const) out.push({ kind: 'roll', dir });
      break;
    case 'octa':
      for (const view of views) for (const dir of dirs) for (const angle of [90, 180]) if (!(angle === 180 && dir === 'ccw')) out.push({ kind: 'view', view, dir, angle });
      for (const f of solid.faces) for (const dir of dirs) out.push({ kind: 'face', symbol: sym(f.id), dir, angle: 120 });
      for (const e of solid.edges) out.push({ kind: 'edge', symbols: [sym(e.faces[0]), sym(e.faces[1])], dir: 'cw', angle: 180 });
      break;
    case 'dodeca':
      for (const dir of dirs) for (const angle of [72, 144]) out.push({ kind: 'view', view: 'front', dir, angle });
      for (const f of solid.faces) for (const dir of dirs) for (const angle of [72, 144]) out.push({ kind: 'face', symbol: sym(f.id), dir, angle });
      for (const vs of pickVertexes()) for (const dir of dirs) out.push({ kind: 'vertex', symbols: vs, dir, angle: 120 });
      for (const e of solid.edges) out.push({ kind: 'edge', symbols: [sym(e.faces[0]), sym(e.faces[1])], dir: 'cw', angle: 180 });
      break;
    case 'tetra':
      for (const f of solid.faces) for (const dir of dirs) out.push({ kind: 'face', symbol: sym(f.id), dir, angle: 120 });
      for (const vs of pickVertexes()) for (const dir of dirs) out.push({ kind: 'vertex', symbols: vs, dir, angle: 120 });
      for (const e of solid.edges) out.push({ kind: 'edge', symbols: [sym(e.faces[0]), sym(e.faces[1])], dir: 'cw', angle: 180 });
      break;
    case 'icosa':
      for (const vs of pickVertexes()) for (const dir of dirs) for (const angle of [72, 144]) out.push({ kind: 'vertex', symbols: vs, dir, angle });
      for (const f of solid.faces) for (const dir of dirs) out.push({ kind: 'face', symbol: sym(f.id), dir, angle: 120 });
      for (const e of solid.edges) out.push({ kind: 'edge', symbols: [sym(e.faces[0]), sym(e.faces[1])], dir: 'cw', angle: 180 });
      break;
  }
  if (allowMirror) out.push({ kind: 'mirror' });
  return out;
}

/** 연산 효과 키 (같은 효과면 같은 값) */
const solidEffect = (solidId: SolidId, op: RotationOp, lab: Labeling) => signature(applyOp(initialState(solidId), op, lab, ));

/** 헷갈리는 짝: 방향 반대 / 다른 시점 같은 각도 / 같은 축 다른 각도 */
function confusingVariants(op: RotationOp, all: RotationOp[]): RotationOp[] {
  const out: RotationOp[] = [];
  if (op.kind !== 'mirror' && op.kind !== 'axis') out.push(inverseOp(op));
  if (op.kind === 'view') {
    for (const v of ['front', 'top', 'right'] as View[]) if (v !== op.view) out.push({ ...op, view: v });
  }
  for (const c of all) {
    if (c.kind === op.kind && JSON.stringify(c) !== JSON.stringify(op)) {
      if ((c.kind === 'face' && op.kind === 'face' && c.symbol === op.symbol) || (c.kind === 'view' && op.kind === 'view' && c.view === op.view))
        out.push(c);
    }
  }
  // 대칭이 성립하는 후보 목록에 있는 것만 (예: 정십이면체는 '위에서 볼 때' 회전 불가)
  return out.filter((c) => all.some((a) => JSON.stringify(a) === JSON.stringify(c)));
}

export interface SolidSetOptions {
  solidId?: SolidId;
  allowMirror?: boolean;
}

export function generateSolidRuleSet(level: number, seed: number, opts: SolidSetOptions = {}): SolidRuleSet {
  const rng = makeRng(seed);
  const cfg = SOLID_LEVELS[level];
  const solidId = opts.solidId ?? rng.pick(cfg.solids);
  const lab = randomLabeling(solidId, rng);
  const all = solidOpCandidates(solidId, lab, cfg, opts.allowMirror);
  // 정육면체는 시점 기반(라벨 불필요) 위주로, 그 외는 기호 기반 규칙을 섞는다
  const ops: RotationOp[] = [];
  const effects = new Set<string>([solidEffect(solidId, { kind: 'axis', axis: [0, 0, 1], angle: 0 }, lab)]);
  const tryAdd = (op: RotationOp) => {
    const e = solidEffect(solidId, op, lab);
    if (effects.has(e)) return false;
    effects.add(e);
    ops.push(op);
    return true;
  };
  let guard = 0;
  while (ops.length < cfg.ruleCount && guard++ < 500) {
    if (ops.length > 0 && rng.chance(cfg.confusing)) {
      const base = rng.pick(ops);
      const vars = rng.shuffle(confusingVariants(base, all));
      if (vars.some((v) => tryAdd(v))) continue;
    }
    // 다양성: 이미 있는 종류와 다른 종류를 우선
    const kindsUsed = new Set(ops.map((o) => o.kind + (o.kind === 'view' ? o.view : '')));
    const fresh = all.filter((o) => !kindsUsed.has(o.kind + (o.kind === 'view' ? o.view : '')));
    tryAdd(rng.pick(fresh.length && rng.chance(0.7) ? fresh : all));
  }
  if (opts.allowMirror && !ops.some((o) => o.kind === 'mirror') && rng.chance(0.6)) ops[ops.length - 1] = { kind: 'mirror' };
  const rules = rng.shuffle(ops).map((op, i) => ({ id: i + 1, label: `[${i + 1}]`, op }));
  const fixed = rules.some((r) => opUsesSymbols(r.op));
  return { kind: 'solid', seed, level, solidId, rules, fixedLabeling: fixed ? lab : null, exampleLabeling: lab };
}

// ---------------- 평면 방사형 ----------------

const radialEffect = (shape: RadialShape, samples: Cells[], op: RadialOp) =>
  samples.map((c) => radialSignature(shape, applyRadialOp(shape, c, op))).join('#');

function radialConfusing(op: RadialOp, all: RadialOp[]): RadialOp[] {
  const same = (pred: (o: RadialOp) => boolean) => all.filter((o) => pred(o) && JSON.stringify(o) !== JSON.stringify(op));
  switch (op.kind) {
    case 'rotate':
      return [...same((o) => o.kind === 'rotate'), ...same((o) => o.kind === 'moveSymbols')];
    case 'rotateRing':
      return same((o) => o.kind === 'rotateRing' && (o.ring === op.ring || o.dir === op.dir));
    case 'moveSymbols':
      return [...same((o) => o.kind === 'moveSymbols'), ...same((o) => o.kind === 'rotate')];
    case 'mirror':
      return [...same((o) => o.kind === 'mirror'), ...same((o) => o.kind === 'rotate' && o.angle === 180)];
    case 'invertRing':
    case 'invert':
      return same((o) => o.kind === 'invertRing' || o.kind === 'invert');
    case 'shiftSymbolRings':
    case 'swapSymbolRings':
      return same((o) => o.kind === 'shiftSymbolRings' || o.kind === 'swapSymbolRings');
    case 'spinSymbols':
    case 'flipSymbols':
      return same((o) => o.kind === 'spinSymbols' || o.kind === 'flipSymbols');
    default:
      return [];
  }
}

export function generateRadialRuleSet(level: number, seed: number, family?: Family): RadialRuleSet {
  const rng = makeRng(seed);
  const cfg = RADIAL_LEVELS[level];
  const shape = pickShape(level, rng, family);
  const all = radialOpCandidates(shape, cfg.kinds);
  const samples = [1, 2, 3].map((i) => randomCells(shape, makeRng(seed * 7 + i), { symbolCount: 6 }));
  const identity = samples.map((c) => radialSignature(shape, c)).join('#');
  const effects = new Set<string>([identity]);
  const ops: RadialOp[] = [];
  const tryAdd = (op: RadialOp) => {
    const e = radialEffect(shape, samples, op);
    if (effects.has(e)) return false;
    effects.add(e);
    ops.push(op);
    return true;
  };
  let guard = 0;
  while (ops.length < Math.min(cfg.ruleCount, all.length) && guard++ < 500) {
    if (ops.length > 0 && rng.chance(cfg.confusing)) {
      const vars = rng.shuffle(radialConfusing(rng.pick(ops), all));
      if (vars.some((v) => tryAdd(v))) continue;
    }
    const used = new Set(ops.map((o) => o.kind));
    const fresh = all.filter((o) => !used.has(o.kind));
    tryAdd(rng.pick(fresh.length && rng.chance(0.75) ? fresh : all));
  }
  const rules = rng.shuffle(ops).map((op, i) => ({ id: i + 1, label: `[${i + 1}]`, op }));
  return { kind: 'radial', seed, level, shape, rules, exampleCells: randomCells(shape, rng, { symbolCount: cfg.symbolCount }) };
}

export const ruleById = <Op>(rules: Rule<Op>[], id: number): Rule<Op> => {
  const r = rules.find((x) => x.id === id);
  if (!r) throw new Error(`없는 규칙 번호 ${id}`);
  return r;
};

/** 모든 규칙이 대칭 회전인지 확인 (테스트·디버그용) */
export function solidRulesAreSymmetries(set: SolidRuleSet): boolean {
  const lab = set.fixedLabeling ?? set.exampleLabeling;
  return set.rules.every((r) => {
    try {
      applyOp(initialState(set.solidId), r.op, lab);
      return symmetryGroup(set.solidId).length > 0;
    } catch {
      return false;
    }
  });
}

// ---------------- 쌓기나무 ----------------

export interface BlockLevelConfig {
  blocks: [number, number];
  box: number;
  steps: [number, number];
  ruleCount: number;
  views: ('front' | 'top' | 'right')[];
  half: boolean;
  rolls: boolean;
  mirror: boolean;
  edits: boolean;
}

export const BLOCK_LEVELS: Record<number, BlockLevelConfig> = {
  1: { blocks: [4, 4], box: 3, steps: [1, 1], ruleCount: 3, views: ['top', 'front'], half: false, rolls: false, mirror: false, edits: false },
  2: { blocks: [4, 5], box: 3, steps: [2, 2], ruleCount: 4, views: ['top', 'front', 'right'], half: false, rolls: false, mirror: false, edits: false },
  3: { blocks: [5, 6], box: 3, steps: [2, 3], ruleCount: 4, views: ['top', 'front', 'right'], half: true, rolls: true, mirror: false, edits: true },
  4: { blocks: [5, 7], box: 3, steps: [3, 3], ruleCount: 5, views: ['top', 'front', 'right'], half: true, rolls: true, mirror: false, edits: true },
  5: { blocks: [6, 8], box: 4, steps: [3, 4], ruleCount: 5, views: ['top', 'front', 'right'], half: true, rolls: true, mirror: true, edits: true },
};

/** 그림만으로 모양을 알 수 있고 돌리면 달라 보이는 쌓기나무 */
export function pickBlocks(rng: Rng, level: number, needChiral = false): Blocks {
  const cfg = BLOCK_LEVELS[Math.min(5, Math.max(1, level))];
  for (let t = 0; t < 400; t++) {
    const b = randomBlocks(rng, rng.range(cfg.blocks[0], cfg.blocks[1]), cfg.box);
    if (b.length < cfg.blocks[0] || !allVisible(b)) continue;
    if (needChiral && !isChiral(b)) continue;
    return b;
  }
  return randomBlocks(rng, cfg.blocks[0], cfg.box);
}

export function generateBlockRuleSet(level: number, seed: number): BlockRuleSet {
  const rng = makeRng(seed);
  const cfg = BLOCK_LEVELS[Math.min(5, Math.max(1, level))];
  const all = rng.shuffle(blockOpCandidates(cfg));
  const ops: BlockOp[] = [];
  // 거울은 레벨 5에서 꼭 하나
  if (cfg.mirror) ops.push({ kind: 'mirror' });
  // 블록을 더하거나 빼는 규칙은 레벨 3부터 1~2개
  if (cfg.edits) {
    const edits = rng.shuffle(all.filter(isEditOp));
    ops.push(...edits.slice(0, level >= 4 ? 2 : 1));
  }
  for (const o of all) {
    if (ops.length >= cfg.ruleCount) break;
    if (isEditOp(o) || isIdentityOp(o) || ops.some((x) => sameEffect(x, o))) continue;
    ops.push(o);
  }
  const shuffled = rng.shuffle(ops);
  return {
    kind: 'block',
    seed,
    level,
    rules: shuffled.map((op, i) => ({ id: i + 1, label: String(i + 1), op })),
    example: pickBlocks(rng, level, true),
  };
}

// ---------------- 그림 정팔면체 ----------------

export function generateOctaRuleSet(level: number, seed: number): OctaRuleSet {
  const rng = makeRng(seed);
  const lv = Math.min(5, Math.max(1, level));
  const cfg = OCTA_LEVELS[lv];
  const all = rng.shuffle(octaOpCandidates(cfg.kinds, cfg.views, cfg.opposite));
  const ops: OctaOp[] = [];
  const effects = new Set<string>();
  const add = (o: OctaOp) => {
    const e = octaEffect(o);
    if (effects.has(e) || ops.length >= cfg.ruleCount) return;
    // 그림 맞바꾸기는 세트에 하나만 (맞붙은 면이든 정반대편이든)
    if (o.kind === 'swapPics' && ops.some((x) => x.kind === 'swapPics')) return;
    // 색 반전도 세트에 하나만
    if (o.kind === 'invert' && ops.some((x) => x.kind === 'invert')) return;
    effects.add(e);
    ops.push(o);
  };
  // 종류마다 하나씩 먼저
  for (const k of ['layer', 'swapPics', 'invert', 'turn'] as const) {
    const o = all.find((x) => x.kind === k);
    if (o) add(o);
  }
  // 헷갈리는 짝: 같은 쪽 4면을 반대 방향으로 돌리기
  if (lv >= 2) {
    const l = ops.find((o) => o.kind === 'layer');
    if (l && l.kind === 'layer') add({ kind: 'layer', view: l.view, dir: l.dir === 'cw' ? 'ccw' : 'cw' });
  }
  for (const o of all) add(o);
  return {
    kind: 'octa',
    seed,
    level: lv,
    rules: rng.shuffle(ops).map((op, i) => ({ id: i + 1, label: String(i + 1), op })),
    example: randomOcta(rng, cfg.picCount),
  };
}
