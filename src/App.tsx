import { useState } from 'react';
import { Sandbox } from './features/sandbox/Sandbox';
import { Practice } from './features/quiz/Practice';
import { Exam } from './features/exam/Exam';
import { Review } from './features/review/Review';
import { Stats } from './features/stats/Stats';
import { SettingsPage } from './features/settings/SettingsPage';
import { useRecords } from './store';

const TABS = [
  ['sandbox', '샌드박스'],
  ['practice', '문제풀이'],
  ['exam', '실전모드'],
  ['review', '오답노트'],
  ['stats', '통계'],
  ['settings', '설정'],
] as const;
type Tab = (typeof TABS)[number][0];

const initialTab = (): Tab => {
  const h = location.hash.slice(1);
  return (TABS.find(([id]) => id === h)?.[0] ?? 'sandbox') as Tab;
};

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const wrongCount = useRecords((s) => s.wrong.length);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };
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
      </header>
      <main>
        {tab === 'sandbox' && <Sandbox />}
        {tab === 'practice' && <Practice />}
        {tab === 'exam' && <Exam />}
        {tab === 'review' && <Review />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
