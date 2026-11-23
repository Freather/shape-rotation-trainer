// 통계: 실수 유형 비율(약점 진단), 유형·레벨·도형별 정답률, 풀이 시간 추이, 레벨 추천
import { MISTAKE_NAMES, QTYPE_NAMES, type MistakeTag, type QType } from '../../engine/question';
import { SOLID_NAMES, type SolidId } from '../../engine/solids';
import { useRecords, type AnswerRecord } from '../../store';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="bar-text">{text}</span>
    </div>
  );
}

function groupBy<K extends string | number>(list: AnswerRecord[], key: (a: AnswerRecord) => K | undefined) {
  const m = new Map<K, AnswerRecord[]>();
  for (const a of list) {
    const k = key(a);
    if (k === undefined) continue;
    m.set(k, [...(m.get(k) ?? []), a]);
  }
  return m;
}

export function Stats() {
  const answers = useRecords((s) => s.answers);
  const clearAll = useRecords((s) => s.clearAll);
  if (!answers.length) return <div className="panel"><h2>통계</h2><p className="muted">아직 푼 문제가 없어요.</p></div>;

  const total = answers.length;
  const ok = answers.filter((a) => a.correct).length;
  const wrongs = answers.filter((a) => !a.correct);
  const tagCount = new Map<MistakeTag, number>();
  for (const w of wrongs) tagCount.set(w.tag, (tagCount.get(w.tag) ?? 0) + 1);
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]);
  const byType = groupBy(answers, (a) => a.type);
  const byLevel = groupBy(answers.filter((a) => a.type === 1 || a.type === 8), (a) => `${a.type === 1 ? '입체' : '평면'} L${a.level}`);
  const bySolid = groupBy(answers, (a) => a.solidId);

  // 레벨 추천: 최근 20문항 85% 이상
  const recs: string[] = [];
  for (const [k, list] of byLevel) {
    const recent = list.slice(-20);
    if (recent.length >= 20 && pct(recent.filter((a) => a.correct).length, recent.length) >= 85) recs.push(`${k}: 최근 20문제 중 85% 이상 맞혔어요. 다음 레벨로 넘어가도 좋아요.`);
  }

  // 시간 추이: 최근 60문항
  const recent = answers.slice(-60);
  const maxT = Math.max(...recent.map((a) => a.timeMs), 1);
  const W = 600;
  const H = 120;
  const pts = recent.map((a, i) => `${(i / Math.max(1, recent.length - 1)) * W},${H - (a.timeMs / maxT) * H}`).join(' ');

  return (
    <div className="panel">
      <h2>통계</h2>
      <div className="stat-nums">
        <div><b>{total}</b><span>푼 문제</span></div>
        <div><b>{pct(ok, total)}%</b><span>정답률</span></div>
        <div><b>{(answers.reduce((s, a) => s + a.timeMs, 0) / total / 1000).toFixed(1)}초</b><span>평균 시간</span></div>
      </div>
      {recs.map((r) => (
        <p key={r} className="good">
          {r}
        </p>
      ))}
      <h3>자주 걸리는 함정</h3>
      {tags.length === 0 && <p className="muted">틀린 문제가 없어요.</p>}
      {tags.map(([t, n]) => (
        <Bar key={t} label={MISTAKE_NAMES[t]} value={n} max={tags[0][1]} text={`${n}회 (${pct(n, wrongs.length)}%)`} />
      ))}
      <h3>유형별</h3>
      {[...byType.entries()].map(([t, list]) => (
        <Bar key={t} label={QTYPE_NAMES[t as QType]} value={pct(list.filter((a) => a.correct).length, list.length)} max={100} text={`${pct(list.filter((a) => a.correct).length, list.length)}% (${list.length}문항, 평균 ${(list.reduce((s, a) => s + a.timeMs, 0) / list.length / 1000).toFixed(1)}s)`} />
      ))}
      <h3>규칙 문제 레벨별</h3>
      {[...byLevel.entries()].sort().map(([k, list]) => (
        <Bar key={k} label={k} value={pct(list.filter((a) => a.correct).length, list.length)} max={100} text={`${pct(list.filter((a) => a.correct).length, list.length)}% (${list.length})`} />
      ))}
      <h3>도형별</h3>
      {[...bySolid.entries()].map(([k, list]) => (
        <Bar key={k} label={SOLID_NAMES[k as SolidId]} value={pct(list.filter((a) => a.correct).length, list.length)} max={100} text={`${pct(list.filter((a) => a.correct).length, list.length)}% (${list.length})`} />
      ))}
      <h3>최근 {recent.length}문제 풀이 시간</h3>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="spark">
        <polyline points={pts} fill="none" stroke="#16181b" strokeWidth={2} />
        {recent.map((a, i) => (
          <circle key={i} cx={(i / Math.max(1, recent.length - 1)) * W} cy={H - (a.timeMs / maxT) * H} r={3} fill={a.correct ? '#1f7a3d' : '#c62828'} />
        ))}
      </svg>
      <p className="muted small">초록 점은 맞힌 문제, 빨간 점은 틀린 문제예요. 맨 위는 {(maxT / 1000).toFixed(1)}초예요.</p>
      <button
        onClick={() => {
          if (confirm('기록과 오답노트를 모두 지울까요?')) clearAll();
        }}
      >
        기록 모두 지우기
      </button>
    </div>
  );
}
