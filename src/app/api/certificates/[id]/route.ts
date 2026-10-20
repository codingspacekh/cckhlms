import { certificateFile } from '@/modules/certificates/certificates';
import { contentDisposition } from '@/modules/teaching/attachment-rules';
import { getActor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

// A certificate's PDF (FR-ADM-11, FR-STU-08): for Admin, and for the student it belongs to.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const f = await certificateFile(await getActor(request.headers), id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(f.data.byteLength),
        'Content-Disposition': contentDisposition(f.filename, false),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    // Someone else's certificate looks the same as a missing one.
    if (e instanceof ValidationError || e instanceof ForbiddenError) return new Response('Not found', { status: 404 });
    throw e;
  }
}
