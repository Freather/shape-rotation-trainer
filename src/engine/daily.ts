// 하루 단위 연습 기록: 날짜별 푼 문제 수·정답률·시간, 연속 연습 일수

export interface DailyAnswer {
  ts: number;
  correct: boolean;
  timeMs: number;
}

export interface DaySummary {
  day: string; // YYYY-MM-DD (기기 시간대 기준)
  count: number;
  correct: number;
  timeMs: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 기기 시간대 기준 날짜 키 */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 날짜 키에서 n일 더하기 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return dayKey(dt.getTime());
}

export function summarizeByDay(answers: DailyAnswer[]): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>();
  for (const a of answers) {
    const k = dayKey(a.ts);
    const s = map.get(k) ?? { day: k, count: 0, correct: 0, timeMs: 0 };
    s.count++;
    if (a.correct) s.correct++;
    s.timeMs += a.timeMs;
    map.set(k, s);
  }
  return map;
}

/**
 * 연속 연습 일수. 오늘 아직 안 했으면 어제까지 이어진 날수를 센다
 * (오늘 안 했다고 바로 0이 되지 않게).
 */
export function currentStreak(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestStreak(days: Set<string>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue; // 연속 구간의 시작만
    let n = 0;
    let x = d;
    while (days.has(x)) {
      n++;
      x = addDays(x, 1);
    }
    best = Math.max(best, n);
  }
  return best;
}

// ---------------- 캘린더 알림 ----------------

const SITE = 'https://freather.github.io/shape-rotation-trainer/';

/** 다음 알림 시각 (오늘 그 시간이 지났으면 내일, 기기 시간 기준) */
export function nextStart(time: string, now = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** 매일 반복되는 캘린더 일정 (.ics). 대부분의 캘린더 앱에서 열 수 있다 */
export function dailyIcs(time: string, minutes: number, now = new Date()): string {
  const start = nextStart(time, now);
  const utc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shape-rotation-trainer//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:srt-daily-${stamp(start)}@freather.github.io`,
    `DTSTAMP:${utc}`,
    `DTSTART:${stamp(start)}`,
    `DURATION:PT${minutes}M`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:도형추리 연습',
    `DESCRIPTION:오늘 연습할 시간이에요. ${SITE}`,
    `URL:${SITE}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:도형추리 연습할 시간이에요',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** 구글 캘린더 일정 추가 화면 주소 (매일 반복) */
export function googleCalendarUrl(time: string, minutes: number, now = new Date()): string {
  const start = nextStart(time, now);
  const end = new Date(start.getTime() + minutes * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: '도형추리 연습',
    details: `오늘 연습할 시간이에요. ${SITE}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    recur: 'RRULE:FREQ=DAILY',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export const SITE_URL = SITE;
