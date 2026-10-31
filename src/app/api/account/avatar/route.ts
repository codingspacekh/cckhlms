import { revalidatePath } from 'next/cache';
import { MAX_AVATAR_BYTES } from '@/lib/avatar';
import { setAvatar } from '@/modules/identity/avatar';
import { getActor } from '@/server/actor';
import { LMS_ORIGIN } from '@/server/auth';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

// Sets the signed-in person's profile picture (owner, 2026-10-31): `picture`, up to 5 MB. Like attachments, the caller
// and the size are checked before the body is read.
export async function POST(request: Request) {
  if (request.headers.get('origin') !== LMS_ORIGIN) return fail('Request not allowed from this site.', 403);
  const actor = await getActor(request.headers);
  if (!actor) return fail('Please sign in again.', 401);
  const length = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length)) return fail('Send the picture as a normal upload.', 411);
  if (length > MAX_AVATAR_BYTES + 64 * 1024) return fail('That picture is bigger than 5 MB.', 413);
  const picture = (await request.formData()).get('picture');
  if (!(picture instanceof Blob)) return fail('Choose a picture.');
  try {
    await setAvatar(actor, new Uint8Array(await picture.arrayBuffer()));
    revalidatePath('/', 'layout');
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message);
    if (e instanceof ForbiddenError) return fail(e.message, 403);
    throw e;
  }
}
