// 그림 정팔면체 직접 돌려보기: 규칙 버튼(또는 기본 연산 버튼)을 눌러 천천히 적용
import { useEffect, useState } from 'react';
import { applyOctaOp, describeOctaOp, octaOpCandidates, type OctaOp, type OctaState } from '../../engine/octa';
import type { Rule } from '../../engine/rules';
import { OctaView } from '../../render/OctaSvg';
import { easeInOut } from '../../render/usePlayer';
import { Parts, RuleBadge } from '../../ui/Parts';

const FREE_OPS = octaOpCandidates(['turn', 'layer', 'swapPics', 'invert'], ['top', 'right', 'front', 'bottom', 'left', 'back'], true);

export function OctaScratch({ state: start, rules }: { state: OctaState; rules?: Rule<OctaOp>[] }) {
  const [state, setState] = useState(start);
  const [history, setHistory] = useState<OctaState[]>([]);
  const [anim, setAnim] = useState<{ op: OctaOp; p: number } | null>(null);
  useEffect(() => {
    setState(start);
    setHistory([]);
    setAnim(null);
  }, [start]);
  const apply = (op: OctaOp) => {
    if (anim) return;
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setAnim(null);
      setHistory((h) => [...h, state]);
      setState(applyOctaOp(state, op));
    };
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / 900);
      setAnim({ op, p: easeInOut(p) });
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 1300);
  };
  return (
    <div className="scratch">
      <div className="scratch-canvas">
        <OctaView state={state} anim={anim} size={250} />
      </div>
      <div className="field-label">{rules ? '규칙 적용' : '버튼으로 바꾸기'}</div>
      <div className="btn-col">
        {(rules ?? FREE_OPS.map((op, i) => ({ id: i + 1, label: '', op }))).map((ru) => (
          <button key={ru.id} onClick={() => apply(ru.op)} disabled={!!anim} className="btn-left">
            {rules && <RuleBadge id={ru.id} />} <Parts parts={describeOctaOp(ru.op)} />
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button
          disabled={!history.length || !!anim}
          onClick={() => {
            setState(history[history.length - 1]);
            setHistory((h) => h.slice(0, -1));
          }}
        >
          한 번 되돌리기
        </button>
        <button
          disabled={!!anim}
          onClick={() => {
            setState(start);
            setHistory([]);
          }}
        >
          처음 모습으로
        </button>
      </div>
    </div>
  );
}
