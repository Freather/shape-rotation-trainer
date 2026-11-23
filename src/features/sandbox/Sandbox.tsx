import { lazy, Suspense, useState } from 'react';
import { RadialSandbox } from './RadialSandbox';
import { NetBuilder } from './NetBuilder';

// three.js 는 크기가 커서 입체 샌드박스에 들어올 때만 불러온다
const SolidSandbox = lazy(() => import('./SolidSandbox').then((m) => ({ default: m.SolidSandbox })));

type Mode = 'solid' | 'net' | 'radial';
const MODES: [Mode, string][] = [
  ['solid', '입체 돌리기'],
  ['net', '전개도 만들기'],
  ['radial', '평면 도형'],
];

export function Sandbox() {
  const [mode, setMode] = useState<Mode>('solid');
  return (
    <div>
      <div className="mode-bar">
        <div className="seg">
          {MODES.map(([m, name]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      {mode === 'solid' && (
        <Suspense fallback={<p className="muted">3D 화면을 불러오는 중이에요.</p>}>
          <SolidSandbox />
        </Suspense>
      )}
      {mode === 'net' && <NetBuilder />}
      {mode === 'radial' && <RadialSandbox />}
    </div>
  );
}
