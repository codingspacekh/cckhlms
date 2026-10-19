import 'server-only';
import { headers } from 'next/headers';
import { forbidden, notFound, redirect } from 'next/navigation';
import { getActor } from './actor';
import { ForbiddenError, ValidationError } from './errors';
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
