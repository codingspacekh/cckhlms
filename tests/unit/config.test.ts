// NFR-05: the production server refuses to start with settings that would make it unsafe.
import { describe, expect, it } from 'vitest';
import { configProblems } from '@/server/config';

const GOOD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://lms:pw@db:5432/lms',
  BETTER_AUTH_URL: 'https://lms.cckh.dev',
  BETTER_AUTH_SECRET: 'Zq3v8mK1xR7tY2pL9wN4cB6hJ0sD5fG8',
  PREVIEW_ORIGIN: 'https://preview.cckh.dev',
};

describe('configProblems', () => {
  it('accepts a complete production configuration', () => {
    expect(configProblems(GOOD)).toEqual([]);
  });

  it('checks nothing outside production (dev and tests use local defaults)', () => {
    expect(configProblems({ NODE_ENV: 'development' })).toEqual([]);
    expect(configProblems({ NODE_ENV: 'test' })).toEqual([]);
  });

  it('needs every setting', () => {
    expect(configProblems({ NODE_ENV: 'production' })).toEqual([
      'DATABASE_URL is not set.',
      'BETTER_AUTH_URL is not set.',
      'BETTER_AUTH_SECRET must be at least 32 characters.',
      'PREVIEW_ORIGIN is not set.',
    ]);
  });

  it('refuses a short secret or the example one', () => {
    expect(configProblems({ ...GOOD, BETTER_AUTH_SECRET: 'too-short' })).toEqual(['BETTER_AUTH_SECRET must be at least 32 characters.']);
    expect(configProblems({ ...GOOD, BETTER_AUTH_SECRET: 'change-me-to-32-or-more-random-characters' })).toEqual([
      'BETTER_AUTH_SECRET is still the example value. Generate one with: openssl rand -hex 32',
    ]);
  });

  it('needs https, except on this computer (the e2e tests run a production build on lms.localhost)', () => {
    expect(configProblems({ ...GOOD, BETTER_AUTH_URL: 'http://lms.cckh.dev' })).toEqual(['BETTER_AUTH_URL must use https.']);
    expect(configProblems({ ...GOOD, PREVIEW_ORIGIN: 'http://preview.cckh.dev' })).toEqual(['PREVIEW_ORIGIN must use https.']);
    expect(
      configProblems({ ...GOOD, BETTER_AUTH_URL: 'http://lms.localhost:3100', PREVIEW_ORIGIN: 'http://preview.localhost:3102' }),
    ).toEqual([]);
  });

  it('keeps the preview on its own origin (ADR 0001)', () => {
    expect(configProblems({ ...GOOD, PREVIEW_ORIGIN: 'https://lms.cckh.dev' })).toEqual([
      'PREVIEW_ORIGIN must be a different site from BETTER_AUTH_URL, so student pages can’t reach the LMS.',
    ]);
  });

  it('reports a value that isn’t a URL', () => {
    expect(configProblems({ ...GOOD, BETTER_AUTH_URL: 'lms.cckh.dev' })).toEqual(['BETTER_AUTH_URL is not a valid URL.']);
  });
});
