// 쌓기나무 직접 돌려보기: 버튼으로 돌리면 축과 방향을 보여주며 천천히 돈다
import { useEffect, useState } from 'react';
import { applyBlockOp, blockOpCandidates, describeBlockOp, type BlockOp, type Blocks } from '../../engine/blocks';
import { blockFrame, blockOpMarks, colorsAfter } from '../../render/blockAnim';
import type { Rule } from '../../engine/rules';
import { BlocksSvg, blocksRadius } from '../../render/BlocksSvg';
import { AxisMarks, VIEW_LABEL } from '../../render/AxisMarks';
import { Parts, RuleBadge } from '../../ui/Parts';

const FREE_OPS = blockOpCandidates({ views: ['top', 'front', 'right'], half: false, rolls: false, mirror: false });

export function BlockScratch({ cells: start, rules, colors }: { cells: Blocks; rules?: Rule<BlockOp>[]; colors?: string[] }) {
  const [cells, setCells] = useState(start);
  const [cols, setCols] = useState<(string | undefined)[] | undefined>(colors);
  const [history, setHistory] = useState<{ cells: Blocks; cols?: (string | undefined)[] }[]>([]);
  const [anim, setAnim] = useState<{ op: BlockOp; p: number } | null>(null);
  useEffect(() => {
    setCells(start);
    setCols(colors);
    setHistory([]);
    setAnim(null);
  }, [start, colors]);
  const apply = (op: BlockOp) => {
    if (anim) return;
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setAnim(null);
      setHistory((h) => [...h, { cells, cols }]);
      setCells(applyBlockOp(cells, op));
      setCols(colorsAfter(cells, op, cols));
    };
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / 900);
      setAnim({ op, p });
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 1200);
  };
  const fr = blockFrame(cells, anim?.op ?? null, anim?.p ?? 0, cols);
  const r = Math.max(2.2, blocksRadius(cells));
  return (
    <div className="scratch">
      <div className="scratch-canvas radial-wrap">
        <BlocksSvg cells={fr.cells} colors={fr.colors} q={fr.q} sx={fr.sx} size={250} view={Math.max(1.9, r * 1.08) + 1}>
          {anim && <AxisMarks marks={blockOpMarks(anim.op, anim.op.kind === 'view' ? VIEW_LABEL[anim.op.view] : undefined)} radius={r + 0.2} />}
        </BlocksSvg>
      </div>
      {rules ? (
        <>
          <div className="field-label">규칙 적용</div>
          <div className="btn-row">
            {rules.map((ru) => (
              <button key={ru.id} onClick={() => apply(ru.op)} disabled={!!anim}>
                <RuleBadge id={ru.id} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="field-label">돌리기</div>
          <div className="op-list scratch-ops">
            {FREE_OPS.map((op, i) => (
              <button key={i} onClick={() => apply(op)} disabled={!!anim}>
                <Parts parts={describeBlockOp(op)} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="btn-row">
        <button
          disabled={!history.length || !!anim}
          onClick={() => {
            const last = history[history.length - 1];
            setCells(last.cells);
            setCols(last.cols);
            setHistory((h) => h.slice(0, -1));
          }}
        >
          한 번 되돌리기
        </button>
        <button
          onClick={() => {
            setCells(start);
            setCols(colors);
            setHistory([]);
          }}
        >
          처음 모습으로
        </button>
      </div>
    </div>
  );
}
