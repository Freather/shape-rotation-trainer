// 풀이 보기: 초기 → 각 단계 애니메이션 (SVG, 렌더러 없이)
import { useMemo, type ReactNode } from 'react';
import { CAMERA_DIR, getSolid } from '../engine/solids';
import { QUAT_IDENTITY, deg, quatFromAxisAngle, quatFromTo, quatSlerp, rotateVec, sub, type Quat, type Vec3 } from '../engine/math';
import { describeOp, type RotationOp, type TextPart } from '../engine/rotation';
import { resolveOp, stateHistory, transformVec, type Labeling, type SolidState } from '../engine/state';
import { applyT, foldBounds, foldTransforms, rotateT } from '../engine/net';
import { radialHistory, describeRadialOp } from '../engine/radial/ops';
import type { Solution } from '../engine/question';
import { drawsFromTransform } from './project';
import { FaceDrawsSvg } from './SolidSvg';
import { RadialSvg } from './RadialSvg';
import { easeInOut, usePlayer } from './usePlayer';
import { Parts } from '../ui/Parts';
import { AxisMarks, opMarks } from './AxisMarks';

function Controls({ pl, total, labels, describe }: { pl: ReturnType<typeof usePlayer>; total: number; labels: string[]; describe: (i: number) => TextPart[] }) {
  return (
    <div className="player">
      <div className="player-buttons">
        <button onClick={pl.reset} title="처음">⏮</button>
        <button onClick={pl.prev} title="이전 단계">◀</button>
        {pl.playing ? <button onClick={pl.pause}>멈춤</button> : <button className="primary" onClick={pl.play}>재생</button>}
        <button onClick={pl.next} title="다음 단계">▶|</button>
        <button onClick={pl.jumpEnd} title="끝">⏭</button>
      </div>
      <ol className="step-list">
        {labels.map((l, i) => (
          <li key={i} className={i < pl.done ? 'done' : i === pl.done && pl.playing ? 'now' : ''}>
            <b>{l}</b> <Parts parts={describe(i)} />
            {pl.justFinished === i + 1 && <span className="applied">완료</span>}
          </li>
        ))}
      </ol>
      <div className="muted small">
        {pl.done} / {total}
      </div>
    </div>
  );
}

/** 상태 s에서 op를 진행도 p만큼 적용한 그리기 함수 */
function animFns(s: SolidState, op: RotationOp | null, p: number, lab: Labeling) {
  let rq: Quat = QUAT_IDENTITY;
  let sx = 1;
  if (op) {
    const r = resolveOp(s, op, lab);
    if (r.kind === 'rotate') rq = quatFromAxisAngle(r.axis, deg(r.angle * easeInOut(p)));
    else sx = Math.cos(Math.PI * easeInOut(p)) || 0.001;
  }
  const point = (_f: number, v: Vec3): Vec3 => {
    const w = rotateVec(rq, transformVec(s, v));
    return [w[0] * sx, w[1], w[2]];
  };
  return { point, vec: point };
}

export function SolidSolution({ sol, size = 260 }: { sol: Extract<Solution, { kind: 'solid' }>; size?: number }) {
  const hist = useMemo(() => stateHistory(sol.initial, sol.ops, sol.labeling), [sol]);
  const pl = usePlayer(sol.ops.length);
  const s = hist[pl.done];
  const op = pl.p > 0 && pl.done < sol.ops.length ? sol.ops[pl.done] : null;
  const { point, vec } = animFns(s, op, pl.p, sol.labeling);
  const draws = drawsFromTransform(sol.solidId, sol.labeling, point, vec, sol.focusFace !== undefined ? [sol.focusFace] : []);
  const marks = pl.done < sol.ops.length ? opMarks(hist[pl.done], sol.ops[pl.done], sol.labeling) : [];
  return (
    <div className="solution">
      <FaceDrawsSvg draws={draws} size={size} view={2.9}>
        <AxisMarks marks={marks} />
      </FaceDrawsSvg>
      {marks.length > 0 && <div className="muted small">빨간 선이 이번 단계에서 도는 축이고, 화살표가 도는 방향이에요.</div>}
      {sol.focusFace !== undefined && <div className="muted small">노란 면은 마지막에 정면(가장 크게 보이는 면)에 오는 면이에요. 이 면을 눈으로 따라가 보세요.</div>}
      <Controls pl={pl} total={sol.ops.length} labels={sol.labels} describe={(i) => describeOp(sol.ops[i])} />
    </div>
  );
}

/** 전개도 → 접기 → (회전) */
export function FoldSolution({ sol, size = 260 }: { sol: Extract<Solution, { kind: 'fold' }>; size?: number }) {
  const solid = getSolid(sol.solidId);
  const toFinal = useMemo((): RotationOp | null => {
    let [w, x, y, z] = sol.finalQ;
    if (w < 0) [w, x, y, z] = [-w, -x, -y, -z];
    const angle = (2 * Math.acos(Math.min(1, w)) * 180) / Math.PI;
    if (angle < 1e-6) return null;
    const s = Math.sqrt(1 - w * w);
    return { kind: 'axis', axis: [x / s, y / s, z / s], angle };
  }, [sol.finalQ]);
  // 단계: 0 = 접기, 1 = (보기 방향으로 돌리기), 이후 회전 명령들
  const rotOps: RotationOp[] = [...(toFinal ? [toFinal] : []), ...sol.ops];
  const labels = ['접기', ...(toFinal ? ['방향 맞추기'] : []), ...sol.labels];
  const pl = usePlayer(1 + rotOps.length, { stepMs: 1400 });
  const start: SolidState = { solidId: sol.solidId, q: QUAT_IDENTITY, mirrored: false };
  const hist = useMemo(() => stateHistory(start, rotOps, sol.labeling), [sol, toFinal]); // eslint-disable-line react-hooks/exhaustive-deps
  const align = quatFromTo(solid.faces[sol.root].normal, CAMERA_DIR);

  let point: (f: number, v: Vec3) => Vec3;
  let vec: (f: number, v: Vec3) => Vec3;
  if (pl.done === 0) {
    // 접는 중: t = 1 - p (처음엔 펼친 상태)
    const t = 1 - easeInOut(pl.p);
    const T = foldTransforms(sol.solidId, sol.edges, sol.root, t, 'sequential');
    const oq = quatSlerp(QUAT_IDENTITY, align, t);
    const { center, radius } = foldBounds(sol.solidId, T);
    const k = Math.min(1, 2.1 / radius);
    point = (f, v) => {
      const w = rotateVec(oq, sub(applyT(T[f], v), center));
      return [w[0] * k, w[1] * k, w[2] * k];
    };
    // 그림 크기도 면과 같은 비율로 줄인다 (안 그러면 펼친 전개도에서 그림이 면 밖으로 튀어나옴)
    vec = (f, v) => {
      const w = rotateVec(oq, rotateT(T[f], v));
      return [w[0] * k, w[1] * k, w[2] * k];
    };
  } else {
    const i = pl.done - 1;
    const s = hist[i];
    const op = pl.p > 0 && i < rotOps.length ? rotOps[i] : null;
    ({ point, vec } = animFns(s, op, pl.p, sol.labeling));
  }
  const draws = drawsFromTransform(sol.solidId, sol.labeling, point, vec, sol.highlight ?? []);
  const describe = (i: number): TextPart[] =>
    i === 0 ? ['한 장씩 접어요. 회색은 면의 안쪽이에요.'] : rotOps[i - 1].kind === 'axis' ? ['정답 그림과 같은 방향으로 돌려요.'] : describeOp(rotOps[i - 1]);
  return (
    <div className="solution">
      <FaceDrawsSvg draws={draws} size={size} />
      {sol.highlight && <div className="muted small">노란 두 면이 서로 맞은편이에요.</div>}
      <Controls pl={pl} total={1 + rotOps.length} labels={labels} describe={describe} />
    </div>
  );
}

export function RadialSolution({ sol, size = 260 }: { sol: Extract<Solution, { kind: 'radial' }>; size?: number }) {
  const hist = useMemo(() => radialHistory(sol.shape, sol.cells, sol.ops), [sol]);
  const pl = usePlayer(sol.ops.length, { stepMs: 1300 });
  const anim = pl.p > 0 && pl.done < sol.ops.length ? { op: sol.ops[pl.done], p: pl.p } : null;
  return (
    <div className="solution">
      <RadialSvg shape={sol.shape} cells={hist[pl.done]} anim={anim} size={size} />
      <Controls pl={pl} total={sol.ops.length} labels={sol.labels} describe={(i) => describeRadialOp(sol.ops[i])} />
    </div>
  );
}

export function SolutionView({ sol, size }: { sol: Solution; size?: number }): ReactNode {
  switch (sol.kind) {
    case 'solid':
      return <SolidSolution sol={sol} size={size} />;
    case 'fold':
      return <FoldSolution sol={sol} size={size} />;
    case 'radial':
      return <RadialSolution sol={sol} size={size} />;
    case 'text':
      return (
        <div className="solution">
          {sol.parts.map((p, i) => (
            <p key={i}>
              <Parts parts={p} />
            </p>
          ))}
        </div>
      );
  }
}

