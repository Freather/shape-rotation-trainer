// 문제 생성기 (유형 1~10 + 규칙 플래시카드) + 오답 보기 생성
// 같은 seed → 같은 문제 (오답노트에서 똑같이 다시 풀기)

import { getSymbol } from '../symbols/library';
import { blockOpCandidates, blocksKey, describeBlockOp, gridKey, type BlockOp, type Blocks, type ViewDir } from './blocks';
import { generateBlockQuestion } from './blockQuestions';
import { generateOctaQuestion } from './octaQuestions';
import { OCTA_LEVELS, describeOctaOp, octaKey, octaOpCandidates, type OctaOp, type OctaState } from './octa';
import { QUAT_IDENTITY, dot, quatMul, type Quat } from './math';
import { defaultRoot, pickNet } from './net';
import { makeRng, type Rng } from './rng';
import { describeOp, inverseOp, symmetryGroup, type RotationOp, type TextPart } from './rotation';
import {
  RADIAL_LEVELS,
  randomCells,
  radialOpCandidates,
} from './radial/generate';
import { radialSignature, type Cells, type RadialShape } from './radial/model';
import { applyRadialOp, applyRadialOps, describeRadialOp, type RadialOp } from './radial/ops';
import {
  SOLID_LEVELS,
  generateRadialRuleSet,
  generateSolidRuleSet,
  randomLabeling,
  ruleById,
  solidOpCandidates,
  type RadialRuleSet,
  type RuleSet,
  type SolidRuleSet,
} from './rules';
import { CAMERA_DIR, adjacentFaces, getSolid, oppositeFace, visibleSlots, type SolidId } from './solids';
import {
  applyOps,
  canonicalLabelSignature,
  lookOf,
  mirror,
  mirrorLabeling,
  slots,
  visibleSignature,
  type Labeling,
  type Look,
  type SlotLook,
  type SolidState,
} from './state';

export type QType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export const BLOCK_TYPES: QType[] = [12, 13, 14, 15, 16, 17, 18, 19];

export const QTYPE_NAMES: Record<QType, string> = {
  1: '규칙 적용 (입체)',
  2: '특정 면 맞히기',
  3: '같은 도형 판별',
  4: '전개도 → 입체',
  5: '입체 → 전개도',
  6: '마주보는 면',
  7: '전개도 + 회전',
  8: '규칙 적용 (평면)',
  9: '규칙 찾기 (평면)',
  10: '회전 순서 찾기',
  11: '규칙 외우기',
  12: '쌓기나무 규칙 적용',
  13: '쌓기나무 돌린 모습',
  14: '같은 쌓기나무 찾기',
  15: '방향별로 본 모양',
  16: '쌓기나무 조각 맞추기',
  17: '두 쌓기나무 합쳐 돌리기',
  18: '세 방향 모양으로 찾기',
  19: '쌓기나무 규칙 찾기',
  20: '그림 정팔면체 규칙 적용',
};

export type MistakeTag =
  | 'correct'
  | 'mirror'
  | 'skipLast'
  | 'reverse'
  | 'symbolRot'
  | 'swapAdj'
  | 'ruleConfuse'
  | 'orderSwap'
  | 'oppositeAdj'
  | 'faceSwap'
  | 'wrongRing'
  | 'missInvert'
  | 'rotVsMove'
  | 'mirrorVsRotate'
  | 'stepOff'
  | 'wrongSymbol'
  | 'wrongJudge'
  | 'wrongRule'
  | 'blockMoved'
  | 'otherView'
  | 'cellOff'
  | 'wrongPiece'
  | 'wrongSide'
  | 'layerVsPic'
  | 'nearVsOpposite'
  | 'random';

export const MISTAKE_NAMES: Record<MistakeTag, string> = {
  correct: '정답',
  mirror: '거울상',
  skipLast: '단계 누락',
  reverse: '방향 반대',
  symbolRot: '기호 방향 오류',
  swapAdj: '이웃 면 기호 바뀜',
  ruleConfuse: '규칙 착각',
  orderSwap: '규칙 순서 바꿈',
  oppositeAdj: '마주보는 면을 이웃으로',
  faceSwap: '면 위치 바뀜',
  wrongRing: '다른 층에 적용',
  missInvert: '색반전 누락/오적용',
  rotVsMove: '전체 회전 ↔ 그림 이동 착각',
  mirrorVsRotate: '대칭 ↔ 회전 착각',
  stepOff: '칸 수 틀림',
  wrongSymbol: '다른 면',
  wrongJudge: '판별 오류',
  wrongRule: '규칙 오판',
  blockMoved: '블록 하나 위치 다름',
  otherView: '다른 방향에서 본 모양',
  cellOff: '칸 하나 틀림',
  wrongPiece: '맞지 않는 조각',
  wrongSide: '붙이는 방향 틀림',
  layerVsPic: '4면 돌리기 ↔ 그림만 옮기기 착각',
  nearVsOpposite: '맞붙은 면 ↔ 정반대편 면 착각',
  random: '기타',
};

export type Figure =
  | { kind: 'solid'; look: Look; caption?: string }
  | { kind: 'net'; solidId: SolidId; edges: number[]; root: number; labeling: Labeling; mark?: number; rootLabel?: boolean }
  | { kind: 'radial'; shape: RadialShape; cells: Cells; caption?: string }
  | { kind: 'face'; solidId: SolidId; slot: number; look: SlotLook }
  | { kind: 'symbol'; symbol: string }
  | { kind: 'text'; parts: TextPart[] }
  | { kind: 'ox'; value: boolean }
  | { kind: 'blocks'; cells: Blocks; caption?: string; colors?: string[]; viewMarks?: ViewDir[] }
  | { kind: 'grid'; grid: boolean[][]; caption?: string }
  | { kind: 'octa'; state: OctaState; caption?: string };

export interface Option {
  figure: Figure;
  tag: MistakeTag;
}

export type Solution =
  | { kind: 'solid'; solidId: SolidId; labeling: Labeling; initial: SolidState; ops: RotationOp[]; labels: string[]; focusFace?: number }
  | { kind: 'fold'; solidId: SolidId; labeling: Labeling; edges: number[]; root: number; finalQ: Quat; ops: RotationOp[]; labels: string[]; highlight?: number[]; note?: string }
  | { kind: 'radial'; shape: RadialShape; cells: Cells; ops: RadialOp[]; labels: string[] }
  | { kind: 'text'; parts: TextPart[][] }
  | { kind: 'blocks'; initial: Blocks; steps: { op: BlockOp; label: TextPart[]; axisLabel?: string }[]; note?: string; colors?: string[] }
  | { kind: 'figs'; figs: Figure[]; parts: TextPart[][] }
  | { kind: 'octa'; initial: OctaState; steps: { op: OctaOp; label: string }[] };

/** 연습할 때 옆에 띄우는 "직접 돌려보기" 판의 시작 상태 */
export type Scratch =
  | { kind: 'solid'; solidId: SolidId; labeling: Labeling; initial: SolidState; net?: { edges: number[]; root: number } }
  | { kind: 'radial'; shape: RadialShape; cells: Cells }
  | { kind: 'blocks'; cells: Blocks; colors?: string[] }
  | { kind: 'octa'; state: OctaState };

export interface Question {
  scratch?: Scratch;
  type: QType;
  level: number;
  seed: number;
  setSeed?: number;
  solidId?: SolidId;
  prompt: string;
  stem: Figure[];
  /** 규칙 번호 순서 (유형 1·8) */
  seq?: number[];
  /** 문장으로 쓴 회전 지시 (유형 2·7) */
  stemOps?: TextPart[][];
  options: Option[];
  answer: number;
  solution: Solution;
}

export interface GenParams {
  type: QType;
  level: number;
  seed: number;
  ruleSet?: RuleSet;
  solidId?: SolidId;
}

// ---------------- 공통 도우미 ----------------

const LETTER = ['①', '②', '③', '④', '⑤'];
export const optionMark = (i: number) => LETTER[i] ?? `${i + 1}`;

/** 후보 중 서로 다른 것만 골라 정답 + 오답 (count−1)개 → 섞어서 반환 */
export function assemble<T>(
  rng: Rng,
  correct: T,
  candidates: { item: T; tag: MistakeTag }[],
  key: (t: T) => string,
  filler: () => { item: T; tag: MistakeTag } | null,
  toFigure: (t: T) => Figure,
  count = 5,
  invalid: (t: T) => boolean = () => false,
): { options: Option[]; answer: number } {
  const chosen: { item: T; tag: MistakeTag }[] = [{ item: correct, tag: 'correct' }];
  const keys = new Set([key(correct)]);
  const add = (c: { item: T; tag: MistakeTag }) => {
    const k = key(c.item);
    if (keys.has(k) || invalid(c.item)) return;
    keys.add(k);
    chosen.push(c);
  };
  for (const c of candidates) {
    if (chosen.length >= count) break;
    add(c);
  }
  let guard = 0;
  while (chosen.length < count && guard++ < 400) {
    const f = filler();
    if (f) add(f);
  }
  const order = rng.shuffle(chosen.map((_, i) => i));
  return {
    options: order.map((i) => ({ figure: toFigure(chosen[i].item), tag: chosen[i].tag })),
    answer: order.indexOf(0),
  };
}

const solidFig = (look: Look): Figure => ({ kind: 'solid', look });

/** 보이는 면 하나의 기호 방향을 한 칸 틀리게 */
function perturbRot(look: Look, rng: Rng): Look {
  const solid = getSolid(look.solidId);
  const vis = visibleSlots(solid);
  const s = rng.pick(vis);
  const slotsCopy = look.slots.map((x) => ({ ...x }));
  slotsCopy[s].rot = (slotsCopy[s].rot + rng.pick([1, solid.sides - 1, ...(solid.sides >= 4 ? [2] : [])])) % solid.sides;
  return { ...look, slots: slotsCopy };
}

/** 보이는 이웃 면 두 개의 기호를 맞바꿈 */
function swapAdjacent(look: Look, rng: Rng): Look | null {
  const solid = getSolid(look.solidId);
  const vis = visibleSlots(solid);
  const pairs: [number, number][] = [];
  for (const a of vis) for (const b of vis) if (a < b && adjacentFaces(solid, a, b)) pairs.push([a, b]);
  if (!pairs.length) return null;
  const [a, b] = rng.pick(pairs);
  const s = look.slots.map((x) => ({ ...x }));
  [s[a].symbol, s[b].symbol] = [s[b].symbol, s[a].symbol];
  [s[a].flip, s[b].flip] = [s[b].flip && getSymbol(s[b].symbol).chiral, s[a].flip && getSymbol(s[a].symbol).chiral];
  return { ...look, slots: s };
}

/** 보이는 면 하나를, 다른 보이는 면의 정반대 면 기호로 바꿈 (마주보는 면이 이웃해 보임) */
function oppositeAsAdjacent(look: Look, lab: Labeling, state: SolidState, rng: Rng): Look | null {
  const solid = getSolid(look.solidId);
  const vis = visibleSlots(solid);
  const info = slots(state);
  const cands: [number, number][] = [];
  for (const a of vis) {
    const opp = oppositeFace(solid, info[a].face);
    if (opp === null) continue;
    for (const b of vis) if (b !== a) cands.push([b, opp]);
  }
  if (!cands.length) return null;
  const [slot, face] = rng.pick(cands);
  const s = look.slots.map((x) => ({ ...x }));
  s[slot] = { symbol: lab[face].symbol, rot: s[slot].rot, flip: false };
  return { ...look, slots: s };
}

const randomGroupState = (solidId: SolidId, rng: Rng): SolidState => ({ solidId, q: rng.pick(symmetryGroup(solidId)), mirrored: false });

/** 이 모습이 라벨 입체를 어떤 방향으로 돌려서 볼 수 있는 모습인지 */
function isViewOf(look: Look, solidId: SolidId, lab: Labeling): boolean {
  const sig = visibleSignature(look);
  return symmetryGroup(solidId).some((g) => visibleSignature(lookOf({ solidId, q: g, mirrored: false }, lab)) === sig);
}

/** 마지막 상태에서 가장 정면에 있는 면 (풀이에서 주목할 면) */
function frontFace(state: SolidState): number {
  const solid = getSolid(state.solidId);
  const info = slots(state);
  let best = 0;
  for (const f of solid.faces) if (dot(f.normal, CAMERA_DIR) > dot(solid.faces[best].normal, CAMERA_DIR)) best = f.id;
  return info[best].face;
}

/** 그림에 안 보이는 면도 알 수 있게 옆에 붙이는 전개도 (문제 rng와 따로 뽑아서 같은 seed면 같은 문제) */
function hiddenFacesNet(solidId: SolidId, lab: Labeling, seed: number): Figure {
  return netFig(solidId, pickNet(solidId, makeRng(seed ^ 0x6e6574)), lab);
}

// ---------------- 유형 1: 규칙 적용형 (입체) ----------------

function genSolidRule(p: GenParams, set: SolidRuleSet): Question {
  const rng = makeRng(p.seed);
  const cfg = SOLID_LEVELS[set.level];
  const solidId = set.solidId;
  const lab = set.fixedLabeling ?? randomLabeling(solidId, rng);
  const initial = set.level <= 1 && !set.fixedLabeling ? { solidId, q: QUAT_IDENTITY, mirrored: false } : randomGroupState(solidId, rng);
  const nSteps = Math.min(rng.range(cfg.steps[0], cfg.steps[1]), 5);
  const seq: number[] = [];
  for (let i = 0; i < nSteps; i++) {
    let id = rng.pick(set.rules).id;
    if (seq.length && id === seq[seq.length - 1] && set.rules.length > 1) id = rng.pick(set.rules.filter((r) => r.id !== id)).id;
    seq.push(id);
  }
  const opsOf = (ids: number[]) => ids.map((id) => ruleById(set.rules, id).op);
  const ops = opsOf(seq);
  const run = (o: RotationOp[]) => lookOf(applyOps(initial, o, lab), lab);
  const ansState = applyOps(initial, ops, lab);
  const ans = lookOf(ansState, lab);

  const cands: { item: Look; tag: MistakeTag }[] = [];
  const i = rng.int(nSteps);
  cands.push({ item: lookOf(mirror(ansState), lab), tag: 'mirror' });
  // 규칙 착각: 한 단계를 다른 규칙으로
  const others = set.rules.filter((r) => r.id !== seq[i]);
  if (others.length) {
    const s2 = [...seq];
    s2[i] = rng.pick(others).id;
    cands.push({ item: run(opsOf(s2)), tag: 'ruleConfuse' });
  }
  if (nSteps >= 2) {
    const j = rng.int(nSteps - 1);
    const s2 = [...seq];
    [s2[j], s2[j + 1]] = [s2[j + 1], s2[j]];
    cands.push({ item: run(opsOf(s2)), tag: 'orderSwap' });
  }
  const rev = [...ops];
  rev[i] = inverseOp(rev[i]);
  cands.push({ item: run(rev), tag: 'reverse' });
  cands.push({ item: run(ops.slice(0, -1)), tag: 'skipLast' });
  cands.push({ item: perturbRot(ans, rng), tag: 'symbolRot' });
  const sw = swapAdjacent(ans, rng);
  if (sw) cands.push({ item: sw, tag: 'swapAdj' });
  // 레벨 5는 거울상을 반드시 포함, 그 외는 섞어서
  const ordered = set.level >= 5 ? [cands[0], ...rng.shuffle(cands.slice(1))] : rng.shuffle(cands);

  const { options, answer } = assemble(
    rng,
    ans,
    ordered,
    visibleSignature,
    () => (rng.chance(0.5) ? { item: perturbRot(ans, rng), tag: 'symbolRot' } : { item: lookOf(randomGroupState(solidId, rng), lab), tag: 'random' }),
    solidFig,
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial },
    type: 1,
    level: p.level,
    seed: p.seed,
    setSeed: set.seed,
    solidId,
    prompt: '도형에 규칙을 순서대로 적용한 결과로 알맞은 것은? 안 보이는 면은 같이 있는 전개도로 확인해요.',
    stem: [solidFig(lookOf(initial, lab)), hiddenFacesNet(solidId, lab, p.seed)],
    seq,
    options,
    answer,
    solution: {
      kind: 'solid',
      solidId,
      labeling: lab,
      initial,
      ops,
      labels: seq.map((id) => `[${id}]`),
      focusFace: frontFace(ansState),
    },
  };
}

// ---------------- 유형 2: 특정 면 맞히기 ----------------

function explicitOps(solidId: SolidId, level: number, lab: Labeling, rng: Rng, n: number): RotationOp[] {
  const cfg = SOLID_LEVELS[Math.min(5, Math.max(1, level))];
  const all = solidOpCandidates(solidId, lab, cfg);
  return Array.from({ length: n }, () => rng.pick(all));
}

function pickSolid(p: GenParams, rng: Rng): SolidId {
  return p.solidId ?? rng.pick(SOLID_LEVELS[Math.min(5, Math.max(1, p.level))].solids);
}

function genFaceQuestion(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = pickSolid(p, rng);
  const solid = getSolid(solidId);
  const lab = randomLabeling(solidId, rng);
  const initial = randomGroupState(solidId, rng);
  const ops = explicitOps(solidId, p.level, lab, rng, Math.max(1, Math.min(3, p.level)));
  const final = applyOps(initial, ops, lab);
  const slotChoices: [number, string][] = solidId === 'cube' ? [[2, '앞면'], [0, '윗면'], [4, '오른쪽 면']] : [[0, '정면']];
  const [slot, slotName] = rng.pick(slotChoices);
  const ans = lookOf(final, lab).slots[slot];
  const key = (s: SlotLook) => `${s.symbol}.${s.rot}${s.flip ? 'm' : ''}`;
  const cands: { item: SlotLook; tag: MistakeTag }[] = [];
  for (let d = 1; d < solid.sides; d++) cands.push({ item: { ...ans, rot: (ans.rot + d) % solid.sides }, tag: 'symbolRot' });
  const rev = [...ops];
  rev[rev.length - 1] = inverseOp(rev[rev.length - 1]);
  cands.push({ item: lookOf(applyOps(initial, rev, lab), lab).slots[slot], tag: 'reverse' });
  cands.push({ item: lookOf(applyOps(initial, ops.slice(0, -1), lab), lab).slots[slot], tag: 'skipLast' });
  cands.push({ item: lookOf(mirror(final), lab).slots[slot], tag: 'mirror' });
  const ordered = [...rng.shuffle(cands.filter((c) => c.tag !== 'symbolRot')).slice(0, 2), ...rng.shuffle(cands.filter((c) => c.tag === 'symbolRot'))];
  const { options, answer } = assemble(
    rng,
    ans,
    ordered,
    key,
    () => ({ item: { symbol: rng.pick(lab).symbol, rot: rng.int(solid.sides), flip: false }, tag: 'wrongSymbol' }),
    (s) => ({ kind: 'face', solidId, slot, look: s }),
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial },
    type: 2,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: `아래 순서로 돌린 뒤 ${slotName}에 오는 그림은? 안 보이는 면은 같이 있는 전개도로 확인해요. 보기는 그 면을 정면에서 본 모습이에요.${slot === 0 && solidId === 'cube' ? ' 윗면은 화면 위쪽이 뒤쪽이에요.' : ''}`,
    stem: [solidFig(lookOf(initial, lab)), hiddenFacesNet(solidId, lab, p.seed)],
    stemOps: ops.map(describeOp),
    options,
    answer,
    solution: { kind: 'solid', solidId, labeling: lab, initial, ops, labels: ops.map((_, i) => `${i + 1}단계`), focusFace: slots(final)[slot].face },
  };
}

// ---------------- 유형 3: 같은 도형 판별 ----------------

/** 두 그림이 같은 입체(회전만으로 일치)일 수 있는지: 보이는 면 정보만으로 판단 */
export function viewsConsistent(a: Look, b: Look): boolean {
  const solidId = a.solidId;
  const solid = getSolid(solidId);
  const n = solid.sides;
  const visA = visibleSlots(solid);
  const visB = visibleSlots(solid);
  const symsA = new Set(visA.map((s) => a.slots[s].symbol));
  for (const g of symmetryGroup(solidId)) {
    const info = slots({ solidId, q: g, mirrored: false });
    let ok = true;
    for (const x of info) {
      if (!visB.includes(x.slot)) continue;
      const bl = b.slots[x.slot];
      if (visA.includes(x.face)) {
        const al = a.slots[x.face];
        const rot = (x.rot + al.rot) % n;
        if (al.symbol !== bl.symbol || rot !== bl.rot || al.flip !== bl.flip) {
          ok = false;
          break;
        }
      } else if (symsA.has(bl.symbol)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function genSameDiff(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = p.solidId ?? (p.level >= 3 ? rng.pick<SolidId>(['cube', 'octa']) : 'cube');
  const solid = getSolid(solidId);
  const lab = randomLabeling(solidId, rng);
  const edges = pickNet(solidId, rng);
  const sB = randomGroupState(solidId, rng);
  const same = rng.chance(0.5);
  const truth = lookOf(sB, lab);
  let lookB: Look = truth;
  let why = '';
  if (!same) {
    for (let tries = 0; tries < 200; tries++) {
      const lab2 = lab.map((l) => ({ ...l }));
      const kind = rng.int(3);
      if (kind === 0) {
        lookB = lookOf(sB, mirrorLabeling(solidId, lab));
        why = '(나)는 거울에 비친 모습이에요. 한 꼭짓점을 둘러싼 면의 순서가 전개도와 반대 방향이에요.';
      } else if (kind === 1) {
        const f = rng.int(lab.length);
        lab2[f].rot = (lab2[f].rot + 1 + rng.int(solid.sides - 1)) % solid.sides;
        lookB = lookOf(sB, lab2);
        why = '면 위치는 맞지만 노란 면의 그림 방향이 전개도와 달라요.';
      } else {
        const e = rng.pick(solid.edges);
        [lab2[e.faces[0]], lab2[e.faces[1]]] = [lab2[e.faces[1]], lab2[e.faces[0]]];
        lookB = lookOf(sB, lab2);
        why = '노란 면들에 오는 그림이 전개도와 달라요. 이웃한 두 면의 그림이 서로 바뀌어 있어요.';
      }
      if (!isViewOf(lookB, solidId, lab)) break;
    }
  }
  // 전개도를 접어 (나)와 같은 방향으로 돌린 모습과 다른 면을 노랗게
  const info = slots(sB);
  const diff = visibleSlots(solid)
    .filter((sl) => {
      const x = truth.slots[sl];
      const y = lookB.slots[sl];
      return x.symbol !== y.symbol || x.rot !== y.rot || x.flip !== y.flip;
    })
    .map((sl) => info[sl].face);
  const options: Option[] = [
    { figure: { kind: 'ox', value: true }, tag: same ? 'correct' : 'wrongJudge' },
    { figure: { kind: 'ox', value: false }, tag: same ? 'wrongJudge' : 'correct' },
  ];
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial: { solidId, q: QUAT_IDENTITY, mirrored: false }, net: { edges, root: defaultRoot(solidId) } },
    type: 3,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: '왼쪽 전개도를 접어 만든 도형을 돌려서 오른쪽 모습이 될 수 있나요?',
    stem: [netFig(solidId, edges, lab), { kind: 'solid', look: lookB, caption: '(나)' }],
    options,
    answer: same ? 0 : 1,
    solution: {
      kind: 'fold',
      solidId,
      labeling: lab,
      edges,
      root: defaultRoot(solidId),
      finalQ: sB.q,
      ops: [],
      labels: [],
      highlight: same ? undefined : diff,
      note: same ? '전개도를 접어 돌리면 (나)와 똑같아져요.' : `전개도를 접어 (나)와 같은 방향으로 돌린 모습이에요. ${why}`,
    },
  };
}

// ---------------- 유형 4·5·6·7: 전개도 ----------------

/** 두 번째 시점: 첫 시점에서 안 보이던 면을 최대한 보여주는 회전 */
function backViewRotation(solidId: SolidId): Quat {
  const solid = getSolid(solidId);
  const vis = new Set(visibleSlots(solid));
  let best: Quat = QUAT_IDENTITY;
  let bestCount = -1;
  for (const g of symmetryGroup(solidId)) {
    const info = slots({ solidId, q: g, mirrored: false });
    const newly = visibleSlots(solid).filter((s) => !vis.has(info[s].face)).length;
    if (newly > bestCount) {
      bestCount = newly;
      best = g;
    }
  }
  return best;
}

function netFig(solidId: SolidId, edges: number[], lab: Labeling, extra: Partial<Extract<Figure, { kind: 'net' }>> = {}): Figure {
  return { kind: 'net', solidId, edges, root: defaultRoot(solidId), labeling: lab, ...extra };
}

function genNetToSolid(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = p.solidId ?? (p.level >= 3 ? rng.pick<SolidId>(['cube', 'octa']) : 'cube');
  const lab = randomLabeling(solidId, rng);
  const edges = pickNet(solidId, rng);
  const st = randomGroupState(solidId, rng);
  const ans = lookOf(st, lab);
  const cands: { item: Look; tag: MistakeTag }[] = [
    { item: perturbRot(ans, rng), tag: 'symbolRot' },
    { item: lookOf(mirror(st), lab), tag: 'mirror' },
  ];
  const sw = swapAdjacent(ans, rng);
  if (sw) cands.push({ item: sw, tag: 'faceSwap' });
  const oa = oppositeAsAdjacent(ans, lab, st, rng);
  if (oa) cands.push({ item: oa, tag: 'oppositeAdj' });
  const { options, answer } = assemble(
    rng,
    ans,
    rng.shuffle(cands),
    visibleSignature,
    () => {
      const r = rng.int(3);
      if (r === 0) return { item: perturbRot(lookOf(randomGroupState(solidId, rng), lab), rng), tag: 'symbolRot' };
      if (r === 1) return { item: lookOf(randomGroupState(solidId, rng), mirrorLabeling(solidId, lab)), tag: 'mirror' };
      const s2 = randomGroupState(solidId, rng);
      const x = swapAdjacent(lookOf(s2, lab), rng);
      return x ? { item: x, tag: 'faceSwap' } : null;
    },
    solidFig,
    5,
    (l) => isViewOf(l, solidId, lab),
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial: { solidId, q: QUAT_IDENTITY, mirrored: false }, net: { edges, root: defaultRoot(solidId) } },
    type: 4,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: '전개도를 접어서 만들 수 있는 입체는?',
    stem: [netFig(solidId, edges, lab)],
    options,
    answer,
    solution: { kind: 'fold', solidId, labeling: lab, edges, root: defaultRoot(solidId), finalQ: st.q, ops: [], labels: [] },
  };
}

function genSolidToNet(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = p.solidId ?? (p.level >= 3 ? rng.pick<SolidId>(['cube', 'octa']) : 'cube');
  const solid = getSolid(solidId);
  const lab = randomLabeling(solidId, rng);
  const edges = pickNet(solidId, rng);
  const s1 = randomGroupState(solidId, rng);
  const s2 = { ...s1, q: quatMul(s1.q, backViewRotation(solidId)) };
  const v1 = lookOf(s1, lab);
  const v2 = lookOf(s2, lab);
  const group = symmetryGroup(solidId);
  const canon = (l: Labeling) => canonicalLabelSignature(solidId, l, group);
  const consistent = (l: Labeling) =>
    group.some((h) => {
      const a = lookOf({ solidId, q: quatMul(h, s1.q), mirrored: false }, l);
      const b = lookOf({ solidId, q: quatMul(h, s2.q), mirrored: false }, l);
      return visibleSignature(a) === visibleSignature(v1) && visibleSignature(b) === visibleSignature(v2);
    });
  const modRot = (): Labeling => {
    const l = lab.map((x) => ({ ...x }));
    const f = rng.int(l.length);
    l[f].rot = (l[f].rot + 1 + rng.int(solid.sides - 1)) % solid.sides;
    return l;
  };
  const modSwap = (adj: boolean): Labeling => {
    const l = lab.map((x) => ({ ...x }));
    let a: number, b: number;
    if (adj) {
      const e = rng.pick(solid.edges);
      [a, b] = e.faces;
    } else {
      a = rng.int(l.length);
      b = oppositeFace(solid, a) ?? (a + 1) % l.length;
    }
    [l[a], l[b]] = [l[b], l[a]];
    return l;
  };
  const cands = rng.shuffle([
    { item: modRot(), tag: 'symbolRot' as MistakeTag },
    { item: mirrorLabeling(solidId, lab), tag: 'mirror' as MistakeTag },
    { item: modSwap(true), tag: 'faceSwap' as MistakeTag },
    { item: modSwap(false), tag: 'oppositeAdj' as MistakeTag },
  ]);
  const { options, answer } = assemble(
    rng,
    lab,
    cands,
    canon,
    () => {
      const r = rng.int(3);
      return r === 0 ? { item: modRot(), tag: 'symbolRot' } : r === 1 ? { item: modSwap(true), tag: 'faceSwap' } : { item: modSwap(false), tag: 'oppositeAdj' };
    },
    (l) => netFig(solidId, edges, l),
    5,
    consistent,
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial: s1 },
    type: 5,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: '같은 입체를 두 방향에서 본 그림이다. 이 입체의 전개도는?',
    stem: [
      { kind: 'solid', look: v1, caption: '(가)' },
      { kind: 'solid', look: v2, caption: '(나) 뒤쪽에서 본 모습' },
    ],
    options,
    answer,
    solution: { kind: 'fold', solidId, labeling: lab, edges, root: defaultRoot(solidId), finalQ: s1.q, ops: [], labels: [] },
  };
}

function genOpposite(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = p.solidId && p.solidId !== 'tetra' ? p.solidId : p.level >= 3 ? rng.pick<SolidId>(['cube', 'octa']) : 'cube';
  const solid = getSolid(solidId);
  const lab = randomLabeling(solidId, rng);
  const edges = pickNet(solidId, rng);
  const f = rng.int(solid.faces.length);
  const o = oppositeFace(solid, f)!;
  const others = rng.shuffle(solid.faces.map((x) => x.id).filter((x) => x !== f && x !== o));
  const { options, answer } = assemble(
    rng,
    o,
    others.map((x) => ({ item: x, tag: 'wrongSymbol' as MistakeTag })),
    (x) => String(x),
    () => null,
    (x) => ({ kind: 'symbol', symbol: lab[x].symbol }),
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial: { solidId, q: QUAT_IDENTITY, mirrored: false }, net: { edges, root: defaultRoot(solidId) } },
    type: 6,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: '전개도를 접었을 때 굵은 테두리 면의 맞은편에 오는 그림은?',
    stem: [netFig(solidId, edges, lab, { mark: f })],
    options,
    answer,
    solution: { kind: 'fold', solidId, labeling: lab, edges, root: defaultRoot(solidId), finalQ: QUAT_IDENTITY, ops: [], labels: [], highlight: [f, o] },
  };
}

function genNetRotate(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = p.solidId ?? (p.level >= 4 ? rng.pick<SolidId>(['cube', 'octa']) : 'cube');
  const lab = randomLabeling(solidId, rng);
  const edges = pickNet(solidId, rng);
  const initial: SolidState = { solidId, q: QUAT_IDENTITY, mirrored: false };
  const n = Math.max(1, Math.min(3, p.level - 1));
  const ops = explicitOps(solidId, Math.min(p.level, 2), lab, rng, n);
  const final = applyOps(initial, ops, lab);
  const ans = lookOf(final, lab);
  const run = (o: RotationOp[]) => lookOf(applyOps(initial, o, lab), lab);
  const rev = [...ops];
  rev[rev.length - 1] = inverseOp(rev[rev.length - 1]);
  const cands = rng.shuffle<{ item: Look; tag: MistakeTag }>([
    { item: lookOf(mirror(final), lab), tag: 'mirror' },
    { item: run(rev), tag: 'reverse' },
    { item: run(ops.slice(0, -1)), tag: 'skipLast' },
    { item: perturbRot(ans, rng), tag: 'symbolRot' },
    ...(swapAdjacent(ans, rng) ? [{ item: swapAdjacent(ans, rng)!, tag: 'faceSwap' as MistakeTag }] : []),
  ]);
  const { options, answer } = assemble(
    rng,
    ans,
    cands,
    visibleSignature,
    () => ({ item: perturbRot(lookOf(randomGroupState(solidId, rng), lab), rng), tag: 'random' }),
    solidFig,
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial, net: { edges, root: defaultRoot(solidId) } },
    type: 7,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: "'앞' 면이 정면에 똑바로 오도록 접은 뒤 아래 순서로 돌린 모습은?",
    stem: [netFig(solidId, edges, lab, { rootLabel: true })],
    stemOps: ops.map(describeOp),
    options,
    answer,
    solution: { kind: 'fold', solidId, labeling: lab, edges, root: defaultRoot(solidId), finalQ: QUAT_IDENTITY, ops, labels: ops.map((_, i) => `${i + 1}단계`) },
  };
}

// ---------------- 유형 8: 규칙 적용형 (평면) ----------------

function genRadialRule(p: GenParams, set: RadialRuleSet): Question {
  const rng = makeRng(p.seed);
  const cfg = RADIAL_LEVELS[set.level];
  const shape = set.shape;
  const cells = randomCells(shape, rng, { symbolCount: cfg.symbolCount });
  const nSteps = rng.range(cfg.steps[0], cfg.steps[1]);
  const seq: number[] = [];
  for (let i = 0; i < nSteps; i++) {
    let id = rng.pick(set.rules).id;
    if (seq.length && id === seq[seq.length - 1] && set.rules.length > 1) id = rng.pick(set.rules.filter((r) => r.id !== id)).id;
    seq.push(id);
  }
  const opsOf = (ids: number[]) => ids.map((id) => ruleById(set.rules, id).op);
  const ops = opsOf(seq);
  const run = (o: RadialOp[]) => applyRadialOps(shape, cells, o);
  const ans = run(ops);
  const key = (c: Cells) => radialSignature(shape, c);
  const cands: { item: Cells; tag: MistakeTag }[] = [];
  const variants = (op: RadialOp): { op: RadialOp[]; tag: MistakeTag }[] => {
    const v: { op: RadialOp[]; tag: MistakeTag }[] = [];
    const flip = (d: 'cw' | 'ccw') => (d === 'cw' ? 'ccw' : 'cw');
    switch (op.kind) {
      case 'rotate':
        v.push({ op: [{ ...op, dir: flip(op.dir) }], tag: 'reverse' });
        v.push({ op: [op, { kind: 'spinSymbols', dir: flip(op.dir), angle: op.angle }], tag: 'rotVsMove' });
        break;
      case 'rotateRing':
        v.push({ op: [{ ...op, dir: flip(op.dir) }], tag: 'reverse' });
        v.push({ op: [{ ...op, ring: (op.ring + 1 + rng.int(2)) % 3 }], tag: 'wrongRing' });
        v.push({ op: [{ ...op, steps: op.steps + 1 }], tag: 'stepOff' });
        break;
      case 'rotateOpposite':
        v.push({ op: [{ ...op, dir: flip(op.dir) }], tag: 'reverse' });
        break;
      case 'mirror':
        v.push({ op: [{ kind: 'rotate', dir: 'cw', angle: 180 }], tag: 'mirrorVsRotate' });
        break;
      case 'invert':
        v.push({ op: [], tag: 'missInvert' });
        break;
      case 'invertRing':
        v.push({ op: [], tag: 'missInvert' });
        v.push({ op: [{ ...op, ring: (op.ring + 1 + rng.int(2)) % 3 }], tag: 'wrongRing' });
        break;
      case 'invertSymbolCells':
        v.push({ op: [{ kind: 'invert' }], tag: 'missInvert' });
        break;
      case 'moveSymbols':
        v.push({ op: [{ ...op, dir: flip(op.dir) }], tag: 'reverse' });
        v.push({ op: [{ ...op, withRot: !op.withRot }], tag: 'rotVsMove' });
        v.push({ op: [{ ...op, steps: op.steps + 1 }], tag: 'stepOff' });
        break;
      case 'spinSymbols':
        v.push({ op: [{ ...op, dir: flip(op.dir) }], tag: 'reverse' });
        break;
      case 'flipSymbols':
        v.push({ op: [{ kind: 'spinSymbols', dir: 'cw', angle: 180 }], tag: 'mirrorVsRotate' });
        break;
      case 'swapSymbolRings':
        v.push({ op: [], tag: 'skipLast' });
        break;
      case 'shiftSymbolRings':
        v.push({ op: [{ ...op, dir: op.dir === 'out' ? 'in' : 'out' }], tag: 'reverse' });
        break;
    }
    return v;
  };
  for (let i = 0; i < ops.length; i++)
    for (const v of variants(ops[i])) {
      try {
        cands.push({ item: run([...ops.slice(0, i), ...v.op, ...ops.slice(i + 1)]), tag: v.tag });
      } catch {
        /* 적용 불가한 변형은 버림 */
      }
    }
  if (nSteps >= 2) {
    const j = rng.int(nSteps - 1);
    const s2 = [...seq];
    [s2[j], s2[j + 1]] = [s2[j + 1], s2[j]];
    cands.push({ item: run(opsOf(s2)), tag: 'orderSwap' });
    cands.push({ item: run(ops.slice(0, -1)), tag: 'skipLast' });
  }
  const others = set.rules.filter((r) => r.id !== seq[0]);
  if (others.length) {
    const s2 = [...seq];
    s2[rng.int(nSteps)] = rng.pick(others).id;
    cands.push({ item: run(opsOf(s2)), tag: 'ruleConfuse' });
  }
  const { options, answer } = assemble(
    rng,
    ans,
    rng.shuffle(cands),
    key,
    () => {
      const c = ans.map((r) => r.map((x) => ({ ...x })));
      const r = rng.int(3);
      const k = rng.int(shape.sectors[r]);
      c[r][k].fill = 1 - c[r][k].fill;
      return { item: c, tag: 'random' };
    },
    (c) => ({ kind: 'radial', shape, cells: c }),
  );
  return {
    scratch: { kind: 'radial', shape, cells },
    type: 8,
    level: p.level,
    seed: p.seed,
    setSeed: set.seed,
    prompt: '도형에 규칙을 순서대로 적용한 결과로 알맞은 것은?',
    stem: [{ kind: 'radial', shape, cells }],
    seq,
    options,
    answer,
    solution: { kind: 'radial', shape, cells, ops, labels: seq.map((id) => `[${id}]`) },
  };
}

// ---------------- 유형 9: 평면 규칙 찾기 ----------------

function genRadialFind(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const level = Math.min(4, Math.max(1, p.level));
  const set = generateRadialRuleSet(level, p.seed ^ 0x5bd1e995);
  const shape = set.shape;
  const cells = randomCells(shape, rng, { symbolCount: RADIAL_LEVELS[level].symbolCount + 1 });
  const all = rng.shuffle(radialOpCandidates(shape, RADIAL_LEVELS[Math.max(3, level)].kinds));
  const before = radialSignature(shape, cells);
  const usable = all.filter((op) => radialSignature(shape, applyRadialOp(shape, cells, op)) !== before);
  const correct = usable[0];
  const resultKey = (op: RadialOp) => radialSignature(shape, applyRadialOp(shape, cells, op));
  const { options, answer } = assemble(
    rng,
    correct,
    usable.slice(1).map((op) => ({ item: op, tag: 'wrongRule' as MistakeTag })),
    resultKey,
    () => null,
    (op) => ({ kind: 'text', parts: describeRadialOp(op) }),
  );
  return {
    scratch: { kind: 'radial', shape, cells },
    type: 9,
    level: p.level,
    seed: p.seed,
    prompt: '왼쪽 도형이 오른쪽처럼 바뀌었다. 적용한 규칙은?',
    stem: [
      { kind: 'radial', shape, cells, caption: '전' },
      { kind: 'radial', shape, cells: applyRadialOp(shape, cells, correct), caption: '후' },
    ],
    options,
    answer,
    solution: { kind: 'radial', shape, cells, ops: [correct], labels: ['적용된 규칙'] },
  };
}

// ---------------- 유형 10: 역추적 ----------------

function genBacktrack(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const solidId = pickSolid(p, rng);
  const lab = randomLabeling(solidId, rng);
  const initial = randomGroupState(solidId, rng);
  const n = p.level >= 3 ? 3 : 2;
  const seq = explicitOps(solidId, Math.max(2, p.level), lab, rng, n);
  const final = lookOf(applyOps(initial, seq, lab), lab);
  const finalSig = visibleSignature(final);
  const resultOf = (ops: RotationOp[]) => visibleSignature(lookOf(applyOps(initial, ops, lab), lab));
  const cands: { item: RotationOp[]; tag: MistakeTag }[] = [];
  cands.push({ item: [...seq].reverse(), tag: 'orderSwap' });
  for (let i = 0; i < n; i++) {
    const s = [...seq];
    s[i] = inverseOp(s[i]);
    cands.push({ item: s, tag: 'reverse' });
  }
  const { options, answer } = assemble(
    rng,
    seq,
    rng.shuffle(cands),
    (ops) => JSON.stringify(ops),
    () => ({ item: explicitOps(solidId, Math.max(2, p.level), lab, rng, n), tag: 'random' }),
    (ops) => ({ kind: 'text', parts: ops.flatMap((o, i) => [...(i ? [' → '] : []), ...describeOp(o)]) }),
    5,
    (ops) => resultOf(ops) === finalSig && JSON.stringify(ops) !== JSON.stringify(seq),
  );
  return {
    scratch: { kind: 'solid', solidId, labeling: lab, initial },
    type: 10,
    level: p.level,
    seed: p.seed,
    solidId,
    prompt: '(가)를 (나)로 만드는 회전 순서는?',
    stem: [
      { kind: 'solid', look: lookOf(initial, lab), caption: '(가)' },
      { kind: 'solid', look: final, caption: '(나)' },
    ],
    options,
    answer,
    solution: { kind: 'solid', solidId, labeling: lab, initial, ops: seq, labels: seq.map((_, i) => `${i + 1}단계`) },
  };
}

// ---------------- 유형 11: 규칙 플래시카드 ----------------

function genFlash(p: GenParams, set: RuleSet): Question {
  const rng = makeRng(p.seed);
  const rule = rng.pick(set.rules as { id: number; op: RotationOp | RadialOp }[]);
  const desc = (op: RotationOp | RadialOp): TextPart[] =>
    set.kind === 'solid'
      ? describeOp(op as RotationOp)
      : set.kind === 'block'
        ? describeBlockOp(op as BlockOp)
        : set.kind === 'octa'
          ? describeOctaOp(op as unknown as OctaOp)
          : describeRadialOp(op as RadialOp);
  const others = set.rules.filter((r) => r.id !== rule.id).map((r) => r.op as RotationOp | RadialOp);
  const extra: (RotationOp | RadialOp)[] =
    set.kind === 'solid'
      ? [
          ...set.rules.map((r) => inverseOp(r.op)),
          ...solidOpCandidates(set.solidId, set.fixedLabeling ?? set.exampleLabeling, SOLID_LEVELS[Math.max(2, set.level)]),
        ]
      : set.kind === 'octa'
        ? (octaOpCandidates(OCTA_LEVELS[5].kinds, OCTA_LEVELS[5].views, true) as unknown as RotationOp[])
        : set.kind === 'block'
        ? (blockOpCandidates({ views: ['front', 'top', 'right'], half: true, rolls: true, mirror: false, edits: true }) as unknown as RotationOp[])
        : radialOpCandidates(set.shape, RADIAL_LEVELS[set.level].kinds);
  const { options, answer } = assemble(
    rng,
    rule.op,
    [...others, ...rng.shuffle(extra)].map((op) => ({ item: op, tag: 'ruleConfuse' as MistakeTag })),
    (op) => JSON.stringify(desc(op)),
    () => null,
    (op) => ({ kind: 'text', parts: desc(op) }),
  );
  return {
    type: 11,
    level: p.level,
    seed: p.seed,
    setSeed: set.seed,
    prompt: `규칙 [${rule.id}]은 무엇이었나요?`,
    stem: [],
    options,
    answer,
    solution: { kind: 'text', parts: [[`[${rule.id}] = `, ...desc(rule.op)]] },
  };
}

// ---------------- 진입점 ----------------

export function generateQuestion(p: GenParams): Question {
  switch (p.type) {
    case 1: {
      const set = p.ruleSet?.kind === 'solid' ? p.ruleSet : generateSolidRuleSet(p.level, p.seed ^ 0x1234567, { solidId: p.solidId });
      return genSolidRule(p, set);
    }
    case 2:
      return genFaceQuestion(p);
    case 3:
      return genSameDiff(p);
    case 4:
      return genNetToSolid(p);
    case 5:
      return genSolidToNet(p);
    case 6:
      return genOpposite(p);
    case 7:
      return genNetRotate(p);
    case 8: {
      const set = p.ruleSet?.kind === 'radial' ? p.ruleSet : generateRadialRuleSet(Math.min(4, p.level), p.seed ^ 0x1234567);
      return genRadialRule(p, set);
    }
    case 9:
      return genRadialFind(p);
    case 10:
      return genBacktrack(p);
    case 11:
      return genFlash(p, p.ruleSet ?? generateSolidRuleSet(p.level, p.seed ^ 0x1234567));
    case 20:
      return generateOctaQuestion(p);
    default:
      return generateBlockQuestion(p);
  }
}

/** 보기 시그니처 (중복 검사용) */
export function figureKey(f: Figure): string {
  switch (f.kind) {
    case 'solid':
      return visibleSignature(f.look);
    case 'radial':
      return radialSignature(f.shape, f.cells);
    case 'net':
      return canonicalLabelSignature(f.solidId, f.labeling, symmetryGroup(f.solidId));
    case 'face':
      return JSON.stringify(f.look);
    case 'blocks':
      return blocksKey(f.cells);
    case 'grid':
      return gridKey(f.grid);
    case 'octa':
      return octaKey(f.state);
    default:
      return JSON.stringify(f);
  }
}
