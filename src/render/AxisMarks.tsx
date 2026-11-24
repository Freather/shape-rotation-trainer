// 회전축 표시: 축이 도형을 뚫고 나오는 쪽에 점과 이름(앞·위·오른쪽)을 찍고,
// 돌리는 방향을 그 끝에 둥근 화살표로 보여준다.
import { CAMERA_DIR } from '../engine/solids';
import { cross, dot, normalize, scale, add, type Vec3 } from '../engine/math';
import { projectPoint } from './project';
import { resolveOp, type Labeling, type SolidState } from '../engine/state';
import type { RotationOp } from '../engine/rotation';

export interface AxisMark {
  /** 월드 방향 (끝이 이쪽) */
  dir: Vec3;
  label?: string;
  /** 부호 있는 회전각(도). 양수 = 끝에서 볼 때 반시계. 없으면 화살표 없음 */
  angle?: number;
}

const R = Math.sqrt(3);
const COLOR = '#d6336c';

export function AxisMarks({ marks, radius = R }: { marks: AxisMark[]; radius?: number }) {
  return (
    <g pointerEvents="none">
      {marks.map((m, i) => {
        const d = normalize(m.dir);
        const facing = dot(d, CAMERA_DIR) > -0.05;
        const inner = projectPoint([0, 0, 0]);
        const tip = projectPoint(scale(d, radius * 1.18));
        // 화면에서 축이 거의 점으로 보일 때도 이름이 겹치지 않게 바깥쪽으로 밀기
        const along = [tip[0] - inner[0], tip[1] - inner[1]];
        const len = Math.hypot(along[0], along[1]) || 1;
        const ax = along[0] / len;
        const ay = along[1] / len;
        const off = m.angle ? 0.6 : 0.3;
        const lp = [tip[0] + ax * off, tip[1] + ay * off + 0.14];
        const anchor = Math.abs(ax) > 0.6 ? (ax > 0 ? 'start' : 'end') : 'middle';
        // 회전 화살표: 축 끝 둘레의 원을 투영
        let arc: string | null = null;
        let head: string | null = null;
        if (m.angle) {
          const u = normalize(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
          const v = cross(d, u);
          const c = scale(d, radius * 1.05);
          const r = 0.42;
          const sgn = m.angle > 0 ? 1 : -1;
          const pts: [number, number][] = [];
          const N = 24;
          for (let k = 0; k <= N; k++) {
            const t = sgn * (k / N) * Math.PI * 1.5;
            pts.push(projectPoint(add(c, add(scale(u, r * Math.cos(t)), scale(v, r * Math.sin(t))))));
          }
          arc = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
          const a = pts[N];
          const b = pts[N - 2];
          const dx = a[0] - b[0];
          const dy = a[1] - b[1];
          const l = Math.hypot(dx, dy) || 1;
          const ux = dx / l;
          const uy = dy / l;
          const s = 0.18;
          head = `M${a[0] + ux * s},${a[1] + uy * s} L${a[0] - uy * s * 0.7},${a[1] + ux * s * 0.7} L${a[0] + uy * s * 0.7},${a[1] - ux * s * 0.7} Z`;
        }
        return (
          <g key={i} opacity={facing ? 1 : 0.55}>
            <line x1={inner[0]} y1={inner[1]} x2={tip[0]} y2={tip[1]} stroke={COLOR} strokeWidth={0.07} strokeDasharray={facing ? undefined : '0.08 0.06'} strokeLinecap="round" />
            <circle cx={tip[0]} cy={tip[1]} r={0.11} fill={COLOR} />
            {arc && <path d={arc} fill="none" stroke={COLOR} strokeWidth={0.065} />}
            {head && <path d={head} fill={COLOR} />}
            {m.label && (
              <text x={lp[0]} y={lp[1]} fontSize={0.4} fontWeight={700} fill={COLOR} textAnchor={anchor} stroke="#fff" strokeWidth={0.1} paintOrder="stroke">
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export const VIEW_LABEL = { front: '앞', top: '위', right: '오른쪽' } as const;

/** 회전 명령 하나의 축 표시 (상태 s에서 돌릴 때) */
export function opMarks(s: SolidState, op: RotationOp, lab: Labeling): AxisMark[] {
  const r = resolveOp(s, op, lab);
  if (r.kind !== 'rotate') return [];
  return [{ dir: r.axis, angle: r.angle, label: op.kind === 'view' ? VIEW_LABEL[op.view] : undefined }];
}
