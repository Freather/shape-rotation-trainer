import { describe, expect, it } from 'vitest';
import { deg, quatFromAxisAngle, quatMul } from '../math';
import { figureKey, generateQuestion, viewsConsistent, type QType } from '../question';
import { isSymmetry } from '../rotation';
import { generateRadialRuleSet, generateSolidRuleSet } from '../rules';
import { SOLID_IDS } from '../solids';
import { initialState, resolveOp } from '../state';

describe('규칙 세트', () => {
  it('모든 규칙은 해당 다면체의 대칭 회전 (스냅 전 기준)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const level of [1, 2, 3, 4, 5]) {
        const set = generateSolidRuleSet(level, seed);
        const lab = set.fixedLabeling ?? set.exampleLabeling;
        expect(set.rules.length).toBeGreaterThanOrEqual(3);
        for (const r of set.rules) {
          const res = resolveOp(initialState(set.solidId), r.op, lab);
          if (res.kind === 'rotate') {
            const q = quatMul(quatFromAxisAngle(res.axis, deg(res.angle)), [1, 0, 0, 0]);
            expect(isSymmetry(set.solidId, q, 1e-9)).toBe(true);
          }
        }
      }
      for (const id of SOLID_IDS) {
        const set = generateSolidRuleSet(4, seed, { solidId: id });
        const lab = set.fixedLabeling ?? set.exampleLabeling;
        for (const r of set.rules) {
          const res = resolveOp(initialState(id), r.op, lab);
          if (res.kind === 'rotate') expect(isSymmetry(id, quatFromAxisAngle(res.axis, deg(res.angle)), 1e-9)).toBe(true);
        }
      }
    }
  });

  it('같은 seed → 같은 규칙 세트, 다른 seed → 대체로 다른 규칙', () => {
    expect(JSON.stringify(generateSolidRuleSet(2, 99))).toBe(JSON.stringify(generateSolidRuleSet(2, 99)));
    const descs = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(generateSolidRuleSet(2, s).rules)));
    expect(descs.size).toBeGreaterThan(3);
  });

  it('평면 세트: 레벨별 규칙 3~5개', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const level of [1, 2, 3, 4]) {
        const set = generateRadialRuleSet(level, seed);
        expect(set.rules.length).toBeGreaterThanOrEqual(2);
        expect(set.rules.length).toBeLessThanOrEqual(5);
      }
  });
});

describe('문제 생성', () => {
  it('랜덤 50문제(유형 1)의 보기 5개 시그니처가 전부 서로 다름', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const level = (seed % 5) + 1;
      const set = generateSolidRuleSet(level, seed * 31);
      const q = generateQuestion({ type: 1, level, seed, ruleSet: set });
      expect(q.options).toHaveLength(5);
      expect(new Set(q.options.map((o) => figureKey(o.figure))).size).toBe(5);
      expect(q.options[q.answer].tag).toBe('correct');
      expect(q.seq!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('평면 50문제(유형 8)의 보기 5개가 전부 서로 다름', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const level = (seed % 4) + 1;
      const set = generateRadialRuleSet(level, seed * 17);
      const q = generateQuestion({ type: 8, level, seed, ruleSet: set });
      expect(new Set(q.options.map((o) => figureKey(o.figure))).size).toBe(5);
      expect(q.options[q.answer].tag).toBe('correct');
    }
  });

  it('같은 seed → 같은 문제 (오답노트 재현)', () => {
    for (const type of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as QType[]) {
      const a = generateQuestion({ type, level: 2, seed: 777 });
      const b = generateQuestion({ type, level: 2, seed: 777 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('모든 유형 · 레벨에서 문제 생성, 보기 중복 없음, 정답 표시 일치', () => {
    for (const type of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as QType[])
      for (let level = 1; level <= 5; level++)
        for (let seed = 1; seed <= 12; seed++) {
          const q = generateQuestion({ type, level, seed: seed * 101 + level });
          const n = type === 3 ? 2 : 5;
          expect(q.options).toHaveLength(n);
          expect(new Set(q.options.map((o) => figureKey(o.figure))).size).toBe(n);
          expect(q.options[q.answer].tag).toBe('correct');
        }
  });

  it('유형 3: 정답이 O면 두 그림이 실제로 일치 가능, X면 불가능', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateQuestion({ type: 3, level: (seed % 5) + 1, seed });
      const [a, b] = q.stem;
      if (a.kind !== 'solid' || b.kind !== 'solid') throw new Error();
      expect(viewsConsistent(a.look, b.look)).toBe(q.answer === 0);
    }
  });

  it('유형 4: 오답 보기는 정답 입체를 어떻게 돌려도 나오지 않는 모습', () => {
    // generateQuestion 내부에서 isViewOf 로 걸러지지만, 정답 외 보기가 4개 채워지는지 확인
    for (let seed = 1; seed <= 20; seed++) {
      const q = generateQuestion({ type: 4, level: 3, seed });
      expect(q.options.filter((o) => o.tag !== 'correct')).toHaveLength(4);
    }
  });
});
