// 전개도 모음: 정육면체와 정팔면체의 전개도 11가지를 한눈에.
// 마주 보는 면은 같은 색, 주사위처럼 숫자를 붙였다 (정육면체 합 7, 정팔면체 합 9).
// 카드를 누르면 오른쪽에서 그 전개도를 접어 볼 수 있다.
import { useMemo, useState } from 'react';
import { QUAT_IDENTITY } from '../../engine/math';
import { defaultRoot, net2D, netPresets } from '../../engine/net';
import { getSolid, oppositeFace } from '../../engine/solids';
import type { Labeling } from '../../engine/state';
import { NetSvg } from '../../render/NetSvg';
import { FoldSolution } from '../../render/SolutionPlayer';

type GallerySolid = 'cube' | 'octa';

/** 마주 보는 면끼리 숫자 합이 같게 붙인 라벨 */
function pairLabeling(solidId: GallerySolid): Labeling {
  const solid = getSolid(solidId);
  const n = solid.faces.length;
  const num: number[] = new Array(n).fill(0);
  let k = 1;
  for (const f of solid.faces) {
    if (num[f.id]) continue;
    num[f.id] = k;
    num[oppositeFace(solid, f.id)!] = n + 1 - k;
    k++;
  }
  return num.map((x) => ({ symbol: `${solidId === 'cube' ? 'c' : 'o'}_${x}`, rot: 0, flip: false }));
}

/** 정육면체 전개도 이름: 한 줄로 이어진 면 수로 나눈다 */
function cubeFamily(edges: number[]): string {
  const net = net2D('cube', edges, defaultRoot('cube'));
  const s = getSolid('cube');
  const e = s.edges[0];
  const len = Math.hypot(...[0, 1, 2].map((i) => s.vertices[e.a][i] - s.vertices[e.b][i]));
  const cells = net.faces.map((f) => [Math.round(f.center[0] / len), Math.round(f.center[1] / len)] as [number, number]);
  const runs = (axis: 0 | 1) => {
    const lines = new Map<number, number[]>();
    for (const c of cells) lines.set(c[1 - axis], [...(lines.get(c[1 - axis]) ?? []), c[axis]]);
    const out: number[] = [];
    for (const xs of lines.values()) {
      xs.sort((a, b) => a - b);
      let run = 1;
      for (let i = 1; i <= xs.length; i++) {
        if (i < xs.length && xs[i] === xs[i - 1] + 1) run++;
        else {
          out.push(run);
          run = 1;
        }
      }
    }
    return out;
  };
  const all = [runs(0), runs(1)];
  const longest = Math.max(...all.flat());
  if (longest === 4) return '1-4-1형';
  if (longest === 2) return '2-2-2형';
  return all.some((r) => r.filter((x) => x === 3).length === 2) ? '3-3형' : '2-3-1형';
}

const FAMILY_ORDER = ['1-4-1형', '2-3-1형', '2-2-2형', '3-3형'];

export function NetGallery() {
  const [solidId, setSolidId] = useState<GallerySolid>('cube');
  const [picked, setPicked] = useState(0);
  const lab = useMemo(() => pairLabeling(solidId), [solidId]);
  const nets = useMemo(() => {
    const list = netPresets(solidId).map((edges) => ({ edges, family: solidId === 'cube' ? cubeFamily(edges) : '' }));
    return solidId === 'cube' ? [...list].sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family)) : list;
  }, [solidId]);
  const root = defaultRoot(solidId);
  // 모든 전개도를 같은 배율로: 가장 큰 전개도가 카드 폭에 맞게
  const extent = (edges: number[]) => {
    const n = net2D(solidId, edges, root);
    return Math.max(n.maxX - n.minX, n.maxY - n.minY) + 0.3;
  };
  const maxExtent = Math.max(...nets.map((n) => extent(n.edges)));
  const px = 150 / maxExtent;
  const cur = nets[Math.min(picked, nets.length - 1)];
  const counts = FAMILY_ORDER.map((f) => [f, nets.filter((x) => x.family === f).length] as const).filter(([, c]) => c > 0);

  return (
    <div className="net-gallery">
      <div className="gallery-head">
        <div className="seg">
          {(['cube', 'octa'] as GallerySolid[]).map((id) => (
            <button
              key={id}
              className={solidId === id ? 'on' : ''}
              onClick={() => {
                setSolidId(id);
                setPicked(0);
              }}
            >
              {id === 'cube' ? '정육면체' : '정팔면체'}
            </button>
          ))}
        </div>
        <p className="muted small">
          {solidId === 'cube' ? '정육면체' : '정팔면체'} 전개도는 모두 {nets.length}가지예요. 같은 색 면끼리 접으면 서로 마주 봐요
          (숫자 합이 {solidId === 'cube' ? 7 : 9}). 카드를 누르면 접어 볼 수 있어요.
        </p>
        {counts.length > 0 && (
          <div className="family-chips">
            {counts.map(([f, c]) => (
              <span key={f} className="chip">
                {f} {c}개
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="gallery-body">
        <div className="gallery-grid">
          {nets.map((n, i) => (
            <button key={i} className={i === picked ? 'net-card on' : 'net-card'} onClick={() => setPicked(i)}>
              <span className="net-no">{i + 1}</span>
              {n.family && <span className="net-family">{n.family}</span>}
              <div className="net-pic">
                <NetSvg solidId={solidId} edges={n.edges} root={root} labeling={lab} size={px * extent(n.edges)} forceColor />
              </div>
            </button>
          ))}
        </div>
        <aside className="gallery-detail">
          <h3>
            {picked + 1}번 전개도{cur.family && <span className="net-family inline">{cur.family}</span>}
          </h3>
          <FoldSolution
            key={`${solidId}-${picked}`}
            sol={{ kind: 'fold', solidId, labeling: lab, edges: cur.edges, root, finalQ: QUAT_IDENTITY, ops: [], labels: [] }}
            size={260}
            forceColor
          />
        </aside>
      </div>
    </div>
  );
}
