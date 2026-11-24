import { useState } from 'react';
import { MISTAKE_NAMES, optionMark, type Question } from '../../engine/question';
import { FigureView } from '../../ui/FigureView';
import { Parts, RuleBadge } from '../../ui/Parts';
import { SolutionView } from '../../render/SolutionPlayer';
import { VIEW_LABEL, type AxisMark } from '../../render/AxisMarks';
import { VIEW_AXIS, type View } from '../../engine/rotation';

/** 문제에 '앞/위/오른쪽에서 볼 때'가 나오면 그 방향을 그림에 표시 */
function viewMarks(q: Question): AxisMark[] {
  if (q.solution.kind !== 'solid') return [];
  const views = new Set<View>();
  for (const op of q.solution.ops) if (op.kind === 'view') views.add(op.view);
  return (['front', 'top', 'right'] as View[]).filter((v) => views.has(v)).map((v) => ({ dir: VIEW_AXIS[v], label: VIEW_LABEL[v] }));
}

export function QuestionView({
  q,
  number,
  selected,
  onSelect,
  revealed,
  extraTop,
}: {
  q: Question;
  number: number;
  selected: number | null;
  onSelect?: (i: number) => void;
  revealed: boolean;
  extraTop?: React.ReactNode;
}) {
  const [showSol, setShowSol] = useState(false);
  const textOptions = q.options.some((o) => o.figure.kind === 'text' || o.figure.kind === 'ox');
  const correct = selected === q.answer;
  const marks = viewMarks(q);
  return (
    <div className="question paper">
      <div className="q-head">
        <span className="q-num">{number}.</span>
        <span className="q-prompt">{q.prompt}</span>
      </div>
      {extraTop}
      <div className="stem">
        {q.stem.map((f, i) => (
          <FigureView key={i} fig={f} size={q.stem.length > 1 ? 170 : 200} marks={i === 0 ? marks : undefined} />
        ))}
        {q.seq && (
          <div className="seq" aria-label="적용할 규칙 순서">
            {q.seq.map((id, i) => (
              <span key={i}>
                {i > 0 && <span className="seq-arrow">→</span>}
                <RuleBadge id={id} />
              </span>
            ))}
          </div>
        )}
      </div>
      {marks.length > 0 && (
        <p className="axis-note">
          빨간 점이 {marks.map((m) => m.label).join('·')} 쪽이에요. '{marks[0].label}에서 볼 때'는 그 점 쪽에서 도형을 바라본다는 뜻이에요.
        </p>
      )}
      {q.stemOps && (
        <ol className="stem-ops">
          {q.stemOps.map((p, i) => (
            <li key={i}>
              <Parts parts={p} />
            </li>
          ))}
        </ol>
      )}
      <div className={textOptions ? 'options options-text' : 'options'}>
        {q.options.map((o, i) => {
          const cls = ['option'];
          if (!revealed && selected === i) cls.push('selected');
          if (revealed && i === q.answer) cls.push('correct');
          if (revealed && selected === i && i !== q.answer) cls.push('wrong');
          return (
            <button key={i} className={cls.join(' ')} onClick={onSelect ? () => onSelect(i) : undefined} disabled={!onSelect}>
              <span className="opt-mark">{optionMark(i)}</span>
              <FigureView fig={o.figure} size={q.options.length > 2 ? 120 : 100} />
              {revealed && (
                <span className="opt-labels">
                  {selected === i && <span className="label mine">내 답</span>}
                  {i === q.answer && <span className="label answer">정답</span>}
                  {i !== q.answer && selected === i && <span className="label tag">{MISTAKE_NAMES[o.tag]}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="feedback">
          <div className={correct ? 'result-line good' : 'result-line bad'}>
            {selected === null
              ? `답을 고르지 않았어요. 정답은 ${optionMark(q.answer)}번이에요.`
              : correct
                ? '맞았어요.'
                : `틀렸어요. 정답은 ${optionMark(q.answer)}번이에요. 고른 보기는 '${MISTAKE_NAMES[q.options[selected].tag]}' 함정이었어요.`}
          </div>
          <button onClick={() => setShowSol((s) => !s)}>{showSol ? '풀이 닫기' : '풀이 보기'}</button>
          {showSol && <SolutionView sol={q.solution} />}
        </div>
      )}
    </div>
  );
}
