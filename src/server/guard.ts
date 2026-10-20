import 'server-only';
import { headers } from 'next/headers';
import { forbidden, notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getActor } from './actor';
import { ForbiddenError, ValidationError } from './errors';
import { can, type Action } from './policy';

// Once per request: the layout and the page both ask, and each lookup reads the session and the user (and may
// update lastActiveAt). React's cache() lasts for one request only (node_modules/next/dist/docs, data-security).
export const currentActor = cache(async () => getActor(await headers()));

// For pages and layouts: not signed in → sign-in page; signed in but not allowed → 403 page.
export async function requireActor(action: Action) {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!can(actor, action)) forbidden();
  return actor;
}

// For page data: a missing record → 404 page; a record that isn't yours → 403 page.
export async function pageData<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (e) {
    if (e instanceof ValidationError) notFound();
    if (e instanceof ForbiddenError) forbidden();
    throw e;
  }
}
