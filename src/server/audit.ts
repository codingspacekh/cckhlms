// Audit log (NFR-11): who did what, when, from where.
import { db } from '@/db/client';
import { auditLog } from '@/db/schema';

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

// Pass the transaction that makes the change, so the change and its audit row are saved together or not at all
// (tests/integration/audit.test.ts).
export async function audit(e: AuditEntry, tx: Executor = db) {
  await tx
    .insert(auditLog)
    .values({ actorId: e.actorId ?? null, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail, ip: e.ip ?? null });
}
