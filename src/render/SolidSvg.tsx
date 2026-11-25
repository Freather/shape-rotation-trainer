import { getSymbol } from '../symbols/library';
import { useSettings } from '../store';
import type { Look } from '../engine/state';
import { drawsFromLook, type FaceDraw } from './project';
import { Glyph } from './Glyph';

import { AxisMarks, type AxisMark } from './AxisMarks';

const VIEW = 2.25;
/** 축 표시가 있을 때는 바깥 여백을 더 둔다 (도형 크기는 그대로) */
const MARK_VIEW = 2.9;

/** 면 방향에 따라 밝기가 다른 회색 (인쇄된 시험지 그림처럼) */
const grayFor = (shade: number) => `hsl(40 6% ${Math.round(78 + 22 * shade)}%)`;

export function FaceDrawsSvg({
  draws,
  size = 160,
  view = VIEW,
  onFaceClick,
  children,
}: {
  draws: FaceDraw[];
  children?: React.ReactNode;
  size?: number;
  view?: number;
  onFaceClick?: (face: number) => void;
}) {
  const color = useSettings((s) => !s.mono);
  const seeThrough = draws.some((d) => d.hidden);
  const ptsOf = (d: FaceDraw) => d.pts.map((p) => p.join(',')).join(' ');
  /** 면 바탕 (안쪽 면이면 회색) */
  const face = (d: FaceDraw, inner: boolean) => {
    if (!d.facing) return inner ? <polygon key={`b${d.key}`} points={ptsOf(d)} fill="#cfccc6" stroke="#333" strokeWidth={0.03} strokeLinejoin="round" /> : null;
    const fill = d.highlight ? '#ffd43b' : color ? getSymbol(d.symbol).color : grayFor(d.shade);
    return (
      <g key={`b${d.key}`} onClick={onFaceClick ? () => onFaceClick(d.key) : undefined} style={onFaceClick ? { cursor: 'pointer' } : undefined}>
        <polygon points={ptsOf(d)} fill={fill} />
        {color && !d.highlight && <polygon points={ptsOf(d)} fill="#000" opacity={(1 - d.shade) * 0.18} />}
      </g>
    );
  };
  /** 면 위 그림과 테두리 */
  const top = (d: FaceDraw) => (
    <g key={`t${d.key}`} style={{ pointerEvents: 'none' }}>
      <g transform={`matrix(${d.matrix.join(' ')})`}>
        <Glyph id={d.symbol} />
      </g>
      <polygon points={ptsOf(d)} fill="none" stroke="#111" strokeWidth={0.04} strokeLinejoin="round" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`} className="solid-svg">
      {seeThrough ? (
        <>
          {draws.map((d) => (d.hidden ? null : face(d, false)))}
          {/* 뒤에 숨은 면: 비쳐 보이듯 흐린 그림과 점선 */}
          {draws
            .filter((d) => d.hidden)
            .map((d) => (
              <g key={`h${d.key}`}>
                <g transform={`matrix(${d.matrix.join(' ')})`} opacity={0.3}>
                  <Glyph id={d.symbol} />
                </g>
                <polygon points={ptsOf(d)} fill="none" stroke="#555" strokeWidth={0.028} strokeDasharray="0.09 0.07" strokeLinejoin="round" />
              </g>
            ))}
          {draws.filter((d) => !d.hidden).map((d) => top(d))}
        </>
      ) : (
        draws.map((d) => (
          <g key={d.key}>
            {face(d, true)}
            {d.facing && top(d)}
          </g>
        ))
      )}
      {children}
    </svg>
  );
}

export function SolidSvg({ look, size = 160, highlightSlots, marks, seeThrough }: { look: Look; size?: number; highlightSlots?: number[]; marks?: AxisMark[]; seeThrough?: boolean }) {
  return (
    <FaceDrawsSvg draws={drawsFromLook(look, highlightSlots, undefined, seeThrough)} size={marks?.length ? Math.round((size * MARK_VIEW) / VIEW) : size} view={marks?.length ? MARK_VIEW : VIEW}>
      {marks?.length ? <AxisMarks marks={marks} /> : null}
    </FaceDrawsSvg>
  );
}
