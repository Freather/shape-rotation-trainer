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
import { useHandRotate, type ThreeRefs } from '../../render/useHandRotate';
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
  const [axis, setAxis] = useState<View | 'face'>(VIEWS[solidId].views.includes('top') ? 'top' : 'front');
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

  const step = axis === 'face' ? 360 / solid.sides : VIEWS[solidId].step;
  const hand = useHandRotate({
    three,
    enabled: foldT === 0 && !anim,
    axisFor: (face) => (axis === 'face' ? transformVec(state, solid.faces[face].normal) : VIEW_AXIS[axis]),
    step,
    onCommit: (k, face) => {
      const angle = Math.abs(k) * step;
      const dir: Dir = angle === 180 ? 'cw' : k > 0 ? 'ccw' : 'cw';
      const op: RotationOp = axis === 'face' ? { kind: 'face', symbol: labeling[face].symbol, dir, angle } : { kind: 'view', view: axis, dir, angle };
      setHistory((h) => [...h, state]);
      setState((s) => applyOp(s, op, labeling));
    },
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
          {foldT === 0 && axis !== 'face' && <AxisLine axis={VIEW_AXIS[axis] as Vec3} />}
          {hand.dragRot && axis === 'face' && <AxisLine axis={hand.dragRot.axis} />}
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
        {[...VIEWS[solidId].views, 'face' as const].map((a) => (
          <button key={a} className={axis === a ? 'on' : ''} onClick={() => setAxis(a)}>
            {a === 'face' ? '누른 면' : AXIS_NAME[a]}
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
        {net ? '슬라이더로 접은 뒤 돌려 보세요. ' : ''}도형을 끌면 주황 축으로만 돌고, 손을 떼면 {step}° 단위로 맞춰져요. 빈 곳을 끌면 보는 방향만 바뀌어요.
      </p>
    </div>
  );
}

export default SolidScratch;
