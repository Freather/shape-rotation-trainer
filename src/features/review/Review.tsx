// 오답노트: seed 로 같은 문제를 다시 만들어 풀기
import { useMemo, useState } from 'react';
import { MISTAKE_NAMES, QTYPE_NAMES, generateQuestion } from '../../engine/question';
import { buildRuleSet, useRecords, type WrongNote } from '../../store';
import { QuestionView } from '../quiz/QuestionView';
import { RulePages, RuleSummary } from '../quiz/RulePages';

function Retry({ note, onClose }: { note: WrongNote; onClose: () => void }) {
  const markRetry = useRecords((s) => s.markRetry);
  const ruleSet = useMemo(() => (note.setParams ? buildRuleSet(note.setParams) : undefined), [note]);
  const q = useMemo(() => generateQuestion({ type: note.type, level: note.level, seed: note.seed, ruleSet, solidId: note.solidId }), [note, ruleSet]);
  const [phase, setPhase] = useState<'rules' | 'q'>(ruleSet && note.type !== 11 ? 'rules' : 'q');
  const [sel, setSel] = useState<number | null>(null);
  if (phase === 'rules' && ruleSet) return <RulePages set={ruleSet} onStart={() => setPhase('q')} />;
  return (
    <div>
      <div className="toolbar">
        <button onClick={onClose}>← 목록</button>
        <span>다시 풀기 · 지난번 실수: {MISTAKE_NAMES[note.tag]}</span>
      </div>
      {ruleSet && <RuleSummary set={ruleSet} />}
      <QuestionView
        q={q}
        number={1}
        selected={sel}
        revealed={sel !== null}
        onSelect={(i) => {
          if (sel !== null) return;
          setSel(i);
          markRetry(note.id, i === q.answer);
        }}
      />
    </div>
  );
}

export function Review() {
  const wrong = useRecords((s) => s.wrong);
  const remove = useRecords((s) => s.removeWrong);
  const [open, setOpen] = useState<WrongNote | null>(null);
  if (open) return <Retry note={open} onClose={() => setOpen(null)} />;
  return (
    <div className="panel">
      <h2>오답노트 ({wrong.length})</h2>
      {wrong.length === 0 && <p className="muted">아직 틀린 문제가 없습니다.</p>}
      <table className="result-table">
        <tbody>
          {wrong.map((w) => (
            <tr key={w.id}>
              <td>{new Date(w.ts).toLocaleString()}</td>
              <td>{QTYPE_NAMES[w.type]}</td>
              <td>레벨 {w.level}</td>
              <td>{MISTAKE_NAMES[w.tag]}</td>
              <td>{w.retried ? (w.solvedOnRetry ? '재도전 성공' : `재도전 ${w.retried}회`) : ''}</td>
              <td>
                <button className="primary" onClick={() => setOpen(w)}>
                  다시 풀기
                </button>{' '}
                <button onClick={() => remove(w.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
