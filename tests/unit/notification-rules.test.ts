// FR-STU-09 · FR-SYS-01 · ADR-08: notifications are worked out from what happened, when they're read. These rules
// decide what counts, what it says, and in what order.
import { describe, expect, it } from 'vitest';
import {
  DUE_SOON_HOURS,
  dueSoonAt,
  isDueSoon,
  lessonShownAt,
  snippet,
  sortFeed,
  WINDOW_DAYS,
  type Notification,
} from '@/modules/notifications/rules';

const at = (iso: string) => new Date(iso);
const H = 3_600_000;

describe('when a lesson is shown', () => {
  it('is when it was published, or its scheduled time if that is later', () => {
    expect(lessonShownAt({ publishedAt: at('2027-01-09T03:00:00Z'), publishAt: null })).toEqual(at('2027-01-09T03:00:00Z'));
    expect(lessonShownAt({ publishedAt: at('2027-01-09T03:00:00Z'), publishAt: at('2027-01-09T04:30:00Z') })).toEqual(
      at('2027-01-09T04:30:00Z'),
    );
    expect(lessonShownAt({ publishedAt: at('2027-01-09T05:00:00Z'), publishAt: at('2027-01-09T04:30:00Z') })).toEqual(
      at('2027-01-09T05:00:00Z'),
    );
    expect(lessonShownAt({ publishedAt: null, publishAt: null })).toBeNull();
  });
});

describe('due soon', () => {
  const due = at('2027-01-16T02:00:00Z');
  const open = { due, language: 'python' as const, handedIn: false, excused: false };

  it(`starts ${DUE_SOON_HOURS} hours before the work is due and ends when it is due`, () => {
    expect(isDueSoon(open, new Date(due.getTime() - DUE_SOON_HOURS * H - 1))).toBe(false);
    expect(isDueSoon(open, new Date(due.getTime() - DUE_SOON_HOURS * H))).toBe(true);
    expect(isDueSoon(open, new Date(due.getTime() - 1))).toBe(true);
    expect(isDueSoon(open, due)).toBe(false);
    expect(dueSoonAt(open)).toEqual(new Date(due.getTime() - DUE_SOON_HOURS * H));
  });

  it('is not for work already handed in, excused, done on paper, or with no due date', () => {
    const now = new Date(due.getTime() - H);
    expect(isDueSoon({ ...open, handedIn: true }, now)).toBe(false);
    expect(isDueSoon({ ...open, excused: true }, now)).toBe(false);
    expect(isDueSoon({ ...open, language: 'paper' }, now)).toBe(false);
    expect(isDueSoon({ ...open, due: null }, now)).toBe(false);
  });
});

describe('the feed', () => {
  const n = (id: string, iso: string): Notification => ({
    id,
    kind: 'lesson',
    at: at(iso),
    title: id,
    detail: '',
    href: '/',
    className: 'Python Level 1 · Sat 09:00',
  });

  it(`shows the newest first, at most 50, from the last ${WINDOW_DAYS} days`, () => {
    const now = at('2027-02-01T00:00:00Z');
    const items = [
      n('old', '2027-01-10T00:00:00Z'),
      n('b', '2027-01-30T00:00:00Z'),
      n('a', '2027-01-31T00:00:00Z'),
      n('later', '2027-02-02T00:00:00Z'),
    ];
    expect(sortFeed(items, now).map((x) => x.id)).toEqual(['a', 'b']);
    const many = Array.from({ length: 60 }, (_, i) => n(`x${i}`, new Date(now.getTime() - (i + 1) * 60_000).toISOString()));
    expect(sortFeed(many, now)).toHaveLength(50);
  });

  it('keeps one of each, by id', () => {
    const now = at('2027-02-01T00:00:00Z');
    expect(sortFeed([n('a', '2027-01-31T00:00:00Z'), n('a', '2027-01-31T00:00:00Z')], now)).toHaveLength(1);
  });
});

describe('snippet', () => {
  it('puts the start of a question on one line', () => {
    expect(snippet('Why does\n  `range(5)` stop at 4?')).toBe('Why does `range(5)` stop at 4?');
    expect(snippet('x'.repeat(100))).toBe(`${'x'.repeat(79)}…`);
  });
});
