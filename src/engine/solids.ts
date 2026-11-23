// 다면체 정의: 꼭짓점 좌표 + 면(꼭짓점 인덱스 배열, 바깥에서 볼 때 반시계 순서)
// 각 면은 기호의 "위쪽"을 나타내는 upRef 벡터를 가진다.

import { add, cross, dot, normalize, scale, sub, type Vec3 } from './math';

export type SolidId = 'cube';

export interface Face {
  /** 0부터 시작하는 면 번호 */
  id: number;
  /** 사람이 읽기 위한 이름 (예: 'U' = 윗면) */
  name: string;
  /** 꼭짓점 인덱스, 바깥에서 볼 때 반시계 순서 */
  vertices: number[];
  center: Vec3;
  /** 바깥쪽 단위 법선 */
  normal: Vec3;
  /** 면 평면 위 단위벡터. 기호의 위쪽 방향 */
  upRef: Vec3;
}

export interface Solid {
  id: SolidId;
  name: string;
  vertices: Vec3[];
  faces: Face[];
  /** 면이 몇 각형인지 */
  sides: number;
}

/** 면 중심 주위로 꼭짓점들을 바깥에서 볼 때 반시계 순서로 정렬 */
function sortCCW(vertices: Vec3[], idx: number[], center: Vec3, normal: Vec3): number[] {
  const ref = normalize(sub(vertices[idx[0]], center));
  const ref2 = cross(normal, ref); // ref를 반시계로 90° 돌린 방향
  const angle = (i: number) => {
    const d = sub(vertices[i], center);
    return Math.atan2(dot(d, ref2), dot(d, ref));
  };
  return [...idx].sort((a, b) => angle(a) - angle(b));
}

function buildFace(
  vertices: Vec3[],
  id: number,
  name: string,
  normal: Vec3,
  upRef: Vec3,
  test: (v: Vec3) => boolean,
): Face {
  const idx = vertices.map((v, i) => (test(v) ? i : -1)).filter((i) => i >= 0);
  const center = scale(
    idx.reduce<Vec3>((acc, i) => add(acc, vertices[i]), [0, 0, 0]),
    1 / idx.length,
  );
  return { id, name, vertices: sortCCW(vertices, idx, center, normal), center, normal, upRef };
}

function makeCube(): Solid {
  const vertices: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x, y, z]);
  const faces: Face[] = [
    // 윗면: 기호의 위쪽 = 뒤(-Z) (앞에서 보고 위로 고개를 들었을 때 자연스러운 방향)
    buildFace(vertices, 0, 'U', [0, 1, 0], [0, 0, -1], (v) => v[1] === 1),
    buildFace(vertices, 1, 'D', [0, -1, 0], [0, 0, 1], (v) => v[1] === -1),
    buildFace(vertices, 2, 'F', [0, 0, 1], [0, 1, 0], (v) => v[2] === 1),
    buildFace(vertices, 3, 'B', [0, 0, -1], [0, 1, 0], (v) => v[2] === -1),
    buildFace(vertices, 4, 'R', [1, 0, 0], [0, 1, 0], (v) => v[0] === 1),
    buildFace(vertices, 5, 'L', [-1, 0, 0], [0, 1, 0], (v) => v[0] === -1),
  ];
  return { id: 'cube', name: '정육면체', vertices, faces, sides: 4 };
}

export const SOLIDS: Record<SolidId, Solid> = {
  cube: makeCube(),
};

export const getSolid = (id: SolidId): Solid => SOLIDS[id];
