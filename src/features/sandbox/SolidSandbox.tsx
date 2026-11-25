// 입체 샌드박스: 회전 큐 → 단계별 애니메이션, 자유 시점, 펼치기/접기, 면 기호 편집
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SYMBOLS } from '../../symbols/library';
import { CAMERA_DIR, SOLID_IDS, SOLID_NAMES, getSolid, type SolidId } from '../../engine/solids';
import { QUAT_IDENTITY, add, cross, deg, dot, quatFromAxisAngle, quatFromTo, quatMul, quatSlerp, scale, type Quat, type Vec3 } from '../../engine/math';
import { describeOp, type Dir, type RotationOp, type View } from '../../engine/rotation';
import { resolveOp, slots, stateHistory, transformVec, type Labeling, type SolidState } from '../../engine/state';
import { foldBounds, foldTransforms, hasPresets, netPresets, randomSpanningTree, type UnfoldMode } from '../../engine/net';
import { makeRng, randomSeed } from '../../engine/rng';
import { randomLabeling } from '../../engine/rules';
import { useSettings } from '../../store';
import { AxisGizmo, AxisLegend, AxisLine, NetCells3D, Solid3D, ThreeBridge, type EditCell } from '../../render/Solid3D';
import * as THREE from 'three';
import { VIEW_AXIS } from '../../engine/rotation';
import { useHandRotate, type AxisCandidate } from '../../render/useHandRotate';
import { canDetach, cellsFromNet, foldCells, freeSlots, placeCell, rotateUp } from '../../engine/netEdit';
import { symmetryGroup } from '../../engine/rotation';
import { canonicalLabelSignature } from '../../engine/state';
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
  const [tab, setTab] = useState<'rotate' | 'unfold' | 'edit'>('rotate');
  // 손으로 돌리기: 축을 고정하고 도형을 끌어서 돌림
  const [handRotate, setHandRotate] = useState(true);
  const [handAxis, setHandAxis] = useState<View | 'face' | 'auto'>('auto');
  const three = useRef<{ camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: unknown } | null>(null);
  const [jumpToEnd, setJumpToEnd] = useState(false);
  // 펼치기
  const [foldT, setFoldT] = useState(0);
  const [mode, setMode] = useState<UnfoldMode>('all');
  const [netIdx, setNetIdx] = useState(0);
  const [randTree, setRandTree] = useState<number[] | null>(null);
  // 펼친 전개도에서 면 옮기기
  const [customTree, setCustomTree] = useState<number[] | null>(null);
  const [moveCells, setMoveCells] = useState<EditCell[] | null>(null);
  const [moveRoot, setMoveRoot] = useState(0);
  const [held, setHeld] = useState<{ id: number; up: [number, number] } | null>(null);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ lab: Labeling; tree: number[] | null } | null>(null);
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
    setCustomTree(null);
    setMoveCells(null);
    setHeld(null);
    setHandAxis('auto');
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

  // 손으로 돌리기 (축 자동 선택 또는 고정)
  const viewStep = Math.min(...VIEW_ANGLES[solidId].angles);
  const faceStep = 360 / solid.sides;
  const recordHand = (op: RotationOp) => {
    setQueue((qq) => [...qq.slice(0, pl.done), op]);
    setJumpToEnd(true);
  };
  const dirOf = (k: number, angle: number): Dir => (angle === 180 ? 'cw' : k > 0 ? 'ccw' : 'cw');
  const viewCandidate = (v: View): AxisCandidate => ({
    axis: VIEW_AXIS[v],
    step: viewStep,
    commit: (k) => recordHand({ kind: 'view', view: v, dir: dirOf(k, Math.abs(k) * viewStep), angle: Math.abs(k) * viewStep }),
  });
  const faceCandidate = (face: number): AxisCandidate => ({
    axis: transformVec(cur, solid.faces[face].normal),
    step: faceStep,
    commit: (k) => recordHand({ kind: 'face', symbol: lab[face].symbol, dir: dirOf(k, Math.abs(k) * faceStep), angle: Math.abs(k) * faceStep }),
  });
  const hand = useHandRotate({
    three,
    enabled: handRotate && foldT === 0 && !pl.playing && !moveCells,
    candidates: (face) =>
      handAxis === 'auto'
        ? [...VIEW_ANGLES[solidId].views.map(viewCandidate), faceCandidate(face)]
        : handAxis === 'face'
          ? [faceCandidate(selFace ?? face)]
          : [viewCandidate(handAxis)],
    // 두 손가락: 누른 면을 축으로 비틀기
    twist: faceCandidate,
  });
  const dragRot = hand.dragRot;
  if (dragRot) q = quatMul(quatFromAxisAngle(dragRot.axis, dragRot.angle), q);

  // 전개도: 루트 = 지금 카메라를 향한 면
  const root = useMemo(() => {
    const info = slots(cur);
    let best = 0;
    for (const f of solid.faces) if (dot(f.normal, CAMERA_DIR) > dot(solid.faces[best].normal, CAMERA_DIR)) best = f.id;
    return info[best].face;
  }, [cur, solid]);
  const tree = useMemo(() => {
    if (customTree) return customTree;
    if (hasPresets(solidId)) return netPresets(solidId)[netIdx % netPresets(solidId).length];
    return randTree ?? randomSpanningTree(solidId, makeRng(1));
  }, [solidId, netIdx, randTree, customTree]);
  const foldTransformsNow = foldT > 0 ? foldTransforms(solidId, tree, root, foldT, mode) : null;
  // 펼칠수록 전개도 중심을 화면 가운데로, 전체 크기를 화면에 맞게
  const bounds = foldTransformsNow ? foldBounds(solidId, foldTransformsNow) : null;
  let fitScale = bounds ? Math.min(1, 2.3 / bounds.radius) : 1;

  // 면 옮기기 모드 계산
  const moveSlots = moveCells && held ? freeSlots(moveCells, held.id) : [];
  const moveResult = moveCells ? foldCells(solidId, moveCells, { cellId: moveRoot, face: moveRoot }) : null;
  const group = symmetryGroup(solidId);
  const sameAsBefore = !!snapshot && !!moveResult?.ok && canonicalLabelSignature(solidId, moveResult.labeling, group) === canonicalLabelSignature(solidId, snapshot.lab, group);
  let moveOffset: Vec3 = [0, 0, 0];
  if (moveCells) {
    const pts = [...moveCells.flatMap((c) => c.pts), ...moveSlots.flatMap((sl) => sl.pts)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rf = solid.faces[moveRoot];
    const ex = cross(rf.upRef, rf.normal);
    moveOffset = add(add(rf.center, scale(ex, cx)), scale(rf.upRef, cy));
    const radius = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    fitScale = Math.min(1, 2.4 / radius);
  }
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

  // 손으로 돌린 회전을 기록에 넣고 바로 그 결과를 보여줌
  useEffect(() => {
    if (jumpToEnd) {
      pl.jumpEnd();
      setJumpToEnd(false);
    }
  }, [jumpToEnd, pl]);

  const handAxes: (View | 'face' | 'auto')[] = ['auto', ...VIEW_ANGLES[solidId].views, 'face'];

  const startMove = () => {
    if (foldAnim.current) cancelAnimationFrame(foldAnim.current);
    setFoldT(1);
    setMoveRoot(root);
    setMoveCells(cellsFromNet(solidId, tree, root, lab));
    setSnapshot({ lab, tree: customTree });
    setHeld(null);
    setSelFace(null);
    setMoveMsg(null);
  };
  const canPickCell = (id: number): boolean => {
    if (!moveCells) return false;
    if (held?.id === id) return true;
    if (id === moveRoot) {
      setMoveMsg('색이 다른 면은 바닥 면이라 옮길 수 없어요. 다른 면을 골라 주세요.');
      return false;
    }
    if (!canDetach(moveCells, id)) {
      setMoveMsg('이 면을 떼면 전개도가 두 조각으로 나뉘어요. 끝에 달린 면을 골라 주세요.');
      return false;
    }
    setMoveMsg(null);
    return true;
  };
  const pickCell = (id: number) => {
    if (!moveCells || held?.id === id) return;
    setHeld({ id, up: moveCells.find((c) => c.id === id)!.up });
  };
  const clickSlot = (key: string) => {
    if (!moveCells || !held) return;
    const slot = moveSlots.find((x) => x.key === key);
    if (!slot) return;
    const next = placeCell(moveCells, held.id, slot, held.up);
    setMoveCells(next);
    setHeld(null);
    const r = foldCells(solidId, next, { cellId: moveRoot, face: moveRoot });
    if (r.ok) {
      setLab(r.labeling);
      setCustomTree(r.edges);
    }
  };
  const finishMove = (fold: boolean) => {
    if (!moveResult?.ok) return;
    setMoveCells(null);
    setHeld(null);
    if (fold) setTimeout(() => animateFold(0), 50);
  };
  const cancelMove = () => {
    if (snapshot) {
      setLab(snapshot.lab);
      setCustomTree(snapshot.tree);
    }
    setMoveCells(null);
    setHeld(null);
    setMoveMsg(null);
  };
  const commitHere = () => {
    // 현재 상태를 새 시작점으로
    setStart(cur);
    setQueue([]);
    pl.reset();
  };

  const views = VIEW_ANGLES[solidId];
  const faceAngle = 360 / solid.sides;
  const selSym = selFace !== null ? lab[selFace].symbol : null;
  const angleCols: { key: string; dir: Dir; angle: number; label: string; short: string }[] = views.angles.flatMap((a) =>
    a === 180
      ? [{ key: '180', dir: 'cw' as Dir, angle: 180, label: '180°', short: '180°' }]
      : [
          { key: `cw${a}`, dir: 'cw' as Dir, angle: a, label: `시계 ${a}°`, short: '↻' },
          { key: `ccw${a}`, dir: 'ccw' as Dir, angle: a, label: `반시계 ${a}°`, short: '↺' },
        ],
  );

  return (
    <div className="sandbox">
      <div className="stage">
        <div className="canvas-wrap">
          <Canvas camera={{ position: [CAMERA_DIR[0] * 8, CAMERA_DIR[1] * 8, CAMERA_DIR[2] * 8], fov: 35 }} dpr={[1, 2]}>
            <FitCamera />
            <ambientLight intensity={1.7} />
            <directionalLight position={[-3, 6, 4]} intensity={1.3} />
            {moveCells ? (
              <NetCells3D
                solidId={solidId}
                root={moveRoot}
                q={q}
                mirrored={cur.mirrored}
                offset={moveOffset}
                fitScale={fitScale}
                cells={moveCells}
                heldId={held?.id ?? null}
                heldUp={held?.up ?? null}
                slots={moveSlots}
                badIds={moveResult && !moveResult.ok ? moveResult.collide : []}
                mono={mono}
                onSlotClick={clickSlot}
                canPick={canPickCell}
                onDragStart={pickCell}
                onDragCancel={() => setHeld(null)}
              />
            ) : (
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
              onFacePress={hand.press}
              onFaceClick={(f) => {
                if (hand.consumeClick()) return;
                setSelFace(f === selFace ? null : f);
                if (f !== selFace) setTab('edit');
              }}
            />
            )}
            <AxisGizmo />
            <ThreeBridge target={three} />
            {handRotate && foldT === 0 && !moveCells && (dragRot || (handAxis !== 'auto' && (handAxis !== 'face' || selFace !== null))) && (
              <AxisLine
                axis={dragRot ? dragRot.axis : handAxis === 'face' ? transformVec(cur, solid.faces[selFace!].normal) : VIEW_AXIS[handAxis as View]}
              />
            )}
            <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={4} maxDistance={18} />
          </Canvas>
          <AxisLegend />
          <div className="canvas-hint">
            {moveCells
              ? held
                ? '끌어서 파란 자리 가까이 가져가면 붙어요'
                : '옮길 면을 꾹 눌러 끌어 보세요'
              : hand.twisting
                ? '누른 면을 축으로 비트는 중'
                : handRotate && foldT === 0
                ? '도형을 끌면 돌아가요. 빈 곳을 끌면 보는 방향이 바뀌어요'
                : '끌면 보는 방향만 바뀌어요'}
          </div>
          {pl.justFinished !== null && <div className="toast">{pl.justFinished}번째 회전 끝</div>}
        </div>
        <div className="playbar">
          <div className="queue-chips">
            {queue.length === 0 && <span className="muted small">회전을 고르면 여기에 차례로 쌓여요. 다 쌓으면 재생을 누르세요.</span>}
            {queue.map((op, i) => (
              <span key={i} className={i < pl.done ? 'chip done' : i === pl.done && pl.playing ? 'chip now' : 'chip'}>
                {i + 1}. <Parts parts={describeOp(op)} />
                <button className="x" aria-label="빼기" onClick={() => setQueue((qq) => qq.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <button onClick={pl.reset} title="처음으로">
            ⏮
          </button>
          <button onClick={pl.prev} title="한 단계 뒤로">
            ◀
          </button>
          {pl.playing ? (
            <button onClick={pl.pause}>멈춤</button>
          ) : (
            <button className="primary" onClick={pl.play} disabled={!queue.length || !!moveCells}>
              재생
            </button>
          )}
          <button onClick={pl.next} title="한 단계 앞으로">
            ▶
          </button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="속도">
            {[0.25, 0.5, 1, 1.5, 2].map((s) => (
              <option key={s} value={s}>
                {s}배
              </option>
            ))}
          </select>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="link" onClick={() => setQueue([])}>
            비우기
          </button>
          <button className="link" onClick={commitHere}>
            지금 모양에서 다시 시작
          </button>
        </div>
      </div>

      <div className="side">
        <div className="side-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {SOLID_IDS.map((id) => (
              <button key={id} className={id === solidId ? 'on' : ''} onClick={() => changeSolid(id)}>
                {SOLID_NAMES[id]}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button onClick={() => setLab(randomLabeling(solidId, makeRng(randomSeed())))}>그림 새로 섞기</button>
            <button onClick={() => controls.current?.reset()}>처음 보던 방향</button>
            <label className="check small">
              <input type="checkbox" checked={translucent} onChange={(e) => setTranslucent(e.target.checked)} /> 뒷면 비치게
            </label>
          </div>
        </div>
        <div className="side-tabs">
          <button className={tab === 'rotate' ? 'on' : ''} onClick={() => setTab('rotate')}>
            돌리기
          </button>
          <button className={tab === 'unfold' ? 'on' : ''} onClick={() => setTab('unfold')}>
            펼치기
          </button>
          <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>
            면 꾸미기
          </button>
        </div>

        {tab === 'rotate' && (
          <div className="side-body">
            <h3 style={{ marginTop: 0 }}>손으로 돌리기</h3>
            <label className="check small">
              <input type="checkbox" checked={handRotate} onChange={(e) => setHandRotate(e.target.checked)} /> 도형을 끌어서 돌리기
            </label>
            {handRotate && (
              <>
                <div className="field-label" style={{ marginTop: 8 }}>
                  고정할 축
                </div>
                <div className="seg">
                  {handAxes.map((a) => (
                    <button key={a} className={handAxis === a ? 'on' : ''} onClick={() => setHandAxis(a)}>
                      {a === 'auto' ? '자동' : a === 'face' ? '누른 면' : { front: '앞뒤 축', top: '위아래 축', right: '좌우 축' }[a]}
                    </button>
                  ))}
                </div>
                <p className="note">
                  {handAxis === 'auto'
                    ? '끄는 방향에 맞는 축을 알아서 골라 돌려요. 돌아가는 동안 그 축이 주황 점선으로 보여요.'
                    : '주황 점선이 고정된 축이에요. 도형을 끌면 그 축으로만 돌아요.'}{' '}
                  조금만 끌어도 다음 각도로 넘어가고, 손을 떼면 각도가 딱 맞춰진 뒤 아래 기록에 쌓여요. 휴대폰에서는 한 손가락으로 면을 누른 채 다른 손가락을 돌리면 그 면을 축으로 비틀어 돌아요.
                  {handAxis === 'face' && ' 미리 고른 면이 있으면 그 면, 없으면 누른 면이 축이 돼요.'}
                </p>
              </>
            )}
            <h3>버튼으로 돌리기</h3>
            <table className="rot-table">
              <thead>
                <tr>
                  <th>보는 쪽</th>
                  {angleCols.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {views.views.map((v) => (
                  <tr key={v}>
                    <th>{VIEW_NAME[v]}에서</th>
                    {angleCols.map((c) => (
                      <td key={c.key}>
                        <button onClick={() => push({ kind: 'view', view: v, dir: c.dir, angle: c.angle })}>{c.short}</button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {solidId === 'cube' && (
              <>
                <h3>굴리기</h3>
                <div className="btn-row">
                  {(['forward', 'backward', 'left', 'right'] as const).map((d) => (
                    <button key={d} onClick={() => push({ kind: 'roll', dir: d })}>
                      {{ forward: '앞으로', backward: '뒤로', right: '오른쪽으로', left: '왼쪽으로' }[d]}
                    </button>
                  ))}
                </div>
              </>
            )}
            <h3>고른 면을 기준으로</h3>
            {selSym ? (
              <div className="btn-row">
                <InlineGlyph id={selSym} size={22} />
                {(['cw', 'ccw'] as Dir[]).map((d) =>
                  [faceAngle, ...(solid.sides === 5 ? [faceAngle * 2] : [])].map((a) => (
                    <button key={`f${d}${a}`} onClick={() => push({ kind: 'face', symbol: selSym, dir: d, angle: a })}>
                      {d === 'cw' ? '시계' : '반시계'} {a}°
                    </button>
                  )),
                )}
              </div>
            ) : (
              <p className="note">도형에서 면을 하나 누르면 그 면을 기준으로 돌릴 수 있어요.</p>
            )}
            <h3>그 밖에</h3>
            <div className="btn-row">
              <button onClick={() => push({ kind: 'mirror' })}>거울처럼 좌우 반전</button>
              <button onClick={() => { setStart({ solidId, q: QUAT_IDENTITY, mirrored: false }); setQueue([]); pl.reset(); }}>처음 자세로</button>
            </div>
          </div>
        )}

        {tab === 'unfold' && moveCells && (
          <div className="side-body">
            <h3>면 옮기기</h3>
            {held ? (
              <div className="btn-row">
                <InlineGlyph id={moveCells.find((c) => c.id === held.id)!.symbol} size={28} />
                <button onClick={() => setHeld({ ...held, up: rotateUp(held.up, solid.sides, 1) as [number, number] })}>↺ 돌리기</button>
                <button onClick={() => setHeld({ ...held, up: rotateUp(held.up, solid.sides, -1) as [number, number] })}>↻ 돌리기</button>
                <button className="link" onClick={() => setHeld(null)}>
                  내려놓기
                </button>
              </div>
            ) : (
              <p className="note">옮길 면을 꾹 눌러 끌어 보세요. 파란 자리 가까이 가면 자석처럼 끌려가 붙어요. 눌렀다 떼면 든 채로 있어서, 돌린 다음 파란 자리를 눌러 붙여도 돼요.</p>
            )}
            {moveResult?.ok ? (
              <div className={sameAsBefore ? 'status ok' : 'status'}>
                접으면 {solid.name}가 돼요. {sameAsBefore ? '옮기기 전 도형과 똑같아요.' : '옮기기 전 도형과는 달라요.'}
              </div>
            ) : (
              <div className="status ng">빨간 면 두 개가 접었을 때 같은 자리에 겹쳐요. 둘 중 하나를 다른 곳으로 옮겨 보세요.</div>
            )}
            {moveMsg && <p className="note bad">{moveMsg}</p>}
            <div className="btn-row">
              <button className="primary" disabled={!moveResult?.ok || !!held} onClick={() => finishMove(true)}>
                이대로 접기
              </button>
              <button disabled={!moveResult?.ok || !!held} onClick={() => finishMove(false)}>
                옮기기 끝내기
              </button>
              <button className="link" onClick={cancelMove}>
                옮기기 전으로
              </button>
            </div>
          </div>
        )}

        {tab === 'unfold' && !moveCells && (
          <div className="side-body">
            <div className="btn-row">
              <button className="primary" onClick={() => animateFold(1)}>
                펼치기
              </button>
              <button onClick={() => animateFold(0)}>접기</button>
              <div className="seg">
                <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>
                  한꺼번에
                </button>
                <button className={mode === 'sequential' ? 'on' : ''} onClick={() => setMode('sequential')}>
                  한 장씩
                </button>
              </div>
            </div>
            <label className="slider">
              <span>펼친 정도 {Math.round(foldT * 100)}%</span>
              <input type="range" min={0} max={1} step={0.005} value={foldT} onChange={(e) => setFoldT(Number(e.target.value))} />
            </label>
            <div className="btn-row">
              {hasPresets(solidId) ? (
                <>
                  <span className="small muted">전개도 모양</span>
                  <select value={netIdx} onChange={(e) => { setNetIdx(Number(e.target.value)); setCustomTree(null); }}>
                    {netPresets(solidId).map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}번 / {netPresets(solidId).length}가지
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <button onClick={() => { setRandTree(randomSpanningTree(solidId, makeRng(randomSeed()))); setCustomTree(null); }}>다른 모양으로</button>
              )}
            </div>
            <div className="btn-row">
              <button onClick={startMove}>면 옮기기</button>
              {customTree && (
                <button className="link" onClick={() => setCustomTree(null)}>
                  원래 전개도 모양으로
                </button>
              )}
            </div>
            <p className="note">지금 앞에 보이는 면을 바닥에 두고 펼쳐요. "면 옮기기"를 누르면 펼친 상태에서 면을 떼어 다른 모서리에 붙여 볼 수 있어요.</p>
          </div>
        )}

        {tab === 'edit' && (
          <div className="side-body">
            {selFace !== null && selSym ? (
              <>
                <div className="btn-row">
                  <InlineGlyph id={selSym} size={28} />
                  <button onClick={() => setLab((l) => l.map((x, i) => (i === selFace ? { ...x, rot: (x.rot + 1) % solid.sides } : x)))}>그림 돌리기</button>
                  <button onClick={() => setLab((l) => l.map((x, i) => (i === selFace ? { ...x, flip: !x.flip } : x)))}>그림 뒤집기</button>
                  <button className="link" onClick={() => setSelFace(null)}>
                    선택 풀기
                  </button>
                </div>
                <p className="note">다른 그림으로 바꾸기 (이미 쓰인 그림은 흐리게 보여요)</p>
                <div className="symbol-grid">
                  {SYMBOLS.filter((s) => !s.noQuiz).map((s) => (
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
              </>
            ) : (
              <p className="note">도형에서 면을 누르면 그 면의 그림을 돌리거나 바꿀 수 있어요. 펼친 상태에서 바꾸고 다시 접어 봐도 돼요.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 화면 비율에 맞게 카메라 거리 조절 (세로로 긴 휴대폰 화면에서 도형이 잘리지 않게) */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const dist = 8 * Math.max(1, 1.05 / aspect);
    camera.position.setLength(dist);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}
