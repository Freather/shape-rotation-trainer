// 그림 정팔면체 그리기: 45° 위에서 비스듬히 본 한 장. 뒤에 숨은 면은 비쳐 보이게 그린다.
// 숨은 면은 테두리를 점선으로, 가운데 작은 칸으로 색(검은 면은 회색 칸, 흰 면은 흰 칸)과 흐린 그림을 보여준다 (투명한 도형을 들여다본 모습이라 좌우가 뒤집혀 보임).
// anim이 있으면 그 연산이 p(0~1)만큼 진행된 중간 모습을 그린다.
import type { ReactNode } from 'react';
import { OCTA_COLORS, OCTA_NORMALS, faceVertices, onSide, opTouches, oppositeAxis, swapAxis, type OctaOp, type OctaState } from '../engine/octa';
import { VIEW_AXIS, signedAngle } from '../engine/rotation';
import { add, cross, deg, dot, normalize, quatFromAxisAngle, rotateVec, scale, sub, type Quat, type Vec3 } from '../engine/math';
import { symbolMatrix, symbolWorldSize, type P2 } from './project';
import { Glyph } from './Glyph';

const R = Math.sqrt(3);
const LIGHT = normalize([-0.35, 0.85, 0.45]);
/** 오른쪽 앞에서 45° 내려다보는 방향 */
const CAM: Vec3 = normalize([0.5, 1, 0.866]);
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
  const q = quatFromAxisAngle(VIEW_AXIS[op.view], deg(signedAngle(op.dir, 90) * p));
  return op.kind === 'movePics' ? { face: null, pic: q } : { face: q, pic: q };
}

export function OctaView({ state, size = 160, anim, mark }: { state: OctaState; size?: number; anim?: { op: OctaOp; p: number } | null; mark?: OctaOp | null }) {
  const glyphSize = symbolWorldSize('octa');
  const fronts: { depth: number; base: ReactNode; top: ReactNode }[] = [];
  const hiddens: ReactNode[] = [];
  const strongPics: { depth: number; el: ReactNode }[] = [];
  const faintPics: ReactNode[] = [];
  OCTA_NORMALS.forEach((n0, i) => {
    const n: Vec3 = normalize(n0 as unknown as Vec3);
    const { face: fq, pic: pq } = partial(anim?.op ?? null, anim?.p ?? 0, n0);
    const rf = (v: Vec3) => (fq ? rotateVec(fq, v) : v);
    const rn = rf(n);
    const f0 = state[i];
    const flipping = anim && anim.op.kind === 'invert' && anim.p >= 0.5 && opTouches(anim.op, n0);
    const f = flipping ? { ...f0, color: 1 - f0.color } : f0;
    const corners = faceVertices(n0).map((v) => rf(scale(v as unknown as Vec3, R)));
    const center = rf(scale(n0 as unknown as Vec3, R / 3));
    const pts = corners.map(proj);
    const marked = !!mark && onSide(mark, n0);
    if (dot(rn, CAM) > 1e-3) {
      const shade = 0.5 + 0.5 * dot(rn, LIGHT);
      fronts.push({
        depth: dot(center, CAM),
        base: (
          <g key={`f${i}`}>
            <polygon points={ptsStr(pts)} fill={OCTA_COLORS[f.color]} />
            <polygon points={ptsStr(pts)} fill="#000" opacity={(1 - shade) * 0.22} />
          </g>
        ),
        top: (
          <g key={`e${i}`}>
            <polygon points={ptsStr(pts)} fill="none" stroke="#111" strokeWidth={0.04} strokeLinejoin="round" />
            {marked && <polygon points={ptsStr(pts)} fill="none" stroke="#d6336c" strokeWidth={0.09} strokeLinejoin="round" strokeDasharray="0.14 0.08" />}
          </g>
        ),
      });
    } else {
      // 숨은 면: 면을 줄인 칸에 색, 점선 테두리
      const inner = corners.map((c) => proj(add(center, scale(sub(c, center), 0.55))));
      hiddens.push(
        <g key={`h${i}`}>
          <polygon points={ptsStr(pts)} fill="none" stroke="#666" strokeWidth={0.026} strokeDasharray="0.09 0.07" strokeLinejoin="round" />
          <polygon points={ptsStr(inner)} fill={f.color === 1 ? '#8a8a8f' : '#ffffff'} fillOpacity={f.color === 1 ? 0.75 : 0.9} stroke={marked ? '#d6336c' : '#666'} strokeWidth={marked ? 0.06 : 0.026} strokeDasharray="0.09 0.07" />
        </g>,
      );
    }
    if (f.pic) {
      const rp = (v: Vec3) => (pq ? rotateVec(pq, v) : v);
      const pn = rp(n);
      const c = rp(scale(n0 as unknown as Vec3, R / 3));
      const u = normalize(rp(f.pic.up as unknown as Vec3));
      const r = cross(u, pn);
      const visible = dot(pn, CAM) > 1e-3;
      const m = symbolMatrix(proj(c), proj(r), proj(u), visible ? glyphSize : glyphSize * 0.6);
      const el = (
        <g key={`p${i}`} transform={`matrix(${m.join(' ')})`} opacity={visible ? 1 : 0.55}>
          <Glyph id={f.pic.symbol} color={!visible || pq ? '#111' : f.color === 1 ? '#fff' : '#111'} halo={pq ? '#fff' : undefined} />
        </g>
      );
      if (visible) strongPics.push({ depth: dot(c, CAM), el });
      else faintPics.push(el);
    }
  });
  fronts.sort((a, b) => a.depth - b.depth);
  strongPics.sort((a, b) => a.depth - b.depth);
  const V = 2.15;
  const front = proj([0, 0, R + 0.42]);
  return (
    <svg width={size} height={size} viewBox={`${-V} ${-V} ${V * 2} ${V * 2}`} className="solid-svg">
      {fronts.map((x) => x.base)}
      {hiddens}
      {faintPics}
      {strongPics.map((x) => x.el)}
      {fronts.map((x) => x.top)}
      <text x={front[0]} y={front[1]} fontSize={0.3} textAnchor="middle" dominantBaseline="middle" fill="#d6336c" fontWeight={700}>
        앞
      </text>
    </svg>
  );
}
