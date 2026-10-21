// Development only: `next dev` prints http://localhost:3000, but sign-in only accepts the LMS's own origin.
import { describe, expect, it } from 'vitest';
import { devRedirect } from '@/proxy';

const LMS = 'http://lms.localhost:3000';
const to = (url: string, authUrl: string | undefined = LMS, mode: string | null = 'navigate') =>
  devRedirect(new URL(url), authUrl, mode)?.href ?? null;

describe('devRedirect', () => {
  it('sends localhost to the LMS address, keeping the path and query', () => {
    expect(to('http://localhost:3000/login?next=%2Fteacher')).toBe('http://lms.localhost:3000/login?next=%2Fteacher');
    expect(to('http://127.0.0.1:3000/')).toBe('http://lms.localhost:3000/');
    expect(to('http://[::1]:3000/student')).toBe('http://lms.localhost:3000/student');
  });

  it('leaves the LMS address alone', () => {
    expect(to('http://lms.localhost:3000/login')).toBeNull();
  });

  it('leaves other hosts alone, and does nothing without BETTER_AUTH_URL', () => {
    expect(to('http://192.168.1.20:3000/login')).toBeNull();
    expect(devRedirect(new URL('http://localhost:3000/login'), undefined, 'navigate')).toBeNull();
  });

  // After a Server Action redirects, Next fetches the new page from localhost itself. Sent to another host, that
  // fetch drops the cookie, the page renders signed out, and the student lands on /login and then their home page.
  it('only moves pages the browser opens, not Next’s own fetches', () => {
    expect(to('http://localhost:3000/student/playground/p1', LMS, 'cors')).toBeNull();
    expect(to('http://localhost:3000/student/playground/p1', LMS, null)).toBeNull();
  });
});
