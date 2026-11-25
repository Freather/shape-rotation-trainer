// 그림 정팔면체 그리기: 정면에서 조금 위로 본 한 장. 면은 모두 흰색이고 반투명해서 뒤쪽 그림이 흐리게 비쳐 보인다.
// 그림은 검은 그림 또는 흰 그림(검은 테두리).
// 안 보이는 모서리는 점선. 뒤쪽 그림은 투명한 도형을 들여다본 모습이라 좌우가 뒤집혀 보인다.
// anim이 있으면 그 연산이 p(0~1)만큼 진행된 중간 모습을 그린다.
import type { ReactNode } from 'react';
import { OCTA_NORMALS, SIDE_AXIS, faceVertices, onSide, opTouches, oppositeAxis, swapAxis, type OctaOp, type OctaState } from '../engine/octa';
import { signedAngle } from '../engine/rotation';
import { cross, deg, dot, normalize, quatFromAxisAngle, rotateVec, scale, type Quat, type Vec3 } from '../engine/math';
import { symbolMatrix, symbolWorldSize, type P2 } from './project';
import { Glyph } from './Glyph';

const R = Math.sqrt(3);
const LIGHT = normalize([-0.35, 0.85, 0.45]);
/**
 * 정면에서 24° 위: 앞쪽 4면이 모두 고르게 보이는 각도 (가장 비스듬한 면도 기울기 73° 이내),
 * 뒤쪽 면 그림이 앞쪽 그림과 가장 덜 겹친다. 위아래 꼭짓점은 세로로 선다.
 */
const CAM: Vec3 = normalize([0, 0.407, 0.914]);
const CAM_R = normalize(cross([0, 1, 0], CAM));
const CAM_U = cross(CAM, CAM_R);
const proj = (v: Vec3): P2 => [dot(v, CAM_R), -dot(v, CAM_U)];
const ptsStr = (pts: P2[]) => pts.map((p) => p.map((x) => x.toFixed(3)).join(',')).join(' ');

/** 연산 진행 중 면/그림이 도는 회전 */
function partial(op: OctaOp | null, p: number, n: [number, number, number]): { face: Quat | null; pic: Quat | null } {
  if (!op || p <= 0 || op.kind === 'invert' || !opTouches(op, n)) return { face: null, pic: null };
  if (op.kind === 'swapPics') {
    const b = op.target === 'near' ? swapAxis(op.view, n) : oppositeAxis(op.view, n);
    return { face: null, pic: quatFromAxisAngle(normalize(b as unknown as Vec3), deg(180 * p)) };
  }
  const q = quatFromAxisAngle(SIDE_AXIS[op.view], deg(signedAngle(op.dir, 90) * p));
  return { face: q, pic: q };
}

export function OctaView({ state, size = 160, anim, mark }: { state: OctaState; size?: number; anim?: { op: OctaOp; p: number } | null; mark?: OctaOp | null }) {
  const glyphSize = symbolWorldSize('octa');
  type Item = { depth: number; el: ReactNode };
  const backFills: Item[] = [];
  const backPics: Item[] = [];
  const frontFills: Item[] = [];
  const hiddenEdges: ReactNode[] = [];
  const frontPics: Item[] = [];
  const frontEdges: ReactNode[] = [];
  OCTA_NORMALS.forEach((n0, i) => {
    const n: Vec3 = normalize(n0 as unknown as Vec3);
    const { face: fq, pic: pq } = partial(anim?.op ?? null, anim?.p ?? 0, n0);
    const rf = (v: Vec3) => (fq ? rotateVec(fq, v) : v);
    const rn = rf(n);
    const f0 = state[i];
    const flipping = anim && anim.op.kind === 'invert' && anim.p >= 0.5 && opTouches(anim.op, n0);
    const f = flipping && f0.pic ? { pic: { ...f0.pic, white: !f0.pic.white } } : f0;
    const corners = faceVertices(n0).map((v) => rf(scale(v as unknown as Vec3, R)));
    const center = rf(scale(n0 as unknown as Vec3, R / 3));
    const pts = ptsStr(corners.map(proj));
    const marked = !!mark && onSide(mark, n0);
    const front = dot(rn, CAM) > 1e-3;
    const depth = dot(center, CAM);
    if (front) {
      const shade = 0.5 + 0.5 * dot(rn, LIGHT);
      // 반투명: 뒤쪽 면과 그림이 비쳐 보이게
      frontFills.push({
        depth,
        el: (
          <g key={`f${i}`}>
            <polygon points={pts} fill="#ffffff" fillOpacity={0.7} />
            <polygon points={pts} fill="#000" opacity={(1 - shade) * 0.15} />
          </g>
        ),
      });
      frontEdges.push(
        <g key={`e${i}`}>
          <polygon points={pts} fill="none" stroke="#111" strokeWidth={0.035} strokeLinejoin="round" />
          {marked && <polygon points={pts} fill="none" stroke="#d6336c" strokeWidth={0.08} strokeLinejoin="round" strokeDasharray="0.14 0.08" />}
        </g>,
      );
    } else {
      backFills.push({ depth, el: <polygon key={`b${i}`} points={pts} fill="#ffffff" /> });
      hiddenEdges.push(
        <polygon
          key={`h${i}`}
          points={pts}
          fill="none"
          stroke={marked ? '#d6336c' : '#777'}
          strokeWidth={marked ? 0.05 : 0.022}
          strokeDasharray="0.08 0.06"
          strokeLinejoin="round"
        />,
      );
    }
    if (f.pic) {
      const rp = (v: Vec3) => (pq ? rotateVec(pq, v) : v);
      const pn = rp(n);
      const c = rp(scale(n0 as unknown as Vec3, R / 3));
      const u = normalize(rp(f.pic.up as unknown as Vec3));
      const r = cross(u, pn);
      const visible = dot(pn, CAM) > 1e-3;
      const m = symbolMatrix(proj(c), proj(r), proj(u), visible ? glyphSize : glyphSize * 0.8);
      // 흰 그림은 흰 바탕 + 검은 테두리
      const el = (
        <g key={`p${i}`} transform={`matrix(${m.join(' ')})`}>
          <Glyph id={f.pic.symbol} color={f.pic.white ? '#fff' : '#111'} halo={f.pic.white ? '#111' : undefined} />
        </g>
      );
      (visible ? frontPics : backPics).push({ depth: dot(c, CAM), el });
    }
  });
  const byDepth = (a: Item, b: Item) => a.depth - b.depth;
  const V = 2.05;
  return (
    <svg width={size} height={size} viewBox={`${-V} ${-V} ${V * 2} ${V * 2}`} className="solid-svg">
      {backFills.sort(byDepth).map((x) => x.el)}
      {backPics.sort(byDepth).map((x) => x.el)}
      {frontFills.sort(byDepth).map((x) => x.el)}
      {hiddenEdges}
      {frontPics.sort(byDepth).map((x) => x.el)}
      {frontEdges}
    </svg>
  );
}
