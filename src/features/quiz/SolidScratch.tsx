// 문제 옆 "직접 돌려보기" (입체): 문제의 처음 모습에서 시작해 손이나 버튼으로 돌려 본다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Scratch } from '../../engine/question';
import type { Rule } from '../../engine/rules';
import { CAMERA_DIR, getSolid, type SolidId } from '../../engine/solids';
import { QUAT_IDENTITY, deg, quatFromAxisAngle, quatFromTo, quatMul, quatSlerp, type Quat, type Vec3 } from '../../engine/math';
import { VIEW_AXIS, type Dir, type RotationOp, type View } from '../../engine/rotation';
import { applyOp, resolveOp, transformVec, type SolidState } from '../../engine/state';
import { foldBounds, foldTransforms } from '../../engine/net';
import { useSettings } from '../../store';
import { AxisLine, Solid3D, ThreeBridge } from '../../render/Solid3D';
import { useHandRotate, type AxisCandidate, type ThreeRefs } from '../../render/useHandRotate';
import { easeInOut } from '../../render/usePlayer';
import { RuleBadge } from '../../ui/Parts';

const VIEWS: Record<SolidId, { views: View[]; step: number }> = {
  cube: { views: ['front', 'top', 'right'], step: 90 },
  octa: { views: ['front', 'top', 'right'], step: 90 },
  dodeca: { views: ['front'], step: 72 },
  tetra: { views: ['front'], step: 120 },
  icosa: { views: ['front'], step: 120 },
};
const AXIS_NAME: Record<View, string> = { front: '앞뒤 축', top: '위아래 축', right: '좌우 축' };

export function SolidScratch({ scratch, rules }: { scratch: Extract<Scratch, { kind: 'solid' }>; rules?: Rule<RotationOp>[] }) {
  const mono = useSettings((s) => s.mono);
  const { solidId, labeling } = scratch;
  const solid = getSolid(solidId);
  const [state, setState] = useState<SolidState>(scratch.initial);
  const [history, setHistory] = useState<SolidState[]>([]);
  const [anim, setAnim] = useState<{ op: RotationOp; p: number } | null>(null);
  const [foldT, setFoldT] = useState(scratch.net ? 1 : 0);
  const [axis, setAxis] = useState<View | 'face' | 'auto'>('auto');
  const three = useRef<ThreeRefs | null>(null);

  // 문제가 바뀌면 처음 상태로
  useEffect(() => {
    setState(scratch.initial);
    setHistory([]);
    setFoldT(scratch.net ? 1 : 0);
    setAnim(null);
  }, [scratch]);

  const apply = (op: RotationOp) => {
    if (anim) return;
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setAnim(null);
      setHistory((h) => [...h, state]);
      setState(applyOp(state, op, labeling));
    };
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / 650);
      setAnim({ op, p });
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 900);
  };

  const faceStep = 360 / solid.sides;
  const record = (op: RotationOp) => {
    setHistory((h) => [...h, state]);
    setState((st) => applyOp(st, op, labeling));
  };
  const dirOf = (k: number, angle: number): Dir => (angle === 180 ? 'cw' : k > 0 ? 'ccw' : 'cw');
  const viewCandidate = (v: View): AxisCandidate => ({
    axis: VIEW_AXIS[v],
    step: VIEWS[solidId].step,
    commit: (k) => {
      const angle = Math.abs(k) * VIEWS[solidId].step;
      record({ kind: 'view', view: v, dir: dirOf(k, angle), angle });
    },
  });
  const faceCandidate = (face: number): AxisCandidate => ({
    axis: transformVec(state, solid.faces[face].normal),
    step: faceStep,
    commit: (k) => {
      const angle = Math.abs(k) * faceStep;
      record({ kind: 'face', symbol: labeling[face].symbol, dir: dirOf(k, angle), angle });
    },
  });
  const hand = useHandRotate({
    three,
    enabled: foldT === 0 && !anim,
    // 자동: 끄는 방향을 보고 앞뒤·위아래·좌우·누른 면 축 중 가장 잘 맞는 축으로 돌림
    candidates: (face) =>
      axis === 'auto' ? [...VIEWS[solidId].views.map(viewCandidate), faceCandidate(face)] : axis === 'face' ? [faceCandidate(face)] : [viewCandidate(axis)],
    // 두 손가락: 누른 면을 축으로 비틀기
    twist: faceCandidate,
  });

  // 표시 자세
  let q: Quat = state.q;
  let worldScaleX = 1;
  if (anim) {
    const r = resolveOp(state, anim.op, labeling);
    if (r.kind === 'rotate') q = quatMul(quatFromAxisAngle(r.axis, deg(r.angle * easeInOut(anim.p))), q);
    else worldScaleX = Math.cos(Math.PI * easeInOut(anim.p)) || 0.001;
  }
  if (hand.dragRot) q = quatMul(quatFromAxisAngle(hand.dragRot.axis, hand.dragRot.angle), q);
  const net = scratch.net;
  const T = net && foldT > 0 ? foldTransforms(solidId, net.edges, net.root, foldT, 'sequential') : null;
  const bounds = T ? foldBounds(solidId, T) : null;
  if (T && net) {
    const align = quatFromTo(transformVec(state, solid.faces[net.root].normal), CAMERA_DIR);
    q = quatMul(quatSlerp(QUAT_IDENTITY, align, foldT), q);
  }

  const viewButtons = useMemo(
    () =>
      VIEWS[solidId].views.flatMap((v) =>
        (['cw', 'ccw'] as Dir[]).map((d): [string, RotationOp] => [`${{ front: '앞', top: '위', right: '오른쪽' }[v]} ${d === 'cw' ? '↻' : '↺'}`, { kind: 'view', view: v, dir: d, angle: VIEWS[solidId].step }]),
      ),
    [solidId],
  );

  return (
    <div className="scratch">
      <div className="scratch-canvas">
        <Canvas camera={{ position: [CAMERA_DIR[0] * 8.5, CAMERA_DIR[1] * 8.5, CAMERA_DIR[2] * 8.5], fov: 35 }} dpr={[1, 2]}>
          <ambientLight intensity={1.7} />
          <directionalLight position={[-3, 6, 4]} intensity={1.3} />
          <ThreeBridge target={three} />
          <Solid3D
            solidId={solidId}
            labeling={labeling}
            q={q}
            mirrored={state.mirrored}
            worldScaleX={worldScaleX}
            foldT={T}
            offset={bounds?.center}
            fitScale={bounds ? Math.min(1, 2.3 / bounds.radius) : 1}
            mono={mono}
            onFacePress={hand.press}
            onFaceClick={() => hand.consumeClick()}
          />
          {foldT === 0 && !hand.dragRot && axis !== 'face' && axis !== 'auto' && <AxisLine axis={VIEW_AXIS[axis] as Vec3} />}
          {hand.dragRot && <AxisLine axis={hand.dragRot.axis} />}
          <OrbitControls makeDefault enablePan={false} minDistance={4} maxDistance={18} />
        </Canvas>
      </div>
      {net && (
        <label className="slider">
          <span>접은 정도 {Math.round((1 - foldT) * 100)}%</span>
          <input type="range" min={0} max={1} step={0.005} value={1 - foldT} onChange={(e) => setFoldT(1 - Number(e.target.value))} />
        </label>
      )}
      <div className="field-label" style={{ marginTop: 6 }}>
        끌어서 돌릴 축
      </div>
      <div className="seg">
        {['auto' as const, ...VIEWS[solidId].views, 'face' as const].map((a) => (
          <button key={a} className={axis === a ? 'on' : ''} onClick={() => setAxis(a)}>
            {a === 'auto' ? '자동' : a === 'face' ? '누른 면' : AXIS_NAME[a]}
          </button>
        ))}
      </div>
      {rules && rules.length > 0 && (
        <>
          <div className="field-label">규칙 적용</div>
          <div className="btn-row">
            {rules.map((r) => (
              <button key={r.id} onClick={() => apply(r.op)} disabled={!!anim || foldT > 0} title="이 규칙을 적용">
                <RuleBadge id={r.id} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="field-label">버튼으로 돌리기</div>
      <div className="btn-row">
        {viewButtons.map(([label, op]) => (
          <button key={label} onClick={() => apply(op)} disabled={!!anim || foldT > 0}>
            {label}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button
          disabled={!history.length || !!anim}
          onClick={() => {
            setState(history[history.length - 1]);
            setHistory((h) => h.slice(0, -1));
          }}
        >
          한 번 되돌리기
        </button>
        <button
          onClick={() => {
            setState(scratch.initial);
            setHistory([]);
            setFoldT(scratch.net ? 1 : 0);
          }}
        >
          처음 모습으로
        </button>
      </div>
      <p className="note">
        {net && foldT > 0 ? '다 접어야 손으로 돌릴 수 있어요. ' : ''}
        {axis === 'auto' ? '끄는 방향에 맞는 축을 알아서 골라 돌려요. ' : '고른 축으로만 돌아요. '}
        조금만 끌어도 다음 각도로 넘어가고, 손을 떼면 각도가 딱 맞춰져요. 휴대폰에서는 한 손가락으로 면을 누른 채 다른 손가락을 돌리면 그 면을 축으로 비틀어 돌아요. 빈 곳을 끌면 보는 방향만 바뀌어요.
      </p>
    </div>
  );
}

export default SolidScratch;
