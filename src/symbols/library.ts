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
  /** 전개도 모음에만 쓰는 숫자 (문제에는 안 씀) */
  noQuiz?: boolean;
  /** 돌리면 다른 숫자처럼 보이는 글자(6)는 밑줄로 위아래를 표시 */
  underline?: boolean;
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
    id: 'heart', name: '하트', chiral: false, rotationalOrder: 1, color: '#ffd6e0',
    parts: [P('M50 88 C22 66 10 50 12 34 C14 18 34 10 50 28 C66 10 86 18 88 34 C90 50 78 66 50 88 Z')],
  },
  {
    // 오각별은 72°마다 같아 보인다 → 오각형 면(정십이면체)에는 쓰지 않는다
    id: 'star', name: '별', chiral: false, rotationalOrder: 5, color: '#ffec99',
    parts: [P('M50.0 12.0 L60.0 40.2 L89.9 41.0 L66.2 59.3 L74.7 88.0 L50.0 71.0 L25.3 88.0 L33.8 59.3 L10.1 41.0 L40.0 40.2 Z')],
  },
  {
    id: 'smile', name: '웃는 얼굴', chiral: false, rotationalOrder: 1, color: '#c3fae8',
    parts: [
      P('M50 13 A37 37 0 1 1 49.9 13 Z', 'stroke'),
      P('M38 33 A7 7 0 1 1 37.9 33 Z M62 33 A7 7 0 1 1 61.9 33 Z'),
      P('M28 56 Q50 84 72 56', 'stroke'),
    ],
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

// 전개도 모음용 숫자: 마주 보는 면끼리 같은 색 (정육면체는 합이 7, 정팔면체는 합이 9)
const PAIR_COLORS = ['#ffd8a8', '#c5f6fa', '#d3f9d8', '#e5dbff'];
for (const [prefix, n] of [['c', 6], ['o', 8]] as const)
  for (let k = 1; k <= n; k++)
    SYMBOLS.push({ id: `${prefix}_${k}`, name: String(k), chiral: true, rotationalOrder: 1, text: String(k), color: PAIR_COLORS[Math.min(k, n + 1 - k) - 1], noQuiz: true, underline: k === 6 || k === 9 });

export const SYMBOL_MAP: Record<string, SymbolDef> = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

export const getSymbol = (id: string): SymbolDef => {
  const s = SYMBOL_MAP[id];
  if (!s) throw new Error(`없는 기호: ${id}`);
  return s;
};

/** 문제에 쓸 수 있는 기호 (회전 대칭 없는 것만) */
export const USABLE_SYMBOLS = SYMBOLS.filter((s) => s.rotationalOrder === 1 && !s.noQuiz);

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** 면이 n각형일 때 쓸 수 있는 기호: 면 회전(360/n 단위)으로 돌려도 같아 보이는 일이 없는 것 */
export const symbolsForSides = (n: number) => SYMBOLS.filter((s) => gcd(s.rotationalOrder, n) === 1 && !s.noQuiz);

/** 시험에 흔히 나오는 그림: 자주 섞이게 한다 */
export const COMMON_SYMBOLS = ['heart', 'star', 'smile'];

/** 돌리면 서로 비슷해 보이는 그림 묶음: 한 문제에 같은 묶음에서 둘 이상 쓰지 않는다 */
export const LOOKALIKE_GROUPS: string[][] = [
  ['arrow', 'house'], // 화살표와 오각형 집은 돌리면 둘 다 화살표처럼 보임
  ['ell', 't_ㄱ', 't_7'], // ㄴ자, ㄱ, 7은 돌리면 같은 꺾쇠
  ['t_A', 't_V'], // A를 뒤집으면 V
  ['t_J', 'hook'], // 갈고리 모양
  ['flag', 'rtri'], // 깃발과 직각삼각형
];

/**
 * 기호 순서 정하기: 흔한 그림(하트·별·웃는 얼굴)은 각각 확률 60%로 앞에 오고,
 * 비슷해 보이는 묶음에서는 하나만 남긴다. shuffled는 이미 섞인 목록.
 */
export function arrangeSymbols(shuffled: string[], chance: (p: number) => boolean): string[] {
  const common = shuffled.filter((id) => COMMON_SYMBOLS.includes(id) && chance(0.6));
  const ordered = [...common, ...shuffled.filter((id) => !common.includes(id))];
  const usedGroups = new Set<number>();
  return ordered.filter((id) => {
    const g = LOOKALIKE_GROUPS.findIndex((grp) => grp.includes(id));
    if (g < 0) return true;
    if (usedGroups.has(g)) return false;
    usedGroups.add(g);
    return true;
  });
}

/** 칸이 작은 평면 도형에 쓰기 좋은 굵은 기호 */
export const RADIAL_SYMBOLS = ['arrow', 'flag', 'ell', 'rtri', 'house', 't_F', 't_R', 't_ㄱ', 't_J', 'halfdisc', 'heart', 'star', 'smile'];
