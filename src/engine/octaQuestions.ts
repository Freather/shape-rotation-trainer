// 그림 정팔면체 규칙 적용 (유형 20)
import { generateOctaRuleSet, ruleById, type OctaRuleSet } from './rules';
import {
  OCTA_LEVELS,
  OCTA_NORMALS,
  faceVertices,
  applyOctaOp,
  applyOctaOps,
  describeOctaOp,
  flipOctaDir,
  octaKey,
  octaOpCandidates,
  randomOcta,
  type OctaOp,
  type OctaState,
} from './octa';
import { makeRng } from './rng';
import { assemble, type GenParams, type MistakeTag, type Question } from './question';
import type { View } from './rotation';

const octaFig = (state: OctaState, caption?: string) => ({ kind: 'octa' as const, state, caption });

/** 그림 하나의 방향만 다른 꼭짓점 쪽으로 돌린 모습 (헷갈리는 보기) */
function nudgePic(st: OctaState, k: number): OctaState | null {
  const withPic = st.map((f, i) => (f.pic ? i : -1)).filter((i) => i >= 0);
  if (!withPic.length) return null;
  const i = withPic[k % withPic.length];
  const pic = st[i].pic!;
  const n = OCTA_NORMALS[i];
  const vs = faceVertices(n).map((v) => [3 * v[0] - n[0], 3 * v[1] - n[1], 3 * v[2] - n[2]] as [number, number, number]);
  const cur = vs.findIndex((u) => u.every((x, j) => x === pic.up[j]));
  const out = st.map((f) => ({ ...f }));
  out[i] = { ...st[i], pic: { symbol: pic.symbol, up: vs[(cur + 1 + (k % 2)) % 3] } };
  return out;
}

export function genOctaRule(p: GenParams, set: OctaRuleSet): Question {
  const rng = makeRng(p.seed);
  const cfg = OCTA_LEVELS[set.level];
  let initial: OctaState = [];
  let seq: number[] = [];
  let ops: OctaOp[] = [];
  let ans: OctaState = [];
  const opsOf = (ids: number[]) => ids.map((id) => ruleById(set.rules, id).op);
  for (let t = 0; t < 40; t++) {
    initial = randomOcta(rng, cfg.picCount);
    const n = rng.range(cfg.steps[0], cfg.steps[1]);
    seq = [];
    for (let i = 0; i < n; i++) {
      let id = rng.pick(set.rules).id;
      if (seq.length && id === seq[seq.length - 1] && set.rules.length > 1) id = rng.pick(set.rules.filter((r) => r.id !== id)).id;
      seq.push(id);
    }
    ops = opsOf(seq);
    ans = applyOctaOps(initial, ops);
    if (octaKey(ans) !== octaKey(initial)) break;
  }
  const run = (o: OctaOp[]) => applyOctaOps(initial, o);
  const cands: { item: OctaState; tag: MistakeTag }[] = [];
  const i = rng.int(seq.length);
  const op = ops[i];
  const swapAt = (alt: OctaOp) => {
    const o = [...ops];
    o[i] = alt;
    return run(o);
  };
  // 4면 돌리기 ↔ 그림만 옮기기
  if (op.kind === 'layer') cands.push({ item: swapAt({ kind: 'movePics', view: op.view, dir: op.dir }), tag: 'layerVsPic' });
  if (op.kind === 'movePics') cands.push({ item: swapAt({ kind: 'layer', view: op.view, dir: op.dir }), tag: 'layerVsPic' });
  // 4면만 ↔ 전체
  if (op.kind === 'layer' || op.kind === 'movePics') cands.push({ item: swapAt({ kind: 'turn', view: op.view, dir: op.dir }), tag: 'wrongRing' });
  if (op.kind === 'turn') cands.push({ item: swapAt({ kind: 'layer', view: op.view, dir: op.dir }), tag: 'wrongRing' });
  // 바로 맞붙은 면 ↔ 정반대편 면
  if (op.kind === 'swapPics') cands.push({ item: swapAt({ kind: 'swapOpposite', view: op.view }), tag: 'nearVsOpposite' });
  if (op.kind === 'swapOpposite') cands.push({ item: swapAt({ kind: 'swapPics', view: op.view }), tag: 'nearVsOpposite' });
  const rev = flipOctaDir(op);
  if (rev) cands.push({ item: swapAt(rev), tag: 'reverse' });
  if (op.kind !== 'turn') {
    const other = (['top', 'right', 'front'] as View[]).filter((v) => v !== op.view);
    cands.push({ item: swapAt({ ...op, view: rng.pick(other) } as OctaOp), tag: 'wrongRing' });
  }
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
  cands.push({ item: run(ops.slice(0, -1)), tag: 'skipLast' });
  const extra = octaOpCandidates(cfg.kinds, cfg.views);
  let k = 0;
  const { options, answer } = assemble(
    rng,
    ans,
    rng.shuffle(cands),
    octaKey,
    () => {
      k++;
      if (rng.chance(0.5)) {
        const x = nudgePic(ans, k);
        return x ? { item: x, tag: 'symbolRot' } : null;
      }
      return { item: applyOctaOp(ans, rng.pick(extra)), tag: 'random' };
    },
    (s) => octaFig(s),
  );
  return {
    type: 20,
    level: p.level,
    seed: p.seed,
    setSeed: set.seed,
    prompt: '정팔면체에 규칙을 순서대로 적용한 결과로 알맞은 것은?',
    stem: [octaFig(initial)],
    seq,
    options,
    answer,
    scratch: { kind: 'octa', state: initial },
    solution: { kind: 'octa', initial, steps: seq.map((id) => ({ op: ruleById(set.rules, id).op, label: `[${id}]` })) },
  };
}

export function generateOctaQuestion(p: GenParams): Question {
  const set = p.ruleSet?.kind === 'octa' ? p.ruleSet : generateOctaRuleSet(p.level, p.seed ^ 0x1234567);
  return genOctaRule(p, set);
}

export { describeOctaOp };
