import { revalidatePath } from 'next/cache';
import { MAX_PROJECT_FILE_BYTES } from '@/modules/academics/language-rules';
import { handInUpload } from '@/modules/assessments/hand-in';
import { getActor } from '@/server/actor';
import { LMS_ORIGIN } from '@/server/auth';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

// Hands in work in a language Admin added (M18b, BR-32): a project file (`file`) and/or a link (`link`). A route
// handler rather than a Server Action, like attachments: the caller and the size are checked before the body is read,
// without raising every action's body limit.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== LMS_ORIGIN) return fail('Request not allowed from this site.', 403);
  const actor = await getActor(request.headers);
  if (!actor) return fail('Please sign in again.', 401);
  const length = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length)) return fail('Send the file as a normal upload.', 411);
  if (length > MAX_PROJECT_FILE_BYTES + 64 * 1024) return fail('That file is bigger than 20 MB.', 413);

  const { id } = await params;
  const form = await request.formData();
  const file = form.get('file');
  const link = form.get('link');
  try {
    const r = await handInUpload(actor, id, {
      file: file instanceof File && file.size > 0 ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined,
      link: typeof link === 'string' ? link : undefined,
    });
    revalidatePath('/student/classes', 'layout');
    revalidatePath('/teacher/classes', 'layout');
    return Response.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message);
    if (e instanceof ForbiddenError) return fail(e.message, 403);
    throw e;
  }
}
