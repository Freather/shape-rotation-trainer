// 평면 도형 샌드박스: 도형 가족·칸 수 선택, 칸 칠하기/그림 놓기, 변환을 쌓아서 재생
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

const ALL_KINDS: RadialOp['kind'][] = ['rotate', 'rotateRing', 'rotateOpposite', 'mirror', 'invert', 'invertRing', 'invertSymbolCells', 'moveSymbols', 'swapSymbolRings', 'shiftSymbolRings', 'spinSymbols', 'flipSymbols'];

const OP_GROUPS: { title: string; kinds: RadialOp['kind'][] }[] = [
  { title: '돌리기', kinds: ['rotate', 'rotateRing', 'rotateOpposite'] },
  { title: '뒤집기', kinds: ['mirror'] },
  { title: '색 바꾸기', kinds: ['invert', 'invertRing', 'invertSymbolCells'] },
  { title: '그림만 움직이기', kinds: ['moveSymbols', 'swapSymbolRings', 'shiftSymbolRings', 'spinSymbols', 'flipSymbols'] },
];

type Tool = 'fill' | 'symbol' | 'rotate' | 'erase';

export function RadialSandbox() {
  const [shape, setShape] = useState<RadialShape>({ family: 'dart', sectors: [8, 8, 8] });
  const [cells, setCells] = useState<Cells>(() => randomCells({ family: 'dart', sectors: [8, 8, 8] }, makeRng(randomSeed()), { symbolCount: 5 }));
  const [queue, setQueue] = useState<RadialOp[]>([]);
  const [tool, setTool] = useState<Tool>('fill');
  const [sym, setSym] = useState(RADIAL_SYMBOLS[0]);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'ops' | 'edit' | 'shape'>('ops');
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
    if (!editing || tab !== 'edit') return;
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
      <div className="stage">
        <div className="canvas-wrap radial-wrap">
          <RadialSvg shape={shape} cells={cur} anim={anim} size={400} onCellClick={clickCell} />
          {pl.justFinished !== null && <div className="toast">{pl.justFinished}번째 변환 끝</div>}
          <div className="canvas-hint">{tab === 'edit' ? (editing ? '칸을 눌러 꾸미세요' : '꾸미려면 ⏮ 로 처음으로 돌아가세요') : ''}</div>
        </div>
        <div className="playbar">
          <div className="queue-chips">
            {queue.length === 0 && <span className="muted small">변환을 고르면 여기에 차례로 쌓여요.</span>}
            {queue.map((op, i) => (
              <span key={i} className={i < pl.done ? 'chip done' : i === pl.done && pl.playing ? 'chip now' : 'chip'}>
                {i + 1}. <Parts parts={describeRadialOp(op)} />
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
            <button className="primary" onClick={pl.play} disabled={!queue.length}>
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
          <span style={{ flex: 1 }} />
          <button className="link" onClick={() => setQueue([])}>
            비우기
          </button>
        </div>
      </div>

      <div className="side">
        <div className="side-tabs">
          <button className={tab === 'ops' ? 'on' : ''} onClick={() => setTab('ops')}>
            변환
          </button>
          <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>
            칸 꾸미기
          </button>
          <button className={tab === 'shape' ? 'on' : ''} onClick={() => setTab('shape')}>
            도형 모양
          </button>
        </div>

        {tab === 'ops' && (
          <div className="side-body">
            {OP_GROUPS.map((g) => {
              const list = ops.filter((o) => g.kinds.includes(o.kind));
              if (!list.length) return null;
              return (
                <div key={g.title}>
                  <h3>{g.title}</h3>
                  <div className="op-list">
                    {list.map((op, i) => (
                      <button key={i} onClick={() => setQueue((q) => [...q, op])}>
                        <Parts parts={describeRadialOp(op)} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="note">"전체 회전"은 그림도 같이 돌고, "그림만 이동"은 그림 방향이 그대로예요. 둘을 번갈아 재생해서 차이를 보세요.</p>
          </div>
        )}

        {tab === 'edit' && (
          <div className="side-body">
            <div className="seg">
              {(
                [
                  ['fill', '색 칠하기'],
                  ['symbol', '그림 놓기'],
                  ['rotate', '그림 돌리기'],
                  ['erase', '그림 지우기'],
                ] as [Tool, string][]
              ).map(([t, n]) => (
                <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
                  {n}
                </button>
              ))}
            </div>
            {tool === 'symbol' && (
              <div className="symbol-grid" style={{ marginTop: 10 }}>
                {RADIAL_SYMBOLS.map((s) => (
                  <button key={s} className={s === sym ? 'on' : ''} onClick={() => setSym(s)}>
                    <InlineGlyph id={s} size={24} />
                  </button>
                ))}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button onClick={() => setCells(randomCells(shape, makeRng(randomSeed()), { symbolCount: 5 }))}>무작위로 채우기</button>
              <button onClick={() => setCells(emptyCells(shape))}>모두 지우기</button>
            </div>
          </div>
        )}

        {tab === 'shape' && (
          <div className="side-body">
            {(Object.keys(FAMILY_SECTORS) as Family[]).map((f) => (
              <div key={f}>
                <h3>{FAMILY_NAMES[f]}</h3>
                <div className="btn-row">
                  {FAMILY_SECTORS[f].map((s) => (
                    <button key={s.join()} className={shape.family === f && shape.sectors.join() === s.join() ? 'on' : ''} onClick={() => setShapeAnd({ family: f, sectors: s })}>
                      {s[0] === s[2] ? `${s[0]}칸` : `안쪽부터 ${s.join('·')}칸`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
