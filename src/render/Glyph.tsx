// 기호 하나를 100×100 상자 좌표계로 그리는 SVG 조각
import { getSymbol } from '../symbols/library';

export function Glyph({ id, color = '#111', halo }: { id: string; color?: string; halo?: string }) {
  const s = getSymbol(id);
  if (s.text) {
    const t = (
      <text
        x={50}
        y={52}
        fontSize={78}
        fontWeight={900}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        stroke={halo}
        strokeWidth={halo ? 6 : 0}
        paintOrder="stroke"
        fontFamily="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif"
        style={{ userSelect: 'none' }}
      >
        {s.text}
      </text>
    );
    return s.underline ? (
      <g>
        {t}
        <rect x={32} y={90} width={36} height={7} fill={color} />
      </g>
    ) : (
      t
    );
  }
  // 웃는 얼굴: 얼굴은 그림 색으로 채우고 눈·입은 반대 색. 검은 그림이면 검은 얼굴에 흰 눈, 흰 그림이면 흰 얼굴에 검은 눈
  if (id === 'smile') {
    const line = halo ?? '#111';
    const feat = halo ?? '#fff';
    return (
      <g>
        <circle cx={50} cy={50} r={38} fill={color} stroke={line} strokeWidth={halo ? 6 : 0} />
        <circle cx={38} cy={40} r={7} fill={feat} />
        <circle cx={62} cy={40} r={7} fill={feat} />
        <path d="M29 56 Q50 82 71 56" fill="none" stroke={feat} strokeWidth={7} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      {s.parts!.map((p, i) =>
        p.mode === 'fill' ? (
          <path key={i} d={p.d} fill={color} stroke={halo} strokeWidth={halo ? 6 : 0} paintOrder="stroke" strokeLinejoin="round" />
        ) : (
          <g key={i}>
            {halo && <path d={p.d} fill="none" stroke={halo} strokeWidth={12} strokeLinejoin="round" />}
            <path d={p.d} fill="none" stroke={color} strokeWidth={6} />
          </g>
        ),
      )}
    </g>
  );
}

/** 글 속에 넣는 작은 기호 아이콘 */
export function InlineGlyph({ id, size = 20 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ verticalAlign: 'middle', display: 'inline-block' }}>
      <rect x={2} y={2} width={96} height={96} rx={14} fill="#fff" stroke="#999" strokeWidth={4} />
      <g transform="translate(10 10) scale(0.8)">
        <Glyph id={id} />
      </g>
    </svg>
  );
}
