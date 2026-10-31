import type { Metadata } from 'next';
import { MyAccount } from '@/components/account/MyAccount';
import { avatarKeyOf } from '@/modules/identity/avatar';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My account' };

export default async function StudentAccountPage() {
  const actor = await requireActor('password.change_own');
  return <MyAccount actor={actor} role="student" image={await avatarKeyOf(actor.userId)} />;
}
