import { lazy, Suspense, useState } from 'react';
import { RadialSandbox } from './RadialSandbox';

// three.js 는 크기가 커서 샌드박스에 들어올 때만 불러온다
const SolidSandbox = lazy(() => import('./SolidSandbox').then((m) => ({ default: m.SolidSandbox })));

export function Sandbox() {
  const [mode, setMode] = useState<'solid' | 'radial'>('solid');
  return (
    <div>
      <div className="seg">
        <button className={mode === 'solid' ? 'primary' : ''} onClick={() => setMode('solid')}>
          입체
        </button>
        <button className={mode === 'radial' ? 'primary' : ''} onClick={() => setMode('radial')}>
          평면 (방사형)
        </button>
      </div>
      {mode === 'solid' ? (
        <Suspense fallback={<p className="muted">3D 불러오는 중…</p>}>
          <SolidSandbox />
        </Suspense>
      ) : (
        <RadialSandbox />
      )}
    </div>
  );
}
