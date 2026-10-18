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

export async function audit(e: AuditEntry) {
  await db
    .insert(auditLog)
    .values({ actorId: e.actorId ?? null, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail, ip: e.ip ?? null });
}
