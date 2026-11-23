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
