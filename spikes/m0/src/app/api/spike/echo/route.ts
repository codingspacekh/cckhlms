// Test-only endpoint: records what a request from the student preview looked like (origin, cookie).
// Mutating LMS routes refuse any Origin other than the LMS, as Server Actions and our auth hook do.
type Seen = { origin: string; hadCookie: boolean; status: number };
const store = globalThis as unknown as { __seen?: Seen[] };
const seen = (store.__seen ??= []);
const LMS_ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://lms.localhost:3101';

export async function POST(req: Request) {
  const origin = req.headers.get('origin') ?? '(none)';
  const status = origin === LMS_ORIGIN ? 200 : 403;
  seen.push({ origin, hadCookie: (req.headers.get('cookie') ?? '').includes('lms_probe='), status });
  return new Response(status === 200 ? 'ok' : 'forbidden', { status });
}
export function GET() {
  return Response.json(seen);
}
export function DELETE() {
  seen.length = 0;
  return new Response(null, { status: 204 });
}
