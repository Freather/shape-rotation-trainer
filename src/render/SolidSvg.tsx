import { getSymbol } from '../symbols/library';
import { useSettings } from '../store';
import type { Look } from '../engine/state';
import { drawsFromLook, type FaceDraw } from './project';
import { Glyph } from './Glyph';

const VIEW = 2.25;

export function FaceDrawsSvg({
  draws,
  size = 160,
  showBack = false,
  view = VIEW,
  onFaceClick,
}: {
  draws: FaceDraw[];
  size?: number;
  showBack?: boolean;
  view?: number;
  onFaceClick?: (face: number) => void;
}) {
  const mono = useSettings((s) => s.mono);
  return (
    <svg width={size} height={size} viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`} className="solid-svg">
      {draws.map((d) => {
        if (!d.facing && !showBack) {
          return (
            <polygon key={d.key} points={d.pts.map((p) => p.join(',')).join(' ')} fill="#d9d9d9" stroke="#555" strokeWidth={0.03} strokeLinejoin="round" />
          );
        }
        const fill = d.highlight ? '#ffe066' : mono ? '#ffffff' : getSymbol(d.symbol).color;
        return (
          <g key={d.key} onClick={onFaceClick ? () => onFaceClick(d.key) : undefined} style={onFaceClick ? { cursor: 'pointer' } : undefined}>
            <polygon points={d.pts.map((p) => p.join(',')).join(' ')} fill={fill} stroke="#222" strokeWidth={0.035} strokeLinejoin="round" />
            <g transform={`matrix(${d.matrix.join(' ')})`}>
              <Glyph id={d.symbol} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export function SolidSvg({ look, size = 160, highlightSlots }: { look: Look; size?: number; highlightSlots?: number[] }) {
  return <FaceDrawsSvg draws={drawsFromLook(look, highlightSlots)} size={size} />;
}
