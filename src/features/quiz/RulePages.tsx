// 규칙 설명 페이지 (2페이지): 규칙 카드 = 번호 + 설명 + 예시 도형 적용 전 → 적용 후 (탭하면 애니메이션)
import { useEffect, useMemo, useState } from 'react';
import type { RuleSet } from '../../engine/rules';
import { describeOp, type RotationOp } from '../../engine/rotation';
import { applyOp, initialState, lookOf } from '../../engine/state';
import { applyRadialOp, describeRadialOp, type RadialOp } from '../../engine/radial/ops';
import { SolidSvg } from '../../render/SolidSvg';
import { AxisMarks, VIEW_LABEL, opMarks } from '../../render/AxisMarks';
import { BlocksSvg, blocksRadius } from '../../render/BlocksSvg';
import { applyBlockOp, describeBlockOp, type BlockOp } from '../../engine/blocks';
import { blockOpMarks } from '../../render/blockAnim';
import { RadialSvg } from '../../render/RadialSvg';
import { SolidSolution, RadialSolution, BlocksSolution } from '../../render/SolutionPlayer';
import { Parts, RuleBadge } from '../../ui/Parts';
import { SOLID_NAMES } from '../../engine/solids';
import { FAMILY_NAMES } from '../../engine/radial/model';
import { applyOctaOp, describeOctaOp, type OctaOp } from '../../engine/octa';
import { OctaPair } from '../../render/OctaSvg';
import { OctaSolution } from '../../render/SolutionPlayer';

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
            <button className="link" onClick={() => setAnimate(false)}>닫기</button>
          </div>
        ) : (
          <div className="before-after">
            <SolidSvg look={lookOf(s0, lab)} size={160} marks={opMarks(s0, op, lab)} />
            <span className="arrow">→</span>
            <SolidSvg look={lookOf(s1, lab)} size={160} />
          </div>
        )}
      </div>
    );
  }
  if (set.kind === 'block') {
    const op = rule.op as BlockOp;
    const b1 = applyBlockOp(set.example, op);
    const r = Math.max(blocksRadius(set.example), blocksRadius(b1));
    const m = blockOpMarks(op, op.kind === 'view' ? VIEW_LABEL[op.view] : undefined);
    const V = Math.max(1.9, r * 1.08) + 1;
    return (
      <div className="rule-card" onClick={() => setAnimate((a) => !a)}>
        <div className="rule-head">
          <RuleBadge id={rule.id} />
          <span className="rule-desc">
            <Parts parts={describeBlockOp(op)} />
          </span>
        </div>
        {animate ? (
          <div onClick={(e) => e.stopPropagation()}>
            <BlocksSolution
              sol={{ kind: 'blocks', initial: set.example, steps: [{ op, label: describeBlockOp(op), axisLabel: op.kind === 'view' ? VIEW_LABEL[op.view] : undefined }] }}
              size={190}
            />
            <button className="link" onClick={() => setAnimate(false)}>닫기</button>
          </div>
        ) : (
          <div className="before-after">
            <BlocksSvg cells={set.example} size={160} view={V}>
              <AxisMarks marks={m} radius={r + 0.2} />
            </BlocksSvg>
            <span className="arrow">→</span>
            <BlocksSvg cells={b1} size={160} view={V} />
          </div>
        )}
      </div>
    );
  }
  if (set.kind === 'octa') {
    const op = rule.op as OctaOp;
    return (
      <div className="rule-card" onClick={() => setAnimate((a) => !a)}>
        <div className="rule-head">
          <RuleBadge id={rule.id} />
          <span className="rule-desc">
            <Parts parts={describeOctaOp(op)} />
          </span>
        </div>
        {animate ? (
          <div onClick={(e) => e.stopPropagation()}>
            <OctaSolution sol={{ kind: 'octa', initial: set.example, steps: [{ op, label: rule.label }] }} size={240} />
            <button className="link" onClick={() => setAnimate(false)}>닫기</button>
          </div>
        ) : (
          <div className="before-after">
            <OctaPair state={set.example} size={96} captions={false} mark={op} />
            <span className="arrow">→</span>
            <OctaPair state={applyOctaOp(set.example, op)} size={96} captions={false} />
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
          <button className="link" onClick={() => setAnimate(false)}>닫기</button>
        </div>
      ) : (
        <div className="before-after">
          <RadialSvg shape={set.shape} cells={set.exampleCells} size={160} />
          <span className="arrow">→</span>
          <RadialSvg shape={set.shape} cells={c1} size={160} />
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
  const title = set.kind === 'solid' ? SOLID_NAMES[set.solidId] : set.kind === 'block' ? '쌓기나무' : set.kind === 'octa' ? '그림 정팔면체' : `${FAMILY_NAMES[set.shape.family]} (${set.shape.sectors.join('/')}칸)`;
  return (
    <div className="rule-pages">
      <div className="paper-head">
        <h2>규칙</h2>
        <span className="muted">{title} · {set.rules.length}개</span>
        {timer > 0 && <span className="timer">{left}초</span>}
      </div>
      <p className="lead">규칙을 외운 다음 시작하세요. 문제에는 번호만 나와요. 카드를 누르면 움직이는 모습을 볼 수 있어요.</p>
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
          <Parts
            parts={
              set.kind === 'solid'
                ? describeOp(r.op as RotationOp)
                : set.kind === 'block'
                  ? describeBlockOp(r.op as BlockOp)
                  : set.kind === 'octa'
                    ? describeOctaOp(r.op as OctaOp)
                    : describeRadialOp(r.op as RadialOp)
            }
          />
        </div>
      ))}
    </div>
  );
}
