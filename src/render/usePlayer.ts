// 단계별 애니메이션 재생기: 단계 i 를 진행도 p(0→1)로 재생, 단계 사이 잠깐 멈춤
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlayerState {
  /** 지금까지 완료된 단계 수 (0 = 시작 상태) */
  done: number;
  /** 재생 중인 단계의 진행도 (재생 중이 아니면 0) */
  p: number;
  playing: boolean;
  /** 단계 완료 직후 잠깐 보여주는 메시지용 */
  justFinished: number | null;
}

export function usePlayer(count: number, opts: { stepMs?: number; pauseMs?: number; speed?: number } = {}) {
  const stepMs = opts.stepMs ?? 1100;
  const pauseMs = opts.pauseMs ?? 450;
  const speed = opts.speed ?? 1;
  const [st, setSt] = useState<PlayerState>({ done: 0, p: 0, playing: false, justFinished: null });
  const ref = useRef(st);
  ref.current = st;
  const raf = useRef<number | null>(null);
  const single = useRef(false);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  const run = useCallback(
    (onlyOne: boolean) => {
      stop();
      single.current = onlyOne;
      let last = performance.now();
      let pauseLeft = 0;
      const tick = (now: number) => {
        const dt = (now - last) * speed;
        last = now;
        const s = ref.current;
        if (!s.playing) return;
        if (pauseLeft > 0) {
          pauseLeft -= dt;
          if (pauseLeft <= 0) setSt((x) => ({ ...x, justFinished: null }));
          raf.current = requestAnimationFrame(tick);
          return;
        }
        if (s.done >= count) {
          setSt((x) => ({ ...x, playing: false, p: 0 }));
          return;
        }
        const np = s.p + dt / stepMs;
        if (np >= 1) {
          const done = s.done + 1;
          const keepGoing = !single.current && done < count;
          setSt({ done, p: 0, playing: keepGoing, justFinished: done });
          ref.current = { done, p: 0, playing: keepGoing, justFinished: done };
          if (!keepGoing) return;
          pauseLeft = pauseMs;
        } else {
          setSt((x) => ({ ...x, p: np }));
          ref.current = { ...ref.current, p: np };
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [count, pauseMs, speed, stepMs, stop],
  );

  useEffect(() => stop, [stop]);
  // "적용 완료" 표시는 잠시 뒤 사라짐
  useEffect(() => {
    if (st.justFinished === null) return;
    const id = setTimeout(() => setSt((x) => ({ ...x, justFinished: null })), 1300);
    return () => clearTimeout(id);
  }, [st.justFinished]);
  useEffect(() => {
    // 단계 수가 바뀌면(큐 수정) 범위를 맞춤
    setSt((x) => (x.done > count ? { done: count, p: 0, playing: false, justFinished: null } : x));
  }, [count]);

  const play = useCallback(() => {
    const s = ref.current;
    const done = s.done >= count ? 0 : s.done;
    const next = { done, p: s.p, playing: true, justFinished: null };
    ref.current = next;
    setSt(next);
    run(false);
  }, [count, run]);

  const pause = useCallback(() => {
    stop();
    setSt((x) => ({ ...x, playing: false }));
  }, [stop]);

  const next = useCallback(() => {
    const s = ref.current;
    if (s.done >= count) return;
    const n = { done: s.done, p: 0, playing: true, justFinished: null };
    ref.current = n;
    setSt(n);
    run(true);
  }, [count, run]);

  const prev = useCallback(() => {
    stop();
    setSt((x) => ({ done: Math.max(0, x.p > 0 ? x.done : x.done - 1), p: 0, playing: false, justFinished: null }));
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setSt({ done: 0, p: 0, playing: false, justFinished: null });
  }, [stop]);

  const jumpEnd = useCallback(() => {
    stop();
    setSt({ done: count, p: 0, playing: false, justFinished: null });
  }, [count, stop]);

  return { ...st, play, pause, next, prev, reset, jumpEnd };
}

export const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
