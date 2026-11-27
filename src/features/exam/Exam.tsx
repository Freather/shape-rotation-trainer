// 실전 모드: [규칙 설명 1] → [규칙 설명 2] → [문제 1..N] → [결과]
// 문제 화면은 시험지처럼 문제 번호·도형·규칙 번호·보기만. 채점은 세트가 끝난 뒤.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MISTAKE_NAMES, generateQuestion, optionMark, type Question } from '../../engine/question';
import { randomSeed } from '../../engine/rng';
import { SOLID_LEVELS } from '../../engine/rules';
import { buildRuleSet, useRecords, useSettings, type SetParams } from '../../store';
import { QuestionView } from '../quiz/QuestionView';
import { RuleCard, RulePages, RuleSummary } from '../quiz/RulePages';
import { RuleBadge } from '../../ui/Parts';
import { LevelGuide } from '../quiz/Practice';

interface Sheet {
  setParams: SetParams;
  questions: Question[];
}

export function Exam() {
  const settings = useSettings();
  const addAnswer = useRecords((s) => s.addAnswer);
  const addWrong = useRecords((s) => s.addWrong);
  const [kind, setKind] = useState<'solid' | 'radial' | 'block' | 'octa'>('solid');
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<'config' | 'rules' | 'run' | 'result'>('config');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const [left, setLeft] = useState(0);
  const [showRules, setShowRules] = useState(false);
  // 문제 푸는 중 규칙 보기: 설정에서 허용하지 않으면 시험 한 번에 한 번만
  const [ruleUsed, setRuleUsed] = useState(false);
  const [review, setReview] = useState<number | null>(null);
  const qStart = useRef(0);

  const ruleSet = useMemo(() => (sheet ? buildRuleSet(sheet.setParams) : null), [sheet]);
  const timeScale = kind === 'solid' ? SOLID_LEVELS[level].timeScale : 1;
  const perQ = Math.round(settings.timePerQuestion * timeScale);

  const start = () => {
    const lv = kind === 'radial' ? Math.min(4, level) : level;
    const sp: SetParams =
      kind === 'solid'
        ? { kind: 'solid', level: lv, seed: randomSeed(), allowMirror: settings.allowMirrorRules }
        : kind === 'block'
          ? { kind: 'block', level: lv, seed: randomSeed() }
          : kind === 'octa'
            ? { kind: 'octa', level: lv, seed: randomSeed() }
            : { kind: 'radial', level: lv, seed: randomSeed() };
    const rs = buildRuleSet(sp);
    const questions = Array.from({ length: settings.examCount }, () =>
      generateQuestion({ type: kind === 'solid' ? 1 : kind === 'block' ? 12 : kind === 'octa' ? 20 : 8, level: lv, seed: randomSeed(), ruleSet: rs }),
    );
    setSheet({ setParams: sp, questions });
    setAnswers(questions.map(() => null));
    setTimes(questions.map(() => 0));
    setIdx(0);
    setReview(null);
    setRuleUsed(false);
    setShowRules(false);
    setPhase('rules');
  };

  const beginQuestions = () => {
    setPhase('run');
    setIdx(0);
    qStart.current = performance.now();
    setLeft(settings.timerMode === 'perQuestion' ? perQ : settings.totalTime);
  };

  const finish = (finalTimes: number[]) => {
    if (!sheet) return;
    sheet.questions.forEach((q, i) => {
      const a = answers[i];
      const correct = a === q.answer;
      const tag = a === null ? 'random' : q.options[a].tag;
      addAnswer({ ts: Date.now(), type: q.type, level: q.level, correct, timeMs: finalTimes[i], tag, mode: 'exam', solidId: q.solidId });
      if (!correct) addWrong({ type: q.type, level: q.level, seed: q.seed, setParams: sheet.setParams, tag });
    });
    setPhase('result');
  };

  const goNext = () => {
    if (!sheet) return;
    const t = [...times];
    t[idx] += performance.now() - qStart.current;
    setTimes(t);
    qStart.current = performance.now();
    setShowRules(false);
    if (idx + 1 >= sheet.questions.length) {
      finish(t);
      return;
    }
    setIdx(idx + 1);
    if (settings.timerMode === 'perQuestion') setLeft(perQ);
  };

  // 타이머
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (phase !== 'run') return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'run' || left > 0) return;
    if (settings.timerMode === 'perQuestion') goNextRef.current();
    else {
      const t = [...times];
      t[idx] += performance.now() - qStart.current;
      finishRef.current(t);
    }
  }, [left, phase, settings.timerMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'config') {
    return (
      <div className="panel">
        <h2>실전 모드</h2>
        <p className="lead">시험처럼 규칙 2쪽을 먼저 보고, 문제를 이어서 풀어요. 채점은 마지막에 한 번에 해요.{settings.allowRuleReviewInExam ? '' : ' 문제 푸는 중에 규칙은 한 번만 다시 볼 수 있어요.'}</p>
        <div className="field-label">종류</div>
        <div className="seg">
          <button className={kind === 'solid' ? 'on' : ''} onClick={() => setKind('solid')}>
            입체 회전
          </button>
          <button
            className={kind === 'radial' ? 'on' : ''}
            onClick={() => {
              setKind('radial');
              setLevel((l) => Math.min(l, 4));
            }}
          >
            평면 도형
          </button>
          <button className={kind === 'block' ? 'on' : ''} onClick={() => setKind('block')}>
            쌓기나무
          </button>
          <button className={kind === 'octa' ? 'on' : ''} onClick={() => setKind('octa')}>
            그림 정팔면체
          </button>
        </div>
        <div className="field-label">레벨</div>
        <div className="seg">
          {Array.from({ length: kind === 'radial' ? 4 : 5 }, (_, i) => i + 1).map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>
        <div className="start-row">
          <button className="primary big" onClick={start}>
            시작하기
          </button>
          <span className="muted small">
            문제 {settings.examCount}개, {settings.timerMode === 'perQuestion' ? `한 문제에 ${perQ}초` : `전체 ${settings.totalTime}초`}. 설정에서 바꿀 수 있어요.
          </span>
        </div>
        <LevelGuide />
      </div>
    );
  }

  if (!sheet || !ruleSet) return null;

  if (phase === 'rules') return <RulePages set={ruleSet} onStart={beginQuestions} timer={settings.ruleTimer} startLabel="문제 시작" />;

  if (phase === 'run') {
    const q = sheet.questions[idx];
    return (
      <div>
        <div className="toolbar exam-bar">
          <span>
            문제 {idx + 1} / {sheet.questions.length}
          </span>
          <span className={left <= 10 ? 'timer urgent' : 'timer'}>{Math.max(0, left)}초</span>
          {settings.allowRuleReviewInExam ? (
            <button onClick={() => setShowRules((s) => !s)}>{showRules ? '규칙 닫기' : '규칙 보기'}</button>
          ) : showRules ? (
            <button onClick={() => setShowRules(false)}>규칙 닫기</button>
          ) : (
            <button
              disabled={ruleUsed}
              title={ruleUsed ? '이번 시험에서 규칙은 이미 한 번 봤어요' : '이번 시험에서 한 번만 볼 수 있어요'}
              onClick={() => {
                setRuleUsed(true);
                setShowRules(true);
              }}
            >
              {ruleUsed ? '규칙 보기 다 씀' : '규칙 보기 (1번)'}
            </button>
          )}
        </div>
        {showRules && <RuleSummary set={ruleSet} />}
        <QuestionView
          key={idx}
          q={q}
          number={idx + 1}
          selected={answers[idx]}
          onSelect={(i) => setAnswers((a) => a.map((x, j) => (j === idx ? i : x)))}
          revealed={false}
        />
        <div className="next-row">
          <button className="primary big" onClick={goNext}>
            {idx + 1 >= sheet.questions.length ? '제출하기' : '다음 문제'}
          </button>
        </div>
      </div>
    );
  }

  // 결과
  const correct = sheet.questions.filter((q, i) => answers[i] === q.answer).length;
  // 규칙마다: 쓰인 문제 수, 그중 틀린 문제 수
  const ruleStat = new Map<number, { used: number; wrong: number }>();
  sheet.questions.forEach((q, i) => {
    const ok = answers[i] === q.answer;
    for (const id of new Set(q.seq ?? [])) {
      const st = ruleStat.get(id) ?? { used: 0, wrong: 0 };
      st.used++;
      if (!ok) st.wrong++;
      ruleStat.set(id, st);
    }
  });
  const weak = ruleSet.rules.filter((r) => (ruleStat.get(r.id)?.wrong ?? 0) > 0).sort((a, b) => ruleStat.get(b.id)!.wrong - ruleStat.get(a.id)!.wrong);
  const reviewQ = review !== null ? sheet.questions[review] : null;
  return (
    <div className="panel">
      <h2>결과</h2>
      <div className="score">
        {correct} / {sheet.questions.length}
      </div>
      <p className="muted">
        걸린 시간 {Math.round(times.reduce((a, b) => a + b, 0) / 1000)}초. 틀린 문제는 오답노트에 넣어 뒀어요.
      </p>
      {weak.length > 0 && (
        <div className="weak-rules">
          <div className="field-label">틀린 문제에 나온 규칙</div>
          <div className="weak-list">
            {weak.map((r) => (
              <span key={r.id} className="weak-chip">
                <RuleBadge id={r.id} /> {ruleStat.get(r.id)!.wrong}문제 틀림 / {ruleStat.get(r.id)!.used}문제
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="table-scroll">
      <table className="result-table">
        <thead>
          <tr>
            <th>번호</th>
            <th>결과</th>
            <th>내 답</th>
            <th>정답</th>
            <th>쓰인 규칙</th>
            <th>함정</th>
            <th>시간</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sheet.questions.map((q, i) => {
            const a = answers[i];
            const ok = a === q.answer;
            return (
              <tr key={i} className={ok ? 'ok' : 'ng'}>
                <td>{i + 1}</td>
                <td>{ok ? 'O' : 'X'}</td>
                <td>{a === null ? '-' : optionMark(a)}</td>
                <td>{optionMark(q.answer)}</td>
                <td className="seq-cell">
                  {(q.seq ?? []).map((id, k) => (
                    <RuleBadge key={k} id={id} />
                  ))}
                </td>
                <td>{ok ? '' : a === null ? '안 풂' : MISTAKE_NAMES[q.options[a].tag]}</td>
                <td>{(times[i] / 1000).toFixed(1)}s</td>
                <td>
                  <button className="link" onClick={() => setReview(review === i ? null : i)}>{review === i ? '닫기' : '풀이'}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {reviewQ && review !== null && (
        <div className="exam-review">
          <RuleSummary set={ruleSet} />
          <QuestionView key={`r${review}`} q={reviewQ} number={review + 1} selected={answers[review]} revealed />
        </div>
      )}
      <div className="field-label">규칙 다시 보기</div>
      <p className="muted small">틀린 문제에 나온 규칙은 표시해 뒀어요. 카드를 누르면 움직이는 모습을 볼 수 있어요.</p>
      <div className="rule-list">
        {ruleSet.rules.map((r, i) => (
          <div key={`${ruleSet.seed}-${i}`} className={(ruleStat.get(r.id)?.wrong ?? 0) > 0 ? 'rule-wrap weak' : 'rule-wrap'}>
            <RuleCard set={ruleSet} index={i} />
          </div>
        ))}
      </div>
      <div className="next-row">
        <button className="primary" onClick={() => setPhase('config')}>
          새 시험 보기
        </button>
      </div>
    </div>
  );
}
