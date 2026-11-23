// 규칙 설명 페이지 (2페이지): 규칙 카드 = 번호 + 설명 + 예시 도형 적용 전 → 적용 후 (탭하면 애니메이션)
import { useEffect, useMemo, useState } from 'react';
import type { RuleSet } from '../../engine/rules';
import { describeOp, type RotationOp } from '../../engine/rotation';
import { applyOp, initialState, lookOf } from '../../engine/state';
import { applyRadialOp, describeRadialOp, type RadialOp } from '../../engine/radial/ops';
import { SolidSvg } from '../../render/SolidSvg';
import { RadialSvg } from '../../render/RadialSvg';
import { SolidSolution, RadialSolution } from '../../render/SolutionPlayer';
import { Parts, RuleBadge } from '../../ui/Parts';
import { SOLID_NAMES } from '../../engine/solids';
import { FAMILY_NAMES } from '../../engine/radial/model';

export function RuleCard({ set, index }: { set: RuleSet; index: number }) {
  const [animate, setAnimate] = useState(false);
  const rule = set.rules[index];
  if (set.kind === 'solid') {
    const lab = set.fixedLabeling ?? set.exampleLabeling;
    const s0 = initialState(set.solidId);
    const op = rule.op as RotationOp;
    const s1 = applyOp(s0, op, lab);
    return (
      <div className="rule-card" onClick={() => setAnimate((a) => !a)}>
        <div className="rule-head">
          <RuleBadge id={rule.id} />
          <span className="rule-desc">
            <Parts parts={describeOp(op)} />
          </span>
        </div>
        {animate ? (
          <div onClick={(e) => e.stopPropagation()}>
            <SolidSolution sol={{ kind: 'solid', solidId: set.solidId, labeling: lab, initial: s0, ops: [op], labels: [rule.label] }} size={190} />
            <button onClick={() => setAnimate(false)}>그림으로 돌아가기</button>
          </div>
        ) : (
          <div className="before-after">
            <SolidSvg look={lookOf(s0, lab)} size={160} />
            <span className="arrow">→</span>
            <SolidSvg look={lookOf(s1, lab)} size={160} />
            <span className="muted small">탭하면 회전 애니메이션</span>
          </div>
        )}
      </div>
    );
  }
  const op = rule.op as RadialOp;
  const c1 = applyRadialOp(set.shape, set.exampleCells, op);
  return (
    <div className="rule-card" onClick={() => setAnimate((a) => !a)}>
      <div className="rule-head">
        <RuleBadge id={rule.id} />
        <span className="rule-desc">
          <Parts parts={describeRadialOp(op)} />
        </span>
      </div>
      {animate ? (
        <div onClick={(e) => e.stopPropagation()}>
          <RadialSolution sol={{ kind: 'radial', shape: set.shape, cells: set.exampleCells, ops: [op], labels: [rule.label] }} size={190} />
          <button onClick={() => setAnimate(false)}>그림으로 돌아가기</button>
        </div>
      ) : (
        <div className="before-after">
          <RadialSvg shape={set.shape} cells={set.exampleCells} size={160} />
          <span className="arrow">→</span>
          <RadialSvg shape={set.shape} cells={c1} size={160} />
          <span className="muted small">탭하면 애니메이션</span>
        </div>
      )}
    </div>
  );
}

export function RulePages({ set, onStart, timer = 0, startLabel = '시작' }: { set: RuleSet; onStart: () => void; timer?: number; startLabel?: string }) {
  const half = Math.ceil(set.rules.length / 2);
  const pages = useMemo(() => [set.rules.slice(0, half).map((_, i) => i), set.rules.slice(half).map((_, i) => i + half)], [set, half]);
  const [page, setPage] = useState(0);
  const [left, setLeft] = useState(timer);
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);
  useEffect(() => {
    if (timer && left <= 0) onStart();
  }, [left, timer, onStart]);
  const title = set.kind === 'solid' ? SOLID_NAMES[set.solidId] : `${FAMILY_NAMES[set.shape.family]} (${set.shape.sectors.join('/')}칸)`;
  return (
    <div className="rule-pages">
      <div className="paper-head">
        <h2>규칙 설명 — {title}</h2>
        {timer > 0 && <span className="timer">남은 시간 {left}s</span>}
      </div>
      <p className="muted">아래 규칙을 익힌 뒤, 문제에서는 규칙 번호만 보고 적용합니다.</p>
      <div className="rule-list">
        {pages[page].map((i) => (
          <RuleCard key={`${set.seed}-${i}`} set={set} index={i} />
        ))}
      </div>
      <div className="page-foot">
        <span>
          {page + 1} / 2
        </span>
        {page > 0 && <button onClick={() => setPage(0)}>이전</button>}
        {page === 0 ? (
          <button className="primary" onClick={() => setPage(1)}>
            다음
          </button>
        ) : (
          <button className="primary" onClick={onStart}>
            {startLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** 문제 화면에서 펼쳐보는 규칙 요약 */
export function RuleSummary({ set }: { set: RuleSet }) {
  return (
    <div className="rule-summary">
      {set.rules.map((r) => (
        <div key={r.id}>
          <RuleBadge id={r.id} />{' '}
          <Parts parts={set.kind === 'solid' ? describeOp(r.op as RotationOp) : describeRadialOp(r.op as RadialOp)} />
        </div>
      ))}
    </div>
  );
}
