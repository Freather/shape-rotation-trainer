// 시드 기반 난수 (같은 seed → 같은 문제 재현)

export interface Rng {
  next(): number;
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
  range(a: number, b: number): number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (arr) => arr[int(arr.length)],
    shuffle: (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    chance: (p) => next() < p,
    range: (a, b) => a + int(b - a + 1),
  };
}

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);
