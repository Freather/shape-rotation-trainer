import { describe, expect, it } from 'vitest';
import { addDays, currentStreak, dailyIcs, dayKey, googleCalendarUrl, longestStreak, nextStart, summarizeByDay } from '../daily';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('매일 기록', () => {
  it('날짜별로 묶기', () => {
    const s = summarizeByDay([
      { ts: at(2026, 11, 20, 9), correct: true, timeMs: 1000 },
      { ts: at(2026, 11, 20, 23), correct: false, timeMs: 3000 },
      { ts: at(2026, 11, 21, 0), correct: true, timeMs: 2000 },
    ]);
    expect(s.get('2026-11-20')).toEqual({ day: '2026-11-20', count: 2, correct: 1, timeMs: 4000 });
    expect(s.get('2026-11-21')?.count).toBe(1);
  });

  it('날짜 더하기는 달·해를 넘어감', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });

  it('연속 일수: 오늘 안 했으면 어제까지 센다, 하루 빠지면 끊김', () => {
    const days = new Set(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-17']);
    expect(currentStreak(days, '2026-11-21')).toBe(3);
    expect(currentStreak(days, '2026-11-22')).toBe(3);
    expect(currentStreak(days, '2026-11-23')).toBe(0);
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak(new Set())).toBe(0);
  });

  it('알림 시각: 지났으면 내일, 아니면 오늘', () => {
    const now = new Date(2026, 10, 23, 21, 0);
    expect(nextStart('20:00', now).getDate()).toBe(24);
    expect(nextStart('22:30', now).getDate()).toBe(23);
  });

  it('캘린더 파일과 구글 캘린더 주소에 매일 반복과 시간이 들어감', () => {
    const now = new Date(2026, 10, 23, 9, 0);
    const ics = dailyIcs('20:00', 20, now);
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('DTSTART:20261123T200000');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
    const url = googleCalendarUrl('20:00', 20, now);
    expect(url).toContain('recur=RRULE%3AFREQ%3DDAILY');
    expect(url).toContain('20261123T200000%2F20261123T202000');
  });
});
