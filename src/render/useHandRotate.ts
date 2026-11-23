// 손으로 돌리기: 축을 고정한 채 도형을 끌어서 돌리고, 손을 떼면 가장 가까운 정확한 각도로 맞춘다.
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

export interface HandRotateOptions {
  three: { current: ThreeRefs | null };
  enabled: boolean;
  /** 누른 면에 따라 회전축(월드)을 정함 */
  axisFor: (face: number) => Vec3;
  /** 맞춰질 각도 단위(도) */
  step: number;
  /** 손을 뗀 뒤 맞춰진 칸 수 (반시계가 +) 와 누른 면 */
  onCommit: (k: number, face: number) => void;
}

export function useHandRotate(opts: HandRotateOptions) {
  const [dragRot, setDragRot] = useState<{ axis: Vec3; angle: number } | null>(null);
  const suppressClick = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const press = (face: number, point: Vec3, clientX: number, clientY: number): boolean => {
    suppressClick.current = false;
    const o = optsRef.current;
    if (!o.enabled || !o.three.current) return false;
    const { camera, gl, controls } = o.three.current;
    const axis = o.axisFor(face);
    const rect = gl.domElement.getBoundingClientRect();
    const toScreen = (v: Vec3) => {
      const w = new THREE.Vector3(v[0], v[1], v[2]).project(camera);
      return [((w.x + 1) / 2) * rect.width, ((1 - w.y) / 2) * rect.height];
    };
    // 잡은 점이 축 둘레로 조금 돌 때 화면에서 움직이는 방향·속도 (픽셀/라디안)
    const eps = 0.02;
    const pr = quatFromAxisAngle(axis, eps);
    const v = new THREE.Vector3(point[0], point[1], point[2]).applyQuaternion(new THREE.Quaternion(pr[1], pr[2], pr[3], pr[0]));
    const a = toScreen(point);
    const b = toScreen([v.x, v.y, v.z]);
    const d = [(b[0] - a[0]) / eps, (b[1] - a[1]) / eps];
    const circular = Math.hypot(d[0], d[1]) < 20; // 축 바로 위를 잡았을 때
    const center = toScreen([0, 0, 0]);
    const towardViewer = dot(axis, CAMERA_DIR) >= 0 ? 1 : -1;
    const c = controls as { enabled: boolean } | null;
    if (c) c.enabled = false;
    let angle = 0;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - clientX;
      const dy = e.clientY - clientY;
      if (Math.hypot(dx, dy) > 4) suppressClick.current = true;
      if (circular) {
        const p0 = Math.atan2(clientY - rect.top - center[1], clientX - rect.left - center[0]);
        const p1 = Math.atan2(e.clientY - rect.top - center[1], e.clientX - rect.left - center[0]);
        angle = -(p1 - p0) * towardViewer;
      } else {
        angle = (dx * d[0] + dy * d[1]) / (d[0] * d[0] + d[1] * d[1]);
      }
      setDragRot({ axis, angle });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (c) c.enabled = true;
      const step = optsRef.current.step;
      const n = Math.round(360 / step);
      let k = Math.round((angle * 180) / Math.PI / step);
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
        if (k !== 0) optsRef.current.onCommit(k, face);
      };
      const tick = (now: number) => {
        if (finished) return;
        const t = Math.min(1, (now - t0) / 160);
        setDragRot({ axis, angle: from + (to - from) * easeInOut(t) });
        if (t < 1) requestAnimationFrame(tick);
        else finish();
      };
      requestAnimationFrame(tick);
      setTimeout(finish, 260);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
