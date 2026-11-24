// 앱 상태 (zustand). 설정·풀이 기록·오답노트는 localStorage에 저장 → 새로고침해도 유지.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MistakeTag, QType } from './engine/question';
import type { SolidId } from './engine/solids';
import type { Family } from './engine/radial/model';
import { generateBlockRuleSet, generateRadialRuleSet, generateSolidRuleSet, type RuleSet } from './engine/rules';

export interface Settings {
  mono: boolean;
  timePerQuestion: number;
  timerMode: 'perQuestion' | 'total';
  totalTime: number;
  /** 규칙 설명 페이지 제한 시간(초), 0 = 없음 */
  ruleTimer: number;
  allowRuleReviewInExam: boolean;
  allowMirrorRules: boolean;
  examCount: number;
  /** 하루 목표 문제 수 */
  dailyGoal: number;
  /** 매일 알림 시각 HH:MM */
  reminderTime: string;
  /** 사이트를 열어 두었을 때 브라우저 알림 */
  notifyOn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mono: true,
  timePerQuestion: 40,
  timerMode: 'perQuestion',
  totalTime: 600,
  ruleTimer: 0,
  allowRuleReviewInExam: false,
  allowMirrorRules: false,
  examCount: 15,
  dailyGoal: 20,
  reminderTime: '20:00',
  notifyOn: false,
};

interface SettingsState extends Settings {
  set: (p: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (p) => set(p),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    { name: 'srt-settings-v2' },
  ),
);

/** 규칙 세트를 다시 만들 수 있는 값 */
export type SetParams =
  | { kind: 'solid'; level: number; seed: number; solidId?: SolidId; allowMirror?: boolean }
  | { kind: 'radial'; level: number; seed: number; family?: Family }
  | { kind: 'block'; level: number; seed: number };

export const buildRuleSet = (p: SetParams): RuleSet =>
  p.kind === 'solid'
    ? generateSolidRuleSet(p.level, p.seed, { solidId: p.solidId, allowMirror: p.allowMirror })
    : p.kind === 'block'
      ? generateBlockRuleSet(p.level, p.seed)
      : generateRadialRuleSet(p.level, p.seed, p.family);

export interface AnswerRecord {
  ts: number;
  type: QType;
  level: number;
  solidId?: SolidId;
  correct: boolean;
  timeMs: number;
  tag: MistakeTag;
  mode: 'practice' | 'exam';
}

export interface WrongNote {
  id: string;
  ts: number;
  type: QType;
  level: number;
  seed: number;
  solidId?: SolidId;
  setParams?: SetParams;
  tag: MistakeTag;
  retried?: number;
  solvedOnRetry?: boolean;
}

interface RecordState {
  answers: AnswerRecord[];
  wrong: WrongNote[];
  addAnswer: (a: AnswerRecord) => void;
  addWrong: (w: Omit<WrongNote, 'id' | 'ts'>) => void;
  removeWrong: (id: string) => void;
  markRetry: (id: string, ok: boolean) => void;
  clearAll: () => void;
}

export const useRecords = create<RecordState>()(
  persist(
    (set) => ({
      answers: [],
      wrong: [],
      addAnswer: (a) => set((s) => ({ answers: [...s.answers, a].slice(-3000) })),
      addWrong: (w) =>
        set((s) => {
          const dup = s.wrong.find((x) => x.type === w.type && x.seed === w.seed && x.level === w.level);
          if (dup) return { wrong: s.wrong.map((x) => (x === dup ? { ...x, ts: Date.now(), tag: w.tag } : x)) };
          return { wrong: [{ ...w, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now() }, ...s.wrong].slice(0, 500) };
        }),
      removeWrong: (id) => set((s) => ({ wrong: s.wrong.filter((w) => w.id !== id) })),
      markRetry: (id, ok) =>
        set((s) => ({ wrong: s.wrong.map((w) => (w.id === id ? { ...w, retried: (w.retried ?? 0) + 1, solvedOnRetry: ok } : w)) })),
      clearAll: () => set({ answers: [], wrong: [] }),
    }),
    { name: 'srt-records' },
  ),
);
