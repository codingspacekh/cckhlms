// Session rules by role (FR-AUTH-10). Students share club laptops, so their sessions end quickly.
const H = 3_600_000;
export const TOUCH_EVERY_MS = 60_000;
export const POLICIES = {
  student: { idleMs: 2 * H, maxAgeMs: 12 * H },
  staff: { idleMs: 7 * 24 * H, maxAgeMs: 30 * 24 * H },
} as const;

export function policyFor(role: string) {
  const roles = role.split(',').map((r) => r.trim());
  return roles.includes('admin') || roles.includes('teacher') ? POLICIES.staff : POLICIES.student;
}

export type SessionDecision = { valid: true; touch: boolean } | { valid: false; reason: 'idle' | 'max-age'; touch: false };

export function sessionDecision(input: { role: string; createdAt: Date; lastActiveAt: Date; now: Date }): SessionDecision {
  const p = policyFor(input.role);
  const age = input.now.getTime() - input.createdAt.getTime();
  const idle = input.now.getTime() - input.lastActiveAt.getTime();
  if (age > p.maxAgeMs) return { valid: false, reason: 'max-age', touch: false };
  if (idle > p.idleMs) return { valid: false, reason: 'idle', touch: false };
  return { valid: true, touch: idle >= TOUCH_EVERY_MS };
}
