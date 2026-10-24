import { revalidatePath } from 'next/cache';
import { addAttachment } from '@/modules/teaching/attachments';
import { MAX_ATTACHMENT_BYTES } from '@/modules/teaching/attachment-rules';
import { getActor } from '@/server/actor';
import { LMS_ORIGIN } from '@/server/auth';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

// Uploads a lesson attachment (FR-TCH-01), or a picture for the note itself when inNote=1 (BR-22). A route handler rather than a Server Action so the size and the
// caller are checked before the body is read, without raising the body limit of every action.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== LMS_ORIGIN) return fail('Request not allowed from this site.', 403);
  const actor = await getActor(request.headers);
  if (!actor) return fail('Please sign in again.', 401);
  const length = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length)) return fail('Send the file as a normal upload.', 411);
  if (length > MAX_ATTACHMENT_BYTES + 64 * 1024) return fail('That file is bigger than 10 MB.', 413);

  const { id } = await params;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Choose a file to upload.');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const attachment = await addAttachment(actor, id, { name: file.name, bytes }, { inNote: form.get('inNote') === '1' });
    revalidatePath('/teacher/classes', 'layout');
    revalidatePath('/student/classes', 'layout');
    return Response.json({ ok: true, attachment });
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message);
    if (e instanceof ForbiddenError) return fail(e.message, 403);
    throw e;
  }
}
