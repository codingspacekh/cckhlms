import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

// Used by the deploy pipeline and the uptime monitor.
export async function GET() {
  const dbOk = await db.execute(sql`select 1`).then(
    () => true,
    () => false,
  );
  return Response.json({ ok: dbOk, db: dbOk, version: process.env.GIT_SHA ?? 'dev' }, { status: dbOk ? 200 : 503 });
}
