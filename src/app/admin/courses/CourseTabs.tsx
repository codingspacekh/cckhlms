import Link from 'next/link';

// Courses and the languages they're taught in (M18a): two pages under Courses.
export function CourseTabs({ on }: { on: 'courses' | 'languages' }) {
  return (
    <nav className="tabs" aria-label="Courses and languages">
      <Link href="/admin/courses" aria-current={on === 'courses' ? 'page' : undefined}>
        Courses
      </Link>
      <Link href="/admin/courses/languages" aria-current={on === 'languages' ? 'page' : undefined}>
        Languages
      </Link>
    </nav>
  );
}
