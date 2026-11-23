import { describe, expect, it } from 'vitest';
import { cross, dot, vecClose } from '../math';
import {
  applyT,
  buildTree,
  defaultRoot,
  enumerateSpanningTrees,
  foldTransforms,
  isSpanningTree,
  net2D,
  netOverlaps,
  netPresets,
  netShapeKey,
  polygonsOverlap,
  randomSpanningTree,
  rotateT,
} from '../net';
import { makeRng } from '../rng';
import { SOLID_IDS, adjacentFaces, getSolid, oppositeFace } from '../solids';

describe('전개도 엔진', () => {
  it('9. 신장 트리 간선 수 = 면 수 − 1, 모든 면 연결 (모든 도형 랜덤 20개)', () => {
    const rng = makeRng(7);
    for (const id of SOLID_IDS) {
      const solid = getSolid(id);
      for (let i = 0; i < 20; i++) {
        const tree = randomSpanningTree(id, rng);
        expect(tree).toHaveLength(solid.faces.length - 1);
        expect(isSpanningTree(solid, tree)).toBe(true);
        expect(buildTree(solid, tree, 0).order).toHaveLength(solid.faces.length);
      }
    }
  });

  it('정육면체·정팔면체 신장 트리 384개', () => {
    expect(enumerateSpanningTrees(getSolid('cube'))).toHaveLength(384);
    expect(enumerateSpanningTrees(getSolid('octa'))).toHaveLength(384);
  });

  it('10. 정육면체 프리셋 11종, 정팔면체 11종, 정사면체 2종 — 서로 다른 모양', () => {
    for (const [id, count] of [['cube', 11], ['octa', 11], ['tetra', 2]] as const) {
      const presets = netPresets(id);
      expect(presets).toHaveLength(count);
      const keys = new Set(presets.map((t) => netShapeKey(net2D(id, t, defaultRoot(id)))));
      expect(keys.size).toBe(count);
      // 루트를 바꿔 그려도 같은 모양 키
      const t0 = presets[0];
      expect(netShapeKey(net2D(id, t0, 0))).toBe(netShapeKey(net2D(id, t0, 1)));
    }
  });

  it('11. 펼친 뒤(t=1) 다시 접으면(t=0) 법선·기호 방향이 원래와 동일', () => {
    const rng = makeRng(3);
    for (const id of SOLID_IDS) {
      const solid = getSolid(id);
      const tree = randomSpanningTree(id, rng);
      for (const mode of ['all', 'sequential'] as const) {
        const unfolded = foldTransforms(id, tree, 0, 1, mode);
        // t=1: 모든 면이 루트 면과 같은 평면, 같은 방향
        for (const f of solid.faces) {
          expect(vecClose(rotateT(unfolded[f.id], f.normal), solid.faces[0].normal, 1e-9)).toBe(true);
        }
        const folded = foldTransforms(id, tree, 0, 0, mode);
        for (const f of solid.faces) {
          expect(vecClose(rotateT(folded[f.id], f.normal), f.normal, 1e-9)).toBe(true);
          expect(vecClose(rotateT(folded[f.id], f.upRef), f.upRef, 1e-9)).toBe(true);
          expect(vecClose(applyT(folded[f.id], f.center), f.center, 1e-9)).toBe(true);
        }
      }
    }
  });

  it('반쯤 펼친 상태에서도 경첩 모서리는 붙어 있음', () => {
    const solid = getSolid('cube');
    const tree = netPresets('cube')[3];
    const info = buildTree(solid, tree, 2);
    for (const t of [0.25, 0.5, 0.8]) {
      for (const mode of ['all', 'sequential'] as const) {
        const T = foldTransforms('cube', tree, 2, t, mode);
        for (const c of info.order.slice(1)) {
          const e = solid.edges[info.hinge[c]];
          for (const v of [e.a, e.b]) {
            expect(vecClose(applyT(T[c], solid.vertices[v]), applyT(T[info.parent[c]], solid.vertices[v]), 1e-9)).toBe(true);
          }
        }
      }
    }
  });

  it('펼친 전개도에서 기호 방향 = 오른손 좌표 유지 (뒤집히지 않음)', () => {
    const net = net2D('cube', netPresets('cube')[0], 2);
    for (const f of net.faces) {
      // up × right 의 z 성분이 음수(= 오른쪽이 위에서 시계방향 90°)
      const z = f.up[0] * f.right[1] - f.up[1] * f.right[0];
      expect(z).toBeLessThan(0);
    }
    // 루트 면(앞면)은 똑바로
    const root = net.faces[2];
    expect(root.up[0]).toBeCloseTo(0, 9);
    expect(root.up[1]).toBeCloseTo(1, 9);
    void cross;
    void dot;
  });

  it('12. 랜덤 신장 트리 200개 → 모두 겹침 검사 통과', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 200; i++) {
      const id = SOLID_IDS[i % SOLID_IDS.length];
      const tree = randomSpanningTree(id, rng);
      expect(netOverlaps(net2D(id, tree, 0))).toBe(false);
    }
  });

  it('겹침 검사 자체: 겹치는 사각형 / 맞닿은 사각형', () => {
    const sq = (x: number, y: number): [number, number][] => [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    expect(polygonsOverlap(sq(0, 0), sq(0.5, 0.5))).toBe(true);
    expect(polygonsOverlap(sq(0, 0), sq(1, 0))).toBe(false);
  });

  it('13. 정육면체 전개도에서 oppositeFace = 3D 정반대 면, 전개도에서는 절대 이웃하지 않음', () => {
    const solid = getSolid('cube');
    for (const tree of netPresets('cube')) {
      const net = net2D('cube', tree, 2);
      for (const f of solid.faces) {
        const o = oppositeFace(solid, f.id)!;
        expect(dot(solid.faces[o].normal, f.normal)).toBeCloseTo(-1, 12);
        expect(adjacentFaces(solid, f.id, o)).toBe(false);
        // 2D에서 꼭짓점을 공유하지 않음 (변으로 붙어 있지 않음)
        const shared = net.faces[f.id].pts.filter((p) =>
          net.faces[o].pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9),
        );
        expect(shared.length).toBeLessThan(2);
      }
    }
  });
});
