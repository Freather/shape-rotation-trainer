// 방사형 도형의 칸 모양 (SVG 좌표: 중심 0,0 / 반지름 1 / y 아래가 +)

import { polygonSides, polygonVertexAngle, type RadialShape } from './model';

export const RING_RADII = [0, 0.36, 0.68, 1];

const rad = (d: number) => (d * Math.PI) / 180;

/** θ(12시 기준 시계방향, 도) 방향으로 외곽선까지의 거리 (scale = 외접원 반지름) */
export function boundaryRadius(shape: RadialShape, theta: number, scale: number): number {
  const m = polygonSides(shape.family);
  if (m === 0) return scale;
  const seg = 360 / m;
  const v0 = polygonVertexAngle(shape.family);
  const local = ((((theta - v0) % seg) + seg) % seg) - seg / 2;
  return (scale * Math.cos(rad(seg / 2))) / Math.cos(rad(local));
}

export const polar = (theta: number, r: number): [number, number] => [r * Math.sin(rad(theta)), -r * Math.cos(rad(theta))];

/** a0 → a1 사이 외곽선 위의 점들 (다각형 꼭짓점 포함, 원이면 촘촘히) */
function boundaryPoints(shape: RadialShape, a0: number, a1: number, scale: number): [number, number][] {
  const m = polygonSides(shape.family);
  const angles: number[] = [a0];
  if (m === 0) {
    const steps = Math.max(4, Math.ceil((a1 - a0) / 5));
    for (let i = 1; i < steps; i++) angles.push(a0 + ((a1 - a0) * i) / steps);
  } else {
    const seg = 360 / m;
    const v0 = polygonVertexAngle(shape.family);
    for (let v = v0 - 720; v < a1; v += seg) if (v > a0 + 1e-9 && v < a1 - 1e-9) angles.push(v);
  }
  angles.push(a1);
  return angles.map((a) => polar(a, boundaryRadius(shape, a, scale)));
}

/** 칸 하나의 다각형 점들 */
export function cellPolygon(shape: RadialShape, ring: number, k: number): [number, number][] {
  const w = 360 / shape.sectors[ring];
  const a0 = k * w;
  const a1 = (k + 1) * w;
  const outer = boundaryPoints(shape, a0, a1, RING_RADII[ring + 1]);
  if (ring === 0) return [[0, 0], ...outer];
  const inner = boundaryPoints(shape, a0, a1, RING_RADII[ring]).reverse();
  return [...outer, ...inner];
}

export const cellPath = (shape: RadialShape, ring: number, k: number): string =>
  'M' + cellPolygon(shape, ring, k).map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(' L') + ' Z';

/** 칸 안에서 그림을 놓을 위치와 크기 */
export function cellAnchor(shape: RadialShape, ring: number, k: number): { x: number; y: number; size: number } {
  const w = 360 / shape.sectors[ring];
  const mid = (k + 0.5) * w;
  const rOut = boundaryRadius(shape, mid, RING_RADII[ring + 1]);
  const rIn = ring === 0 ? 0 : boundaryRadius(shape, mid, RING_RADII[ring]);
  const r = ring === 0 ? rOut * 0.58 : (rOut + rIn) / 2;
  const thickness = ring === 0 ? rOut * 0.7 : rOut - rIn;
  const arc = 2 * r * Math.sin(rad(Math.min(w, 120) / 2));
  const size = Math.min(thickness, arc) * 0.78;
  const [x, y] = polar(mid, r);
  return { x, y, size };
}
