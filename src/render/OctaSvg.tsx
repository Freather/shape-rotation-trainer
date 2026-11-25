// 그림 정팔면체 그리기: 위에서 본 모습과 아래에서 본 모습 두 장으로 8면을 모두 보여준다.
// anim이 있으면 그 연산이 p(0~1)만큼 진행된 중간 모습을 그린다.
import type { ReactNode } from 'react';
import { OCTA_COLORS, OCTA_NORMALS, faceVertices, opTouches, swapAxis, type OctaOp, type OctaState } from '../engine/octa';
import { VIEW_AXIS, signedAngle } from '../engine/rotation';
import { cross, deg, dot, normalize, quatFromAxisAngle, rotateVec, scale, type Quat, type Vec3 } from '../engine/math';
import { symbolMatrix, symbolWorldSize, type P2 } from './project';
import { Glyph } from './Glyph';

const R = Math.sqrt(3);
const LIGHT = normalize([-0.35, 0.85, 0.45]);

type Side = 'top' | 'bottom';
const CAMERA: Record<Side, Vec3> = { top: normalize([0.16, 1, 0.38]), bottom: normalize([0.16, -1, 0.38]) };

function cameraFrame(side: Side) {
  const cam = CAMERA[side];
  const hint: Vec3 = [0, 0, -1];
  const right = normalize(cross(hint, cam));
  const up = cross(cam, right);
  return { cam, right, up };
}

/** 연산 진행 중 면/그림이 도는 회전 */
function partial(op: OctaOp | null, p: number, n: Vec3): { face: Quat | null; pic: Quat | null } {
  if (!op || p <= 0 || !opTouches(op, n as [number, number, number])) return { face: null, pic: null };
  if (op.kind === 'swapPics') {
    const b = swapAxis(op.view, n as [number, number, number]);
    return { face: null, pic: quatFromAxisAngle(normalize(b), deg(180 * p)) };
  }
  const q = quatFromAxisAngle(VIEW_AXIS[op.view], deg(signedAngle(op.dir, 90) * p));
  return op.kind === 'movePics' ? { face: null, pic: q } : { face: q, pic: q };
}

export function OctaSvg({ state, side, size = 130, anim, mark }: { state: OctaState; side: Side; size?: number; anim?: { op: OctaOp; p: number } | null; mark?: OctaOp | null }) {
  const { cam, right, up } = cameraFrame(side);
  const proj = (v: Vec3): P2 => [dot(v, right), -dot(v, up)];
  const glyphSize = symbolWorldSize('octa');
  const items: { depth: number; el: ReactNode }[] = [];
  const pics: { depth: number; el: ReactNode }[] = [];
  OCTA_NORMALS.forEach((n0, i) => {
    const n: Vec3 = normalize(n0 as unknown as Vec3);
    const { face: fq, pic: pq } = partial(anim?.op ?? null, anim?.p ?? 0, n0 as unknown as Vec3);
    const rf = (v: Vec3) => (fq ? rotateVec(fq, v) : v);
    const rn = rf(n);
    const f = state[i];
    if (dot(rn, cam) > 1e-3) {
      const pts = faceVertices(n0).map((v) => proj(rf(scale(v as unknown as Vec3, R))));
      const shade = 0.5 + 0.5 * dot(rn, LIGHT);
      const ptsStr = pts.map((p) => p.map((x) => x.toFixed(3)).join(',')).join(' ');
      const center = rf(scale(n0 as unknown as Vec3, R / 3));
      items.push({
        depth: dot(center, cam),
        el: (
          <g key={`f${i}`}>
            <polygon points={ptsStr} fill={OCTA_COLORS[f.color]} />
            <polygon points={ptsStr} fill="#000" opacity={(1 - shade) * 0.22} />
            <polygon points={ptsStr} fill="none" stroke="#111" strokeWidth={0.04} strokeLinejoin="round" />
            {mark && mark.kind !== 'turn' && mark.kind !== 'swapPics' && opTouches(mark, n0) && (
              <polygon points={ptsStr} fill="none" stroke="#d6336c" strokeWidth={0.09} strokeLinejoin="round" strokeDasharray="0.14 0.08" />
            )}
          </g>
        ),
      });
    }
    if (f.pic) {
      const rp = (v: Vec3) => (pq ? rotateVec(pq, v) : v);
      const pn = rp(n);
      // 그림 옮기기 중에는 뒤로 넘어가는 그림도 잠깐 흐리게 보여준다
      const facing = dot(pn, cam);
      if (facing > 1e-3 || (pq && !fq && facing > -0.6)) {
        const c = rp(scale(n0 as unknown as Vec3, R / 3 + (pq && !fq ? 0.12 : 0)));
        const u = normalize(rp(f.pic.up as unknown as Vec3));
        const r = cross(u, pn);
        const m = symbolMatrix(proj(c), proj(r), proj(u), glyphSize);
        const target = fq ? items : pics;
        target.push({
          depth: dot(c, cam) + 1e-4,
          el: (
            <g key={`p${i}`} transform={`matrix(${m.join(' ')})`} opacity={facing > 1e-3 ? 1 : 0.35}>
              <Glyph id={f.pic.symbol} />
            </g>
          ),
        });
      }
    }
  });
  items.sort((a, b) => a.depth - b.depth);
  pics.sort((a, b) => a.depth - b.depth);
  const V = 2.05;
  const front = proj([0, 0, R + 0.45]);
  return (
    <svg width={size} height={size} viewBox={`${-V} ${-V} ${V * 2} ${V * 2}`} className="solid-svg">
      {items.map((x) => x.el)}
      {pics.map((x) => x.el)}
      <text x={front[0]} y={front[1]} fontSize={0.32} textAnchor="middle" dominantBaseline="middle" fill="#d6336c" fontWeight={700}>
        앞
      </text>
    </svg>
  );
}

/** 위·아래 두 장 */
export function OctaPair({
  state,
  size = 130,
  anim,
  captions = true,
  mark,
}: {
  state: OctaState;
  size?: number;
  anim?: { op: OctaOp; p: number } | null;
  captions?: boolean;
  /** 이 연산이 움직이는 4면을 빨간 점선으로 */
  mark?: OctaOp | null;
}) {
  return (
    <div className="octa-pair">
      <figure className="fig">
        <OctaSvg state={state} side="top" size={size} anim={anim} mark={mark} />
        {captions && <figcaption>위에서 본 모습</figcaption>}
      </figure>
      <figure className="fig">
        <OctaSvg state={state} side="bottom" size={size} anim={anim} mark={mark} />
        {captions && <figcaption>아래에서 본 모습</figcaption>}
      </figure>
    </div>
  );
}
