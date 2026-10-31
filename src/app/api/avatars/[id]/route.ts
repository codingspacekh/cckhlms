import { openAvatar } from '@/modules/identity/avatar';
import { getActor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

// A profile picture (owner, 2026-10-31), for the person and the club's staff. The address carries the picture's key
// (?v=), so it can be cached by this browser only, for a long time.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const a = await openAvatar(await getActor(request.headers), id);
    return new Response(new Uint8Array(a.data), {
      headers: {
        'Content-Type': a.contentType,
        'Content-Length': String(a.data.byteLength),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return new Response('Not found', { status: 404 });
    throw e;
  }
}
