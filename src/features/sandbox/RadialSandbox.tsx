// 평면 방사형 샌드박스: 도형 가족·칸 수 선택, 칸 칠하기/그림 놓기, 연산 큐 재생
import { useMemo, useState } from 'react';
import { RADIAL_SYMBOLS } from '../../symbols/library';
import { FAMILY_NAMES, FAMILY_SECTORS, emptyCells, normalizeCells, type Cells, type Family, type RadialShape } from '../../engine/radial/model';
import { describeRadialOp, radialHistory, type RadialOp } from '../../engine/radial/ops';
import { radialOpCandidates, randomCells } from '../../engine/radial/generate';
import { makeRng, randomSeed } from '../../engine/rng';
import { RadialSvg } from '../../render/RadialSvg';
import { usePlayer } from '../../render/usePlayer';
import { InlineGlyph } from '../../render/Glyph';
import { Parts } from '../../ui/Parts';

const ALL_KINDS: RadialOp['kind'][] = ['rotate', 'rotateRing', 'rotateOpposite', 'mirror', 'invert', 'invertRing', 'invertSymbolCells', 'moveSymbols', 'swapSymbolRings', 'spinSymbols', 'flipSymbols'];

type Tool = 'fill' | 'symbol' | 'rotate' | 'erase';

export function RadialSandbox() {
  const [shape, setShape] = useState<RadialShape>({ family: 'dart', sectors: [8, 8, 8] });
  const [cells, setCells] = useState<Cells>(() => randomCells({ family: 'dart', sectors: [8, 8, 8] }, makeRng(randomSeed()), { symbolCount: 5 }));
  const [queue, setQueue] = useState<RadialOp[]>([]);
  const [tool, setTool] = useState<Tool>('fill');
  const [sym, setSym] = useState(RADIAL_SYMBOLS[0]);
  const [speed, setSpeed] = useState(1);
  const pl = usePlayer(queue.length, { speed, stepMs: 1200 });
  const hist = useMemo(() => radialHistory(shape, cells, queue), [shape, cells, queue]);
  const cur = hist[Math.min(pl.done, hist.length - 1)];
  const anim = pl.p > 0 && pl.done < queue.length ? { op: queue[pl.done], p: pl.p } : null;
  const ops = useMemo(() => radialOpCandidates(shape, ALL_KINDS), [shape]);

  const setShapeAnd = (s: RadialShape) => {
    setShape(s);
    setCells(randomCells(s, makeRng(randomSeed()), { symbolCount: 5 }));
    setQueue([]);
    pl.reset();
  };

  const editing = pl.done === 0 && !pl.playing;
  const clickCell = (r: number, k: number) => {
    if (!editing) return;
    setCells((c) =>
      normalizeCells(
        c.map((ring, ri) =>
          ring.map((cell, ki) => {
            if (ri !== r || ki !== k) return cell;
            if (tool === 'fill') return { ...cell, fill: 1 - cell.fill };
            if (tool === 'symbol') return { ...cell, symbol: sym, rot: 0, mirrored: false };
            if (tool === 'rotate') return { ...cell, rot: cell.rot + 90 };
            return { ...cell, symbol: null };
          }),
        ),
      ),
    );
  };

  return (
    <div className="sandbox">
      <div className="canvas-wrap radial-wrap">
        <RadialSvg shape={shape} cells={cur} anim={anim} size={420} onCellClick={clickCell} />
        {pl.justFinished !== null && <div className="toast">[{pl.justFinished}] 적용 완료</div>}
        {!editing && <div className="canvas-hint">편집하려면 ⏮ 처음으로 돌아가세요</div>}
      </div>
      <div className="side">
        <section>
          <h3>도형</h3>
          <div className="btn-row">
            {(Object.keys(FAMILY_SECTORS) as Family[]).map((f) =>
              FAMILY_SECTORS[f].map((s) => (
                <button
                  key={`${f}${s.join()}`}
                  className={shape.family === f && shape.sectors.join() === s.join() ? 'primary' : ''}
                  onClick={() => setShapeAnd({ family: f, sectors: s })}
                >
                  {FAMILY_NAMES[f]} {s[0] === s[2] ? s[0] : s.join('/')}칸
                </button>
              )),
            )}
          </div>
          <div className="btn-row">
            <button onClick={() => setCells(randomCells(shape, makeRng(randomSeed()), { symbolCount: 5 }))}>랜덤 채우기</button>
            <button onClick={() => setCells(emptyCells(shape))}>모두 지우기</button>
          </div>
        </section>
        <section>
          <h3>칸 편집 (클릭)</h3>
          <div className="btn-row">
            {(
              [
                ['fill', '색 칠하기'],
                ['symbol', '그림 놓기'],
                ['rotate', '그림 90° 돌리기'],
                ['erase', '그림 지우기'],
              ] as [Tool, string][]
            ).map(([t, n]) => (
              <button key={t} className={tool === t ? 'primary' : ''} onClick={() => setTool(t)}>
                {n}
              </button>
            ))}
          </div>
          {tool === 'symbol' && (
            <div className="symbol-grid">
              {RADIAL_SYMBOLS.map((s) => (
                <button key={s} className={s === sym ? 'primary' : ''} onClick={() => setSym(s)}>
                  <InlineGlyph id={s} size={24} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section>
          <h3>연산 → 큐에 쌓기</h3>
          <div className="rot-grid">
            {ops.map((op, i) => (
              <button key={i} onClick={() => setQueue((q) => [...q, op])}>
                <Parts parts={describeRadialOp(op)} />
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>큐 ({queue.length})</h3>
          <ol className="queue">
            {queue.map((op, i) => (
              <li key={i} className={i < pl.done ? 'done' : i === pl.done && pl.playing ? 'now' : ''}>
                <Parts parts={describeRadialOp(op)} />
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
            <button onClick={() => setQueue([])}>큐 비우기</button>
          </div>
        </section>
      </div>
    </div>
  );
}
