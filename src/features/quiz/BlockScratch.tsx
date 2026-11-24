// 쌓기나무 직접 돌려보기: 버튼으로 돌리면 축과 방향을 보여주며 천천히 돈다
import { useEffect, useState } from 'react';
import { applyBlockOp, blockOpCandidates, describeBlockOp, opMatrix, type BlockOp, type Blocks } from '../../engine/blocks';
import type { Rule } from '../../engine/rules';
import { QUAT_IDENTITY, quatFromMatrix, quatSlerp, type Quat } from '../../engine/math';
import { BlocksSvg, blocksRadius } from '../../render/BlocksSvg';
import { AxisMarks, VIEW_LABEL, type AxisMark } from '../../render/AxisMarks';
import { easeInOut } from '../../render/usePlayer';
import { Parts, RuleBadge } from '../../ui/Parts';

const FREE_OPS = blockOpCandidates({ views: ['top', 'front', 'right'], half: false, rolls: false, mirror: false });

function marksOf(op: BlockOp): AxisMark[] {
  if (op.kind === 'mirror') return [];
  let q = quatFromMatrix(opMatrix(op));
  if (q[0] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
  const s = Math.sqrt(Math.max(0, 1 - q[0] * q[0]));
  if (s < 1e-6) return [];
  return [{ dir: [q[1] / s, q[2] / s, q[3] / s], angle: (2 * Math.acos(Math.min(1, q[0])) * 180) / Math.PI, label: op.kind === 'view' ? VIEW_LABEL[op.view] : undefined }];
}

export function BlockScratch({ cells: start, rules, colors }: { cells: Blocks; rules?: Rule<BlockOp>[]; colors?: string[] }) {
  const [cells, setCells] = useState(start);
  const [history, setHistory] = useState<Blocks[]>([]);
  const [anim, setAnim] = useState<{ op: BlockOp; p: number } | null>(null);
  useEffect(() => {
    setCells(start);
    setHistory([]);
    setAnim(null);
  }, [start]);
  const apply = (op: BlockOp) => {
    if (anim) return;
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setAnim(null);
      setHistory((h) => [...h, cells]);
      setCells(applyBlockOp(cells, op));
    };
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / 700);
      setAnim({ op, p });
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 1000);
  };
  let q: Quat = QUAT_IDENTITY;
  let sx = 1;
  if (anim) {
    if (anim.op.kind === 'mirror') sx = Math.cos(Math.PI * easeInOut(anim.p)) || 0.001;
    else {
      let full = quatFromMatrix(opMatrix(anim.op));
      if (full[0] < 0) full = [-full[0], -full[1], -full[2], -full[3]];
      q = quatSlerp(QUAT_IDENTITY, full, easeInOut(anim.p));
    }
  }
  const r = blocksRadius(start);
  return (
    <div className="scratch">
      <div className="scratch-canvas radial-wrap">
        <BlocksSvg cells={cells} colors={colors} q={q} sx={sx} size={250} view={Math.max(1.9, r * 1.08) + 1}>
          {anim && <AxisMarks marks={marksOf(anim.op)} radius={r + 0.2} />}
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
            setCells(history[history.length - 1]);
            setHistory((h) => h.slice(0, -1));
          }}
        >
          한 번 되돌리기
        </button>
        <button
          onClick={() => {
            setCells(start);
            setHistory([]);
          }}
        >
          처음 모습으로
        </button>
      </div>
    </div>
  );
}
