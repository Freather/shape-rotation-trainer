// 손으로 돌리기: 도형을 끌어서 돌리고, 손을 떼면 가장 가까운 정확한 각도로 맞춘다.
// - 한 손가락(또는 마우스): 축 후보 중 끄는 방향에 가장 잘 맞는 축으로 돈다.
// - 두 손가락: 한 손가락으로 면을 누른 채 다른 손가락을 돌리면, 누른 면을 축으로 비틀어 돈다.
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { dot, quatFromAxisAngle, type Vec3 } from '../engine/math';
import { CAMERA_DIR } from '../engine/solids';
import { easeInOut } from './usePlayer';

export interface ThreeRefs {
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
  controls: unknown;
}

export interface AxisCandidate {
  /** 회전축 (월드) */
  axis: Vec3;
  /** 맞춰질 각도 단위(도) */
  step: number;
  /** 손을 뗀 뒤 맞춰진 칸 수 (반시계가 +) 로 회전 기록 */
  commit: (k: number) => void;
}

export interface HandRotateOptions {
  three: { current: ThreeRefs | null };
  enabled: boolean;
  /** 누른 면에 따라 쓸 수 있는 축 후보 (한 손가락) */
  candidates: (face: number) => AxisCandidate[];
  /** 두 손가락 비틀기에 쓸 축 (보통 누른 면의 축) */
  twist?: (face: number) => AxisCandidate;
}

/** 한 칸의 이 비율 이상 돌리면 그 칸으로 넘어감 */
const COMMIT_RATIO = 0.3;

export function useHandRotate(opts: HandRotateOptions) {
  const [dragRot, setDragRot] = useState<{ axis: Vec3; angle: number } | null>(null);
  const suppressClick = useRef(false);
  const active = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const press = (face: number, point: Vec3, clientX: number, clientY: number, pointerId = 1): boolean => {
    // 이미 잡고 있는 중이면 (두 번째 손가락이 면 위에 닿은 경우) 새로 시작하지 않음
    if (active.current) return true;
    suppressClick.current = false;
    const o = optsRef.current;
    if (!o.enabled || !o.three.current) return false;
    const cands = o.candidates(face);
    if (!cands.length) return false;
    active.current = true;
    const { camera, gl, controls } = o.three.current;
    const rect = gl.domElement.getBoundingClientRect();
    const toScreen = (v: Vec3) => {
      const w = new THREE.Vector3(v[0], v[1], v[2]).project(camera);
      return [((w.x + 1) / 2) * rect.width, ((1 - w.y) / 2) * rect.height];
    };
    const center = toScreen([0, 0, 0]);
    const grab = toScreen(point);
    const info = cands.map((c) => {
      const eps = 0.02;
      const pr = quatFromAxisAngle(c.axis, eps);
      const v = new THREE.Vector3(point[0], point[1], point[2]).applyQuaternion(new THREE.Quaternion(pr[1], pr[2], pr[3], pr[0]));
      const b = toScreen([v.x, v.y, v.z]);
      const d = [(b[0] - grab[0]) / eps, (b[1] - grab[1]) / eps];
      return { c, d, len: Math.hypot(d[0], d[1]), towardViewer: dot(c.axis, CAMERA_DIR) >= 0 ? 1 : -1 };
    });
    const ctl = controls as { enabled: boolean } | null;
    if (ctl) ctl.enabled = false;

    // 손가락 위치 (pointerId → 화면 좌표)
    const pts = new Map<number, [number, number]>([[pointerId, [clientX, clientY]]]);
    let chosen: { c: AxisCandidate; towardViewer: number } | null = info.length === 1 ? info[0] : null;
    let single: (typeof info)[number] | null = info.length === 1 ? info[0] : null;
    let angle = 0;
    // 두 손가락 비틀기 상태
    let twist: { c: AxisCandidate; towardViewer: number; start: number; ids: [number, number] } | null = null;

    const twoAngle = (a: [number, number], b: [number, number]) => Math.atan2(b[1] - a[1], b[0] - a[0]);
    const wrap = (a: number) => {
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };

    const startTwist = (secondId: number) => {
      const tw = optsRef.current.twist?.(face);
      if (!tw) return;
      const a = pts.get(pointerId)!;
      const b = pts.get(secondId)!;
      twist = { c: tw, towardViewer: dot(tw.axis, CAMERA_DIR) >= 0 ? 1 : -1, start: twoAngle(a, b), ids: [pointerId, secondId] };
      chosen = twist;
      angle = 0;
      suppressClick.current = true;
      setDragRot({ axis: tw.axis, angle: 0 });
    };

    const down = (e: PointerEvent) => {
      if (e.pointerId === pointerId || pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (!twist && pts.size === 2) startTwist(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (twist) {
        const a = pts.get(twist.ids[0]);
        const b = pts.get(twist.ids[1]);
        if (!a || !b) return;
        // 화면에서 시계방향(y 아래가 +)으로 돌린 만큼, 보는 사람 기준 시계방향으로 회전
        angle = -wrap(twoAngle(a, b) - twist.start) * twist.towardViewer;
        setDragRot({ axis: twist.c.axis, angle });
        return;
      }
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - clientX;
      const dy = e.clientY - clientY;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) suppressClick.current = true;
      if (!single) {
        if (dist < 8) return;
        const ux = dx / dist;
        const uy = dy / dist;
        let best = info[0];
        let bestScore = -1;
        for (const it of info) {
          const score = it.len < 20 ? 0.2 : Math.abs(ux * it.d[0] + uy * it.d[1]) / it.len;
          if (score > bestScore) {
            bestScore = score;
            best = it;
          }
        }
        single = best;
        chosen = best;
      }
      if (single.len < 20) {
        const p0 = Math.atan2(clientY - rect.top - center[1], clientX - rect.left - center[0]);
        const p1 = Math.atan2(e.clientY - rect.top - center[1], e.clientX - rect.left - center[0]);
        angle = -wrap(p1 - p0) * single.towardViewer;
      } else {
        angle = (dx * single.d[0] + dy * single.d[1]) / (single.len * single.len);
      }
      setDragRot({ axis: single.c.axis, angle });
    };

    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      // 비틀기 중엔 손가락 하나만 떼도 끝, 아니면 처음 손가락을 뗄 때 끝
      if (!twist && e.pointerId !== pointerId) return;
      finishGesture();
    };

    const finishGesture = () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (ctl) ctl.enabled = true;
      active.current = false;
      if (!chosen) {
        setDragRot(null);
        return;
      }
      const cand = chosen.c;
      const step = cand.step;
      const n = Math.round(360 / step);
      const raw = (angle * 180) / Math.PI / step;
      let k = Math.sign(raw) * Math.floor(Math.abs(raw) + (1 - COMMIT_RATIO));
      k = ((k % n) + n) % n;
      if (k > n / 2) k -= n;
      const to = (k * step * Math.PI) / 180;
      const from = angle - Math.round((angle - to) / (2 * Math.PI)) * 2 * Math.PI;
      const t0 = performance.now();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        setDragRot(null);
        if (k !== 0) cand.commit(k);
      };
      const tick = (now: number) => {
        if (finished) return;
        const t = Math.min(1, (now - t0) / 160);
        setDragRot({ axis: cand.axis, angle: from + (to - from) * easeInOut(t) });
        if (t < 1) requestAnimationFrame(tick);
        else finish();
      };
      requestAnimationFrame(tick);
      setTimeout(finish, 260);
    };

    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return true;
  };

  /** 클릭 이벤트가 끌기 뒤에 따라오면 무시하기 위해 */
  const consumeClick = () => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  };

  return { dragRot, press, consumeClick };
}
