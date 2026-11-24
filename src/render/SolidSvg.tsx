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
  return (
    <svg width={size} height={size} viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`} className="solid-svg">
      {draws.map((d) => {
        const pts = d.pts.map((p) => p.join(',')).join(' ');
        if (!d.facing) {
          return <polygon key={d.key} points={pts} fill="#cfccc6" stroke="#333" strokeWidth={0.03} strokeLinejoin="round" />;
        }
        const fill = d.highlight ? '#ffd43b' : color ? getSymbol(d.symbol).color : grayFor(d.shade);
        return (
          <g key={d.key} onClick={onFaceClick ? () => onFaceClick(d.key) : undefined} style={onFaceClick ? { cursor: 'pointer' } : undefined}>
            <polygon points={pts} fill={fill} />
            {color && !d.highlight && <polygon points={pts} fill="#000" opacity={(1 - d.shade) * 0.18} />}
            <g transform={`matrix(${d.matrix.join(' ')})`}>
              <Glyph id={d.symbol} />
            </g>
            <polygon points={pts} fill="none" stroke="#111" strokeWidth={0.04} strokeLinejoin="round" />
          </g>
        );
      })}
      {children}
    </svg>
  );
}

export function SolidSvg({ look, size = 160, highlightSlots, marks }: { look: Look; size?: number; highlightSlots?: number[]; marks?: AxisMark[] }) {
  return (
    <FaceDrawsSvg draws={drawsFromLook(look, highlightSlots)} size={marks?.length ? Math.round((size * MARK_VIEW) / VIEW) : size} view={marks?.length ? MARK_VIEW : VIEW}>
      {marks?.length ? <AxisMarks marks={marks} /> : null}
    </FaceDrawsSvg>
  );
}
