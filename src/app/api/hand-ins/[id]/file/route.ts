import { openHandInFile } from '@/modules/assessments/hand-in';
import { contentDisposition } from '@/modules/teaching/attachment-rules';
import { getActor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

// A project file a student handed in (M18b, BR-32), for them, the class's teachers and Admin. Always a download, never
// shown on the LMS origin: the teacher opens it in Scratch or Roblox Studio.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const f = await openHandInFile(await getActor(request.headers), id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(f.data.byteLength),
        'Content-Disposition': contentDisposition(f.filename, false),
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
