import 'server-only';
import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { getActor } from './actor';
import { can, type Action } from './policy';

export async function currentActor() {
  return getActor(await headers());
}

// For pages and layouts: not signed in → sign-in page; signed in but not allowed → 403 page.
export async function requireActor(action: Action) {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!can(actor, action)) forbidden();
  return actor;
}
