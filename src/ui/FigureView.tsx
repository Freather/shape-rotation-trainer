import type { Figure } from '../engine/question';
import { SolidSvg } from '../render/SolidSvg';
import { NetSvg } from '../render/NetSvg';
import { RadialSvg } from '../render/RadialSvg';
import { faceHeadOn } from '../render/project';
import { Glyph } from '../render/Glyph';
import { getSymbol } from '../symbols/library';
import { useSettings } from '../store';
import { Parts } from './Parts';
import type { AxisMark } from '../render/AxisMarks';

export function FigureView({ fig, size = 150, marks }: { fig: Figure; size?: number; marks?: AxisMark[] }) {
  const mono = useSettings((s) => s.mono);
  switch (fig.kind) {
    case 'solid':
      return (
        <figure className="fig">
          <SolidSvg look={fig.look} size={size} marks={marks} />
          {fig.caption && <figcaption>{fig.caption}</figcaption>}
        </figure>
      );
    case 'net':
      return (
        <figure className="fig">
          <NetSvg solidId={fig.solidId} edges={fig.edges} root={fig.root} labeling={fig.labeling} mark={fig.mark} rootLabel={fig.rootLabel} size={size * 1.35} />
        </figure>
      );
    case 'radial':
      return (
        <figure className="fig">
          <RadialSvg shape={fig.shape} cells={fig.cells} size={size} />
          {fig.caption && <figcaption>{fig.caption}</figcaption>}
        </figure>
      );
    case 'face': {
      const { pts, matrix } = faceHeadOn(fig.solidId, fig.slot, fig.look.rot, fig.look.flip);
      const v = 1.35;
      return (
        <figure className="fig">
          <svg width={size * 0.7} height={size * 0.7} viewBox={`${-v} ${-v} ${v * 2} ${v * 2}`}>
            <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={mono ? '#fff' : getSymbol(fig.look.symbol).color} stroke="#222" strokeWidth={0.04} />
            <g transform={`matrix(${matrix.join(' ')})`}>
              <Glyph id={fig.look.symbol} />
            </g>
          </svg>
        </figure>
      );
    }
    case 'symbol':
      return (
        <figure className="fig">
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 100 100">
            <rect x={3} y={3} width={94} height={94} rx={8} fill={mono ? '#fff' : getSymbol(fig.symbol).color} stroke="#222" strokeWidth={3} />
            <g transform="translate(12 12) scale(0.76)">
              <Glyph id={fig.symbol} />
            </g>
          </svg>
        </figure>
      );
    case 'text':
      return (
        <div className="fig-text">
          <Parts parts={fig.parts} />
        </div>
      );
    case 'ox':
      return <div className="fig-ox">{fig.value ? 'O 될 수 있다' : 'X 될 수 없다'}</div>;
  }
}
