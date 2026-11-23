// 전개도 만들기: 면을 눌러 떼고, 빈 자리(점선)를 눌러 붙인다. 붙이기 전에 돌릴 수 있다.
// 접어 보기로 실제로 접히는 모습과 처음 도형과 같은지 확인한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { QUAT_IDENTITY } from '../../engine/math';
import { defaultRoot, hasPresets, netPresets, randomSpanningTree } from '../../engine/net';
import { canDetach, cellsFromNet, edgeLength, foldCells, freeSlots, magnet, placeCell, rotateUp, type NetCell, type Slot } from '../../engine/netEdit';
import { makeRng, randomSeed } from '../../engine/rng';
import { symmetryGroup } from '../../engine/rotation';
import { randomLabeling } from '../../engine/rules';
import { SOLID_NAMES, getSolid, type SolidId } from '../../engine/solids';
import { canonicalLabelSignature, type Labeling } from '../../engine/state';
import { getSymbol } from '../../symbols/library';
import { useSettings } from '../../store';
import { Glyph, InlineGlyph } from '../../render/Glyph';
import { symbolMatrix, symbolWorldSize } from '../../render/project';
import { FoldSolution } from '../../render/SolutionPlayer';

const BUILD_SOLIDS: SolidId[] = ['cube', 'octa', 'tetra', 'dodeca', 'icosa'];

type Pt = [number, number];

function CellShape({ cell, size, fill, stroke, strokeWidth, opacity = 1, dash }: { cell: { pts: Pt[]; up: Pt; symbol: string }; size: number; fill: string; stroke: string; strokeWidth: number; opacity?: number; dash?: string }) {
  const c: Pt = [cell.pts.reduce((s, p) => s + p[0], 0) / cell.pts.length, cell.pts.reduce((s, p) => s + p[1], 0) / cell.pts.length];
  const right: Pt = [cell.up[1], -cell.up[0]];
  const m = symbolMatrix([c[0], -c[1]], [right[0], -right[1]], [cell.up[0], -cell.up[1]], size);
  return (
    <g opacity={opacity}>
      <polygon points={cell.pts.map(([x, y]) => `${x},${-y}`).join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} strokeLinejoin="round" />
      <g transform={`matrix(${m.join(' ')})`}>
        <Glyph id={cell.symbol} />
      </g>
    </g>
  );
}

export function NetBuilder() {
  const color = useSettings((s) => !s.mono);
  const [solidId, setSolidId] = useState<SolidId>('cube');
  const [lab, setLab] = useState<Labeling>(() => randomLabeling('cube', makeRng(randomSeed())));
  const [tree, setTree] = useState<number[]>(() => netPresets('cube')[0]);
  const [cells, setCells] = useState<NetCell[]>(() => cellsFromNet('cube', netPresets('cube')[0], 2, lab));
  const [held, setHeld] = useState<{ id: number; up: Pt } | null>(null);
  const [view, setView] = useState<'net' | 'fold'>('net');
  const [msg, setMsg] = useState<string | null>(null);
  const [moves, setMoves] = useState(0);
  const [drag, setDrag] = useState<{ id: number; grab: Pt; center: Pt; moved: boolean; wasHeld: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const svgRef = useRef<SVGSVGElement>(null);

  const solid = getSolid(solidId);
  const group = symmetryGroup(solidId);
  const original = useMemo(() => canonicalLabelSignature(solidId, lab, group), [solidId, lab, group]);
  const result = useMemo(() => foldCells(solidId, cells), [solidId, cells]);
  const slots: Slot[] = useMemo(() => (held ? freeSlots(cells, held.id) : []), [cells, held]);
  const symSize = symbolWorldSize(solidId);

  const reset = (id: SolidId, newLab?: Labeling, newTree?: number[]) => {
    const l = newLab ?? randomLabeling(id, makeRng(randomSeed()));
    const t = newTree ?? (hasPresets(id) ? netPresets(id)[0] : randomSpanningTree(id, makeRng(randomSeed())));
    setSolidId(id);
    setLab(l);
    setTree(t);
    setCells(cellsFromNet(id, t, defaultRoot(id), l));
    setHeld(null);
    setView('net');
    setMsg(null);
    setMoves(0);
  };

  // 화면 좌표 → 전개도 좌표 (y 위가 +)
  const toNet = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, -p.y];
  };
  const centerOf = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

  const pressCell = (c: NetCell, e: React.PointerEvent) => {
    if (held?.id !== c.id && !canDetach(cells, c.id)) {
      setMsg('이 면을 떼면 전개도가 두 조각으로 나뉘어요. 가장자리에 있는 면을 골라 보세요.');
      return;
    }
    const p = toNet(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    setMsg(null);
    const wasHeld = held?.id === c.id;
    if (!wasHeld) setHeld({ id: c.id, up: c.up });
    const cc = centerOf(c.pts);
    setDrag({ id: c.id, grab: [cc[0] - p[0], cc[1] - p[1]], center: cc, moved: false, wasHeld });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      const p = toNet(e.clientX, e.clientY);
      if (!d || !p) return;
      const center: Pt = [p[0] + d.grab[0], p[1] + d.grab[1]];
      setDrag({ ...d, center, moved: d.moved || Math.hypot(center[0] - d.center[0], center[1] - d.center[1]) > 0.05 });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const cell = cells.find((x) => x.id === d.id);
      if (!cell) return;
      const slotsNow = freeSlots(cells, d.id);
      const m = magnet(slotsNow, d.center, edgeLength(cell));
      if (m.slot) {
        setCells((cs) => placeCell(cs, d.id, m.slot!, heldUpRef.current ?? cell.up));
        setHeld(null);
        setMoves((n) => n + 1);
      } else if (d.moved || d.wasHeld) {
        setHeld(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag?.id, cells]); // eslint-disable-line react-hooks/exhaustive-deps
  const heldUpRef = useRef<Pt | null>(null);
  heldUpRef.current = held?.up ?? null;

  const place = (s: Slot) => {
    if (!held) return;
    setCells((cs) => placeCell(cs, held.id, s, held.up));
    setHeld(null);
    setMoves((m) => m + 1);
  };

  // 보기 영역 계산
  const allPts = [...cells.flatMap((c) => c.pts), ...slots.flatMap((s) => s.pts)];
  const minX = Math.min(...allPts.map((p) => p[0])) - 0.3;
  const maxX = Math.max(...allPts.map((p) => p[0])) + 0.3;
  const minY = Math.min(...allPts.map((p) => p[1])) - 0.3;
  const maxY = Math.max(...allPts.map((p) => p[1])) + 0.3;

  const heldCell = held ? cells.find((c) => c.id === held.id)! : null;
  const dragMag = drag && heldCell ? magnet(slots, drag.center, edgeLength(heldCell)) : null;
  const collide = !result.ok ? result.collide : null;
  const sameAsOriginal = result.ok && canonicalLabelSignature(solidId, result.labeling, group) === original;
  const fill = (sym: string) => (color ? getSymbol(sym).color : '#fbfaf7');

  return (
    <div className="sandbox">
      <div className="stage">
        <div className="canvas-wrap net-wrap">
          {view === 'net' ? (
            <svg ref={svgRef} width="100%" height="100%" viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" style={{ touchAction: 'none' }}>
              {cells.map((c) => {
                const isHeld = held?.id === c.id;
                const isBad = collide?.includes(c.id);
                return (
                  <g key={c.id} onPointerDown={(e) => pressCell(c, e)} style={{ cursor: drag ? 'grabbing' : 'grab' }}>
                    <CellShape
                      cell={c}
                      size={symSize}
                      fill={isBad ? '#fdeeee' : fill(c.symbol)}
                      stroke={isBad ? '#c62828' : '#16181b'}
                      strokeWidth={isBad ? 0.07 : 0.035}
                      opacity={isHeld ? 0.25 : 1}
                    />
                  </g>
                );
              })}
              {heldCell &&
                slots.map((s) => (
                  <g key={s.key} onClick={drag ? undefined : () => place(s)} style={{ cursor: 'pointer' }}>
                    <CellShape
                      cell={{ pts: s.pts, up: held!.up, symbol: heldCell.symbol }}
                      size={symSize}
                      fill={dragMag?.slot?.key === s.key ? '#fff3bf' : '#e8eefc'}
                      stroke={dragMag?.slot?.key === s.key ? '#e67700' : '#2b4acb'}
                      strokeWidth={dragMag?.slot?.key === s.key ? 0.06 : 0.03}
                      opacity={drag ? 0.55 : 0.75}
                      dash="0.08 0.06"
                    />
                  </g>
                ))}
              {heldCell && held && drag && (
                <g style={{ pointerEvents: 'none' }}>
                  <CellShape
                    cell={{
                      pts:
                        dragMag?.slot && dragMag.pull >= 1
                          ? dragMag.slot.pts
                          : heldCell.pts.map(([x, y]) => [x - centerOf(heldCell.pts)[0] + dragMag!.display[0], y - centerOf(heldCell.pts)[1] + dragMag!.display[1]] as Pt),
                      up: held.up,
                      symbol: heldCell.symbol,
                    }}
                    size={symSize}
                    fill={dragMag?.slot ? '#ffe066' : '#fff'}
                    stroke={dragMag?.slot ? '#e67700' : '#16181b'}
                    strokeWidth={0.05}
                  />
                </g>
              )}
            </svg>
          ) : result.ok ? (
            <FoldSolution sol={{ kind: 'fold', solidId, labeling: result.labeling, edges: result.edges, root: result.root, finalQ: QUAT_IDENTITY, ops: [], labels: [] }} size={360} />
          ) : null}
          {view === 'net' && <div className="canvas-hint">{held ? '파란 자리 가까이 끌어다 놓으면 붙어요' : '옮길 면을 꾹 눌러 끌어 보세요'}</div>}
        </div>
        <div className="playbar">
          {view === 'net' ? (
            <button className="primary" disabled={!result.ok || !!held} onClick={() => setView('fold')}>
              접어 보기
            </button>
          ) : (
            <button className="primary" onClick={() => setView('net')}>
              다시 펼쳐서 고치기
            </button>
          )}
          <button onClick={() => reset(solidId, lab, tree)}>처음 전개도로</button>
          <span className="muted small">옮긴 횟수 {moves}</span>
        </div>
      </div>

      <div className="side">
        <div className="side-body">
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {BUILD_SOLIDS.map((id) => (
              <button key={id} className={id === solidId ? 'on' : ''} onClick={() => reset(id)}>
                {SOLID_NAMES[id]}
              </button>
            ))}
          </div>
          <div className="btn-row">
            {hasPresets(solidId) ? (
              <select
                value={netPresets(solidId).findIndex((t) => t.join() === tree.join())}
                onChange={(e) => reset(solidId, lab, netPresets(solidId)[Number(e.target.value)])}
                aria-label="전개도 모양"
              >
                {netPresets(solidId).map((_, i) => (
                  <option key={i} value={i}>
                    전개도 {i + 1}번
                  </option>
                ))}
              </select>
            ) : (
              <button onClick={() => reset(solidId, lab, randomSpanningTree(solidId, makeRng(randomSeed())))}>다른 전개도</button>
            )}
            <button onClick={() => reset(solidId, randomLabeling(solidId, makeRng(randomSeed())), tree)}>그림 새로 섞기</button>
          </div>

          <h3>지금 든 면</h3>
          {heldCell && held ? (
            <>
              <div className="btn-row">
                <svg width={72} height={72} viewBox="-1.4 -1.4 2.8 2.8">
                  <CellShape
                    cell={{
                      pts: heldCell.pts.map(([x, y]) => {
                        const cx = heldCell.pts.reduce((s, p) => s + p[0], 0) / heldCell.pts.length;
                        const cy = heldCell.pts.reduce((s, p) => s + p[1], 0) / heldCell.pts.length;
                        return [x - cx, y - cy] as Pt;
                      }),
                      up: held.up,
                      symbol: heldCell.symbol,
                    }}
                    size={symSize}
                    fill={fill(heldCell.symbol)}
                    stroke="#16181b"
                    strokeWidth={0.05}
                  />
                </svg>
                <button onClick={() => setHeld({ ...held, up: rotateUp(held.up, solid.sides, 1) })}>↺ 돌리기</button>
                <button onClick={() => setHeld({ ...held, up: rotateUp(held.up, solid.sides, -1) })}>↻ 돌리기</button>
                <button className="link" onClick={() => setHeld(null)}>
                  내려놓기
                </button>
              </div>
              <p className="note">돌린 방향 그대로 붙어요. 칸 모양에 따라 가장 가까운 방향으로 맞춰져요.</p>
            </>
          ) : (
            <p className="note">면을 꾹 눌러 끌어 보세요. 파란 자리 가까이 가면 자석처럼 끌려가 붙어요. 눌렀다 떼면 든 채로 있어서, 돌린 다음 놓을 수도 있어요.</p>
          )}

          <h3>접으면</h3>
          {result.ok ? (
            <div className={sameAsOriginal ? 'status ok' : 'status'}>
              {solid.name}가 만들어져요.{' '}
              {sameAsOriginal ? '처음 도형과 똑같아요.' : '하지만 처음 도형과는 달라요. 어떤 면의 위치나 그림 방향이 바뀌었어요.'}
            </div>
          ) : (
            <div className="status ng">
              접으면{' '}
              {collide && (
                <>
                  <InlineGlyph id={cells.find((c) => c.id === collide[0])!.symbol} /> 면과 <InlineGlyph id={cells.find((c) => c.id === collide[1])!.symbol} /> 면이
                </>
              )}{' '}
              같은 자리에 겹쳐서 {solid.name}가 되지 않아요. 빨간 면을 옮겨 보세요.
            </div>
          )}
          {msg && <p className="note bad">{msg}</p>}

          <h3>해 볼 만한 것</h3>
          <ul className="note" style={{ paddingLeft: 18, margin: 0 }}>
            <li>끝에 달린 면을 다른 모서리로 옮겨도 똑같은 도형이 되는 자리를 찾아보세요.</li>
            <li>그대로 붙이면 달라지고, 돌려서 붙여야 같아지는 경우가 있어요.</li>
            <li>정육면체는 한 줄에 다섯 칸이 이어지면 접히지 않아요.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
