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
          <div className="seq">
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
          if (selected === i) cls.push('selected');
          if (revealed && i === q.answer) cls.push('correct');
          if (revealed && selected === i && i !== q.answer) cls.push('wrong');
          return (
            <button key={i} className={cls.join(' ')} onClick={onSelect ? () => onSelect(i) : undefined} disabled={!onSelect}>
              <span className="opt-mark">{optionMark(i)}</span>
              <FigureView fig={o.figure} size={q.options.length > 2 ? 120 : 100} />
              {revealed && i !== q.answer && <span className="opt-tag">{MISTAKE_NAMES[o.tag]}</span>}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="feedback">
          {selected === null ? (
            <b className="bad">미응답 — 정답 {optionMark(q.answer)}</b>
          ) : selected === q.answer ? (
            <b className="good">정답!</b>
          ) : (
            <b className="bad">
              오답 — 정답은 {optionMark(q.answer)} (고른 보기: {MISTAKE_NAMES[q.options[selected].tag]})
            </b>
          )}
          <button onClick={() => setShowSol((s) => !s)}>{showSol ? '풀이 닫기' : '풀이 보기'}</button>
          {showSol && <SolutionView sol={q.solution} />}
        </div>
      )}
    </div>
  );
}
