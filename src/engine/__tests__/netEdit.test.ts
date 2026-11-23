import { describe, expect, it } from 'vitest';
import { canDetach, cellsFromNet, foldCells, freeSlots, placeCell, rotateUp, type NetCell } from '../netEdit';
import { defaultRoot, net2D, netPresets, netShapeKey, type Net2D } from '../net';
import { symmetryGroup } from '../rotation';
import { canonicalLabelSignature, plainLabeling } from '../state';
import { getSolid, type SolidId } from '../solids';
import { USABLE_SYMBOLS } from '../../symbols/library';

const labFor = (id: SolidId) => plainLabeling(USABLE_SYMBOLS.slice(0, getSolid(id).faces.length).map((s) => s.id)).map((l, i) => ({ ...l, rot: i % getSolid(id).sides }));
const canon = (id: SolidId, lab: ReturnType<typeof labFor>) => canonicalLabelSignature(id, lab, symmetryGroup(id));

/** 칸 배치의 모양 키 (엔진 전개도와 비교용) */
const cellsKey = (id: SolidId, cells: NetCell[]) =>
  netShapeKey({ solidId: id, faces: cells.map((c) => ({ center: [c.pts.reduce((s, p) => s + p[0], 0) / c.pts.length, c.pts.reduce((s, p) => s + p[1], 0) / c.pts.length] })) } as unknown as Net2D);

describe('전개도 직접 만들기', () => {
  for (const id of ['cube', 'octa', 'tetra'] as SolidId[]) {
    it(`${id}: 프리셋 전개도를 그대로 접으면 원래 입체`, () => {
      const lab = labFor(id);
      for (const tree of netPresets(id)) {
        const cells = cellsFromNet(id, tree, defaultRoot(id), lab);
        const r = foldCells(id, cells);
        expect(r.ok).toBe(true);
        if (r.ok) expect(canon(id, r.labeling)).toBe(canon(id, lab));
      }
    });

    it(`${id}: 떼어 붙인 모든 경우, 접히면 엔진 전개도와 같은 모양이고 그림도 일관됨`, () => {
      const lab = labFor(id);
      let ok = 0;
      let ng = 0;
      for (const tree of netPresets(id).slice(0, 4)) {
        const cells = cellsFromNet(id, tree, defaultRoot(id), lab);
        for (const c of cells) {
          if (!canDetach(cells, c.id)) continue;
          for (const slot of freeSlots(cells, c.id)) {
            const moved = placeCell(cells, c.id, slot, c.up);
            const r = foldCells(id, moved);
            if (!r.ok) {
              ng++;
              continue;
            }
            ok++;
            // 접은 결과의 전개도(엔진 계산)를 다시 펼치면 사용자가 만든 배치와 같은 모양
            const back = net2D(id, r.edges, r.root, r.labeling);
            expect(netShapeKey(back)).toBe(cellsKey(id, moved));
            // 모든 면에 기호가 하나씩
            expect(new Set(r.labeling.map((l) => l.symbol)).size).toBe(getSolid(id).faces.length);
          }
        }
      }
      expect(ok).toBeGreaterThan(0);
      if (id === 'cube') expect(ng).toBeGreaterThan(0);
    });
  }

  it('정육면체: 떼었다가 원래 자리에 그대로 붙이면 같은 입체, 돌려서 붙이면 다른 입체', () => {
    const lab = labFor('cube');
    const cells = cellsFromNet('cube', netPresets('cube')[0], 2, lab);
    const leaf = cells.find((c) => c.id !== cells[0].id && canDetach(cells, c.id))!;
    const home = freeSlots(cells, leaf.id).find(
      (s) => Math.hypot(s.center[0] - leaf.pts.reduce((a, p) => a + p[0], 0) / 4, s.center[1] - leaf.pts.reduce((a, p) => a + p[1], 0) / 4) < 1e-6,
    )!;
    expect(home).toBeTruthy();
    const same = foldCells('cube', placeCell(cells, leaf.id, home, leaf.up));
    expect(same.ok && canon('cube', same.labeling)).toBe(canon('cube', lab));
    const turned = foldCells('cube', placeCell(cells, leaf.id, home, rotateUp(leaf.up, 4, 1)));
    expect(turned.ok).toBe(true);
    if (turned.ok) expect(canon('cube', turned.labeling)).not.toBe(canon('cube', lab));
  });

  it('정육면체: 한 줄로 5칸 이상 이어 붙이면 겹침', () => {
    const lab = labFor('cube');
    // 일자 4칸 + 위아래 1칸씩인 전개도에서 위쪽 칸을 줄 끝에 붙이면 5칸 일자 → 겹침
    const cells = cellsFromNet('cube', netPresets('cube')[0], 2, lab);
    let foundCollision = false;
    for (const c of cells) {
      if (!canDetach(cells, c.id)) continue;
      for (const slot of freeSlots(cells, c.id)) {
        const r = foldCells('cube', placeCell(cells, c.id, slot, c.up));
        if (!r.ok) foundCollision = true;
      }
    }
    expect(foundCollision).toBe(true);
  });
});
