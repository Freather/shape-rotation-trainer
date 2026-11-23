// 매일 기록: 오늘 목표, 연속 일수, 달력(최근 16주), 최근 날짜별 표, 매일 알림 설정
import { useMemo, useState } from 'react';
import { addDays, currentStreak, dailyIcs, dayKey, googleCalendarUrl, longestStreak, summarizeByDay, type DaySummary } from '../../engine/daily';
import { useRecords, useSettings } from '../../store';

const WEEKS = 16;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function useToday() {
  const answers = useRecords((s) => s.answers);
  const goal = useSettings((s) => s.dailyGoal);
  return useMemo(() => {
    const byDay = summarizeByDay(answers);
    const today = dayKey(Date.now());
    const days = new Set(byDay.keys());
    return {
      byDay,
      today,
      todayCount: byDay.get(today)?.count ?? 0,
      goal,
      streak: currentStreak(days, today),
      longest: longestStreak(days),
    };
  }, [answers, goal]);
}

function cellColor(s: DaySummary | undefined, goal: number): string {
  if (!s) return '#ecebe7';
  const r = s.count / Math.max(1, goal);
  if (r >= 1) return '#16181b';
  if (r >= 0.5) return '#5f6368';
  return '#b5b2ab';
}

function Reminder() {
  const s = useSettings();
  const [msg, setMsg] = useState<string | null>(null);
  const minutes = 20;
  const downloadIcs = () => {
    const blob = new Blob([dailyIcs(s.reminderTime, minutes)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '도형추리-매일-연습.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const toggleNotify = async (on: boolean) => {
    if (!on) {
      s.set({ notifyOn: false });
      return;
    }
    if (!('Notification' in window)) {
      setMsg('이 브라우저는 알림을 지원하지 않아요. 캘린더 알림을 써 주세요.');
      return;
    }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p === 'granted') {
      s.set({ notifyOn: true });
      setMsg(null);
    } else {
      setMsg('알림이 차단돼 있어요. 브라우저 주소창 옆 설정에서 알림을 허용해 주세요.');
    }
  };
  return (
    <section>
      <h3>매일 알림</h3>
      <div className="form">
        <label>
          알림 시각
          <input type="time" value={s.reminderTime} onChange={(e) => s.set({ reminderTime: e.target.value || '20:00' })} />
        </label>
        <label>
          하루 목표 (문제)
          <input type="number" min={1} max={200} value={s.dailyGoal} onChange={(e) => s.set({ dailyGoal: Math.max(1, Number(e.target.value) || 20) })} />
        </label>
      </div>
      <div className="btn-row">
        <a className="button primary" href={googleCalendarUrl(s.reminderTime, minutes)} target="_blank" rel="noreferrer">
          구글 캘린더에 매일 알림 추가
        </a>
        <button onClick={downloadIcs}>캘린더 파일 받기 (아이폰·삼성 캘린더 등)</button>
      </div>
      <p className="note">
        캘린더에 매일 {s.reminderTime}에 반복되는 일정이 생겨요. 사이트를 닫아 둬도 폰으로 알림이 오는 가장 확실한 방법이에요.
      </p>
      <p className="note">
        구글 캘린더는 내 캘린더의 기본 알림(예: 30분 전, 10분 전)이 자동으로 함께 붙어서 여러 번 울릴 수 있어요. 저장하기 전에 알림 칸에서 하나만 남기고 지우거나, 저장한 뒤 일정을 열어 알림을 정리하세요. 캘린더 파일은 정각 알림 하나만 들어 있어요.
      </p>
      <label className="check small" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={s.notifyOn} onChange={(e) => toggleNotify(e.target.checked)} /> 사이트를 열어 둔 동안 브라우저 알림도 받기
      </label>
      <p className="note">
        브라우저 알림은 이 사이트가 탭으로 열려 있을 때만 와요. 알림 시각이 지났는데 오늘 목표를 못 채웠으면 한 번 알려줘요.
      </p>
      {msg && <p className="note bad">{msg}</p>}
    </section>
  );
}

export function Daily() {
  const t = useToday();
  const { byDay, today, todayCount, goal, streak, longest } = t;

  // 달력: 이번 주 토요일까지, 16주
  const todayDate = new Date();
  const lastSat = addDays(today, 6 - todayDate.getDay());
  const firstSun = addDays(lastSat, -(WEEKS * 7 - 1));
  const weeks: string[][] = [];
  for (let w = 0; w < WEEKS; w++) weeks.push(Array.from({ length: 7 }, (_, d) => addDays(firstSun, w * 7 + d)));

  const recent = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const pct = Math.min(100, Math.round((todayCount / Math.max(1, goal)) * 100));

  return (
    <div className="panel">
      <h2>매일 기록</h2>
      <p className="lead">연습 모드와 실전 모드에서 푼 문제가 날짜별로 쌓여요. 이 기기의 브라우저에 저장돼요.</p>

      <div className="today-card">
        <div>
          <div className="small muted">오늘</div>
          <div className="big-num">
            {todayCount} <span className="muted">/ {goal}문제</span>
          </div>
          <div className="goal-track">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="small">{todayCount >= goal ? '오늘 목표를 채웠어요.' : `목표까지 ${goal - todayCount}문제 남았어요.`}</div>
        </div>
        <div>
          <div className="small muted">연속 연습</div>
          <div className="big-num">{streak}일</div>
          <div className="small muted">가장 길게 이어간 기록 {longest}일</div>
        </div>
      </div>

      <h3>최근 {WEEKS}주</h3>
      <div className="heat">
        <div className="heat-dow">
          {DOW.map((d, i) => (
            <span key={d}>{i % 2 === 1 ? d : ''}</span>
          ))}
        </div>
        <div className="heat-grid">
          {weeks.map((w, wi) => (
            <div key={wi} className="heat-col">
              {w.map((d) => {
                const s = byDay.get(d);
                const future = d > today;
                return (
                  <span
                    key={d}
                    className={d === today ? 'heat-cell today' : 'heat-cell'}
                    style={{ background: future ? 'transparent' : cellColor(s, goal) }}
                    title={s ? `${d} · ${s.count}문제 · 정답률 ${Math.round((s.correct / s.count) * 100)}%` : `${d} · 안 함`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heat-legend small muted">
        <span className="heat-cell" style={{ background: '#ecebe7' }} /> 안 함
        <span className="heat-cell" style={{ background: '#b5b2ab' }} /> 목표의 절반 미만
        <span className="heat-cell" style={{ background: '#5f6368' }} /> 절반 이상
        <span className="heat-cell" style={{ background: '#16181b' }} /> 목표 달성
      </div>

      <h3>최근 2주</h3>
      <table className="result-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>푼 문제</th>
            <th>정답률</th>
            <th>평균 시간</th>
            <th>합계 시간</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((d) => {
            const s = byDay.get(d);
            const [, m, dd] = d.split('-');
            const dow = DOW[new Date(Number(d.slice(0, 4)), Number(m) - 1, Number(dd)).getDay()];
            return (
              <tr key={d} className={s ? '' : 'empty-row'}>
                <td>
                  {Number(m)}월 {Number(dd)}일 ({dow}){d === today ? ' 오늘' : ''}
                </td>
                <td>{s ? `${s.count}${s.count >= goal ? ' ✓' : ''}` : '-'}</td>
                <td>{s ? `${Math.round((s.correct / s.count) * 100)}%` : '-'}</td>
                <td>{s ? `${(s.timeMs / s.count / 1000).toFixed(1)}초` : '-'}</td>
                <td>{s ? `${Math.round(s.timeMs / 60000)}분` : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Reminder />
    </div>
  );
}
