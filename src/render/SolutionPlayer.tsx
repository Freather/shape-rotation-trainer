// 풀이 보기: 초기 → 각 단계 애니메이션 (SVG, 렌더러 없이)
import { useMemo, type ReactNode } from 'react';
import { CAMERA_DIR, getSolid } from '../engine/solids';
import { QUAT_IDENTITY, deg, normalize, quatFromAxisAngle, quatFromTo, quatSlerp, rotateVec, sub, type Quat, type Vec3 } from '../engine/math';
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
import { BlocksSvg, blocksRadius } from './BlocksSvg';
import { applyBlockOp, isEditOp, type Blocks } from '../engine/blocks';
import { blockFrame, blockOpMarks, colorsAfter } from './blockAnim';
import { FigureView } from '../ui/FigureView';
import { OctaView } from './OctaSvg';
import { applyOctaOp, describeOctaOp, type OctaState } from '../engine/octa';

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

/** 면·꼭짓점·모서리 기준 회전: 그 축을 내 쪽으로 돌려 놓고 돌려야 시계방향이 그대로 보인다 */
const bodyAxisOp = (op: RotationOp | null) => !!op && (op.kind === 'face' || op.kind === 'vertex' || op.kind === 'edge');

function bodyAxisCaption(op: RotationOp): TextPart[] {
  if (op.kind === 'face') return [{ symbol: op.symbol }, ' 면을 내 쪽으로 돌려 놓고 봐요. 이렇게 보면 시계방향이 화면에서도 시계방향이에요.'];
  if (op.kind === 'vertex') return ['그 꼭짓점을 내 쪽으로 돌려 놓고 봐요. 이렇게 보면 시계방향이 화면에서도 시계방향이에요.'];
  return ['그 모서리를 내 쪽으로 돌려 놓고 봐요.'];
}

/**
 * 상태 s에서 op를 진행도 p만큼 적용한 그리기 함수.
 * 도형에 붙은 축이면 앞 30%는 축을 내 쪽으로 돌리고, 가운데 40%에 회전, 뒤 30%에 원래 시점으로 돌아온다.
 */
function animFns(s: SolidState, op: RotationOp | null, p: number, lab: Labeling) {
  let rq: Quat = QUAT_IDENTITY;
  let vq: Quat = QUAT_IDENTITY;
  let sx = 1;
  let tilted = false;
  if (op) {
    const r = resolveOp(s, op, lab);
    if (r.kind === 'rotate' && bodyAxisOp(op)) {
      const full = quatFromTo(normalize(r.axis), CAMERA_DIR);
      const tilt = p < 0.3 ? easeInOut(p / 0.3) : p > 0.7 ? easeInOut((1 - p) / 0.3) : 1;
      vq = quatSlerp(QUAT_IDENTITY, full, tilt);
      const pr = p < 0.3 ? 0 : p > 0.7 ? 1 : easeInOut((p - 0.3) / 0.4);
      rq = quatFromAxisAngle(r.axis, deg(r.angle * pr));
      tilted = tilt > 0.5;
    } else if (r.kind === 'rotate') rq = quatFromAxisAngle(r.axis, deg(r.angle * easeInOut(p)));
    else sx = Math.cos(Math.PI * easeInOut(p)) || 0.001;
  }
  const point = (_f: number, v: Vec3): Vec3 => {
    const w = rotateVec(rq, transformVec(s, v));
    return rotateVec(vq, [w[0] * sx, w[1], w[2]]);
  };
  return { point, vec: point, vq, tilted };
}

export function SolidSolution({ sol, size = 260 }: { sol: Extract<Solution, { kind: 'solid' }>; size?: number }) {
  const hist = useMemo(() => stateHistory(sol.initial, sol.ops, sol.labeling), [sol]);
  const pl = usePlayer(sol.ops.length, { stepMs: sol.ops.some(bodyAxisOp) ? 2600 : 1100 });
  const s = hist[pl.done];
  const op = pl.p > 0 && pl.done < sol.ops.length ? sol.ops[pl.done] : null;
  const { point, vec, vq, tilted } = animFns(s, op, pl.p, sol.labeling);
  const draws = drawsFromTransform(sol.solidId, sol.labeling, point, vec, sol.focusFace !== undefined ? [sol.focusFace] : []);
  const marks = (pl.done < sol.ops.length ? opMarks(hist[pl.done], sol.ops[pl.done], sol.labeling) : []).map((m) => ({ ...m, dir: rotateVec(vq, m.dir) }));
  return (
    <div className="solution">
      <FaceDrawsSvg draws={draws} size={size} view={2.9}>
        <AxisMarks marks={marks} />
      </FaceDrawsSvg>
      {marks.length > 0 && <div className="muted small">빨간 선이 이번 단계에서 도는 축이고, 화살표가 도는 방향이에요.</div>}
      {op && tilted && (
        <div className="tilt-note">
          <Parts parts={bodyAxisCaption(op)} />
        </div>
      )}
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
  const pl = usePlayer(1 + rotOps.length, { stepMs: rotOps.some(bodyAxisOp) ? 2600 : 1400 });
  const start: SolidState = { solidId: sol.solidId, q: QUAT_IDENTITY, mirrored: false };
  const hist = useMemo(() => stateHistory(start, rotOps, sol.labeling), [sol, toFinal]); // eslint-disable-line react-hooks/exhaustive-deps
  const align = quatFromTo(solid.faces[sol.root].normal, CAMERA_DIR);

  let point: (f: number, v: Vec3) => Vec3;
  let vec: (f: number, v: Vec3) => Vec3;
  let foldTilt: RotationOp | null = null;
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
    const a = animFns(s, op, pl.p, sol.labeling);
    ({ point, vec } = a);
    if (op && a.tilted) foldTilt = op;
  }
  const draws = drawsFromTransform(sol.solidId, sol.labeling, point, vec, sol.highlight ?? []);
  const describe = (i: number): TextPart[] =>
    i === 0 ? ['한 장씩 접어요. 회색은 면의 안쪽이에요.'] : rotOps[i - 1].kind === 'axis' ? ['정답 그림과 같은 방향으로 돌려요.'] : describeOp(rotOps[i - 1]);
  return (
    <div className="solution">
      <FaceDrawsSvg draws={draws} size={size} />
      {foldTilt && (
        <div className="tilt-note">
          <Parts parts={bodyAxisCaption(foldTilt)} />
        </div>
      )}
      {sol.note ? <div className="muted small">{sol.note}</div> : sol.highlight && <div className="muted small">노란 두 면이 서로 맞은편이에요.</div>}
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

/** 쌓기나무 풀이: 단계마다 돌리는 축과 방향을 보여주며 애니메이션 */
export function BlocksSolution({ sol, size = 260 }: { sol: Extract<Solution, { kind: 'blocks' }>; size?: number }) {
  const hist = useMemo(() => {
    const h: { cells: Blocks; colors?: (string | undefined)[] }[] = [{ cells: sol.initial, colors: sol.colors }];
    for (const st of sol.steps) {
      const last = h[h.length - 1];
      h.push({ cells: applyBlockOp(last.cells, st.op), colors: colorsAfter(last.cells, st.op, last.colors) });
    }
    return h;
  }, [sol]);
  const pl = usePlayer(sol.steps.length, { stepMs: 1200 });
  const cur = hist[pl.done];
  const step = pl.done < sol.steps.length ? sol.steps[pl.done] : null;
  const fr = blockFrame(cur.cells, step?.op ?? null, pl.p, cur.colors);
  const marks = step ? blockOpMarks(step.op, step.axisLabel) : [];
  const r = Math.max(...hist.map((h) => blocksRadius(h.cells)));
  return (
    <div className="solution">
      <BlocksSvg cells={fr.cells} colors={fr.colors} size={size} q={fr.q} sx={fr.sx} view={Math.max(1.9, r * 1.08) + 1}>
        <AxisMarks marks={marks} radius={r + 0.2} />
      </BlocksSvg>
      {marks.length > 0 && <div className="muted small">빨간 선이 이번 단계에서 도는 축이고, 화살표가 도는 방향이에요.</div>}
      {sol.steps.some((s) => isEditOp(s.op)) && <div className="muted small">블록을 더하는 단계는 초록, 빼는 단계는 빨강으로 보여줘요.</div>}
      {sol.note && <div className="muted small">{sol.note}</div>}
      <Controls pl={pl} total={sol.steps.length} labels={sol.steps.map((_, i) => `${i + 1}단계`)} describe={(i) => sol.steps[i].label} />
    </div>
  );
}

/** 그림 정팔면체 풀이 */
export function OctaSolution({ sol, size = 260 }: { sol: Extract<Solution, { kind: 'octa' }>; size?: number }) {
  const hist = useMemo(() => {
    const h: OctaState[] = [sol.initial];
    for (const st of sol.steps) h.push(applyOctaOp(h[h.length - 1], st.op));
    return h;
  }, [sol]);
  const pl = usePlayer(sol.steps.length, { stepMs: 1300 });
  const step = pl.done < sol.steps.length ? sol.steps[pl.done] : null;
  const anim = step && pl.p > 0 ? { op: step.op, p: easeInOut(pl.p) } : null;
  return (
    <div className="solution">
      <OctaView state={hist[pl.done]} anim={anim} size={size} mark={step?.op} />
      <div className="muted small">빨간 점선이 이번 단계에서 움직이는 4면이에요. 4면 돌리기는 면이 색째 돌고, 그림 옮기기는 색은 그대로 두고 그림만 옆 면으로 건너가요.</div>
      <Controls pl={pl} total={sol.steps.length} labels={sol.steps.map((s) => s.label)} describe={(i) => describeOctaOp(sol.steps[i].op)} />
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
    case 'blocks':
      return <BlocksSolution sol={sol} size={size} />;
    case 'octa':
      return <OctaSolution sol={sol} size={size} />;
    case 'figs':
      return (
        <div className="solution">
          <div className="stem">
            {sol.figs.map((f, i) => (
              <FigureView key={i} fig={f} size={150} />
            ))}
          </div>
          {sol.parts.map((p, i) => (
            <p key={i}>
              <Parts parts={p} />
            </p>
          ))}
        </div>
      );
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

