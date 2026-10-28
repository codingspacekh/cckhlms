// Pre-launch review: the lesson editor's live preview runs the full note renderer (a few hundred ms for a long
// note), so only teachers, who write lessons, may call it; a student scripting it can't slow the site.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/actor';

let who: Actor | null = null;
vi.mock('@/server/guard', () => ({ currentActor: async () => who }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { previewMarkdownAction } = await import('@/modules/teaching/lesson-actions');

const as = (role: string): Actor => ({ userId: 'u1', username: 'x', name: 'X', role, sessionId: 's1' });

describe('the lesson note preview', () => {
  beforeEach(() => {
    who = null;
  });

  it('renders the note for a teacher', async () => {
    who = as('teacher');
    expect(await previewMarkdownAction('**Loops**')).toContain('<strong>Loops</strong>');
  });

  it('renders nothing for a student, Admin or someone signed out', async () => {
    for (const actor of [as('student'), as('admin'), null]) {
      who = actor;
      expect(await previewMarkdownAction('**Loops**')).toBe('');
    }
  });
});
