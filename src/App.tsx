import { useEffect, useState } from 'react';
import { Sandbox } from './features/sandbox/Sandbox';
import { Practice } from './features/quiz/Practice';
import { Exam } from './features/exam/Exam';
import { Review } from './features/review/Review';
import { Stats } from './features/stats/Stats';
import { SettingsPage } from './features/settings/SettingsPage';
import { Daily, useToday } from './features/daily/Daily';
import { dayKey } from './engine/daily';
import { useRecords, useSettings } from './store';

const TABS = [
  ['sandbox', '샌드박스'],
  ['practice', '문제풀이'],
  ['exam', '실전모드'],
  ['review', '오답노트'],
  ['daily', '매일 기록'],
  ['stats', '통계'],
  ['settings', '설정'],
] as const;
type Tab = (typeof TABS)[number][0];

const initialTab = (): Tab => {
  const h = location.hash.slice(1);
  return (TABS.find(([id]) => id === h)?.[0] ?? 'sandbox') as Tab;
};

/** 알림 시각이 지났는데 오늘 목표를 못 채웠으면 하루에 한 번 브라우저 알림 */
function useDailyNotification(todayCount: number) {
  const { notifyOn, reminderTime, dailyGoal } = useSettings();
  useEffect(() => {
    if (!notifyOn || !('Notification' in window) || Notification.permission !== 'granted') return;
    const check = () => {
      const now = new Date();
      const [h, m] = reminderTime.split(':').map(Number);
      const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
      const key = `srt-notified-${dayKey(now.getTime())}`;
      if (!due || todayCount >= dailyGoal || localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      const n = new Notification('도형추리 연습할 시간이에요', {
        body: todayCount === 0 ? `오늘은 아직 안 풀었어요. 목표 ${dailyGoal}문제!` : `오늘 ${todayCount}문제 풀었어요. 목표까지 ${dailyGoal - todayCount}문제 남았어요.`,
        icon: './favicon.svg',
        tag: 'srt-daily',
      });
      n.onclick = () => {
        window.focus();
        location.hash = 'practice';
      };
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [notifyOn, reminderTime, dailyGoal, todayCount]);
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const wrongCount = useRecords((s) => s.wrong.length);
  const { todayCount, goal, streak } = useToday();
  useDailyNotification(todayCount);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      const t = TABS.find(([id]) => id === h)?.[0];
      if (t) setTab(t);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <div className="app">
      <header className="top">
        <h1>도형추리 트레이너</h1>
        <nav>
          {TABS.map(([id, name]) => (
            <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => go(id)}>
              {name}
              {id === 'review' && wrongCount > 0 && <span className="badge">{wrongCount}</span>}
            </button>
          ))}
        </nav>
        <button className={todayCount >= goal ? 'today-chip done' : 'today-chip'} onClick={() => go('daily')} title="매일 기록 보기">
          오늘 {todayCount}/{goal}
          {streak > 0 && <span> · {streak}일째</span>}
        </button>
      </header>
      <main>
        {tab === 'sandbox' && <Sandbox />}
        {tab === 'practice' && <Practice />}
        {tab === 'exam' && <Exam />}
        {tab === 'review' && <Review />}
        {tab === 'daily' && <Daily />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
