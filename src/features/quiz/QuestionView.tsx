import { useState } from 'react';
import { MISTAKE_NAMES, optionMark, type Question } from '../../engine/question';
import { FigureView } from '../../ui/FigureView';
import { Parts, RuleBadge } from '../../ui/Parts';
import { SolutionView } from '../../render/SolutionPlayer';

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
  return (
    <div className="question paper">
      <div className="q-head">
        <span className="q-num">{number}.</span>
        <span className="q-prompt">{q.prompt}</span>
      </div>
      {extraTop}
      <div className="stem">
        {q.stem.map((f, i) => (
          <FigureView key={i} fig={f} size={q.stem.length > 1 ? 170 : 200} />
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
