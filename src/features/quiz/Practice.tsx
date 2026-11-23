// 문제풀이 (연습 모드): 유형·레벨 선택 → (규칙형이면 규칙 설명) → 즉시 채점 + 풀이 보기
import { useCallback, useMemo, useRef, useState } from 'react';
import { QTYPE_NAMES, generateQuestion, type QType, type Question } from '../../engine/question';
import { randomSeed } from '../../engine/rng';
import { SOLID_IDS, SOLID_NAMES, type SolidId } from '../../engine/solids';
import { buildRuleSet, useRecords, useSettings, type SetParams } from '../../store';
import { QuestionView } from './QuestionView';
import { RulePages, RuleSummary } from './RulePages';

const TYPE_GROUPS: { title: string; items: [QType, string][] }[] = [
  {
    title: '입체 회전',
    items: [
      [1, '규칙 번호만 보고 돌린 결과 고르기'],
      [2, '돌린 뒤 한 면에 오는 그림 고르기'],
      [3, '두 그림이 같은 도형인지 판단'],
      [10, '처음과 나중을 보고 회전 순서 찾기'],
      [11, '규칙 번호와 내용 짝 맞추기'],
    ],
  },
  {
    title: '전개도',
    items: [
      [4, '전개도를 접은 입체 고르기'],
      [5, '입체를 펼친 전개도 고르기'],
      [6, '맞은편에 오는 면 찾기'],
      [7, '접은 뒤 돌린 모습 고르기'],
    ],
  },
  {
    title: '평면 도형',
    items: [
      [8, '규칙 번호만 보고 바뀐 결과 고르기'],
      [9, '전후 그림을 보고 규칙 찾기'],
    ],
  },
];
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
    const showSolid = type !== 8 && type !== 9 && !(type === 11 && ruleKind === 'radial');
    const solidChoices = SOLID_IDS.filter((id) => !([4, 5, 6, 7].includes(type) && (id === 'dodeca' || id === 'icosa' || (type === 6 && id === 'tetra'))));
    return (
      <div className="panel">
        <h2>문제풀이</h2>
        <p className="lead">한 문제씩 풀고 바로 채점해요. 틀린 문제는 오답노트에 모여요.</p>
        <div className="type-groups">
          {TYPE_GROUPS.map((g) => (
            <div key={g.title} className="type-group">
              <h4>{g.title}</h4>
              {g.items.map(([t, desc]) => (
                <button
                  key={t}
                  className={type === t ? 'type-item on' : 'type-item'}
                  onClick={() => {
                    setType(t);
                    setLevel((l) => Math.min(l, maxLevel(t)));
                  }}
                >
                  <b>{QTYPE_NAMES[t]}</b>
                  <span>{desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="field-label">레벨</div>
        <div className="seg">
          {Array.from({ length: maxLevel(type) }, (_, i) => i + 1).map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>
        {showSolid && (
          <>
            <div className="field-label">도형</div>
            <div className="seg">
              <button className={solid === '' ? 'on' : ''} onClick={() => setSolid('')}>
                레벨에 맞게
              </button>
              {solidChoices.map((id) => (
                <button key={id} className={solid === id ? 'on' : ''} onClick={() => setSolid(id)}>
                  {SOLID_NAMES[id]}
                </button>
              ))}
            </div>
          </>
        )}
        {type === 11 && (
          <>
            <div className="field-label">규칙 종류</div>
            <div className="seg">
              <button className={ruleKind === 'solid' ? 'on' : ''} onClick={() => setRuleKind('solid')}>
                입체 회전
              </button>
              <button className={ruleKind === 'radial' ? 'on' : ''} onClick={() => setRuleKind('radial')}>
                평면 도형
              </button>
            </div>
          </>
        )}
        <div className="start-row">
          <button className="primary big" onClick={start}>
            시작하기
          </button>
        </div>
        <LevelGuide />
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
        <button onClick={() => setPhase('config')}>← 유형 선택</button>
        <span>
          {QTYPE_NAMES[q.type]} · 레벨 {q.level}
        </span>
        <span className="spacer" />
        <span className="muted">
          {score.total}문제 중 {score.ok}개 맞힘
        </span>
        {ruleSet && (
          <button onClick={() => setShowRules((s) => !s)}>{showRules ? '규칙 닫기' : '규칙 보기'}</button>
        )}
        
      </div>
      {showRules && ruleSet && <RuleSummary set={ruleSet} />}
      <QuestionView key={`${q.seed}-${count}`} q={q} number={count} selected={selected} onSelect={answer} revealed={revealed} />
      {revealed && (
        <div className="next-row">
          <button className="primary big" onClick={() => newQuestion(setParams)}>
            다음 문제
          </button>
          {ruleSet && (
            <button
              onClick={() => {
                start();
              }}
            >
              규칙 새로 받기
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
      <summary>레벨별로 무엇이 나오나요?</summary>
      <table>
        <thead>
          <tr>
            <th>레벨</th>
            <th>입체</th>
            <th>평면 방사형</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>정육면체, 한 번 회전, 90°만</td><td>다트판 4칸, 전체 회전과 색 바꿈</td></tr>
          <tr><td>2</td><td>정육면체, 2~3번, 180°와 굴리기</td><td>6·8칸, 층 회전, 층 색 바꿈</td></tr>
          <tr><td>3</td><td>정팔면체, 꼭짓점 축과 면 축</td><td>사각·육각·삼각 과녁, 뒤집기, 그림 이동</td></tr>
          <tr><td>4</td><td>정십이면체, 72°와 144°</td><td>꽃잎형, 조건이 붙은 색 바꿈</td></tr>
          <tr><td>5</td><td>여러 도형 섞음, 3~5번, 거울상 보기 많음, 시간 짧음</td><td></td></tr>
        </tbody>
      </table>
    </details>
  );
}
