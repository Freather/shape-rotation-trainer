import { describe, expect, it } from 'vitest';
import { ROTATIONS, applyBlockOp, blocksKey, completes, isChiral, mirrorBlocks, opMatrix, shapeKey, transform, viewGrid, gridKey, type Blocks } from '../blocks';
import { figureKey, generateQuestion } from '../question';
import { generateBlockRuleSet } from '../rules';

const L: Blocks = [
  [0, 0, 0],
  [1, 0, 0],
  [2, 0, 0],
  [2, 1, 0],
];
// 3D 비대칭 조각 (거울상이 다름)
const SCREW: Blocks = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [1, 1, 1],
];

describe('쌓기나무 엔진', () => {
  it('회전 24가지, 돌려도 같은 모양', () => {
    expect(ROTATIONS.length).toBe(24);
    for (const m of ROTATIONS) expect(shapeKey(transform(SCREW, m))).toBe(shapeKey(SCREW));
  });

  it('거울상: 평면 L은 돌리면 겹치고, 비틀린 조각은 안 겹침', () => {
    expect(isChiral(L)).toBe(false);
    expect(isChiral(SCREW)).toBe(true);
    expect(shapeKey(mirrorBlocks(SCREW))).not.toBe(shapeKey(SCREW));
  });

  it('위에서 볼 때 시계방향 90°: 오른쪽으로 뻗은 줄이 앞으로', () => {
    const bar: Blocks = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    const r = applyBlockOp(bar, { kind: 'view', view: 'top', dir: 'cw', angle: 90 });
    expect(blocksKey(r)).toBe(blocksKey([[0, 0, 0], [0, 0, 1]]));
    // 앞으로 넘어뜨리면 위로 쌓인 줄이 앞으로 눕는다
    const tower: Blocks = [
      [0, 0, 0],
      [0, 1, 0],
    ];
    expect(blocksKey(applyBlockOp(tower, { kind: 'roll', dir: 'forward' }))).toBe(blocksKey([[0, 0, 0], [0, 0, 1]]));
    expect(opMatrix({ kind: 'mirror' })[0][0]).toBe(-1);
  });

  it('방향별 모양', () => {
    expect(gridKey(viewGrid(L, 'front'))).toBe('001/111');
    expect(gridKey(viewGrid(L, 'top'))).toBe('111');
    expect(gridKey(viewGrid(L, 'right'))).toBe('1/1');
  });

  it('조각 맞추기 판정', () => {
    const target: Blocks = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
    ];
    const a: Blocks = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];
    expect(completes(target, a, a)).toBe(true);
    expect(completes(target, a, L.slice(0, 3))).toBe(true);
    expect(completes(target, a, [[0, 0, 0], [1, 0, 0], [1, 0, 1]])).toBe(false);
  });
});

describe('쌓기나무 문제', () => {
  it('규칙 세트: 규칙끼리 효과가 다름', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const lv of [1, 2, 3, 4, 5]) {
        const set = generateBlockRuleSet(lv, seed);
        const keys = set.rules.map((r) => JSON.stringify(opMatrix(r.op)));
        expect(new Set(keys).size).toBe(keys.length);
      }
  });

  it('유형 12~17: 보기 5개가 서로 다르고 정답 표시가 맞음', () => {
    for (const type of [12, 13, 14, 15, 16, 17] as const)
      for (let seed = 1; seed <= 25; seed++) {
        const q = generateQuestion({ type, level: (seed % 5) + 1, seed });
        expect(q.options.length).toBe(5);
        expect(new Set(q.options.map((o) => figureKey(o.figure))).size).toBe(5);
        expect(q.options[q.answer].tag).toBe('correct');
      }
  });

  it('유형 14: 정답만 돌려서 같은 모양', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const q = generateQuestion({ type: 14, level: (seed % 5) + 1, seed });
      const base = q.stem[0];
      if (base.kind !== 'blocks') throw new Error();
      q.options.forEach((o, i) => {
        if (o.figure.kind !== 'blocks') throw new Error();
        expect(shapeKey(o.figure.cells) === shapeKey(base.cells)).toBe(i === q.answer);
      });
    }
  });

  it('유형 16: 정답 조각만 완성 모양을 채움', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const q = generateQuestion({ type: 16, level: (seed % 5) + 1, seed });
      const [t, a] = q.stem;
      if (t.kind !== 'blocks' || a.kind !== 'blocks') throw new Error();
      q.options.forEach((o, i) => {
        if (o.figure.kind !== 'blocks') throw new Error();
        expect(completes(t.cells, a.cells, o.figure.cells)).toBe(i === q.answer);
      });
    }
  });
});
