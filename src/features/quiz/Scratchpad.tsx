// 문제 옆 "직접 돌려보기" 판 (연습 모드 전용)
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { Question } from '../../engine/question';
import type { Rule, RuleSet } from '../../engine/rules';
import type { RotationOp } from '../../engine/rotation';
import { applyRadialOp, describeRadialOp, type RadialOp } from '../../engine/radial/ops';
import { radialOpCandidates } from '../../engine/radial/generate';
import type { Cells } from '../../engine/radial/model';
import { RadialSvg } from '../../render/RadialSvg';
import { Parts, RuleBadge } from '../../ui/Parts';
import { BlockScratch } from './BlockScratch';
import { OctaScratch } from './OctaScratch';
import type { OctaOp } from '../../engine/octa';
import type { BlockOp } from '../../engine/blocks';

const SolidScratch = lazy(() => import('./SolidScratch'));

const ALL_KINDS: RadialOp['kind'][] = ['rotate', 'rotateRing', 'rotateOpposite', 'mirror', 'invert', 'invertRing', 'invertSymbolCells', 'moveSymbols', 'swapSymbolRings', 'shiftSymbolRings', 'spinSymbols', 'flipSymbols'];

function RadialScratch({ scratch, rules }: { scratch: Extract<NonNullable<Question['scratch']>, { kind: 'radial' }>; rules?: Rule<RadialOp>[] }) {
  const [cells, setCells] = useState<Cells>(scratch.cells);
  const [history, setHistory] = useState<Cells[]>([]);
  const [anim, setAnim] = useState<{ op: RadialOp; p: number } | null>(null);
  useEffect(() => {
    setCells(scratch.cells);
    setHistory([]);
    setAnim(null);
  }, [scratch]);
  const ops = useMemo(() => (rules ? [] : radialOpCandidates(scratch.shape, ALL_KINDS)), [rules, scratch.shape]);
  const apply = (op: RadialOp) => {
    if (anim) return;
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setAnim(null);
      setHistory((h) => [...h, cells]);
      setCells(applyRadialOp(scratch.shape, cells, op));
    };
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / 800);
      setAnim({ op, p });
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 1100);
  };
  return (
    <div className="scratch">
      <div className="scratch-canvas radial-wrap">
        <RadialSvg shape={scratch.shape} cells={cells} anim={anim} size={250} />
      </div>
      {rules ? (
        <>
          <div className="field-label">규칙 적용</div>
          <div className="btn-row">
            {rules.map((r) => (
              <button key={r.id} onClick={() => apply(r.op)} disabled={!!anim}>
                <RuleBadge id={r.id} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="field-label">변환 적용</div>
          <div className="op-list scratch-ops">
            {ops.map((op, i) => (
              <button key={i} onClick={() => apply(op)} disabled={!!anim}>
                <Parts parts={describeRadialOp(op)} />
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
            setCells(scratch.cells);
            setHistory([]);
          }}
        >
          처음 모습으로
        </button>
      </div>
    </div>
  );
}

export function Scratchpad({ q, ruleSet, revealed = true }: { q: Question; ruleSet?: RuleSet | null; revealed?: boolean }) {
  const sc = q.scratch;
  if (!sc) return null;
  // 붙인 모양 자체가 문제의 절반이라 답을 고르기 전에는 보여주지 않음
  if ((q.type === 9 || q.type === 10 || q.type === 17 || q.type === 19) && !revealed)
    return (
      <aside className="scratch-panel">
        <h3>직접 돌려보기</h3>
        <p className="muted small">
          {q.type === 17
            ? '이 유형은 두 조각을 붙이는 것까지가 문제라서, 답을 고른 뒤에 붙인 모양을 돌려볼 수 있어요.'
            : '보기를 하나씩 직접 해 보면 답이 나와 버려서, 답을 고른 뒤에 돌려볼 수 있어요.'}
        </p>
      </aside>
    );
  return (
    <aside className="scratch-panel">
      <h3>직접 돌려보기</h3>
      {sc.kind === 'solid' ? (
        <Suspense fallback={<p className="muted small">3D 화면을 불러오는 중이에요.</p>}>
          <SolidScratch scratch={sc} rules={ruleSet?.kind === 'solid' && q.type === 1 ? (ruleSet.rules as Rule<RotationOp>[]) : undefined} />
        </Suspense>
      ) : sc.kind === 'blocks' ? (
        <BlockScratch cells={sc.cells} colors={sc.colors} rules={ruleSet?.kind === 'block' && q.type === 12 ? (ruleSet.rules as Rule<BlockOp>[]) : undefined} />
      ) : sc.kind === 'octa' ? (
        <OctaScratch state={sc.state} rules={ruleSet?.kind === 'octa' && q.type === 20 ? (ruleSet.rules as Rule<OctaOp>[]) : undefined} />
      ) : (
        <RadialScratch scratch={sc} rules={ruleSet?.kind === 'radial' && q.type === 8 ? (ruleSet.rules as Rule<RadialOp>[]) : undefined} />
      )}
    </aside>
  );
}
