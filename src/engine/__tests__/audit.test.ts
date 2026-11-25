// 전수검사: 모든 유형·레벨·도형을 여러 seed로 만들어 문제 오류가 없는지 본다.
// - 보기 수, 보기끼리 겹침, 정답 표시
// - 정답이 하나뿐인지 (다른 보기도 맞는 답이 되면 오류)
// - 풀 수 있는 정보가 문제에 다 있는지
import { describe, expect, it } from 'vitest';
import { figureKey, generateQuestion, type QType, type Question } from '../question';
import { symmetryGroup } from '../rotation';
import { lookOf, visibleSignature, type Labeling, type Look } from '../state';
import { SOLID_IDS, type SolidId } from '../solids';
import { viewGrid, gridKey } from '../blocks';
import { LOOKALIKE_GROUPS, getSymbol } from '../../symbols/library';
import { randomLabeling } from '../rules';
import { randomCells, pickShape } from '../radial/generate';
import { randomOcta } from '../octa';
import { makeRng } from '../rng';
import { getSolid } from '../solids';

const SEEDS = 60;
const maxLevelFor = (t: QType) => (t === 8 || t === 9 ? 4 : 5);
const TYPES: QType[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const isViewOf = (look: Look, solidId: SolidId, lab: Labeling) =>
  symmetryGroup(solidId).some((g) => visibleSignature(lookOf({ solidId, q: g, mirrored: false }, lab)) === visibleSignature(look));

function each(fn: (q: Question, label: string) => void, types = TYPES, solids: (SolidId | undefined)[] = [undefined]) {
  for (const type of types)
    for (let level = 1; level <= maxLevelFor(type); level++)
      for (const solidId of solids)
        for (let seed = 1; seed <= SEEDS; seed++) {
          const label = `유형${type} 레벨${level} ${solidId ?? ''} seed${seed}`;
          let q: Question;
          try {
            q = generateQuestion({ type, level, seed: seed * 7919 + level, solidId });
          } catch (e) {
            throw new Error(`${label}: 생성 실패 ${(e as Error).message}`);
          }
          fn(q, label);
        }
}

describe('전수검사', { timeout: 300_000 }, () => {
  it('보기 수, 겹침, 정답 표시', () => {
    const bad: string[] = [];
    each((q, label) => {
      const n = q.type === 3 ? 2 : 5;
      if (q.options.length !== n) bad.push(`${label}: 보기 ${q.options.length}개`);
      if (new Set(q.options.map((o) => figureKey(o.figure))).size !== q.options.length) bad.push(`${label}: 보기 겹침`);
      if (q.options[q.answer]?.tag !== 'correct') bad.push(`${label}: 정답 표시 틀림`);
      if (q.options.filter((o) => o.tag === 'correct').length !== 1) bad.push(`${label}: 정답 표시가 하나가 아님`);
    });
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('입체 유형은 도형마다 생성됨', () => {
    const bad: string[] = [];
    for (const solidId of SOLID_IDS)
      for (const type of [1, 2, 3, 4, 5, 6, 7, 10] as QType[]) {
        if ([4, 5, 6, 7].includes(type) && (solidId === 'dodeca' || solidId === 'icosa')) continue;
        if (type === 6 && solidId === 'tetra') continue;
        for (let seed = 1; seed <= 15; seed++)
          for (let level = 1; level <= 5; level++) {
            try {
              const q = generateQuestion({ type, level, seed, solidId });
              const n = q.type === 3 ? 2 : 5;
              if (q.options.length !== n || new Set(q.options.map((o) => figureKey(o.figure))).size !== n) bad.push(`유형${type} ${solidId} 레벨${level} seed${seed}: 보기 이상`);
            } catch (e) {
              bad.push(`유형${type} ${solidId} 레벨${level} seed${seed}: ${(e as Error).message}`);
            }
          }
      }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('입체를 볼 때 안 보이는 면이 필요한 문제는 전개도가 같이 있음 (유형 1, 2)', () => {
    const bad: string[] = [];
    each((q, label) => {
      if (!q.stem.some((f) => f.kind === 'net')) bad.push(`${label}: 전개도 없음`);
    }, [1, 2]);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('유형 3: O/X 정답이 실제와 맞음', () => {
    const bad: string[] = [];
    each((q, label) => {
      const [net, view] = q.stem;
      if (net.kind !== 'net' || view.kind !== 'solid') return bad.push(`${label}: 그림 형식`);
      const truth = isViewOf(view.look, net.solidId, net.labeling);
      const ans = q.options[q.answer].figure;
      if (ans.kind !== 'ox' || ans.value !== truth) bad.push(`${label}: O/X 정답 틀림`);
    }, [3]);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('유형 4: 정답만 전개도로 만들 수 있음', () => {
    const bad: string[] = [];
    each((q, label) => {
      const net = q.stem[0];
      if (net.kind !== 'net') return;
      q.options.forEach((o, i) => {
        if (o.figure.kind !== 'solid') return;
        if (isViewOf(o.figure.look, net.solidId, net.labeling) !== (i === q.answer)) bad.push(`${label}: 보기 ${i + 1} 판정 틀림`);
      });
    }, [4]);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('유형 5: 두 그림과 맞는 전개도는 정답 하나', () => {
    const bad: string[] = [];
    each((q, label) => {
      const [a, b] = q.stem;
      if (a.kind !== 'solid' || b.kind !== 'solid') return;
      const solidId = a.look.solidId;
      q.options.forEach((o, i) => {
        if (o.figure.kind !== 'net') return;
        const lab = o.figure.labeling;
        // 이 전개도로 만든 입체를 어떻게 돌려도 (가)·(나)가 같이 나오는지
        const ok = symmetryGroup(solidId).some((g) => {
          const va = visibleSignature(lookOf({ solidId, q: g, mirrored: false }, lab));
          return va === visibleSignature(a.look);
        });
        if (i === q.answer && !ok) bad.push(`${label}: 정답 전개도가 (가)와 안 맞음`);
      });
    }, [5]);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('유형 15: 정답 보기만 그 방향 모양', () => {
    const bad: string[] = [];
    each((q, label) => {
      const s = q.stem[0];
      if (s.kind !== 'blocks') return;
      const v = (['front', 'top', 'right'] as const).find((d) => q.prompt.includes({ front: '앞', top: '위', right: '오른쪽' }[d] + '에서'));
      if (!v) return bad.push(`${label}: 방향을 못 찾음`);
      const truth = gridKey(viewGrid(s.cells, v));
      q.options.forEach((o, i) => {
        if (o.figure.kind !== 'grid') return;
        if ((gridKey(o.figure.grid) === truth) !== (i === q.answer)) bad.push(`${label}: 보기 ${i + 1}`);
      });
    }, [15]);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('한 문제 안에 비슷해 보이는 그림이 둘 이상 없고, 별은 오각형 면에 안 씀', () => {
    const bad: string[] = [];
    const check = (ids: string[], where: string) => {
      for (const g of LOOKALIKE_GROUPS) if (ids.filter((id) => g.includes(id)).length > 1) bad.push(`${where}: ${ids.filter((id) => g.includes(id)).join(',')}`);
    };
    let common = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const solidId of SOLID_IDS) {
        const lab = randomLabeling(solidId, makeRng(seed));
        const ids = lab.map((l) => l.symbol);
        check(ids, `${solidId} seed${seed}`);
        if (new Set(ids).size !== ids.length) bad.push(`${solidId} seed${seed}: 같은 그림 두 번`);
        const n = getSolid(solidId).sides;
        if (ids.some((id) => n % getSymbol(id).rotationalOrder === 0 && getSymbol(id).rotationalOrder > 1)) bad.push(`${solidId} seed${seed}: 돌려도 같은 그림`);
        if (ids.some((id) => ['heart', 'star', 'smile'].includes(id))) common++;
      }
      const rng = makeRng(seed);
      const shape = pickShape(4, rng);
      const cells = randomCells(shape, rng, { symbolCount: 6 });
      const rids = cells.flat().map((c) => c.symbol).filter((x): x is string => !!x);
      check(rids, `평면 seed${seed}`);
      const o = randomOcta(makeRng(seed), 6);
      check(o.map((f) => f.pic?.symbol).filter((x): x is string => !!x), `정팔면체 seed${seed}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    // 흔한 그림이 대부분의 문제에 하나 이상 나옴
    expect(common).toBeGreaterThan(300 * SOLID_IDS.length * 0.8);
  });
});
