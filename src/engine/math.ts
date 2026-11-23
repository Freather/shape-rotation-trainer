// 순수 수학 연산 (three.js 의존 없음)
// 좌표계: X = 오른쪽, Y = 위, Z = 화면 밖(나를 향함). 오른손 법칙.

export type Vec3 = readonly [number, number, number];
/** 쿼터니언 [w, x, y, z] */
export type Quat = readonly [number, number, number, number];

export const EPS = 1e-9;

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));
export const vecClose = (a: Vec3, b: Vec3, eps = 1e-6): boolean =>
  Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

export const QUAT_IDENTITY: Quat = [1, 0, 0, 0];

/** 축(단위벡터 아니어도 됨) 기준 angleRad 만큼 회전 (+ = 축 끝에서 볼 때 반시계) */
export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = normalize(axis);
  const h = angleRad / 2;
  const s = Math.sin(h);
  return [Math.cos(h), n[0] * s, n[1] * s, n[2] * s];
}

/** a * b : b를 먼저 적용하고 a를 나중에 적용 */
export function quatMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export const quatConj = (q: Quat): Quat => [q[0], -q[1], -q[2], -q[3]];
export const quatDot = (a: Quat, b: Quat): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const quatNorm = (q: Quat): number => Math.sqrt(quatDot(q, q));
export function quatNormalize(q: Quat): Quat {
  const n = quatNorm(q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** q와 -q는 같은 회전이므로 부호를 하나로 고정 (첫 번째 0 아닌 성분이 양수) */
export function quatCanonicalSign(q: Quat): Quat {
  for (const c of q) {
    if (Math.abs(c) > 1e-12) return c > 0 ? q : [-q[0], -q[1], -q[2], -q[3]];
  }
  return q;
}

/** 두 쿼터니언이 같은 회전인지 (부호 무관) */
export const quatSameRotation = (a: Quat, b: Quat, eps = 1e-9): boolean =>
  Math.abs(Math.abs(quatDot(a, b)) - 1) < eps;

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const p: Quat = [0, v[0], v[1], v[2]];
  const r = quatMul(quatMul(q, p), quatConj(q));
  return [r[1], r[2], r[3]];
}

export const deg = (d: number): number => (d * Math.PI) / 180;

/** 3×3 회전행렬(행 우선 m[r][c]) → 쿼터니언 */
export function quatFromMatrix(m: number[][]): Quat {
  const tr = m[0][0] + m[1][1] + m[2][2];
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s];
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = [(m[2][1] - m[1][2]) / s, 0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s];
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = [(m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s];
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = [(m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s];
  }
  return quatNormalize(q);
}

/** 단위벡터 a를 단위벡터 b로 보내는 최소 회전 */
export function quatFromTo(a: Vec3, b: Vec3): Quat {
  const na = normalize(a);
  const nb = normalize(b);
  const d = dot(na, nb);
  if (d > 1 - 1e-12) return QUAT_IDENTITY;
  if (d < -1 + 1e-12) {
    let axis = cross([1, 0, 0], na);
    if (length(axis) < 1e-6) axis = cross([0, 1, 0], na);
    return quatFromAxisAngle(axis, Math.PI);
  }
  const c = cross(na, nb);
  return quatNormalize([1 + d, c[0], c[1], c[2]]);
}

/** 구면 선형 보간 */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let d = quatDot(a, b);
  let bb: Quat = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) {
    return quatNormalize([
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ]);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [
    a[0] * wa + bb[0] * wb,
    a[1] * wa + bb[1] * wb,
    a[2] * wa + bb[2] * wb,
    a[3] * wa + bb[3] * wb,
  ];
}

/** v를 axis 기준 angleRad 회전 */
export const rotateAround = (v: Vec3, axis: Vec3, angleRad: number): Vec3 =>
  rotateVec(quatFromAxisAngle(axis, angleRad), v);
