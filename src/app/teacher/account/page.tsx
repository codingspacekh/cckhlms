import type { Metadata } from 'next';
import { MyAccount } from '@/components/account/MyAccount';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My account' };

export default async function TeacherAccountPage() {
  return <MyAccount actor={await requireActor('password.change_own')} role="teacher" />;
}
