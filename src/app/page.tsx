import { redirect } from 'next/navigation';
import { currentActor } from '@/server/guard';
import { homeFor } from '@/server/policy';

export default async function Home() {
  const actor = await currentActor();
  redirect(actor ? homeFor(actor) : '/login');
}
