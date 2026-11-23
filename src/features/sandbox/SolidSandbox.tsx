// 입체 샌드박스: 회전 큐 → 단계별 애니메이션, 자유 시점, 펼치기/접기, 면 기호 편집
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SYMBOLS } from '../../symbols/library';
import { CAMERA_DIR, SOLID_IDS, SOLID_NAMES, getSolid, type SolidId } from '../../engine/solids';
import { QUAT_IDENTITY, deg, dot, quatFromAxisAngle, quatFromTo, quatMul, quatSlerp, type Quat } from '../../engine/math';
import { describeOp, type Dir, type RotationOp, type View } from '../../engine/rotation';
import { resolveOp, slots, stateHistory, transformVec, type Labeling, type SolidState } from '../../engine/state';
import { foldBounds, foldTransforms, hasPresets, netPresets, randomSpanningTree, type UnfoldMode } from '../../engine/net';
import { makeRng, randomSeed } from '../../engine/rng';
import { randomLabeling } from '../../engine/rules';
import { useSettings } from '../../store';
import { AxisGizmo, AxisLegend, Solid3D } from '../../render/Solid3D';
import { easeInOut, usePlayer } from '../../render/usePlayer';
import { Parts } from '../../ui/Parts';
import { InlineGlyph } from '../../render/Glyph';

const VIEW_ANGLES: Record<SolidId, { views: View[]; angles: number[] }> = {
  cube: { views: ['front', 'top', 'right'], angles: [90, 180] },
  octa: { views: ['front', 'top', 'right'], angles: [90, 180] },
  dodeca: { views: ['front'], angles: [72, 144] },
  tetra: { views: ['front'], angles: [120] },
  icosa: { views: ['front'], angles: [120] },
};
const VIEW_NAME: Record<View, string> = { front: '앞', top: '위', right: '오른쪽' };

export function SolidSandbox() {
  const mono = useSettings((s) => s.mono);
  const [solidId, setSolidId] = useState<SolidId>('cube');
  const [lab, setLab] = useState<Labeling>(() => randomLabeling('cube', makeRng(randomSeed())));
  const [start, setStart] = useState<SolidState>({ solidId: 'cube', q: QUAT_IDENTITY, mirrored: false });
  const [queue, setQueue] = useState<RotationOp[]>([]);
  const [speed, setSpeed] = useState(1);
  const [translucent, setTranslucent] = useState(false);
  const [selFace, setSelFace] = useState<number | null>(null);
  // 펼치기
  const [foldT, setFoldT] = useState(0);
  const [mode, setMode] = useState<UnfoldMode>('all');
  const [netIdx, setNetIdx] = useState(0);
  const [randTree, setRandTree] = useState<number[] | null>(null);
  const foldAnim = useRef<number | null>(null);
  const controls = useRef<OrbitControlsImpl | null>(null);

  const solid = getSolid(solidId);
  const pl = usePlayer(queue.length, { speed, stepMs: 1000 });
  const hist = useMemo(() => stateHistory(start, queue, lab), [start, queue, lab]);
  const cur = hist[Math.min(pl.done, hist.length - 1)];

  const changeSolid = (id: SolidId) => {
    setSolidId(id);
    setLab(randomLabeling(id, makeRng(randomSeed())));
    setStart({ solidId: id, q: QUAT_IDENTITY, mirrored: false });
    setQueue([]);
    setSelFace(null);
    setFoldT(0);
    setNetIdx(0);
    setRandTree(null);
    pl.reset();
  };

  // 표시 자세 (애니메이션 중이면 진행 중인 회전 포함)
  let q: Quat = cur.q;
  let worldScaleX = 1;
  const animOp = pl.p > 0 && pl.done < queue.length ? queue[pl.done] : null;
  if (animOp) {
    const r = resolveOp(cur, animOp, lab);
    if (r.kind === 'rotate') q = quatMul(quatFromAxisAngle(r.axis, deg(r.angle * easeInOut(pl.p))), cur.q);
    else worldScaleX = Math.cos(Math.PI * easeInOut(pl.p)) || 0.001;
  }

  // 전개도: 루트 = 지금 카메라를 향한 면
  const root = useMemo(() => {
    const info = slots(cur);
    let best = 0;
    for (const f of solid.faces) if (dot(f.normal, CAMERA_DIR) > dot(solid.faces[best].normal, CAMERA_DIR)) best = f.id;
    return info[best].face;
  }, [cur, solid]);
  const tree = useMemo(() => {
    if (hasPresets(solidId)) return netPresets(solidId)[netIdx % netPresets(solidId).length];
    return randTree ?? randomSpanningTree(solidId, makeRng(1));
  }, [solidId, netIdx, randTree]);
  const foldTransformsNow = foldT > 0 ? foldTransforms(solidId, tree, root, foldT, mode) : null;
  // 펼칠수록 전개도 중심을 화면 가운데로, 전체 크기를 화면에 맞게
  const bounds = foldTransformsNow ? foldBounds(solidId, foldTransformsNow) : null;
  const fitScale = bounds ? Math.min(1, 2.3 / bounds.radius) : 1;
  if (foldT > 0) {
    const align = quatFromTo(transformVec(cur, solid.faces[root].normal), CAMERA_DIR);
    q = quatMul(quatSlerp(QUAT_IDENTITY, align, foldT), q);
  }

  const animateFold = (to: number) => {
    if (foldAnim.current) cancelAnimationFrame(foldAnim.current);
    const from = foldT;
    const t0 = performance.now();
    const dur = 1600 / speed;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      setFoldT(from + (to - from) * easeInOut(k));
      if (k < 1) foldAnim.current = requestAnimationFrame(tick);
    };
    foldAnim.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => {
    if (foldAnim.current) cancelAnimationFrame(foldAnim.current);
  }, []);

  const push = (op: RotationOp) => setQueue((qq) => [...qq, op]);
  const commitHere = () => {
    // 현재 상태를 새 시작점으로
    setStart(cur);
    setQueue([]);
    pl.reset();
  };

  const views = VIEW_ANGLES[solidId];
  const faceAngle = 360 / solid.sides;
  const selSym = selFace !== null ? lab[selFace].symbol : null;

  return (
    <div className="sandbox">
      <div className="canvas-wrap">
        <Canvas camera={{ position: [CAMERA_DIR[0] * 8, CAMERA_DIR[1] * 8, CAMERA_DIR[2] * 8], fov: 35 }} dpr={[1, 2]}>
          <ambientLight intensity={1.6} />
          <directionalLight position={[3, 5, 6]} intensity={1.4} />
          <Solid3D
            solidId={solidId}
            labeling={lab}
            q={q}
            mirrored={cur.mirrored}
            worldScaleX={worldScaleX}
            foldT={foldTransformsNow}
            offset={bounds?.center}
            fitScale={fitScale}
            mono={mono}
            translucent={translucent}
            highlight={selFace !== null ? [selFace] : []}
            onFaceClick={(f) => setSelFace(f === selFace ? null : f)}
          />
          <AxisGizmo />
          <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={4} maxDistance={16} />
        </Canvas>
        <AxisLegend />
        <div className="canvas-hint">드래그: 시점만 이동 (도형 상태는 그대로) · 면 클릭: 기호 편집</div>
        {pl.justFinished !== null && <div className="toast">[{pl.justFinished}] 적용 완료</div>}
      </div>

      <div className="side">
        <section>
          <h3>도형</h3>
          <div className="btn-row">
            {SOLID_IDS.map((id) => (
              <button key={id} className={id === solidId ? 'primary' : ''} onClick={() => changeSolid(id)}>
                {SOLID_NAMES[id]}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button onClick={() => setLab(randomLabeling(solidId, makeRng(randomSeed())))}>기호 랜덤 배정</button>
            <button onClick={() => controls.current?.reset()}>기본 시점으로</button>
            <label className="check">
              <input type="checkbox" checked={translucent} onChange={(e) => setTranslucent(e.target.checked)} /> 뒷면 반투명
            </label>
          </div>
        </section>

        {selFace !== null && selSym && (
          <section className="face-editor">
            <h3>
              선택한 면 <InlineGlyph id={selSym} /> 편집
            </h3>
            <div className="btn-row">
              <button onClick={() => setLab((l) => l.map((x, i) => (i === selFace ? { ...x, rot: (x.rot + 1) % solid.sides } : x)))}>기호 돌리기 ↺</button>
              <button onClick={() => setLab((l) => l.map((x, i) => (i === selFace ? { ...x, flip: !x.flip } : x)))}>기호 좌우 반전</button>
              <button onClick={() => setSelFace(null)}>선택 해제</button>
            </div>
            <div className="symbol-grid">
              {SYMBOLS.map((s) => (
                <button
                  key={s.id}
                  title={s.name}
                  disabled={lab.some((x) => x.symbol === s.id)}
                  onClick={() => setLab((l) => l.map((x, i) => (i === selFace ? { ...x, symbol: s.id } : x)))}
                >
                  <InlineGlyph id={s.id} size={26} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>회전 명령 → 큐에 쌓기</h3>
          <div className="rot-grid">
            {views.views.map((v) =>
              views.angles.map((a) =>
                (['cw', 'ccw'] as Dir[]).map((d) =>
                  a === 180 && d === 'ccw' ? null : (
                    <button key={`${v}${a}${d}`} onClick={() => push({ kind: 'view', view: v, dir: d, angle: a })}>
                      {VIEW_NAME[v]}에서 {d === 'cw' ? '시계' : '반시계'} {a}°
                    </button>
                  ),
                ),
              ),
            )}
            {solidId === 'cube' &&
              (['forward', 'backward', 'right', 'left'] as const).map((d) => (
                <button key={d} onClick={() => push({ kind: 'roll', dir: d })}>
                  {{ forward: '앞으로', backward: '뒤로', right: '오른쪽으로', left: '왼쪽으로' }[d]} 굴리기
                </button>
              ))}
            {selSym &&
              (['cw', 'ccw'] as Dir[]).map((d) =>
                [faceAngle, ...(solid.sides === 5 ? [faceAngle * 2] : [])].map((a) => (
                  <button key={`f${d}${a}`} className="accent" onClick={() => push({ kind: 'face', symbol: selSym, dir: d, angle: a })}>
                    <InlineGlyph id={selSym} size={16} /> 면 기준 {d === 'cw' ? '시계' : '반시계'} {a}°
                  </button>
                )),
              )}
            <button onClick={() => push({ kind: 'mirror' })}>좌우 반전(거울)</button>
          </div>
          {!selSym && solidId !== 'cube' && <p className="muted small">면을 클릭하면 "그 면 기준" 회전 버튼이 생깁니다.</p>}
        </section>

        <section>
          <h3>큐 ({queue.length})</h3>
          <ol className="queue">
            {queue.map((op, i) => (
              <li key={i} className={i < pl.done ? 'done' : i === pl.done && pl.playing ? 'now' : ''}>
                <Parts parts={describeOp(op)} />
                <button className="x" onClick={() => setQueue((qq) => qq.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="btn-row">
            <button onClick={pl.reset}>⏮ 처음</button>
            <button onClick={pl.prev}>◀ 이전</button>
            {pl.playing ? <button onClick={pl.pause}>⏸</button> : <button className="primary" onClick={pl.play} disabled={!queue.length}>▶ 재생</button>}
            <button onClick={pl.next}>다음 ▶</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </div>
          <div className="btn-row">
            <button onClick={() => setQueue([])}>큐 비우기</button>
            <button onClick={commitHere}>지금 상태를 시작점으로</button>
            <button onClick={() => { setStart({ solidId, q: QUAT_IDENTITY, mirrored: false }); setQueue([]); pl.reset(); }}>원래 자세로</button>
          </div>
        </section>

        <section>
          <h3>펼치기 (전개도)</h3>
          <div className="btn-row">
            <button className="primary" onClick={() => animateFold(1)}>
              지금 상태로 펼치기
            </button>
            <button onClick={() => animateFold(0)}>접기</button>
            <select value={mode} onChange={(e) => setMode(e.target.value as UnfoldMode)}>
              <option value="all">동시에 펼치기</option>
              <option value="sequential">한 장씩 펼치기</option>
            </select>
          </div>
          <label className="slider">
            진행도 {Math.round(foldT * 100)}%
            <input type="range" min={0} max={1} step={0.005} value={foldT} onChange={(e) => setFoldT(Number(e.target.value))} />
          </label>
          <div className="btn-row">
            {hasPresets(solidId) ? (
              <select value={netIdx} onChange={(e) => setNetIdx(Number(e.target.value))}>
                {netPresets(solidId).map((_, i) => (
                  <option key={i} value={i}>
                    전개도 {i + 1} / {netPresets(solidId).length}
                  </option>
                ))}
              </select>
            ) : (
              <button onClick={() => setRandTree(randomSpanningTree(solidId, makeRng(randomSeed())))}>다른 전개도</button>
            )}
          </div>
          <p className="muted small">루트 면(움직이지 않는 면) = 지금 화면 정면 쪽 면. 펼친 상태에서도 면을 클릭해 기호를 바꾸고 다시 접어 확인할 수 있어요.</p>
        </section>
      </div>
    </div>
  );
}
