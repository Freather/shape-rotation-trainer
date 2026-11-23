import { describe, expect, it } from 'vitest';
import { deg, quatFromAxisAngle, quatNorm, rotateVec, vecClose } from '../math';
import { symmetryGroup } from '../rotation';
import { CAMERA_DIR, SOLID_IDS, getSolid, oppositeFace, visibleSlots, type SolidId } from '../solids';
import {
  applyOp,
  applyOps,
  applyQuat,
  canonicalLabelSignature,
  initialState,
  lookOf,
  mirror,
  mirrorLabeling,
  plainLabeling,
  signature,
  visibleSignature,
} from '../state';
import { USABLE_SYMBOLS } from '../../symbols/library';

const FACE_COUNT: Record<SolidId, number> = { tetra: 4, cube: 6, octa: 8, dodeca: 12, icosa: 20 };
const SIDES: Record<SolidId, number> = { tetra: 3, cube: 4, octa: 3, dodeca: 5, icosa: 3 };
const GROUP: Record<SolidId, number> = { tetra: 12, cube: 24, octa: 24, dodeca: 60, icosa: 60 };
const FOLD_DEG: Record<SolidId, number> = { tetra: 109.47, cube: 90, octa: 70.53, dodeca: 63.43, icosa: 41.81 };

const labFor = (id: SolidId) => plainLabeling(USABLE_SYMBOLS.slice(0, FACE_COUNT[id]).map((s) => s.id));

describe.each(SOLID_IDS)('%s', (id) => {
  const solid = getSolid(id);

  it('면 수·각 수·펼침 각도', () => {
    expect(solid.faces).toHaveLength(FACE_COUNT[id]);
    expect(solid.sides).toBe(SIDES[id]);
    for (const f of solid.faces) expect(f.vertices).toHaveLength(SIDES[id]);
    expect((solid.foldAngle * 180) / Math.PI).toBeCloseTo(FOLD_DEG[id], 1);
    // 오일러 공식 V − E + F = 2
    expect(solid.vertices.length - solid.edges.length + solid.faces.length).toBe(2);
  });

  it('6. 회전대칭군 원소 개수', () => {
    expect(symmetryGroup(id)).toHaveLength(GROUP[id]);
    const sigs = new Set(symmetryGroup(id).map((q) => signature(applyQuat(initialState(id), q))));
    expect(sigs.size).toBe(GROUP[id]);
  });

  it('모든 대칭 회전은 꼭짓점을 꼭짓점으로 보냄', () => {
    for (const q of symmetryGroup(id)) {
      expect(Math.abs(quatNorm(q) - 1)).toBeLessThan(1e-12);
      for (const v of solid.vertices) {
        const w = rotateVec(q, v);
        expect(solid.vertices.some((u) => vecClose(u, w, 1e-9))).toBe(true);
      }
    }
  });

  it('면 축 회전을 n번 반복하면 원래대로 (정십이면체 72° × 5 포함)', () => {
    const lab = labFor(id);
    const start = signature(initialState(id));
    const n = solid.sides;
    for (const f of solid.faces) {
      const op = { kind: 'face' as const, symbol: lab[f.id].symbol, dir: 'cw' as const, angle: 360 / n };
      const s = applyOps(initialState(id), Array(n).fill(op), lab);
      expect(signature(s)).toBe(start);
    }
  });

  it('8. 거울상은 어떤 회전으로도 원래 모습과 같아지지 않음 (키랄 기호 라벨)', () => {
    const lab = labFor(id).map((l, i) => ({ ...l, symbol: USABLE_SYMBOLS.filter((s) => s.chiral)[i % 10].id }));
    // 기호 중복이 있으면 안 되므로 앞의 면들만 키랄로 교체
    const real = labFor(id).map((l, i) => (i < 10 ? lab[i] : l));
    const canon = canonicalLabelSignature(id, real, symmetryGroup(id));
    const mirrored = canonicalLabelSignature(id, mirrorLabeling(id, real), symmetryGroup(id));
    expect(mirrored).not.toBe(canon);
  });

  it('보이는 면이 하나 이상, 정반대 면 쌍', () => {
    expect(visibleSlots(solid).length).toBeGreaterThanOrEqual(id === 'tetra' ? 2 : 3);
    for (const f of solid.faces) {
      const o = oppositeFace(solid, f.id);
      if (id === 'tetra') expect(o).toBeNull();
      else expect(oppositeFace(solid, o!)).toBe(f.id);
    }
  });

  it('upRef는 면 위의 단위벡터', () => {
    for (const f of solid.faces) {
      expect(Math.abs(f.upRef[0] * f.normal[0] + f.upRef[1] * f.normal[1] + f.upRef[2] * f.normal[2])).toBeLessThan(1e-9);
    }
  });
});

describe('기본 시점', () => {
  it('정육면체: 앞·위·오른쪽 면이 보임', () => {
    expect(visibleSlots(getSolid('cube')).sort()).toEqual([0, 2, 4]);
    expect(CAMERA_DIR[2]).toBeGreaterThan(0);
  });
  it('정십이면체: 정면(+Z)이 면 축', () => {
    expect(vecClose(getSolid('dodeca').faces[0].normal, [0, 0, 1], 1e-9)).toBe(true);
  });
});

describe('모습(Look)', () => {
  it('회전 후 모습 = 상태 시그니처와 일관', () => {
    const lab = labFor('cube');
    const s = applyOp(initialState('cube'), { kind: 'view', view: 'front', dir: 'cw', angle: 90 });
    const look = lookOf(s, lab);
    // 오른쪽 슬롯(4)에는 윗면(0)의 기호
    expect(look.slots[4].symbol).toBe(lab[0].symbol);
    expect(visibleSignature(look)).not.toBe(visibleSignature(lookOf(initialState('cube'), lab)));
  });
  it('거울상 모습은 뒤집힘 표시가 붙음(키랄 기호)', () => {
    const lab = plainLabeling(['flag', 'ell', 'rtri', 'cornerbox', 'hook', 't_F']);
    const look = lookOf(mirror(initialState('cube')), lab);
    expect(look.slots.every((s) => s.flip)).toBe(true);
  });
  it('임의 축 90°는 정십이면체 대칭이 아님 → 스냅되어도 슬롯 검사에서 걸러지지 않게 대칭 회전만 사용', () => {
    const q = quatFromAxisAngle([0, 1, 0], deg(90));
    expect(symmetryGroup('dodeca').some((g) => Math.abs(Math.abs(g[0] * q[0] + g[1] * q[1] + g[2] * q[2] + g[3] * q[3]) - 1) < 1e-9)).toBe(false);
  });
});
