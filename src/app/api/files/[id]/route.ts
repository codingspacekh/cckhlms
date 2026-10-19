import { openAttachment } from '@/modules/teaching/attachments';
import { contentDisposition } from '@/modules/teaching/attachment-rules';
import { getActor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

// Lesson attachments (FR-TCH-01). Plain images are shown inline; everything else downloads. The CSP and
// sandbox stop any file from running script on the LMS origin (NFR-05).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const f = await openAttachment(await getActor(request.headers), id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        'Content-Type': f.contentType,
        'Content-Length': String(f.data.byteLength),
        'Content-Disposition': contentDisposition(f.filename, f.inline),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    // Someone else's file looks the same as a missing one.
    if (e instanceof ValidationError || e instanceof ForbiddenError) return new Response('Not found', { status: 404 });
    throw e;
  }
}
