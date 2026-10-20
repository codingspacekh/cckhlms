// What the production server needs from its environment (NFR-05). Checked once at start-up, so a missing or
// unsafe setting stops the deploy (the health check fails) instead of running an LMS with a guessable secret.
type Env = Record<string, string | undefined>;

const EXAMPLE_SECRET = 'change-me-to-32-or-more-random-characters'; // .env.example
const onThisComputer = (u: URL) => u.hostname === 'localhost' || u.hostname.endsWith('.localhost');

function checkUrl(name: string, value: string | undefined, problems: string[]): URL | null {
  if (!value) {
    problems.push(`${name} is not set.`);
    return null;
  }
  if (!URL.canParse(value)) {
    problems.push(`${name} is not a valid URL.`);
    return null;
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' && !onThisComputer(url)) problems.push(`${name} must use https.`);
  return url;
}

export function configProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set.');
  const lms = checkUrl('BETTER_AUTH_URL', env.BETTER_AUTH_URL, problems);
  const secret = env.BETTER_AUTH_SECRET ?? '';
  if (secret === EXAMPLE_SECRET) problems.push('BETTER_AUTH_SECRET is still the example value. Generate one with: openssl rand -hex 32');
  else if (secret.length < 32) problems.push('BETTER_AUTH_SECRET must be at least 32 characters.');
  const preview = checkUrl('PREVIEW_ORIGIN', env.PREVIEW_ORIGIN, problems);
  if (lms && preview && lms.origin === preview.origin)
    problems.push('PREVIEW_ORIGIN must be a different site from BETTER_AUTH_URL, so student pages can’t reach the LMS.');
  return problems;
}
