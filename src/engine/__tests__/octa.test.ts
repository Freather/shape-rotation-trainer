import { describe, expect, it } from 'vitest';
import { OCTA_NORMALS, applyOctaOp, applyOctaOps, octaKey, randomOcta, sameOctaEffect, type OctaOp } from '../octa';
import { makeRng } from '../rng';
import { figureKey, generateQuestion } from '../question';
import { generateOctaRuleSet } from '../rules';

const st = randomOcta(makeRng(7), 8);

describe('그림 정팔면체 엔진', () => {
  it('위쪽 4면 돌리기: 아래 4면은 그대로, 네 번 돌리면 제자리', () => {
    const op: OctaOp = { kind: 'layer', view: 'top', dir: 'cw' };
    const a = applyOctaOp(st, op);
    OCTA_NORMALS.forEach((n, i) => {
      if (n[1] < 0) expect(a[i]).toEqual(st[i]);
    });
    expect(octaKey(applyOctaOps(st, [op, op, op, op]))).toBe(octaKey(st));
    expect(octaKey(a)).not.toBe(octaKey(st));
  });

  it('그림 맞바꾸기를 두 번 하면 제자리, 위 그림이 바로 아래로', () => {
    const op: OctaOp = { kind: 'swapPics', view: 'top', target: 'near' };
    const a = applyOctaOp(st, op);
    expect(octaKey(applyOctaOp(a, op))).toBe(octaKey(st));
    const up = OCTA_NORMALS.findIndex((n) => n[0] === 1 && n[1] === 1 && n[2] === 1);
    const down = OCTA_NORMALS.findIndex((n) => n[0] === 1 && n[1] === -1 && n[2] === 1);
    expect(a[down].pic?.symbol).toBe(st[up].pic?.symbol);
  });

  it('정반대편 맞바꾸기: 두 번 하면 제자리, 위 오른쪽 앞 그림이 아래 왼쪽 뒤로, 위 꼭짓점을 가리키던 그림은 아래 꼭짓점을', () => {
    const op: OctaOp = { kind: 'swapPics', view: 'top', target: 'opposite' };
    const a = applyOctaOp(st, op);
    expect(octaKey(applyOctaOp(a, op))).toBe(octaKey(st));
    const idx = (x: number, y: number, z: number) => OCTA_NORMALS.findIndex((n) => n[0] === x && n[1] === y && n[2] === z);
    const s2 = st.map((f) => ({ ...f }));
    s2[idx(1, 1, 1)] = { pic: { symbol: 'arrow', up: [-1, 2, -1], white: true } };
    const b = applyOctaOp(s2, op);
    expect(b[idx(-1, -1, -1)].pic).toEqual({ symbol: 'arrow', up: [1, -2, 1], white: true });
    expect(sameOctaEffect(op, { kind: 'swapPics', view: 'top', target: 'near' })).toBe(false);
  });

  it('그림 색 반전: 한쪽 4면 그림만 검↔흰, 위치·방향은 그대로, 두 번 하면 제자리', () => {
    const op: OctaOp = { kind: 'invert', view: 'right' };
    const a = applyOctaOp(st, op);
    OCTA_NORMALS.forEach((n, i) => {
      if (!st[i].pic) return expect(a[i].pic).toBeNull();
      expect(a[i].pic!.symbol).toBe(st[i].pic!.symbol);
      expect(a[i].pic!.up).toEqual(st[i].pic!.up);
      expect(a[i].pic!.white).toBe(n[0] > 0 ? !st[i].pic!.white : st[i].pic!.white);
    });
    expect(octaKey(applyOctaOp(a, op))).toBe(octaKey(st));
    expect(applyOctaOp(st, { kind: 'invert', view: 'all' }).every((f, i) => !f.pic || f.pic.white !== st[i].pic!.white)).toBe(true);
  });

  it('전체 돌리기 = 같은 축의 양쪽 4면을 따로 돌린 것', () => {
    const whole = applyOctaOp(st, { kind: 'turn', view: 'top', dir: 'cw' });
    const top = applyOctaOp(st, { kind: 'layer', view: 'top', dir: 'cw' });
    expect(octaKey(whole)).not.toBe(octaKey(top));
  });
});

describe('그림 정팔면체 문제', () => {
  it('규칙 세트: 효과가 서로 다름', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const lv of [1, 2, 3, 4, 5]) {
        const set = generateOctaRuleSet(lv, seed);
        for (const a of set.rules) for (const b of set.rules) if (a !== b) expect(sameOctaEffect(a.op, b.op)).toBe(false);
        expect(set.rules.some((r) => r.op.kind === 'layer')).toBe(true);
        expect(set.rules.filter((r) => r.op.kind === 'invert').length).toBeLessThanOrEqual(1);
        expect(set.rules.filter((r) => r.op.kind === 'swapPics').length).toBeLessThanOrEqual(1);
      }
  });

  it('유형 20: 보기 5개가 서로 다르고 정답이 규칙 적용 결과', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const q = generateQuestion({ type: 20, level: (seed % 5) + 1, seed });
      expect(q.options.length).toBe(5);
      expect(new Set(q.options.map((o) => figureKey(o.figure))).size).toBe(5);
      expect(q.options[q.answer].tag).toBe('correct');
      const sol = q.solution;
      const ini = q.stem[0];
      if (sol.kind !== 'octa' || ini.kind !== 'octa') throw new Error();
      const ans = q.options[q.answer].figure;
      if (ans.kind !== 'octa') throw new Error();
      expect(octaKey(applyOctaOps(ini.state, sol.steps.map((s) => s.op)))).toBe(octaKey(ans.state));
    }
  });

  it('규칙 외우기(유형 11)도 정팔면체 세트로 만들어짐', () => {
    const set = generateOctaRuleSet(3, 5);
    const q = generateQuestion({ type: 11, level: 3, seed: 9, ruleSet: set });
    expect(q.options.length).toBe(5);
  });
});
