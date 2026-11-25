// 규칙 응용 문제
// 유형 21 빠진 규칙 찾기: 처음과 결과, 규칙 순서 중 한 칸이 ?. 들어갈 규칙 번호를 고른다.
// 유형 22 조건 규칙: "흰 그림이 3개 이상이면 [1], 아니면 [4]"처럼 그림 상태를 보고 규칙이 갈린다.
// 그림 정팔면체·평면 도형·쌓기나무 규칙 세트에 같은 방식으로 쓴다.
import { assemble, type Figure, type GenParams, type MistakeTag, type Question, type Solution } from './question';
import { generateOctaRuleSet, pickBlocks, ruleById, type Rule, type RuleSet } from './rules';
import { OCTA_LEVELS, OCTA_NORMALS, SIDE_AXIS, SIDE_NAME, applyOctaOp, describeOctaOp, octaKey, randomOcta, type OctaOp, type OctaState, type Side } from './octa';
import { RADIAL_LEVELS, randomCells } from './radial/generate';
import { RING_NAMES, radialSignature, type Cells } from './radial/model';
import { applyRadialOp, describeRadialOp, type RadialOp } from './radial/ops';
import { allVisible, applyBlockOp, blocksKey, describeBlockOp, validBlocks, type BlockOp, type Blocks } from './blocks';
import { makeRng, type Rng } from './rng';
import type { TextPart } from './rotation';

/** 조건: 상태를 보고 참/거짓, 문구 */
interface Cond<S> {
  text: string;
  test: (s: S) => boolean;
}

/** 규칙 세트 하나를 문제 만들기에 쓰는 데 필요한 것 */
interface Family<S, Op> {
  rules: Rule<Op>[];
  random: (rng: Rng) => S;
  apply: (s: S, op: Op) => S;
  key: (s: S) => string;
  fig: (s: S, caption?: string) => Figure;
  ok: (s: S) => boolean;
  solution: (initial: S, steps: { op: Op; label: string }[]) => Solution;
  describe: (op: Op) => TextPart[];
  conds?: (s: S, rng: Rng) => Cond<S>[];
}

function octaFamily(set: Extract<RuleSet, { kind: 'octa' }>): Family<OctaState, OctaOp> {
  const cfg = OCTA_LEVELS[set.level];
  const whites = (s: OctaState) => s.filter((f) => f.pic?.white).length;
  const sides: Side[] = ['top', 'right', 'front', 'bottom', 'left', 'back'];
  return {
    rules: set.rules,
    random: (rng) => randomOcta(rng, cfg.picCount),
    apply: applyOctaOp,
    key: octaKey,
    fig: (state, caption) => ({ kind: 'octa', state, caption }),
    ok: () => true,
    solution: (initial, steps) => ({ kind: 'octa', initial, steps }),
    describe: describeOctaOp,
    conds: (s, rng) => {
      const w = whites(s);
      const k = Math.max(1, w + rng.pick([0, 1]));
      const side = rng.pick(sides);
      const sideHasWhite = (st: OctaState) => st.some((f, i) => !!f.pic?.white && sideFaces(side).includes(i));
      const sideHasPic = (st: OctaState) => sideFaces(side).filter((i) => st[i].pic).length;
      const m = Math.max(1, sideHasPic(s) + rng.pick([0, 1]));
      return [
        { text: `흰 그림이 ${k}개 이상이면`, test: (st) => whites(st) >= k },
        { text: `${SIDE_NAME[side]} 4면에 흰 그림이 있으면`, test: sideHasWhite },
        { text: `${SIDE_NAME[side]} 4면에 그림이 ${m}개 이상이면`, test: (st) => sideHasPic(st) >= m },
      ];
    },
  };
}

const sideFaces = (side: Side): number[] =>
  OCTA_NORMALS.map((n, i) => (n[0] * SIDE_AXIS[side][0] + n[1] * SIDE_AXIS[side][1] + n[2] * SIDE_AXIS[side][2] > 0 ? i : -1)).filter((i) => i >= 0);

function radialFamily(set: Extract<RuleSet, { kind: 'radial' }>): Family<Cells, RadialOp> {
  const shape = set.shape;
  const cfg = RADIAL_LEVELS[set.level];
  const blacks = (c: Cells) => c.flat().filter((x) => x.fill === 1).length;
  const ringBlacks = (c: Cells, r: number) => c[r].filter((x) => x.fill === 1).length;
  return {
    rules: set.rules,
    random: (rng) => randomCells(shape, rng, { symbolCount: cfg.symbolCount }),
    apply: (c, op) => applyRadialOp(shape, c, op),
    key: (c) => radialSignature(shape, c),
    fig: (cells, caption) => ({ kind: 'radial', shape, cells, caption }),
    ok: () => true,
    solution: (cells, steps) => ({ kind: 'radial', shape, cells, ops: steps.map((s) => s.op), labels: steps.map((s) => s.label) }),
    describe: describeRadialOp,
    conds: (c, rng) => {
      const b = blacks(c);
      const k = Math.max(1, b + rng.pick([0, 1]));
      const r = rng.int(3);
      const kr = Math.max(1, ringBlacks(c, r) + rng.pick([0, 1]));
      return [
        { text: `검은 칸이 ${k}개 이상이면`, test: (x) => blacks(x) >= k },
        { text: `${RING_NAMES[r]} 층 검은 칸이 ${kr}개 이상이면`, test: (x) => ringBlacks(x, r) >= kr },
      ];
    },
  };
}

function blockFamily(set: Extract<RuleSet, { kind: 'block' }>): Family<Blocks, BlockOp> {
  return {
    rules: set.rules,
    random: (rng) => pickBlocks(rng, set.level, true),
    apply: applyBlockOp,
    key: blocksKey,
    fig: (cells, caption) => ({ kind: 'blocks', cells, caption }),
    ok: (b) => validBlocks(b) && allVisible(b),
    solution: (initial, steps) => ({ kind: 'blocks', initial, steps: steps.map((s) => ({ op: s.op, label: [s.label, ' ', ...describeBlockOp(s.op)] })) }),
    describe: describeBlockOp,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFamily = Family<any, any>;

export function familyOf(set: RuleSet): AnyFamily | null {
  if (set.kind === 'octa') return octaFamily(set);
  if (set.kind === 'radial') return radialFamily(set);
  if (set.kind === 'block') return blockFamily(set);
  return null;
}

const ruleText = (id: number): Figure => ({ kind: 'text', parts: [`[${id}]`] });

// ---------------- 유형 21: 빠진 규칙 찾기 ----------------

export function genMissingRule(p: GenParams): Question {
  const set = p.ruleSet && p.ruleSet.kind !== 'solid' ? p.ruleSet : generateOctaRuleSet(p.level, p.seed ^ 0x1234567);
  const fam = familyOf(set)!;
  const rng = makeRng(p.seed);
  const run = (s: unknown, ids: number[]) => ids.reduce((acc, id) => fam.apply(acc, ruleById(fam.rules, id).op), s);
  const nSteps = Math.min(4, 2 + Math.floor((p.level - 1) / 2));
  for (let t = 0; t < 80; t++) {
    const initial = fam.random(rng);
    const seq: number[] = [];
    for (let i = 0; i < nSteps; i++) {
      let id = rng.pick(fam.rules).id;
      if (seq.length && id === seq[seq.length - 1]) id = rng.pick(fam.rules.filter((r) => r.id !== id)).id;
      seq.push(id);
    }
    const final = run(initial, seq);
    if (!fam.ok(final) || fam.key(final) === fam.key(initial)) continue;
    const m = rng.int(nSteps);
    const tryId = (id: number) => {
      const s2 = [...seq];
      s2[m] = id;
      const r = run(initial, s2);
      return fam.key(r) === fam.key(final);
    };
    // 다른 규칙을 넣어도 같은 결과가 나오면 그 규칙은 보기에서 뺀다. 보기가 셋은 되어야 문제로 쓴다.
    const wrong = fam.rules.map((r) => r.id).filter((id) => id !== seq[m] && !tryId(id));
    if (wrong.length < 2) continue;
    const { options, answer } = assemble(
      rng,
      seq[m],
      rng.shuffle(wrong).map((id) => ({ item: id, tag: 'ruleConfuse' as MistakeTag })),
      (id) => String(id),
      () => null,
      ruleText,
      Math.min(5, wrong.length + 1),
    );
    const shown = seq.map((id, i) => (i === m ? 0 : id));
    return {
      type: 21,
      level: p.level,
      seed: p.seed,
      setSeed: set.seed,
      prompt: '처음 모습에 규칙을 순서대로 적용했더니 결과처럼 되었어요. ? 에 들어갈 규칙은?',
      stem: [fam.fig(initial, '처음'), fam.fig(final, '결과')],
      seq: shown,
      options,
      answer,
      solution: fam.solution(
        initial,
        seq.map((id) => ({ op: ruleById(fam.rules, id).op, label: `[${id}]` })),
      ),
    };
  }
  throw new Error('빠진 규칙 문제를 만들지 못함');
}

// ---------------- 유형 22: 조건 규칙 ----------------

export function genConditional(p: GenParams): Question {
  const set = p.ruleSet && (p.ruleSet.kind === 'octa' || p.ruleSet.kind === 'radial') ? p.ruleSet : generateOctaRuleSet(p.level, p.seed ^ 0x1234567);
  const fam = familyOf(set)!;
  const rng = makeRng(p.seed);
  const opOf = (id: number) => ruleById(fam.rules, id).op;
  for (let t = 0; t < 120; t++) {
    const initial = fam.random(rng);
    const ids = rng.shuffle(fam.rules.map((r) => r.id));
    const [pre, yes, no, post] = [ids[0], ids[1], ids[2 % ids.length], ids[3 % ids.length]];
    if (yes === no) continue;
    const withPost = p.level >= 3;
    const mid = fam.apply(initial, opOf(pre));
    const cond = rng.pick(fam.conds!(mid, rng));
    const taken = cond.test(mid);
    const branch = taken ? yes : no;
    const other = taken ? no : yes;
    const finish = (s: unknown) => (withPost ? fam.apply(s, opOf(post)) : s);
    const ans = finish(fam.apply(mid, opOf(branch)));
    const wrongBranch = finish(fam.apply(mid, opOf(other)));
    if (fam.key(ans) === fam.key(wrongBranch)) continue;
    const cands: { item: unknown; tag: MistakeTag }[] = [{ item: wrongBranch, tag: 'wrongBranch' }];
    cands.push({ item: finish(mid), tag: 'skipLast' });
    if (withPost) cands.push({ item: fam.apply(mid, opOf(branch)), tag: 'skipLast' });
    cands.push({ item: finish(fam.apply(fam.apply(initial, opOf(branch)), opOf(pre))), tag: 'orderSwap' });
    const extra = fam.rules.map((r) => r.op);
    const { options, answer } = assemble(
      rng,
      ans,
      rng.shuffle(cands),
      fam.key,
      () => ({ item: fam.apply(ans, rng.pick(extra)), tag: 'random' }),
      (s) => fam.fig(s),
    );
    if (options.length < 5) continue;
    const stemOps: TextPart[][] = [
      [`[${pre}] 적용`],
      [`${cond.text} [${yes}], 아니면 [${no}] 적용 (1번까지 적용한 모습을 보고 판단)`],
      ...(withPost ? [[`[${post}] 적용`]] : []),
    ];
    return {
      type: 22,
      level: p.level,
      seed: p.seed,
      setSeed: set.seed,
      prompt: '아래 순서대로 규칙을 적용한 결과는? 2번은 조건에 따라 규칙이 달라져요.',
      stem: [fam.fig(initial)],
      stemOps,
      options,
      answer,
      scratch: set.kind === 'octa' ? { kind: 'octa', state: initial as OctaState } : set.kind === 'radial' ? { kind: 'radial', shape: set.shape, cells: initial as Cells } : undefined,
      solution: fam.solution(initial, [
        { op: opOf(pre), label: `[${pre}]` },
        { op: opOf(branch), label: `[${branch}] (조건이 ${taken ? '맞아서' : '안 맞아서'})` },
        ...(withPost ? [{ op: opOf(post), label: `[${post}]` }] : []),
      ]),
    };
  }
  throw new Error('조건 규칙 문제를 만들지 못함');
}
