import { getSymbol } from '../symbols/library';
import { useSettings } from '../store';
import { net2D } from '../engine/net';
import type { Labeling } from '../engine/state';
import type { SolidId } from '../engine/solids';
import { symbolWorldSize, symbolMatrix } from './project';
import { Glyph } from './Glyph';

/** 평면 전개도 그림 (3D 렌더 없이 엔진의 2D 좌표로 그림) */
export function NetSvg({
  solidId,
  edges,
  root,
  labeling,
  mark,
  rootLabel,
  size = 220,
  forceColor,
}: {
  solidId: SolidId;
  edges: number[];
  root: number;
  labeling: Labeling;
  mark?: number;
  rootLabel?: boolean;
  size?: number;
  /** 흑백 설정과 상관없이 면 색을 칠함 */
  forceColor?: boolean;
}) {
  const mono = useSettings((s) => s.mono) && !forceColor;
  const net = net2D(solidId, edges, root, labeling);
  const pad = 0.15;
  const w = net.maxX - net.minX + pad * 2;
  const h = net.maxY - net.minY + pad * 2;
  const vb = `${net.minX - pad} ${-net.maxY - pad} ${w} ${h}`;
  const symSize = symbolWorldSize(solidId);
  const scale = size / Math.max(w, h);
  return (
    <svg width={w * scale} height={h * scale} viewBox={vb} className="net-svg">
      {net.faces.map((f) => {
        const pts = f.pts.map(([x, y]) => `${x},${-y}`).join(' ');
        const m = symbolMatrix([f.center[0], -f.center[1]], [f.right[0], -f.right[1]], [f.up[0], -f.up[1]], symSize);
        const fill = mono ? '#fff' : getSymbol(labeling[f.id].symbol).color;
        return (
          <g key={f.id}>
            <polygon points={pts} fill={fill} stroke="#222" strokeWidth={mark === f.id ? 0.12 : 0.035} strokeLinejoin="round" />
            <g transform={`matrix(${m.join(' ')})`}>
              <Glyph id={labeling[f.id].symbol} />
            </g>
            {rootLabel && f.id === root && (
              <text x={f.center[0]} y={-f.center[1] + symSize * 0.62} fontSize={symSize * 0.22} textAnchor="middle" fill="#c92a2a" fontWeight={700}>
                앞
              </text>
            )}
          </g>
        );
      })}
      {net.folds.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke="#888" strokeWidth={0.025} strokeDasharray="0.08 0.06" />
      ))}
    </svg>
  );
}
