import { describe, expect, it } from 'vitest';
import { quatNorm, quatSameRotation } from '../math';
import { inverseOp, opToAxisAngle, symmetryGroup, type RotationOp } from '../rotation';
import { getSolid } from '../solids';
import {
  applyOp,
  applyOps,
  applyQuat,
  faceAtSlot,
  initialState,
  mirror,
  signature,
  slots,
} from '../state';

// 슬롯/면 번호: U=0, D=1, F=2, B=3, R=4, L=5
const U = 0, D = 1, F = 2, B = 3, R = 4, L = 5;

const cube = () => initialState('cube');
const frontCW90: RotationOp = { kind: 'view', view: 'front', dir: 'cw', angle: 90 };
const topCW90: RotationOp = { kind: 'view', view: 'top', dir: 'cw', angle: 90 };

const ALL_CUBE_OPS: RotationOp[] = [
  ...(['front', 'top', 'right'] as const).flatMap((view) =>
    (['cw', 'ccw'] as const).flatMap((dir) =>
      [90, 180, 270].map((angle): RotationOp => ({ kind: 'view', view, dir, angle })),
    ),
  ),
  ...(['forward', 'backward', 'right', 'left'] as const).map(
    (dir): RotationOp => ({ kind: 'roll', dir }),
  ),
];

describe('정육면체 데이터', () => {
  it('면 6개, 각 면 4각형, upRef는 법선에 수직인 단위벡터', () => {
    const s = getSolid('cube');
    expect(s.faces).toHaveLength(6);
    for (const f of s.faces) {
      expect(f.vertices).toHaveLength(4);
      const d = f.normal[0] * f.upRef[0] + f.normal[1] * f.upRef[1] + f.normal[2] * f.upRef[2];
      expect(Math.abs(d)).toBeLessThan(1e-12);
    }
  });

  it('초기 상태: 모든 면이 자기 슬롯, 기호 방향 0', () => {
    for (const x of slots(cube())) {
      expect(x.face).toBe(x.slot);
      expect(x.rot).toBe(0);
      expect(x.flipped).toBe(false);
    }
  });
});

describe('회전 방향 규약', () => {
  it('"시계방향" = 해당 축 기준 −θ', () => {
    expect(opToAxisAngle(frontCW90)).toEqual({ axis: [0, 0, 1], angle: -90 });
    expect(opToAxisAngle({ kind: 'roll', dir: 'forward' })).toEqual({ axis: [1, 0, 0], angle: 90 });
    expect(opToAxisAngle({ kind: 'roll', dir: 'right' })).toEqual({ axis: [0, 0, 1], angle: -90 });
  });
});

describe('4-7 필수 테스트 (정육면체)', () => {
  it('1. 앞에서 볼 때 시계방향 90° → 윗면이 오른쪽 면으로', () => {
    const s = applyOp(cube(), frontCW90);
    expect(faceAtSlot(s, R)).toBe(U);
    expect(faceAtSlot(s, D)).toBe(R);
    expect(faceAtSlot(s, L)).toBe(D);
    expect(faceAtSlot(s, U)).toBe(L);
    // 앞면은 제자리에서 시계 90° (반시계 기준 3칸)
    expect(slots(s)[F]).toEqual({ slot: F, face: F, rot: 3, flipped: false });
  });

  it('2. 앞으로 굴리기 → 윗면이 앞면으로', () => {
    const s = applyOp(cube(), { kind: 'roll', dir: 'forward' });
    expect(faceAtSlot(s, F)).toBe(U);
    expect(faceAtSlot(s, D)).toBe(F);
    expect(faceAtSlot(s, B)).toBe(D);
    expect(faceAtSlot(s, U)).toBe(B);
    // 굴린 뒤 앞면의 기호는 똑바로 서 있어야 함 (윗면 기호 위쪽 = 뒤 → 굴리면 위)
    expect(slots(s)[F].rot).toBe(0);
  });

  it('오른쪽으로 굴리기 → 윗면이 오른쪽 면으로', () => {
    const s = applyOp(cube(), { kind: 'roll', dir: 'right' });
    expect(faceAtSlot(s, R)).toBe(U);
  });

  it('3. 어떤 회전이든 90° 4번 반복 → 원래 상태', () => {
    const start = signature(cube());
    for (const op of ALL_CUBE_OPS) {
      const s = applyOps(cube(), [op, op, op, op]);
      expect(signature(s)).toBe(start);
    }
  });

  it('4. 회전 A 후 A의 역회전 → 원래 상태 (모든 명령)', () => {
    const start = signature(cube());
    for (const op of ALL_CUBE_OPS) {
      expect(signature(applyOps(cube(), [op, inverseOp(op)]))).toBe(start);
    }
  });

  it('5. 서로 다른 축 회전은 순서를 바꾸면 결과가 다름(비가환)', () => {
    const a = applyOps(cube(), [frontCW90, topCW90]);
    const b = applyOps(cube(), [topCW90, frontCW90]);
    expect(signature(a)).not.toBe(signature(b));
  });

  it('6. 정육면체 회전대칭군 원소 24개, 서로 다른 시그니처 24개', () => {
    const g = symmetryGroup('cube');
    expect(g).toHaveLength(24);
    const sigs = new Set(g.map((q) => signature(applyQuat(cube(), q))));
    expect(sigs.size).toBe(24);
  });

  it('7. 랜덤 회전 1000번 후에도 쿼터니언 오차 < 1e-9', () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let s = cube();
    for (let i = 0; i < 1000; i++) {
      s = applyOp(s, ALL_CUBE_OPS[Math.floor(rand() * ALL_CUBE_OPS.length)]);
    }
    expect(Math.abs(quatNorm(s.q) - 1)).toBeLessThan(1e-9);
    const exact = symmetryGroup('cube').some((g) => quatSameRotation(g, s.q, 1e-9));
    expect(exact).toBe(true);
    // 스냅 결과는 반드시 대칭군 원소 그 자체
    expect(symmetryGroup('cube')).toContain(s.q);
  });

  it('8. 거울상은 어떤 회전으로도 원래 상태와 같아지지 않음', () => {
    const start = signature(cube());
    const strip = (sig: string) => sig.replace(/m/g, '');
    const m = mirror(cube());
    for (const q of symmetryGroup('cube')) {
      const sig = signature(applyQuat(m, q));
      expect(sig).not.toBe(start);
      // 기호 반전 표시를 지워도 면 배치·방향만으로 이미 다름
      expect(strip(sig)).not.toBe(start);
    }
  });

  it('거울 두 번 → 원래 상태, 거울상에 회전을 적용해도 계속 거울상', () => {
    expect(signature(mirror(mirror(cube())))).toBe(signature(cube()));
    const s = applyOp(mirror(cube()), frontCW90);
    expect(slots(s).every((x) => x.flipped)).toBe(true);
  });
});
