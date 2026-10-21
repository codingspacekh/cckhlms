import { exportStudentData } from '@/modules/privacy/export';
import { contentDisposition } from '@/modules/teaching/attachment-rules';
import { getActor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';

export const dynamic = 'force-dynamic';

// NFR-07: everything stored about one student, as a JSON file, for Admin only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { filename, data } = await exportStudentData(await getActor(request.headers), id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': contentDisposition(filename, false),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof ValidationError) return new Response('Not found', { status: 404 });
    throw e;
  }
}
