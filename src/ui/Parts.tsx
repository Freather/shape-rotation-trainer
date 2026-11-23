import type { TextPart } from '../engine/rotation';
import { InlineGlyph } from '../render/Glyph';

/** 문장 조각 렌더: 기호는 작은 그림으로 */
export function Parts({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className="inline-sym">
            <InlineGlyph id={p.symbol} />
          </span>
        ),
      )}
    </>
  );
}

/** 규칙 번호 배지 [1] (보기 번호 ①과 구분) */
export function RuleBadge({ id }: { id: number }) {
  return <span className="rule-badge">{id}</span>;
}
