// three.js(R3F) 입체 렌더: 면마다 직접 만든 다각형 + Canvas 텍스처 기호.
// 자세·펼침은 모두 엔진의 순수 함수 결과를 그대로 보여주기만 한다.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getSymbol } from '../symbols/library';
import { getSolid, faceCircumradius, type SolidId } from '../engine/solids';
import { labelFrame, type FaceLabel, type Labeling } from '../engine/state';
import { add, dot, scale, sub, type Quat, type Vec3 } from '../engine/math';
import type { RigidTransform } from '../engine/net';
import { symbolWorldSize } from './project';

const TEX = 256;

function drawSymbolCanvas(ctx: CanvasRenderingContext2D, symbolId: string, bg: string, symbolFrac: number) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TEX, TEX);
  const s = getSymbol(symbolId);
  const px = TEX * symbolFrac;
  ctx.save();
  ctx.translate(TEX / 2 - px / 2, TEX / 2 - px / 2);
  ctx.scale(px / 100, px / 100);
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6;
  if (s.text) {
    ctx.font = "900 78px 'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.text, 50, 54);
  } else {
    for (const p of s.parts!) {
      const path = new Path2D(p.d);
      if (p.mode === 'fill') ctx.fill(path);
      else ctx.stroke(path);
    }
  }
  ctx.restore();
}

const texCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(symbolId: string, bg: string, frac: number): THREE.CanvasTexture {
  const key = `${symbolId}|${bg}|${frac.toFixed(3)}`;
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = TEX;
    c.height = TEX;
    drawSymbolCanvas(c.getContext('2d')!, symbolId, bg, frac);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

/** 면 하나의 지오메트리 (원래 도형 좌표). UV는 기호 위쪽 = 라벨 up 방향이 되도록 직접 계산 */
function faceGeometry(solidId: SolidId, face: number, label: FaceLabel): THREE.BufferGeometry {
  const solid = getSolid(solidId);
  const f = solid.faces[face];
  const R = faceCircumradius(solid, face);
  const { up, right } = labelFrame(solidId, face, label);
  const verts = f.vertices.map((v) => solid.vertices[v]);
  const pos: number[] = [];
  const uv: number[] = [];
  const pushV = (p: readonly number[]) => {
    pos.push(p[0], p[1], p[2]);
    const d = sub(p as [number, number, number], f.center);
    uv.push(0.5 + dot(d, right) / (2 * R), 0.5 + dot(d, up) / (2 * R));
  };
  for (let i = 0; i < verts.length; i++) {
    pushV(f.center);
    pushV(verts[i]);
    pushV(verts[(i + 1) % verts.length]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function FaceMesh({
  solidId,
  face,
  label,
  mono,
  translucent,
  highlight,
  transform,
  onClick,
}: {
  solidId: SolidId;
  face: number;
  label: FaceLabel;
  mono: boolean;
  translucent: boolean;
  highlight: boolean;
  transform?: RigidTransform;
  onClick?: (face: number) => void;
}) {
  const solid = getSolid(solidId);
  const f = solid.faces[face];
  const geom = useMemo(() => faceGeometry(solidId, face, label), [solidId, face, label]);
  useEffect(() => () => geom.dispose(), [geom]);
  const frac = symbolWorldSize(solidId) / (2 * faceCircumradius(solid, face));
  const bg = highlight ? '#ffd43b' : mono ? '#fbfaf7' : getSymbol(label.symbol).color;
  const tex = faceTexture(label.symbol, bg, frac);
  const outline = useMemo(() => {
    const pts = f.vertices.map((v) => {
      const p = add(solid.vertices[v], scale(f.normal, 0.004));
      return new THREE.Vector3(p[0], p[1], p[2]);
    });
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: '#111' }));
  }, [solid, f]);
  const q = transform?.q;
  const p = transform?.p;
  return (
    <group
      position={p ? [p[0], p[1], p[2]] : [0, 0, 0]}
      quaternion={q ? new THREE.Quaternion(q[1], q[2], q[3], q[0]) : new THREE.Quaternion()}
    >
      <mesh
        geometry={geom}
        onClick={
          onClick
            ? (e) => {
                e.stopPropagation();
                onClick(face);
              }
            : undefined
        }
      >
        <meshLambertMaterial
          map={tex}
          side={THREE.DoubleSide}
          transparent={translucent}
          opacity={translucent ? 0.55 : 1}
          depthWrite={!translucent}
        />
      </mesh>
      <primitive object={outline} />
    </group>
  );
}

export interface Solid3DProps {
  solidId: SolidId;
  labeling: Labeling;
  /** 표시 자세 */
  q: Quat;
  mirrored: boolean;
  /** 거울 반전 애니메이션용 월드 x 배율 (1 → −1) */
  worldScaleX?: number;
  foldT?: RigidTransform[] | null;
  /** 펼친 도형을 화면 가운데로: 원래 도형 좌표에서 뺄 중심, 전체 배율 */
  offset?: Vec3;
  fitScale?: number;
  mono?: boolean;
  translucent?: boolean;
  highlight?: number[];
  onFaceClick?: (face: number) => void;
}

export function Solid3D({ solidId, labeling, q, mirrored, worldScaleX = 1, foldT, offset, fitScale = 1, mono = false, translucent = false, highlight = [], onFaceClick }: Solid3DProps) {
  const solid = getSolid(solidId);
  return (
    <group scale={[worldScaleX * fitScale, fitScale, fitScale]}>
      <group quaternion={new THREE.Quaternion(q[1], q[2], q[3], q[0])}>
        <group scale={[mirrored ? -1 : 1, 1, 1]}>
          <group position={offset ? [-offset[0], -offset[1], -offset[2]] : [0, 0, 0]}>
          {solid.faces.map((f) => (
            <FaceMesh
              key={`${solidId}-${f.id}`}
              solidId={solidId}
              face={f.id}
              label={labeling[f.id]}
              mono={mono}
              translucent={translucent}
              highlight={highlight.includes(f.id)}
              transform={foldT ? foldT[f.id] : undefined}
              onClick={onFaceClick}
            />
          ))}
          </group>
        </group>
      </group>
    </group>
  );
}

/** 축 표시 기즈모: X/Y/Z 화살표 (라벨은 AxisLegend 로 화면에 고정 표시) */
export function AxisGizmo({ position = [-2.4, -1.75, 0.6] as [number, number, number] }) {
  const arrows = useMemo(
    () =>
      (
        [
          [[1, 0, 0], '#d6336c'],
          [[0, 1, 0], '#2b8a3e'],
          [[0, 0, 1], '#1c56c4'],
        ] as const
      ).map(([d, c]) => new THREE.ArrowHelper(new THREE.Vector3(...d), new THREE.Vector3(0, 0, 0), 0.9, c, 0.22, 0.13)),
    [],
  );
  return (
    <group position={position}>
      {arrows.map((a, i) => (
        <primitive key={i} object={a} />
      ))}
    </group>
  );
}

/** 축 색 범례 (캔버스 위에 겹쳐 표시) */
export function AxisLegend() {
  return (
    <div className="axis-legend">
      <span style={{ color: '#d6336c' }}>━ 오른쪽 X</span>
      <span style={{ color: '#2b8a3e' }}>━ 위 Y</span>
      <span style={{ color: '#1c56c4' }}>━ 앞 Z (나를 향해)</span>
    </div>
  );
}
