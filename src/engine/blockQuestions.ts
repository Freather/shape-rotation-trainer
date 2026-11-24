// 쌓기나무 문제 (유형 12~16): 규칙 적용, 돌린 모습, 같은 모양, 방향별 모양, 조각 맞추기
import {
  BLOCK_LEVELS,
  generateBlockRuleSet,
  pickBlocks,
  ruleById,
  type BlockRuleSet,
} from './rules';
import {
  IDENTITY,
  ROTATIONS,
  VIEW_NAMES,
  allVisible,
  applyBlockOp,
  applyBlockOps,
  blockInverse,
  validBlocks,
  blockOpCandidates,
  blocksKey,
  cellKey,
  completes,
  describeBlockOp,
  flipGrid,
  gridKey,
  isChiral,
  mirrorBlocks,
  moveOne,
  randomBlocks,
  shapeKey,
  splitTwo,
  toggleOne,
  transform,
  viewGrid,
  type BlockOp,
  type Blocks,
  type ViewDir,
  attach,
  SIDE_ALIGN,
  SIDE_NAMES,
  type Side,
} from './blocks';
import { makeRng, type Rng } from './rng';
import { assemble, type GenParams, type MistakeTag, type Question } from './question';

const blocksFig = (cells: Blocks, caption?: string) => ({ kind: 'blocks' as const, cells, caption });

/** 그림에서 블록이 다 보이는 방향으로 돌린 모양 */
function visibleTurn(b: Blocks, rng: Rng, avoid?: string): Blocks {
  for (let t = 0; t < 60; t++) {
    const m = rng.pick(ROTATIONS);
    if (m === IDENTITY && avoid) continue;
    const x = transform(b, m);
    if (avoid && blocksKey(x) === avoid) continue;
    if (allVisible(x)) return x;
  }
  return b;
}

const stepsOf = (ops: BlockOp[]) =>
  ops.map((op) => ({
    op,
    label: describeBlockOp(op),
    axisLabel: op.kind === 'view' ? VIEW_NAMES[op.view] : undefined,
  }));

/** 명령을 차례로 했을 때 중간 모양이 모두 쓸 만한지 (바꾸기 명령 때문에 떨어지거나 너무 커지면 안 됨) */
function runValid(b: Blocks, ops: BlockOp[]): Blocks | null {
  let cur = b;
  for (const op of ops) {
    const nx = applyBlockOp(cur, op);
    if (!validBlocks(nx) || blocksKey(nx) === blocksKey(cur)) return null;
    cur = nx;
  }
  return cur;
}

// ---------------- 유형 12: 규칙 적용 ----------------

function genBlockRule(p: GenParams, set: BlockRuleSet): Question {
  const rng = makeRng(p.seed);
  const cfg = BLOCK_LEVELS[set.level];
  let initial: Blocks = [];
  let seq: number[] = [];
  let ops: BlockOp[] = [];
  let ans: Blocks = [];
  const opsOf = (ids: number[]) => ids.map((id) => ruleById(set.rules, id).op);
  for (let t = 0; t < 40; t++) {
    initial = pickBlocks(rng, set.level, true);
    const n = rng.range(cfg.steps[0], cfg.steps[1]);
    seq = [];
    for (let i = 0; i < n; i++) {
      let id = rng.pick(set.rules).id;
      if (seq.length && id === seq[seq.length - 1] && set.rules.length > 1) id = rng.pick(set.rules.filter((r) => r.id !== id)).id;
      seq.push(id);
    }
    ops = opsOf(seq);
    const r = runValid(initial, ops);
    if (!r) continue;
    ans = r;
    if (allVisible(ans) && blocksKey(ans) !== blocksKey(initial)) break;
  }
  const run = (o: (BlockOp | null)[]) => (o.every(Boolean) ? applyBlockOps(initial, o as BlockOp[]) : moveOne(ans, rng) ?? ans);
  const cands: { item: Blocks; tag: MistakeTag }[] = [];
  const i = rng.int(seq.length);
  cands.push({ item: mirrorBlocks(ans), tag: 'mirror' });
  const others = set.rules.filter((r) => r.id !== seq[i]);
  if (others.length) {
    const s2 = [...seq];
    s2[i] = rng.pick(others).id;
    cands.push({ item: run(opsOf(s2)), tag: 'ruleConfuse' });
  }
  if (seq.length >= 2) {
    const j = rng.int(seq.length - 1);
    const s2 = [...seq];
    [s2[j], s2[j + 1]] = [s2[j + 1], s2[j]];
    cands.push({ item: run(opsOf(s2)), tag: 'orderSwap' });
  }
  const inv = blockInverse(ops[i]);
  if (inv) {
    const rev: BlockOp[] = [...ops];
    rev[i] = inv;
    cands.push({ item: run(rev), tag: 'reverse' });
  }
  cands.push({ item: run(ops.slice(0, -1)), tag: 'skipLast' });
  const mv = moveOne(ans, rng);
  if (mv) cands.push({ item: mv, tag: 'blockMoved' });
  const { options, answer } = assemble(
    rng,
    ans,
    rng.shuffle(cands),
    blocksKey,
    () => {
      const x = rng.chance(0.5) ? moveOne(ans, rng) : visibleTurn(ans, rng);
      return x ? { item: x, tag: 'random' } : null;
    },
    (b) => blocksFig(b),
    5,
    (b) => !validBlocks(b) || !allVisible(b),
  );
  return {
    scratch: { kind: 'blocks', cells: initial },
    type: 12,
    level: p.level,
    seed: p.seed,
    setSeed: set.seed,
    prompt: '쌓기나무에 규칙을 순서대로 적용한 결과로 알맞은 것은?',
    stem: [blocksFig(initial)],
    seq,
    options,
    answer,
    solution: { kind: 'blocks', initial, steps: stepsOf(ops).map((s, k) => ({ ...s, label: [`[${seq[k]}] `, ...s.label] })) },
  };
}

// ---------------- 유형 13: 돌린 모습 고르기 ----------------

function genBlockTurn(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const cfg = BLOCK_LEVELS[Math.min(5, Math.max(1, p.level))];
  const all = blockOpCandidates({ ...cfg, mirror: false, edits: false });
  const n = Math.min(3, Math.max(1, Math.ceil(p.level / 2)));
  let initial: Blocks = [];
  let ops: BlockOp[] = [];
  let ans: Blocks = [];
  for (let t = 0; t < 40; t++) {
    initial = pickBlocks(rng, p.level, true);
    ops = Array.from({ length: n }, () => rng.pick(all));
    ans = applyBlockOps(initial, ops);
    if (allVisible(ans) && blocksKey(ans) !== blocksKey(initial)) break;
  }
  const run = (o: BlockOp[]) => applyBlockOps(initial, o);
  const cands: { item: Blocks; tag: MistakeTag }[] = [{ item: mirrorBlocks(ans), tag: 'mirror' }];
  const rev = [...ops];
  rev[rev.length - 1] = blockInverse(rev[rev.length - 1])!;
  cands.push({ item: run(rev), tag: 'reverse' });
  if (ops.length > 1) cands.push({ item: run(ops.slice(0, -1)), tag: 'skipLast' });
  const swapAxis = [...ops];
  const k = rng.int(ops.length);
  swapAxis[k] = rng.pick(all.filter((o) => JSON.stringify(o) !== JSON.stringify(ops[k])));
  cands.push({ item: run(swapAxis), tag: 'ruleConfuse' });
  const mv = moveOne(ans, rng);
  if (mv) cands.push({ item: mv, tag: 'blockMoved' });
  const { options, answer } = assemble(
    rng,
    ans,
    rng.shuffle(cands),
    blocksKey,
    () => ({ item: visibleTurn(initial, rng), tag: 'random' }),
    (b) => blocksFig(b),
    5,
    (b) => !allVisible(b),
  );
  return {
    scratch: { kind: 'blocks', cells: initial },
    type: 13,
    level: p.level,
    seed: p.seed,
    prompt: '쌓기나무를 아래 순서로 돌린 모습은?',
    stem: [blocksFig(initial)],
    stemOps: ops.map(describeBlockOp),
    options,
    answer,
    solution: { kind: 'blocks', initial, steps: stepsOf(ops) },
  };
}

// ---------------- 유형 14: 같은 모양 찾기 ----------------

function genBlockSame(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const base = pickBlocks(rng, p.level + 1, true);
  const baseKey = shapeKey(base);
  // 정답: 돌린 모양. 어떤 회전인지 기억해 둠 (풀이 애니메이션)
  let m = ROTATIONS[1];
  let ans = base;
  for (let t = 0; t < 60; t++) {
    m = rng.pick(ROTATIONS);
    ans = transform(base, m);
    if (m !== IDENTITY && blocksKey(ans) !== blocksKey(base) && allVisible(ans)) break;
  }
  const mir = mirrorBlocks(base);
  const cands: { item: Blocks; tag: MistakeTag }[] = [];
  for (let t = 0; t < 2; t++) cands.push({ item: visibleTurn(mir, rng), tag: 'mirror' });
  for (let t = 0; t < 4; t++) {
    const mv = moveOne(base, rng);
    if (mv) cands.push({ item: visibleTurn(mv, rng), tag: 'blockMoved' });
  }
  const { options, answer } = assemble(
    rng,
    ans,
    cands,
    blocksKey,
    () => {
      const mv = moveOne(rng.chance(0.5) ? base : mir, rng);
      return mv ? { item: visibleTurn(mv, rng), tag: 'blockMoved' } : null;
    },
    (b) => blocksFig(b),
    5,
    (b) => shapeKey(b) === baseKey || !allVisible(b),
  );
  return {
    scratch: { kind: 'blocks', cells: base },
    type: 14,
    level: p.level,
    seed: p.seed,
    prompt: '왼쪽 쌓기나무를 돌려 놓은 것은? 나머지는 거울에 비친 모양이거나 블록 하나가 다른 모양이에요.',
    stem: [blocksFig(base)],
    options,
    answer,
    solution: {
      kind: 'blocks',
      initial: base,
      steps: [{ op: { kind: 'matrix', m }, label: ['왼쪽 모양을 돌리면 정답과 똑같아져요.'] }],
      note: isChiral(base) ? '거울에 비친 모양은 아무리 돌려도 원래 모양과 겹치지 않아요. 길게 뻗은 줄 하나를 기준으로 잡고, 꺾인 블록이 그 줄의 왼쪽인지 오른쪽인지 비교해 보세요.' : undefined,
    },
  };
}

// ---------------- 유형 15: 방향별 모양 ----------------

function genBlockViews(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const base = pickBlocks(rng, p.level + 1);
  const views: ViewDir[] = ['front', 'top', 'right'];
  const v = rng.pick(views);
  const ans = viewGrid(base, v);
  const cands: { item: boolean[][]; tag: MistakeTag }[] = [];
  for (const o of views) if (o !== v) cands.push({ item: viewGrid(base, o), tag: 'otherView' });
  cands.push({ item: flipGrid(ans), tag: 'mirror' });
  for (const o of views) if (o !== v) cands.push({ item: flipGrid(viewGrid(base, o)), tag: 'otherView' });
  for (let t = 0; t < 3; t++) {
    const x = toggleOne(ans, rng);
    if (x) cands.push({ item: x, tag: 'cellOff' });
  }
  const { options, answer } = assemble(
    rng,
    ans,
    [...cands.slice(0, 2), ...rng.shuffle(cands.slice(2))],
    gridKey,
    () => {
      const x = toggleOne(rng.pick([ans, ...views.map((o) => viewGrid(base, o))]), rng);
      return x ? { item: x, tag: 'cellOff' } : null;
    },
    (g) => ({ kind: 'grid', grid: g }),
    5,
  );
  return {
    scratch: { kind: 'blocks', cells: base },
    type: 15,
    level: p.level,
    seed: p.seed,
    prompt: `쌓기나무를 ${VIEW_NAMES[v]}에서 본 모양은?`,
    stem: [{ kind: 'blocks', cells: base, viewMarks: [v] }],
    options,
    answer,
    solution: {
      kind: 'figs',
      figs: views.map((o) => ({ kind: 'grid' as const, grid: viewGrid(base, o), caption: `${VIEW_NAMES[o]}에서 본 모양` })),
      parts: [
        [
          v === 'top'
            ? '위에서 보면 높이는 상관없고, 바닥에 놓인 칸의 자리만 보여요. 앞쪽 줄이 그림의 아래쪽이에요.'
            : v === 'front'
              ? '앞에서 보면 왼쪽부터 한 줄씩, 그 줄에서 가장 높이 쌓인 만큼 보여요. 뒤에 있는 블록도 앞 블록보다 높으면 보여요.'
              : '오른쪽에서 보면 앞쪽 줄이 그림의 왼쪽, 뒤쪽 줄이 오른쪽이에요. 줄마다 가장 높이 쌓인 만큼 보여요.',
        ],
      ],
    },
  };
}

// ---------------- 유형 16: 조각 맞추기 ----------------

function tryPiece(rng: Rng, lv: number, nBlocks: number) {
  let target: Blocks = [];
  let A: Blocks = [];
  let B: Blocks = [];
  for (let t = 0; t < 80; t++) {
    target = randomBlocks(rng, nBlocks, 3);
    if (target.length !== nBlocks || !allVisible(target)) continue;
    const sp = splitTwo(target, rng, 2);
    if (!sp) continue;
    // 정답 조각은 4개 이상 (3개짜리는 모양이 두 가지뿐이라 헷갈리는 보기를 만들 수 없음)
    const [x, y] = sp[0].length > sp[1].length ? [sp[1], sp[0]] : sp;
    if (y.length < 4 || (lv >= 3 && x.length < 3)) continue;
    [A, B] = [x, y];
    break;
  }
  if (B.length < 4) return null;
  const aSet = new Set(A.map(cellKey));
  const colors = target.map((c) => (aSet.has(cellKey(c)) ? '#74a9e0' : '#f0a35e'));
  const pieceA = visibleTurn(A, rng);
  const ans = visibleTurn(B, rng);
  const cands: { item: Blocks; tag: MistakeTag }[] = [];
  if (isChiral(B)) cands.push({ item: visibleTurn(mirrorBlocks(B), rng), tag: 'mirror' });
  for (let t = 0; t < 6; t++) {
    const mv = moveOne(B, rng);
    if (mv) cands.push({ item: visibleTurn(mv, rng), tag: 'wrongPiece' });
  }
  const bKey = shapeKey(B);
  const { options, answer } = assemble(
    rng,
    ans,
    cands,
    shapeKey,
    () => {
      const mv = rng.chance(0.5) ? moveOne(rng.chance(0.5) ? B : mirrorBlocks(B), rng) : randomBlocks(rng, B.length, 3);
      return mv && mv.length === B.length ? { item: visibleTurn(mv, rng), tag: 'wrongPiece' } : null;
    },
    (b) => blocksFig(b),
    5,
    (b) => shapeKey(b) === bKey || completes(target, A, b) || !allVisible(b),
  );
  return { target, colors, pieceA, options, answer };
}

function genBlockPiece(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const lv = Math.min(5, Math.max(1, p.level));
  const nBlocks = [0, 6, 6, 7, 7, 8][lv];
  // 헷갈리는 보기를 5개 못 채우는 조합이면 다시 고름
  for (let attempt = 0; ; attempt++) {
    const r = tryPiece(rng, lv, nBlocks);
    if (!r && attempt > 60) throw new Error('조각 문제를 만들 수 없음');
    if (r && (r.options.length === 5 || attempt >= 15)) {
      const { target, colors, pieceA, options, answer } = r;
      return {
        scratch: { kind: 'blocks', cells: pieceA },
        type: 16,
        level: p.level,
        seed: p.seed,
        prompt: '조각 ㉮와 어떤 조각을 합치면 왼쪽 모양이 되나요? 조각은 돌려서 붙일 수 있어요.',
        stem: [blocksFig(target, '완성 모양'), blocksFig(pieceA, '조각 ㉮')],
        options,
        answer,
        solution: {
          kind: 'figs',
          figs: [{ kind: 'blocks', cells: target, colors, caption: '파랑: 조각 ㉮ / 주황: 정답 조각' }],
          parts: [
            ['완성 모양에서 조각 ㉮가 들어갈 자리를 먼저 찾고, 남은 칸이 어떤 모양인지 보세요.'],
            ['보기 중에는 남은 모양을 거울에 비춘 것이나 블록 하나가 다른 것이 섞여 있어요.'],
          ],
        },
      };
    }
  }
}

// ---------------- 유형 17: 두 쌓기나무 합쳐서 돌리기 ----------------

const BLUE = '#74a9e0';
const ORANGE = '#f0a35e';

function genBlockJoin(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const lv = Math.min(5, Math.max(1, p.level));
  const cfg = BLOCK_LEVELS[lv];
  const all = blockOpCandidates({ ...cfg, mirror: false, edits: false });
  const sides: Side[] = lv <= 1 ? ['right', 'top'] : lv <= 2 ? ['right', 'top', 'front'] : ['right', 'left', 'top', 'front', 'back'];
  const nOps = lv <= 2 ? 1 : lv <= 4 ? rng.range(1, 2) : 2;
  const size = (): number => rng.range(lv <= 2 ? 2 : 3, lv <= 2 ? 3 : 4);
  let A: Blocks = [];
  let B: Blocks = [];
  let side: Side = 'right';
  let joined: Blocks = [];
  let ops: BlockOp[] = [];
  let ans: Blocks = [];
  for (let t = 0; t < 300; t++) {
    A = randomBlocks(rng, size(), 2);
    B = randomBlocks(rng, size(), 2);
    if (!allVisible(A) || !allVisible(B) || blocksKey(A) === blocksKey(B)) continue;
    side = rng.pick(sides);
    const j = attach(A, B, side);
    if (!j || !allVisible(j)) continue;
    joined = j;
    ops = Array.from({ length: nOps }, () => rng.pick(all));
    ans = applyBlockOps(joined, ops);
    if (allVisible(ans) && blocksKey(ans) !== blocksKey(joined)) break;
  }
  const colors = joined.map((_, i) => (i < A.length ? BLUE : ORANGE));
  const run = (b: Blocks | null, o: BlockOp[] = ops) => (b ? applyBlockOps(b, o) : null);
  const cands: { item: Blocks; tag: MistakeTag }[] = [];
  const push = (b: Blocks | null, tag: MistakeTag) => b && cands.push({ item: b, tag });
  for (const s2 of rng.shuffle(sides.filter((x) => x !== side)).slice(0, 2)) push(run(attach(A, B, s2)), 'wrongSide');
  push(mirrorBlocks(ans), 'mirror');
  const rev = [...ops];
  rev[rev.length - 1] = blockInverse(rev[rev.length - 1])!;
  push(run(joined, rev), 'reverse');
  push(run(attach(A, transform(B, rng.pick(ROTATIONS.slice(1))), side)), 'wrongPiece');
  push(moveOne(ans, rng), 'blockMoved');
  const { options, answer } = assemble(
    rng,
    ans,
    [...cands.slice(0, 1), ...rng.shuffle(cands.slice(1))],
    blocksKey,
    () => {
      const x = attach(A, transform(B, rng.pick(ROTATIONS)), rng.pick(sides));
      return x ? { item: applyBlockOps(x, ops), tag: 'wrongPiece' } : null;
    },
    (b) => blocksFig(b),
    5,
    (b) => !allVisible(b),
  );
  return {
    scratch: { kind: 'blocks', cells: joined, colors },
    type: 17,
    level: p.level,
    seed: p.seed,
    prompt: `㉯를 ㉮의 ${SIDE_NAMES[side]}에 붙인 뒤 아래 순서로 돌린 모습은? 붙일 때 ${SIDE_ALIGN[side]}.`,
    stem: [
      { kind: 'blocks', cells: A, caption: '㉮', colors: A.map(() => BLUE) },
      { kind: 'blocks', cells: B, caption: '㉯', colors: B.map(() => ORANGE) },
    ],
    stemOps: ops.map(describeBlockOp),
    options,
    answer,
    solution: {
      kind: 'blocks',
      initial: joined,
      colors,
      steps: stepsOf(ops),
      note: `처음 그림은 ㉯(주황)를 ㉮(파랑)의 ${SIDE_NAMES[side]}에 붙인 모습이에요. 보기는 색 없이 나오니 두 조각의 경계를 머릿속에 그어 두고 따라가세요.`,
    },
  };
}

// ---------------- 유형 18: 세 방향 모양 보고 쌓기나무 고르기 ----------------

const VIEWS3: ViewDir[] = ['front', 'top', 'right'];
const viewsSig = (b: Blocks) => VIEWS3.map((v) => gridKey(viewGrid(b, v))).join('|');

function genBlockFromViews(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const base = pickBlocks(rng, p.level + 1, true);
  const sig = viewsSig(base);
  const cands: { item: Blocks; tag: MistakeTag }[] = [{ item: mirrorBlocks(base), tag: 'mirror' }];
  for (let t = 0; t < 5; t++) {
    const mv = moveOne(base, rng);
    if (mv) cands.push({ item: mv, tag: 'blockMoved' });
  }
  cands.push({ item: applyBlockOp(base, { kind: 'view', view: 'top', dir: rng.chance(0.5) ? 'cw' : 'ccw', angle: 90 }), tag: 'otherView' });
  const { options, answer } = assemble(
    rng,
    base,
    [cands[0], ...rng.shuffle(cands.slice(1))],
    blocksKey,
    () => {
      const mv = moveOne(rng.chance(0.5) ? base : mirrorBlocks(base), rng);
      return mv ? { item: mv, tag: 'blockMoved' } : null;
    },
    (b) => blocksFig(b),
    5,
    (b) => viewsSig(b) === sig || !validBlocks(b) || !allVisible(b),
  );
  return {
    scratch: undefined,
    type: 18,
    level: p.level,
    seed: p.seed,
    prompt: '앞, 위, 오른쪽에서 본 모양이 아래와 같은 쌓기나무는?',
    stem: VIEWS3.map((v) => ({ kind: 'grid' as const, grid: viewGrid(base, v), caption: `${VIEW_NAMES[v]}에서 본 모양` })),
    options,
    answer,
    solution: {
      kind: 'figs',
      figs: [{ kind: 'blocks', cells: base, viewMarks: VIEWS3, caption: '정답' }],
      parts: [
        ['위에서 본 모양으로 바닥 자리를 먼저 정해요. 그다음 앞에서 본 모양으로 왼쪽부터 줄마다 높이를, 오른쪽에서 본 모양으로 앞쪽부터 줄마다 높이를 맞춰 봐요.'],
        ['보기를 하나씩 세 방향으로 볼 필요는 없어요. 위에서 본 모양부터 맞지 않는 보기를 지우면 빨라요.'],
      ],
    },
  };
}

// ---------------- 유형 19: 전후 보고 규칙 찾기 ----------------

function genBlockFind(p: GenParams): Question {
  const rng = makeRng(p.seed);
  const lv = Math.min(5, Math.max(1, p.level));
  const all = blockOpCandidates({ views: ['top', 'front', 'right'], half: lv >= 2, rolls: lv >= 2, mirror: lv >= 4, edits: lv >= 3 });
  let before: Blocks = [];
  let op: BlockOp = all[0];
  let after: Blocks = [];
  for (let t = 0; t < 100; t++) {
    before = pickBlocks(rng, lv, true);
    op = rng.pick(all);
    after = applyBlockOp(before, op);
    if (validBlocks(after) && allVisible(after) && blocksKey(after) !== blocksKey(before)) break;
  }
  const key = (o: BlockOp) => describeBlockOp(o).join('');
  const cands: { item: BlockOp; tag: MistakeTag }[] = [];
  const inv = blockInverse(op);
  if (inv) cands.push({ item: inv, tag: 'reverse' });
  if (op.kind === 'view') for (const v of VIEWS3) if (v !== op.view) cands.push({ item: { ...op, view: v }, tag: 'ruleConfuse' });
  if (op.kind !== 'mirror') cands.push({ item: { kind: 'mirror' }, tag: 'mirrorVsRotate' });
  const { options, answer } = assemble(
    rng,
    op,
    [...cands.slice(0, 1), ...rng.shuffle(cands.slice(1))],
    key,
    () => ({ item: rng.pick(all), tag: 'wrongRule' }),
    (o) => ({ kind: 'text', parts: describeBlockOp(o) }),
    5,
    (o) => blocksKey(applyBlockOp(before, o)) === blocksKey(after),
  );
  return {
    scratch: { kind: 'blocks', cells: before },
    type: 19,
    level: p.level,
    seed: p.seed,
    prompt: '왼쪽 쌓기나무가 오른쪽처럼 바뀌었어요. 어떤 규칙을 적용했나요?',
    stem: [blocksFig(before, '처음'), blocksFig(after, '바뀐 뒤')],
    options,
    answer,
    solution: { kind: 'blocks', initial: before, steps: stepsOf([op]) },
  };
}

/** 보기 5개를 못 채운 경우 다른 seed로 다시 (같은 seed면 늘 같은 문제) */
export function generateBlockQuestion(p: GenParams): Question {
  let q = genBlockOnce(p);
  for (let k = 1; k < 12 && q.options.length < 5; k++) q = genBlockOnce({ ...p, seed: (p.seed + k * 7919) >>> 0 });
  return { ...q, seed: p.seed };
}

function genBlockOnce(p: GenParams): Question {
  switch (p.type) {
    case 12: {
      const set = p.ruleSet?.kind === 'block' ? p.ruleSet : generateBlockRuleSet(Math.min(5, Math.max(1, p.level)), p.seed ^ 0x1234567);
      return genBlockRule(p, set);
    }
    case 13:
      return genBlockTurn(p);
    case 14:
      return genBlockSame(p);
    case 15:
      return genBlockViews(p);
    case 16:
      return genBlockPiece(p);
    case 18:
      return genBlockFromViews(p);
    case 19:
      return genBlockFind(p);
    default:
      return genBlockJoin(p);
  }
}

