// 면/칸에 그릴 기호. 외부 이미지 없이 SVG path 또는 글자로 직접 그린다.
// 좌표계: 100×100 상자, 중심 (50,50), 위쪽 = y가 작은 쪽.
//
// 모든 기호는 "회전 대칭이 없음"(돌리면 반드시 달라 보임).
// chiral=false 인 기호는 세로축 기준 좌우 대칭(거울에 비춰도 같음) → 거울 구분 불가.
// chiral=true 인 기호는 좌우 반전하면 달라짐 → 거울상 오답을 만들 수 있다.

export interface SymbolPart {
  d: string;
  mode: 'fill' | 'stroke';
}

export interface SymbolDef {
  id: string;
  name: string;
  chiral: boolean;
  /** 회전 대칭 차수 (1 = 대칭 없음). 1이 아니면 문제에 쓰지 않는다. */
  rotationalOrder: number;
  parts?: SymbolPart[];
  text?: string;
  color: string;
}

const P = (d: string, mode: 'fill' | 'stroke' = 'fill'): SymbolPart => ({ d, mode });

export const SYMBOLS: SymbolDef[] = [
  {
    id: 'arrow', name: '화살표', chiral: false, rotationalOrder: 1, color: '#ffd8a8',
    parts: [P('M50 10 L80 44 L61 44 L61 88 L39 88 L39 44 L20 44 Z')],
  },
  {
    id: 'flag', name: '깃발', chiral: true, rotationalOrder: 1, color: '#c5f6fa',
    parts: [P('M28 12 h9 v78 h-9 Z M37 14 L80 30 L37 48 Z')],
  },
  {
    id: 'ell', name: 'ㄴ자', chiral: true, rotationalOrder: 1, color: '#d3f9d8',
    parts: [P('M24 14 h18 v54 h36 v18 h-54 Z')],
  },
  {
    id: 'halfdisc', name: '반달', chiral: false, rotationalOrder: 1, color: '#e5dbff',
    parts: [P('M14 52 A36 36 0 0 1 86 52 Z'), P('M50 16 A36 36 0 1 1 49.9 16 Z', 'stroke')],
  },
  {
    id: 'rtri', name: '직각삼각형', chiral: true, rotationalOrder: 1, color: '#ffc9c9',
    parts: [P('M22 86 L22 16 L66 86 Z')],
  },
  {
    id: 'cornerbox', name: '모서리칸', chiral: true, rotationalOrder: 1, color: '#fff3bf',
    parts: [P('M16 16 h68 v68 h-68 Z', 'stroke'), P('M16 16 h36 v24 h-36 Z')],
  },
  {
    id: 'house', name: '집', chiral: false, rotationalOrder: 1, color: '#d0ebff',
    parts: [P('M50 12 L86 46 L74 46 L74 88 L26 88 L26 46 L14 46 Z')],
  },
  {
    id: 'hook', name: '갈고리', chiral: true, rotationalOrder: 1, color: '#ffdeeb',
    parts: [P('M30 88 V30 A20 20 0 0 1 70 30 V48 H54 V30 A4 4 0 0 0 46 30 V88 Z')],
  },
  ...(
    [
      ['F', true], ['G', true], ['J', true], ['P', true], ['R', true], ['Q', true],
      ['2', true], ['4', true], ['5', true], ['7', true],
      ['ㄱ', true], ['ㅋ', true], ['ㅌ', true],
      ['A', false], ['T', false], ['Y', false], ['V', false],
    ] as const
  ).map(([t, chiral], i): SymbolDef => ({
    id: `t_${t}`,
    name: t,
    chiral,
    rotationalOrder: 1,
    text: t,
    color: ['#ffe8cc', '#e3fafc', '#ebfbee', '#f3f0ff', '#fff0f6', '#fff9db', '#e7f5ff', '#f8f0fc'][i % 8],
  })),
];

export const SYMBOL_MAP: Record<string, SymbolDef> = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

export const getSymbol = (id: string): SymbolDef => {
  const s = SYMBOL_MAP[id];
  if (!s) throw new Error(`없는 기호: ${id}`);
  return s;
};

/** 문제에 쓸 수 있는 기호 (회전 대칭 없는 것만) */
export const USABLE_SYMBOLS = SYMBOLS.filter((s) => s.rotationalOrder === 1);

/** 칸이 작은 평면 도형에 쓰기 좋은 굵은 기호 */
export const RADIAL_SYMBOLS = ['arrow', 'flag', 'ell', 'rtri', 'house', 't_F', 't_R', 't_ㄱ', 't_J', 'halfdisc'];
