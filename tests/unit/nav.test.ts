// The teacher's class sections in the sidebar: which one is highlighted for each page.
import { describe, expect, it } from 'vitest';
import { CLASS_SECTIONS, classSectionActive } from '@/components/shell/nav';

const base = '/teacher/classes/c1';
const active = (pathname: string) => CLASS_SECTIONS.filter((s) => classSectionActive(pathname, base, s.path)).map((s) => s.label);

describe('classSectionActive', () => {
  it('highlights exactly one section per class page', () => {
    expect(active(base)).toEqual(['Weeks']);
    expect(active(`${base}/students`)).toEqual(['Students']);
    expect(active(`${base}/syllabus`)).toEqual(['Syllabus']);
    expect(active(`${base}/schedule`)).toEqual(['Schedule']);
  });

  it('counts every week page, and each piece of work, as Weeks', () => {
    expect(active(`${base}/weeks/3`)).toEqual(['Weeks']);
    expect(active(`${base}/work/a1`)).toEqual(['Weeks']);
    expect(active(`${base}/weeks/3/attendance`)).toEqual(['Weeks']);
  });

  it('highlights nothing for another class or the dashboard', () => {
    expect(active('/teacher/classes/c2')).toEqual([]);
    expect(active('/teacher/classes/c10/students')).toEqual([]);
    expect(active('/teacher')).toEqual([]);
  });
});
