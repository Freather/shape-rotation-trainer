import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { allowedMirrors, allowedRotations, emptyCells, radialSignature, type Cells, type RadialShape } from '../radial/model';
import { applyRadialOp, applyRadialOps, type RadialOp } from '../radial/ops';
import { randomCells } from '../radial/generate';

const dart8: RadialShape = { family: 'dart', sectors: [8, 8, 8] };
const dart6: RadialShape = { family: 'dart', sectors: [6, 6, 6] };

function sample(shape: RadialShape, seed = 1): Cells {
  return randomCells(shape, makeRng(seed), { symbolCount: 6 });
}
const sig = (shape: RadialShape, c: Cells) => radialSignature(shape, c);

describe('평면 방사형 도형 엔진', () => {
  it('14. N칸 도형을 한 칸씩 N번 회전 → 원래 상태 (모든 층/전체)', () => {
    for (const shape of [dart8, dart6, { family: 'dart', sectors: [4, 4, 4] } as RadialShape]) {
      const c0 = sample(shape);
      const n = shape.sectors[0];
      const w = 360 / n;
      expect(sig(shape, applyRadialOps(shape, c0, Array(n).fill({ kind: 'rotate', dir: 'cw', angle: w })))).toBe(sig(shape, c0));
      for (const ring of [0, 1, 2]) {
        const op: RadialOp = { kind: 'rotateRing', ring, dir: 'ccw', steps: 1 };
        expect(sig(shape, applyRadialOps(shape, c0, Array(n).fill(op)))).toBe(sig(shape, c0));
      }
    }
  });

  it('15. 대칭 2번 / 색반전 2번 / 그림 반전 2번 → 원래 상태', () => {
    const c0 = sample(dart8);
    for (const axis of allowedMirrors(dart8)) {
      const op: RadialOp = { kind: 'mirror', axis };
      expect(sig(dart8, applyRadialOps(dart8, c0, [op, op]))).toBe(sig(dart8, c0));
    }
    for (const op of [{ kind: 'invert' }, { kind: 'invertRing', ring: 1 }, { kind: 'flipSymbols' }, { kind: 'invertSymbolCells' }] as RadialOp[]) {
      expect(sig(dart8, applyRadialOps(dart8, c0, [op, op]))).toBe(sig(dart8, c0));
    }
  });

  it('16. 바깥 층만 회전하면 안쪽·중간 층은 그대로', () => {
    const c0 = sample(dart8, 5);
    const c1 = applyRadialOp(dart8, c0, { kind: 'rotateRing', ring: 2, dir: 'cw', steps: 1 });
    expect(JSON.stringify(c1[0])).toBe(JSON.stringify(c0[0]));
    expect(JSON.stringify(c1[1])).toBe(JSON.stringify(c0[1]));
    expect(JSON.stringify(c1[2])).not.toBe(JSON.stringify(c0[2]));
  });

  it('17. 좌우 대칭 → 시계 90° ≠ 시계 90° → 좌우 대칭', () => {
    const c0 = sample(dart8, 9);
    const m: RadialOp = { kind: 'mirror', axis: 0 };
    const r: RadialOp = { kind: 'rotate', dir: 'cw', angle: 90 };
    expect(sig(dart8, applyRadialOps(dart8, c0, [m, r]))).not.toBe(sig(dart8, applyRadialOps(dart8, c0, [r, m])));
  });

  it('18. 8칸 도형 "전체 90° 회전" = 모든 층 2칸 회전 (그림 방향도 90° 회전)', () => {
    const c0 = sample(dart8, 3);
    const whole = applyRadialOp(dart8, c0, { kind: 'rotate', dir: 'cw', angle: 90 });
    const byRings = applyRadialOps(dart8, c0, [0, 1, 2].map((ring): RadialOp => ({ kind: 'rotateRing', ring, dir: 'cw', steps: 2 })));
    expect(sig(dart8, whole)).toBe(sig(dart8, byRings));
    // 그림 이동(방향 유지) + 색 이동 + 그림 제자리 90° 와도 같다
    const manual = applyRadialOps(dart8, c0, [
      { kind: 'moveSymbols', dir: 'cw', steps: 2, withRot: false },
      { kind: 'spinSymbols', dir: 'cw', angle: 90 },
    ]);
    // 색까지 옮기려면 색만 따로 2칸 돌려야 하므로, 그림 부분만 비교
    const symOnly = (c: Cells) => c.map((r) => r.map((x) => `${x.symbol}@${x.rot}${x.mirrored}`)).join('|');
    expect(symOnly(manual)).toBe(symOnly(whole));
    for (const ring of whole)
      for (const cell of ring) if (cell.symbol) expect(cell.rot % 90).toBe(0);
  });

  it('19. "그림만 한 칸 이동" 후 각 그림의 방향 값은 이동 전과 같음, 색은 제자리', () => {
    const c0 = sample(dart8, 4);
    const c1 = applyRadialOp(dart8, c0, { kind: 'moveSymbols', dir: 'cw', steps: 1, withRot: false });
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 8; k++) {
        expect(c1[r][(k + 1) % 8].symbol).toBe(c0[r][k].symbol);
        expect(c1[r][(k + 1) % 8].rot).toBe(c0[r][k].rot);
        expect(c1[r][k].fill).toBe(c0[r][k].fill);
      }
  });

  it('전체 회전 vs 그림 이동은 그림 방향이 달라 결과가 다름', () => {
    const c0 = sample(dart8, 8);
    const a = applyRadialOp(dart8, c0, { kind: 'rotate', dir: 'cw', angle: 45 });
    const b = applyRadialOps(dart8, c0, [
      { kind: 'moveSymbols', dir: 'cw', steps: 1, withRot: false },
      ...[0, 1, 2].map((ring): RadialOp => ({ kind: 'invertRing', ring })),
    ]);
    expect(sig(dart8, a)).not.toBe(sig(dart8, b));
  });

  it('허용 회전·대칭 각도', () => {
    expect(allowedRotations({ family: 'square', sectors: [8, 8, 8] })).toEqual([90, 180, 270]);
    expect(allowedRotations({ family: 'tri', sectors: [6, 6, 6] })).toEqual([120, 240]);
    expect(allowedRotations({ family: 'flower', sectors: [4, 8, 8] })).toEqual([90, 180, 270]);
    expect(allowedMirrors({ family: 'tri', sectors: [3, 3, 3] })).toEqual([0]);
    expect(allowedMirrors({ family: 'hex', sectors: [6, 6, 6] })).toEqual([0, 90]);
    expect(allowedMirrors(dart8).sort()).toEqual([0, 135, 45, 90].sort());
    expect(emptyCells(dart6)[2]).toHaveLength(6);
  });
});

describe('그림 안쪽/바깥쪽 이동', () => {
  it('바깥쪽으로 한 층, 바깥 층 그림은 안쪽으로, 반대로 하면 원래대로', () => {
    const shape: RadialShape = { family: 'dart', sectors: [4, 4, 4] };
    const c: Cells = emptyCells(shape);
    c[0][1] = { fill: 1, symbol: 'arrow', rot: 90, mirrored: false };
    c[2][3] = { fill: 0, symbol: 'arrow', rot: 0, mirrored: false };
    const out = applyRadialOp(shape, c, { kind: 'shiftSymbolRings', dir: 'out' });
    expect(out[1][1].symbol).toBe('arrow');
    expect(out[1][1].rot).toBe(90);
    expect(out[0][1].fill).toBe(1);
    expect(out[0][1].symbol).toBeNull();
    expect(out[0][3].symbol).toBe('arrow');
    const back = applyRadialOp(shape, out, { kind: 'shiftSymbolRings', dir: 'in' });
    expect(radialSignature(shape, back)).toBe(radialSignature(shape, c));
  });
});
