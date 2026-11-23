// 손으로 돌리기: 도형을 끌어서 돌리고, 손을 떼면 가장 가까운 정확한 각도로 맞춘다.
// 축 후보가 여러 개면 끄는 방향을 보고 가장 잘 맞는 축을 자동으로 고른다 (어느 방향으로 끌어도 돈다).
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
  /** 누른 면에 따라 쓸 수 있는 축 후보 */
  candidates: (face: number) => AxisCandidate[];
}

/** 한 칸의 이 비율 이상 끌면 그 칸으로 넘어감 (반올림보다 쉽게 넘어가도록) */
const COMMIT_RATIO = 0.3;

export function useHandRotate(opts: HandRotateOptions) {
  const [dragRot, setDragRot] = useState<{ axis: Vec3; angle: number } | null>(null);
  const suppressClick = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const press = (face: number, point: Vec3, clientX: number, clientY: number): boolean => {
    suppressClick.current = false;
    const o = optsRef.current;
    if (!o.enabled || !o.three.current) return false;
    const cands = o.candidates(face);
    if (!cands.length) return false;
    const { camera, gl, controls } = o.three.current;
    const rect = gl.domElement.getBoundingClientRect();
    const toScreen = (v: Vec3) => {
      const w = new THREE.Vector3(v[0], v[1], v[2]).project(camera);
      return [((w.x + 1) / 2) * rect.width, ((1 - w.y) / 2) * rect.height];
    };
    const center = toScreen([0, 0, 0]);
    const grab = toScreen(point);
    // 후보마다: 잡은 점이 그 축으로 조금 돌 때 화면에서 움직이는 방향·속도 (픽셀/라디안)
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
    let chosen: (typeof info)[number] | null = info.length === 1 ? info[0] : null;
    let angle = 0;

    const angleFor = (it: (typeof info)[number], dx: number, dy: number, ex: number, ey: number) => {
      if (it.len < 20) {
        // 축 바로 위를 잡았을 때: 화면 중심을 도는 방향으로 계산
        const p0 = Math.atan2(clientY - rect.top - center[1], clientX - rect.left - center[0]);
        const p1 = Math.atan2(ey - rect.top - center[1], ex - rect.left - center[0]);
        let a = p1 - p0;
        if (a > Math.PI) a -= 2 * Math.PI;
        if (a < -Math.PI) a += 2 * Math.PI;
        return -a * it.towardViewer;
      }
      return (dx * it.d[0] + dy * it.d[1]) / (it.len * it.len);
    };

    const move = (e: PointerEvent) => {
      const dx = e.clientX - clientX;
      const dy = e.clientY - clientY;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) suppressClick.current = true;
      if (!chosen) {
        if (dist < 8) return;
        // 끄는 방향과 가장 잘 맞는 축 고르기
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
        chosen = best;
      }
      angle = angleFor(chosen, dx, dy, e.clientX, e.clientY);
      setDragRot({ axis: chosen.c.axis, angle });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (ctl) ctl.enabled = true;
      if (!chosen) {
        setDragRot(null);
        return;
      }
      const cand = chosen.c;
      const step = cand.step;
      const n = Math.round(360 / step);
      const raw = (angle * 180) / Math.PI / step;
      // 0.3칸만 넘게 끌어도 다음 칸으로
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
