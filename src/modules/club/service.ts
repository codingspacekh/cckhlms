// Club settings (FR-ADM-16). One row; the time zone drives every date in the LMS (BR-19); the signer's name goes on
// certificates (FR-ADM-11).
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { clubSettings } from '@/db/schema';
import { isValidTimeZone } from '@/modules/identity/rules';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';

export const clubSettingsSchema = z.object({
  clubName: z.string().trim().min(1, 'Enter the club name.').max(100, 'That name is too long.'),
  timeZone: z.string().refine(isValidTimeZone, 'Choose a time zone from the list.'),
  certificateSigner: z.string().trim().min(1, 'Enter the name that signs the certificates.').max(100, 'That name is too long.'),
});
export type ClubSettings = z.infer<typeof clubSettingsSchema>;

export async function getClubSettings(): Promise<ClubSettings> {
  const [row] = await db
    .select({ clubName: clubSettings.clubName, timeZone: clubSettings.timeZone, certificateSigner: clubSettings.certificateSigner })
    .from(clubSettings)
    .limit(1);
  return row ?? { clubName: 'CCKH Coding Club', timeZone: 'Asia/Phnom_Penh', certificateSigner: 'Club Director' };
}

export async function updateClubSettings(actor: Actor | null, raw: ClubSettings) {
  assertCan(actor, 'settings.manage');
  const parsed = clubSettingsSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  await db.transaction(async (tx) => {
    await tx
      .update(clubSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(clubSettings.id, 1));
    await audit({ actorId: actor.userId, action: 'settings.update', entity: 'club_settings', entityId: '1', detail: parsed.data }, tx);
  });
}
