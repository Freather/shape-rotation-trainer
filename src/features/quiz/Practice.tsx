// 문제풀이 (연습 모드): 유형·레벨 선택 → (규칙형이면 규칙 설명) → 즉시 채점 + 풀이 보기
import { useCallback, useMemo, useRef, useState } from 'react';
import { QTYPE_NAMES, generateQuestion, type QType, type Question } from '../../engine/question';
import { randomSeed } from '../../engine/rng';
import { SOLID_IDS, SOLID_NAMES, type SolidId } from '../../engine/solids';
import { buildRuleSet, useRecords, useSettings, type SetParams } from '../../store';
import { QuestionView } from './QuestionView';
import { RulePages, RuleSummary } from './RulePages';

const TYPES: QType[] = [1, 8, 11, 2, 3, 4, 5, 6, 7, 9, 10];
const RULE_TYPES: QType[] = [1, 8, 11];

export function maxLevel(type: QType): number {
  return type === 8 || type === 9 ? 4 : 5;
}

export function Practice() {
  const [type, setType] = useState<QType>(1);
  const [level, setLevel] = useState(1);
  const [solid, setSolid] = useState<SolidId | ''>('');
  const [ruleKind, setRuleKind] = useState<'solid' | 'radial'>('solid');
  const [phase, setPhase] = useState<'config' | 'rules' | 'question'>('config');
  const [setParams, setSetParams] = useState<SetParams | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const t0 = useRef(0);
  const allowMirror = useSettings((s) => s.allowMirrorRules);
  const addAnswer = useRecords((s) => s.addAnswer);
  const addWrong = useRecords((s) => s.addWrong);

  const ruleSet = useMemo(() => (setParams ? buildRuleSet(setParams) : null), [setParams]);
  const effType: QType = type === 8 ? 8 : type;

  const newQuestion = useCallback(
    (sp: SetParams | null) => {
      const seed = randomSeed();
      const rs = sp ? buildRuleSet(sp) : undefined;
      const qq = generateQuestion({ type: effType, level, seed, ruleSet: rs, solidId: solid || undefined });
      setQ(qq);
      setSelected(null);
      setRevealed(false);
      setCount((c) => c + 1);
      t0.current = performance.now();
    },
    [effType, level, solid],
  );

  const start = () => {
    setScore({ ok: 0, total: 0 });
    setCount(0);
    if (RULE_TYPES.includes(type)) {
      const kind = type === 8 ? 'radial' : type === 11 ? ruleKind : 'solid';
      const lv = kind === 'radial' ? Math.min(4, level) : level;
      const sp: SetParams =
        kind === 'solid'
          ? { kind: 'solid', level: lv, seed: randomSeed(), solidId: solid || undefined, allowMirror }
          : { kind: 'radial', level: lv, seed: randomSeed() };
      setSetParams(sp);
      setPhase('rules');
    } else {
      setSetParams(null);
      newQuestion(null);
      setPhase('question');
    }
  };

  const answer = (i: number) => {
    if (revealed || !q) return;
    setSelected(i);
    setRevealed(true);
    const correct = i === q.answer;
    const timeMs = performance.now() - t0.current;
    setScore((s) => ({ ok: s.ok + (correct ? 1 : 0), total: s.total + 1 }));
    addAnswer({ ts: Date.now(), type: q.type, level: q.level, solidId: q.solidId, correct, timeMs, tag: q.options[i].tag, mode: 'practice' });
    if (!correct) addWrong({ type: q.type, level: q.level, seed: q.seed, solidId: (solid || undefined) as SolidId | undefined, setParams: setParams ?? undefined, tag: q.options[i].tag });
  };

  if (phase === 'config') {
    return (
      <div className="panel">
        <h2>문제풀이 (연습)</h2>
        <div className="form">
          <label>
            유형
            <select value={type} onChange={(e) => setType(Number(e.target.value) as QType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 11 ? '' : `유형 ${t} — `}
                  {QTYPE_NAMES[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            레벨
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {Array.from({ length: maxLevel(type) }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  레벨 {l}
                </option>
              ))}
            </select>
          </label>
          {type !== 8 && type !== 9 && !(type === 11 && ruleKind === 'radial') && (
            <label>
              도형
              <select value={solid} onChange={(e) => setSolid(e.target.value as SolidId | '')}>
                <option value="">레벨에 맞게 자동</option>
                {SOLID_IDS.filter((id) => !([4, 5, 6, 7].includes(type) && (id === 'dodeca' || id === 'icosa' || (type === 6 && id === 'tetra')))).map((id) => (
                  <option key={id} value={id}>
                    {SOLID_NAMES[id]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === 11 && (
            <label>
              규칙 종류
              <select value={ruleKind} onChange={(e) => setRuleKind(e.target.value as 'solid' | 'radial')}>
                <option value="solid">입체 회전 규칙</option>
                <option value="radial">평면 방사형 규칙</option>
              </select>
            </label>
          )}
        </div>
        <LevelGuide />
        <button className="primary big" onClick={start}>
          시작
        </button>
      </div>
    );
  }

  if (phase === 'rules' && ruleSet) {
    return (
      <RulePages
        set={ruleSet}
        onStart={() => {
          newQuestion(setParams);
          setPhase('question');
        }}
      />
    );
  }

  if (!q) return null;
  return (
    <div>
      <div className="toolbar">
        <button onClick={() => setPhase('config')}>← 설정으로</button>
        <span>
          {QTYPE_NAMES[q.type]} · 레벨 {q.level} · 맞힌 문제 {score.ok}/{score.total}
        </span>
        {ruleSet && (
          <button onClick={() => setShowRules((s) => !s)}>{showRules ? '규칙 숨기기' : '규칙 보기'}</button>
        )}
        {ruleSet && <button onClick={() => setPhase('rules')}>규칙 설명 다시 보기</button>}
      </div>
      {showRules && ruleSet && <RuleSummary set={ruleSet} />}
      <QuestionView key={`${q.seed}-${count}`} q={q} number={count} selected={selected} onSelect={answer} revealed={revealed} />
      {revealed && (
        <div className="next-row">
          <button className="primary big" onClick={() => newQuestion(setParams)}>
            다음 문제 →
          </button>
          {ruleSet && (
            <button
              onClick={() => {
                start();
              }}
            >
              새 규칙 세트로
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LevelGuide() {
  return (
    <details className="guide">
      <summary>레벨 안내</summary>
      <table>
        <thead>
          <tr>
            <th>레벨</th>
            <th>입체</th>
            <th>평면 방사형</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>정육면체 · 1단계 · 90°만</td><td>다트판 4칸 · 전체 회전/색반전</td></tr>
          <tr><td>2</td><td>정육면체 · 2~3단계 · 180°·굴리기</td><td>6/8칸 · 층 회전 · 층 색반전</td></tr>
          <tr><td>3</td><td>정팔면체 · 꼭짓점축+면축</td><td>사각·육각·삼각 · 대칭 · 그림 이동</td></tr>
          <tr><td>4</td><td>정십이면체 · 72°/144°</td><td>꽃잎형 · 조건부 색반전</td></tr>
          <tr><td>5</td><td>혼합 · 3~5단계 · 거울상 오답↑ · 시간 단축</td><td>—</td></tr>
        </tbody>
      </table>
    </details>
  );
}
